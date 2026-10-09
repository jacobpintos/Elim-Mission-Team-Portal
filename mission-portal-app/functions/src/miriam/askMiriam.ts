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
import { isAdminViewer, type Viewer } from './data'
import { Lookups, withWeekday } from './lookups'

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

Someone has spoken to you, usually out loud. Their words were turned into text by speech recognition, so names and words may be misheard: match them to what the tools return by how they sound, and a misheard word to what makes sense.

A question: look it up with the tools — never answer from memory or guess — then finish with \`answer\`: a short reply to be heard, and where in the app to show it. The tools return only what this person is allowed to see. If something isn't there, say you couldn't find it, without suggesting that it exists. When several events match, take the nearest upcoming one unless they said otherwise, and say its date. When nothing fits well, find_events gives the nearest names instead: if one is plainly what they meant — it sounds the same, or it is a name they have used before — use it, and say which you took ("I took that as Revival in the Heartland"); if you can't tell, say you couldn't find that name, and offer the nearest as \`choices\`. Always set \`heard_name\` to the words they used for the event. When they ask who is unavailable, include everyone not plainly available — not available, partly available, not sure yet (TBD), and not answered — with what they wrote. When they ask what is pending, that is every task not done.

Something to do: use the tool for it. It only fills in a form for them to check and save, so fill in what they said and leave the rest empty.

If no tool fits, call \`answer\` saying in one sentence that you can't do that yet. Never ask a question back; they can't answer one.`

/** How many rounds of looking things up before giving up on a question. */
const MAX_ROUNDS = 6

/** Where the app should take them to see an answer. */
type Open =
  | { kind: 'event'; key: string; section: 'dress_code' | 'availability' | 'details' | null }
  | { kind: 'task'; id: string }
  | { kind: 'availability' }

/**
 * Miriam: a request or a question, said or typed.
 *
 * A request — for now, a new event — comes back as a form filled in, for the
 * app to open; nothing is saved here. A question is looked up with read-only
 * tools that see only what this person may see (./data.ts, ./lookups.ts),
 * and comes back as a short answer to be read aloud, and where to show it.
 *
 * The caller's roles are read here from their profile, never taken from the
 * app. Claude is only offered the commands those roles allow (./plan.ts), and
 * each one it uses is checked against them again before it runs.
 *
 * Nothing said is stored or logged, only how much it cost.
 */
export const askMiriam = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 90 },
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
    const roles: string[] = Array.isArray(me.data()?.roles) ? me.data()!.roles : []
    const commands = commandsFor(roles)
    if (commands.length === 0) {
      return { kind: 'reply', text: 'There’s nothing I can do for you in the app yet.' }
    }
    if (!allowed(uid)) {
      throw new HttpsError(
        'resource-exhausted',
        'That’s a lot of requests — try again in a few minutes.'
      )
    }
    const viewer = { uid, roles }
    // Names this device has learned: what they said, and the event they meant.
    const known = (Array.isArray(req.data?.known) ? req.data.known : [])
      .filter(
        (k: unknown): k is { heard: string; title: string } =>
          !!k &&
          typeof (k as { heard?: unknown }).heard === 'string' &&
          typeof (k as { title?: unknown }).title === 'string'
      )
      .slice(0, 30)
      .map(
        (k: { heard: string; title: string }) =>
          `“${k.heard.slice(0, 80)}” meant “${k.title.slice(0, 120)}”`
      )
    const lookups = new Lookups(db, viewer, today)

    // The people and groups a new event's form can name: only for those who
    // may make one (admins, who can see them all).
    let roster: Roster | null = null
    let lists = ''
    if (commands.includes('open_event_form')) {
      const [names, groups] = await Promise.all([lookups.names(), lookups.groups()])
      const userSnap = await db.collection('users').get()
      roster = {
        people: userSnap.docs
          .filter((d) => {
            const roles: string[] = Array.isArray(d.data().roles) ? d.data().roles : []
            return names.has(d.id) && !(roles.length > 0 && roles.every((r) => r === 'public'))
          })
          .map((d) => ({ id: d.id, name: names.get(d.id)! }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        groups: groups.filter((g) => g.name).sort((a, b) => a.name.localeCompare(b.name)),
      }
      lists =
        `For a new event's form — groups (id: name):\n${roster.groups.map((g) => `${g.id}: ${g.name}`).join('\n')}\n\n` +
        `People (id: name):\n${roster.people.map((p) => `${p.id}: ${p.name}`).join('\n')}`
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })
    const tools = commands.map((name) => COMMANDS[name].tool as Anthropic.Beta.BetaTool)
    const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: SYSTEM }]
    if (lists) system.push({ type: 'text', text: lists, cache_control: { type: 'ephemeral' } })
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      {
        role: 'user',
        content:
          `Today is ${withWeekday(today)}.\n\n` +
          (known.length ? `Names they have used before for events:\n${known.join('\n')}\n\n` : '') +
          `They said: “${text}”`,
      },
    ]

    for (let round = 0; round < MAX_ROUNDS; round++) {
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
          system,
          tools,
          messages,
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
      logger.info('askMiriam', { uid, round, model: response.model, usage: response.usage })

      if (response.stop_reason === 'refusal') {
        return { kind: 'reply', text: 'Sorry, I can’t help with that.' }
      }
      const calls = response.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use'
      )
      if (calls.length === 0) {
        const said = response.content
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join(' ')
          .trim()
        return { kind: 'reply', text: said || 'Sorry, I didn’t catch that. Try again?' }
      }

      // Checked again: only a command this person may use is acted on.
      const refusedCall = calls.find((c) => !commands.includes(c.name as CommandName))
      if (refusedCall) return { kind: 'reply', text: 'You don’t have permission to do that.' }

      const form = calls.find((c) => c.name === 'open_event_form')
      if (form && roster) {
        const { draft, notes } = draftFromInput(form.input as Partial<EventFormInput>, roster)
        return { kind: 'eventForm', draft, notes }
      }
      const final = calls.find((c) => c.name === 'answer')
      if (final) return finish(final.input as AnswerInput, lookups, viewer)

      // Looked up, and handed back for the next round.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
      for (const call of calls) {
        const input = call.input as { query?: string; date?: string; key?: string }
        let result: unknown
        try {
          result =
            call.name === 'find_events'
              ? await lookups.findEvents(String(input.query ?? ''), String(input.date ?? ''))
              : call.name === 'get_event'
                ? await lookups.getEvent(String(input.key ?? ''))
                : call.name === 'event_availability'
                  ? await lookups.availability(String(input.key ?? ''))
                  : call.name === 'find_tasks'
                    ? await lookups.findTasks(String(input.query ?? ''))
                    : { error: 'Not a lookup.' }
        } catch (err) {
          logger.error(`askMiriam: ${call.name} failed`, err)
          result = { error: 'That could not be looked up just now.' }
        }
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result) })
      }
      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: results })
    }
    return { kind: 'reply', text: 'I couldn’t work that out — try asking another way.' }
  }
)

interface AnswerInput {
  spoken: string
  open: 'event' | 'task' | 'availability' | 'none'
  target: string
  section: 'dress_code' | 'availability' | 'details' | 'none'
  choices?: string[]
  heard_name?: string
}

/** The answer, and where to show it — only somewhere this person may go. */
async function finish(input: AnswerInput, lookups: Lookups, viewer: Viewer) {
  const text = String(input.spoken ?? '').trim() || 'Sorry, I couldn’t find that.'
  let open: Open | null = null
  if (input.open === 'event' && (await lookups.event(String(input.target)))) {
    const section = ['dress_code', 'availability', 'details'].includes(input.section)
      ? (input.section as 'dress_code' | 'availability' | 'details')
      : null
    open = { kind: 'event', key: String(input.target), section }
  } else if (input.open === 'task' && (await lookups.task(String(input.target)))) {
    open = { kind: 'task', id: String(input.target) }
  } else if (input.open === 'availability' && isAdminViewer(viewer)) {
    open = { kind: 'availability' }
  }
  // Offered choices: only events this person may see, as they will be shown.
  const choices: { key: string; title: string; date: string }[] = []
  for (const key of Array.isArray(input.choices) ? input.choices.slice(0, 3) : []) {
    const ev = await lookups.event(String(key))
    if (ev && !choices.some((c) => c.key === ev.instanceKey)) {
      choices.push({ key: ev.instanceKey, title: ev.title, date: ev.date })
    }
  }
  const heardName = String(input.heard_name ?? '')
    .trim()
    .slice(0, 80)
  return { kind: 'answer', text, open, choices, heardName }
}
