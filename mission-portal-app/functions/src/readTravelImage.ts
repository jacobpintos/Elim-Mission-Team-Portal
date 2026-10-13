import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { canAsk } from './miriam/data'

if (!admin.apps.length) admin.initializeApp()

/** The same key askMiriam uses. */
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

const MODEL = 'claude-opus-5-5'

/** Only pictures the event form uploaded; never an arbitrary address. */
const PATH = /^(eventFlights|eventLodging)\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/

/** Per person: generous for filling in a form, not enough to run up a bill. */
const PER_WINDOW = 30
const WINDOW_MS = 10 * 60 * 1000
const recent = new Map<string, number[]>()
function allowed(uid: string): boolean {
  const now = Date.now()
  const calls = (recent.get(uid) ?? []).filter((t) => now - t < WINDOW_MS)
  if (calls.length >= PER_WINDOW) return false
  calls.push(now)
  recent.set(uid, calls)
  return true
}

const text = { type: 'string' }

const LEG = {
  type: 'object',
  additionalProperties: false,
  required: ['date', 'time', 'airport', 'airline', 'flight', 'ticket', 'confirmation', 'arrival'],
  properties: {
    date: { ...text, description: 'Departure date as MM/DD/YY' },
    time: { ...text, description: 'Departure time, e.g. 10:05 AM' },
    airport: { ...text, description: 'Departing airport: name and code, or its address' },
    airline: { ...text, description: 'Airline name' },
    flight: { ...text, description: 'Flight number, e.g. UA 1234' },
    ticket: { ...text, description: 'Ticket number' },
    confirmation: { ...text, description: 'Confirmation / record locator' },
    arrival: { ...text, description: 'Arrival time at the destination, e.g. 2:40 PM' },
  },
}

const FLIGHT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['outbound', 'return'],
  properties: { outbound: LEG, return: LEG },
}

const HOTEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'address', 'room', 'confirmation'],
  properties: {
    name: { ...text, description: 'Hotel or lodging name' },
    address: { ...text, description: 'Street address' },
    room: { ...text, description: 'Room number or type' },
    confirmation: { ...text, description: 'Confirmation number' },
  },
}

const SYSTEM = `You read travel documents for a church mission team's trip planner: boarding passes, airline itineraries, hotel confirmations, and screenshots of them.

Copy only what the picture actually shows. Leave a field as an empty string when it is not there or you cannot read it — a blank field is much better than a guess, because people will travel on what you fill in.`

/**
 * Read a boarding pass, itinerary or hotel confirmation that the event form
 * just uploaded, and return the fields it shows so the form can fill them in.
 *
 * Takes a Storage path rather than an address, and reads the file with the
 * Admin SDK: the function will only ever look at pictures the event form put
 * there. Nothing read is stored or logged, only how much it cost.
 */
export const readTravelImage = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 90 },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.')

    const kind = req.data?.kind
    const path = req.data?.path
    if ((kind !== 'flight' && kind !== 'hotel') || typeof path !== 'string' || !PATH.test(path)) {
      throw new HttpsError('invalid-argument', 'That picture can’t be read.')
    }
    if (!path.startsWith(kind === 'flight' ? 'eventFlights/' : 'eventLodging/')) {
      throw new HttpsError('invalid-argument', 'That picture can’t be read.')
    }

    const me = await admin.firestore().doc(`users/${uid}`).get()
    const roles: string[] = Array.isArray(me.data()?.roles) ? me.data()!.roles : []
    if (!canAsk(roles)) throw new HttpsError('permission-denied', 'Not available for this account.')
    if (!allowed(uid)) {
      throw new HttpsError('resource-exhausted', 'Too many pictures read just now. Try again soon.')
    }

    const file = admin.storage().bucket().file(path)
    const [meta] = await file.getMetadata().catch(() => {
      throw new HttpsError('not-found', 'That picture is no longer there.')
    })
    const mediaType = String(meta.contentType ?? '')
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
      throw new HttpsError('invalid-argument', 'Only JPEG, PNG, GIF or WebP pictures can be read.')
    }
    const [bytes] = await file.download()

    const leg = req.data?.leg === 'ret' ? 'return' : 'outbound'
    const ask =
      kind === 'flight'
        ? `This was attached to the ${leg} flight. Fill in that leg from it. If the picture also shows the other leg of the trip, fill that in too; otherwise leave the other leg blank.`
        : 'Fill in the hotel details from this picture.'

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })
    let response: Anthropic.Beta.BetaMessage
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        // Declined on safety grounds: tried again on the model Anthropic
        // recommends for that, inside the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: kind === 'flight' ? FLIGHT_SCHEMA : HOTEL_SCHEMA },
        },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType as 'image/jpeg',
                  data: bytes.toString('base64'),
                },
              },
              { type: 'text', text: ask },
            ],
          },
        ],
      })
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        logger.error('readTravelImage: the Anthropic API key was refused')
      } else if (err instanceof Anthropic.RateLimitError) {
        throw new HttpsError('resource-exhausted', 'Busy just now. Try again in a moment.')
      } else {
        logger.error('readTravelImage: request failed', err)
      }
      throw new HttpsError('unavailable', 'The picture couldn’t be read. Try again.')
    }
    logger.info('readTravelImage', { uid, kind, model: response.model, usage: response.usage })

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      throw new HttpsError('unavailable', 'Nothing could be read from that picture.')
    }
    const out = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    try {
      return { kind, fields: JSON.parse(out?.text ?? '') as Record<string, unknown> }
    } catch {
      throw new HttpsError('unavailable', 'Nothing could be read from that picture.')
    }
  }
)
