import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import Anthropic from '@anthropic-ai/sdk'
import {
  COMMANDS,
  commandsFor,
  draftFromInput,
  type CommandName,
  type EventFormInput,
  type Roster,
} from './plan'

if (!admin.apps.length) admin.initializeApp()

/** Set with `firebase functions:secrets:set ANTHROPIC_API_KEY`. */
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

/** The model that reads requests. One line to change. */
const MODEL = 'claude-opus-5-5'

/** A minute of talking, with room to spare; past it, it isn't a request. Mirrored in the app (lib/miriam: MAX_REQUEST). */
const MAX_TEXT = 1500

/** Per person: enough for real use, not enough to run up a bill. */
const PER_WINDOW = 20
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

const SYSTEM = `You are Miriam, the assistant in the Mission Portal app of The Well of Iowa, a church mission team.

Someone has asked you, usually out loud, to do something in the app. Their words were turned into text by speech recognition, so names and words may be misheard: match a name to the lists below by how it sounds and by first name, and a misheard word to what makes sense.

Do what they asked with the one tool that fits. A tool only fills in a form for them to check and save, so fill in what they said and leave the rest empty. If none of your tools fits what they asked, don't call one: say in one short sentence that you can't do that yet. Never ask a question back; they can't answer one.`

/**
 * Miriam: a request, said or typed, turned into something done in the app —
 * for now, a new event's form, filled in.
 *
 * The caller's roles are read here from their profile, never taken from the
 * app. Claude is only offered the commands those roles allow (functions/src/
 * miriam/plan.ts), and its answer is checked against them again before it is
 * acted on. What comes back is a filled-in form for the app to open; nothing
 * is saved here.
 *
 * Nothing said is stored or logged, only how much it cost.
 */
export const askMiriam = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60 },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to use Miriam.')

    const text = typeof req.data?.text === 'string' ? req.data.text.trim() : ''
    if (!text) throw new HttpsError('invalid-argument', 'Nothing was asked.')
    if (text.length > MAX_TEXT)
      throw new HttpsError('invalid-argument', 'That was too long — try it in two.')
    // The person's own day, for "Friday" and "9/25": the server's is UTC.
    const today =
      typeof req.data?.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.data.today)
        ? req.data.today
        : new Date().toISOString().slice(0, 10)

    const db = admin.firestore()
    const me = await db.doc(`users/${uid}`).get()
    const commands = commandsFor(me.data()?.roles as string[] | undefined)
    if (commands.length === 0) {
      return { kind: 'reply', text: 'There’s nothing I can do for you in the app yet.' }
    }
    if (!allowed(uid)) {
      throw new HttpsError(
        'resource-exhausted',
        'That’s a lot of requests — try again in a few minutes.'
      )
    }

    // The people and groups a request may name. Only fetched for commands
    // that assign people, which today are admins', who can see them all.
    const [userSnap, groupSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('groups').get(),
    ])
    const roster: Roster = {
      people: userSnap.docs
        .filter((d) => {
          const u = d.data()
          const roles: string[] = Array.isArray(u.roles) ? u.roles : []
          return u.displayName && !(roles.length > 0 && roles.every((r) => r === 'public'))
        })
        .map((d) => ({ id: d.id, name: String(d.data().displayName) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      groups: groupSnap.docs
        .map((d) => ({
          id: d.id,
          name: String(d.data().name ?? ''),
          members: Array.isArray(d.data().members) ? d.data().members.map(String) : [],
        }))
        .filter((g) => g.name)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
    const lists =
      `Groups (id: name):\n${roster.groups.map((g) => `${g.id}: ${g.name}`).join('\n')}\n\n` +
      `People (id: name):\n${roster.people.map((p) => `${p.id}: ${p.name}`).join('\n')}`

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })
    let response: Anthropic.Beta.BetaMessage
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        // Declined on safety grounds: tried again on the model Anthropic
        // recommends for that, inside the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: [
          { type: 'text', text: SYSTEM },
          { type: 'text', text: lists, cache_control: { type: 'ephemeral' } },
        ],
        tools: commands.map((name) => COMMANDS[name].tool as Anthropic.Beta.BetaTool),
        messages: [{ role: 'user', content: `Today is ${today}.\n\nThey said: “${text}”` }],
      })
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        logger.error('askMiriam: the Anthropic API key was refused')
      } else if (err instanceof Anthropic.RateLimitError) {
        throw new HttpsError('resource-exhausted', 'Miriam is busy — try again in a moment.')
      } else {
        logger.error('askMiriam: request failed', err)
      }
      throw new HttpsError('unavailable', 'Miriam couldn’t be reached. Try again.')
    }
    logger.info('askMiriam', { uid, model: response.model, usage: response.usage })

    if (response.stop_reason === 'refusal') {
      return { kind: 'reply', text: 'Sorry, I can’t help with that.' }
    }

    const call = response.content.find((b) => b.type === 'tool_use')
    if (call && call.type === 'tool_use') {
      const name = call.name as CommandName
      // Checked again: only a command this person may use is acted on.
      if (!commands.includes(name)) {
        return { kind: 'reply', text: 'You don’t have permission to do that.' }
      }
      if (name === 'open_event_form') {
        const { draft, notes } = draftFromInput(call.input as Partial<EventFormInput>, roster)
        return { kind: 'eventForm', draft, notes }
      }
    }

    const said = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join(' ')
      .trim()
    return { kind: 'reply', text: said || 'Sorry, I didn’t catch what to do. Try again?' }
  }
)
