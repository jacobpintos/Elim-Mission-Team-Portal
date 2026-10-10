import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import Anthropic from '@anthropic-ai/sdk'
import {
  ACTIONS,
  toolsFor,
  appToolsFrom,
  commandsFor,
  type AppToolName,
  draftFromInput,
  taskDraftFromInput,
  type CommandName,
  type EventFormInput,
  type Roster,
} from './plan'
import { isAdminViewer, type Viewer } from './data'
import { Lookups, withWeekday } from './lookups'
import { PAUSE_MS, MAX_RESULT, seal, unseal } from './pause'

if (!admin.apps.length) admin.initializeApp()

/** Set with `firebase functions:secrets:set ANTHROPIC_API_KEY`. */
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

/**
 * The model that reads requests: quick and inexpensive, for what most
 * requests are — a lookup and a short answer.
 */
const MODEL = 'claude-haiku-5-5'
/**
 * Asked for advice when it is needed — a request with several parts, or
 * people to match — and only then, so its price is paid only then.
 */
const ADVISOR: Anthropic.Beta.BetaAdvisorTool20260301 = {
  type: 'advisor_20260301',
  name: 'advisor',
  model: 'claude-opus-5-5',
  max_uses: 2,
}

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

Announcements, their messages, the Operations tab (issues, kaizen, planning, inventory), videos in Content, and their own profile and settings each have a lookup, where this person has that screen. To take them to a screen — "go to the admin users page", "open Kaizen" — answer with open "screen" and its id from the list they are sent; to show where an answer is, you may do the same.

Do something only when they plainly tell you to: "create an event", "play the sermon from Sunday". A question is never a request to act — answer it, and show where the answer is. Something to do: use the tool for it. A new task's form (open_task_form) or an event's form — a new one (open_event_form), or an existing one changed (edit_event: find the event first) — is only filled in for them to check and save, so fill in what they said and leave the rest out. To play a video from Content, find it, then answer with open "video" and its id. To buy something ("buy triple A batteries"), find it in the reorder list (read_operations, inventory) and answer with open "reorder" and its id, saying what you're opening; if it isn't on the list, or has no link, say so. To change something — send a message, post an announcement, mark a task, answer their availability, sign up for food, turn a notification on or off, and for admins change people's accounts, groups, common teams and task templates — use its tool once you have what it needs (an event's key, a task's id, a person's or group's id from people_and_groups); they confirm it in the app before anything is done, so don't ask them first. Anything else that changes something you can't do yet: say so in one sentence.

When you are not sure — a request with several parts, people or groups to match, a name you can't place, or anything you might get wrong — ask the advisor before you act. A plain question you can look up needs no advice.

If no tool fits, call \`answer\` saying in one sentence that you can't do that yet. Never ask a question back; they can't answer one.`

/** How many rounds of looking things up before giving up on a question. */
const MAX_ROUNDS = 6

/** Where the app should take them to see an answer. */
type Open =
  | { kind: 'screen'; id: string }
  | { kind: 'video'; id: string }
  | { kind: 'reorder'; id: string }
  | {
      kind: 'event'
      key: string
      section: 'dress_code' | 'availability' | 'weather' | 'details' | null
    }
  | { kind: 'task'; id: string }
  | { kind: 'availability' }

/** The screens the app says this person can open, to name in a request. */
function screensFrom(list: unknown): string[] {
  return (Array.isArray(list) ? list : [])
    .filter(
      (s): s is { id: string; label: string } =>
        !!s && typeof s.id === 'string' && typeof s.label === 'string'
    )
    .slice(0, 80)
    .map((s) => `${s.id.slice(0, 40)}: ${s.label.slice(0, 80)}`)
}

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
 * Some lookups run in the app, as the person signed in (APP_TOOLS): then the
 * request pauses, the app is handed the calls with the request sealed, and
 * it carries on when the app sends back what it found (`resume`).
 *
 * Nothing said is stored or logged, only how much it cost.
 */
export const askMiriam = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 90 },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to use Miriam.')

    // The person's own day, for "Friday" and "9/25": the server's is UTC.
    const today =
      typeof req.data?.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.data.today)
        ? req.data.today
        : new Date().toISOString().slice(0, 10)
    const key = ANTHROPIC_API_KEY.value()
    const paused = req.data?.resume ? unseal(req.data.resume.state, key) : null
    if (req.data?.resume && (!paused || paused.uid !== uid || paused.until < Date.now())) {
      throw new HttpsError('failed-precondition', 'That took too long — ask again.')
    }

    const db = admin.firestore()
    const me = await db.doc(`users/${uid}`).get()
    const roles: string[] = Array.isArray(me.data()?.roles) ? me.data()!.roles : []
    const commands = commandsFor(roles)
    if (commands.length === 0) {
      return { kind: 'reply', text: 'There’s nothing I can do for you in the app yet.' }
    }
    const viewer = { uid, roles }
    const lookups = new Lookups(db, viewer, today)

    let messages: Anthropic.Beta.BetaMessageParam[]
    let appTools: AppToolName[]
    let firstRound = 0
    // Haiku, with Opus to advise; or — if that is ever turned down before
    // anything has been said — Opus alone, as before, so the question is
    // still answered.
    let alone = false
    if (paused) {
      // Carried on with what the app found: a result for each call it was
      // given, in the same turn as those done here.
      const sent: unknown[] = Array.isArray(req.data.resume.results) ? req.data.resume.results : []
      const fromApp = paused.waiting.map((id): Anthropic.Beta.BetaToolResultBlockParam => {
        const r = sent.find((x) => (x as { id?: unknown })?.id === id) as
          | { content?: unknown }
          | undefined
        return {
          type: 'tool_result',
          tool_use_id: id,
          content:
            typeof r?.content === 'string'
              ? r.content.slice(0, MAX_RESULT)
              : JSON.stringify({ error: 'The app could not look that up.' }),
        }
      })
      messages = [...paused.messages, { role: 'user', content: [...paused.done, ...fromApp] }]
      appTools = appToolsFrom(paused.appTools)
      firstRound = paused.round + 1
      alone = paused.alone
    } else {
      const text = typeof req.data?.text === 'string' ? req.data.text.trim() : ''
      if (!text) throw new HttpsError('invalid-argument', 'Nothing was asked.')
      if (text.length > MAX_TEXT)
        throw new HttpsError('invalid-argument', 'That was too long — try it in two.')
      if (!allowed(uid)) {
        throw new HttpsError(
          'resource-exhausted',
          'That’s a lot of requests — try again in a few minutes.'
        )
      }
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
      const screens = screensFrom(req.data?.screens)
      appTools = appToolsFrom(req.data?.appTools)
      messages = [
        {
          role: 'user',
          content:
            `Today is ${withWeekday(today)}.\n\n` +
            (screens.length ? `Screens they can open (id: name):\n${screens.join('\n')}\n\n` : '') +
            (known.length
              ? `Names they have used before for events:\n${known.join('\n')}\n\n`
              : '') +
            `They said: “${text}”`,
        },
      ]
    }

    // The people and groups a new event's form can name: only for those who
    // may make one (admins, who can see them all), and only once asked for.
    let roster: Roster | null = null
    const loadRoster = async (): Promise<Roster> => {
      if (roster) return roster
      const [names, groups, userSnap, config, templates] = await Promise.all([
        lookups.names(),
        lookups.groups(),
        db.collection('users').get(),
        db.doc('config/main').get(),
        db.collection('taskTemplates').get(),
      ])
      const teams: unknown = config.data()?.COMMON_TEAMS
      roster = {
        people: userSnap.docs
          .filter((d) => {
            const roles: string[] = Array.isArray(d.data().roles) ? d.data().roles : []
            return names.has(d.id) && !(roles.length > 0 && roles.every((r) => r === 'public'))
          })
          .map((d) => ({ id: d.id, name: names.get(d.id)! }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        groups: groups.filter((g) => g.name).sort((a, b) => a.name.localeCompare(b.name)),
        commonTeams: (Array.isArray(teams) ? teams : []).map(
          (t: { name?: unknown; members?: unknown[] }) => ({
            name: String(t.name ?? ''),
            members: (t.members ?? []).map(String),
          })
        ),
        taskTemplates: templates.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? '') })),
      }
      return roster
    }

    const client = new Anthropic({ apiKey: key })
    const commandTools = toolsFor(commands, appTools) as Anthropic.Beta.BetaTool[]
    const ask = () =>
      alone
        ? client.beta.messages.create({
            model: ADVISOR.model,
            max_tokens: 8000,
            // Declined on safety grounds: tried again on the model Anthropic
            // recommends for that, inside the same call.
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'low' },
            system: SYSTEM,
            tools: commandTools,
            messages,
          })
        : client.beta.messages.create({
            model: MODEL,
            max_tokens: 8000,
            betas: ['advisor-tool-2026-03-01'],
            output_config: { effort: 'medium' },
            // Each round re-reads the one before from the cache.
            cache_control: { type: 'ephemeral' },
            system: SYSTEM,
            tools: [...commandTools, ADVISOR],
            messages,
          })

    for (let round = firstRound; round < MAX_ROUNDS; round++) {
      let response: Anthropic.Beta.BetaMessage
      try {
        response = await ask().catch((err: unknown) => {
          if (!(err instanceof Anthropic.BadRequestError) || alone || messages.length > 1) throw err
          logger.error('askMiriam: Haiku with an advisor was refused; asking Opus alone', err)
          alone = true
          return ask()
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
      // Paused while asking the advisor: carried on from where it stopped.
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content })
        continue
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
      const isAppTool = (name: string) => appTools.includes(name as AppToolName)
      const refusedCall = calls.find(
        (c) => !commands.includes(c.name as CommandName) && !isAppTool(c.name)
      )
      if (refusedCall) return { kind: 'reply', text: 'You don’t have permission to do that.' }

      const form = calls.find((c) => c.name === 'open_event_form')
      if (form) {
        const { draft, notes } = draftFromInput(form.input as EventFormInput, await loadRoster())
        return { kind: 'eventForm', draft, notes }
      }
      const task = calls.find((c) => c.name === 'open_task_form')
      if (task) {
        const { draft, notes } = taskDraftFromInput(
          task.input as Record<string, unknown>,
          await loadRoster()
        )
        return { kind: 'taskForm', draft, notes }
      }
      // An existing event's form, with the changes asked for made.
      const edit = calls.find((c) => c.name === 'edit_event')
      if (edit) {
        const input = edit.input as EventFormInput
        const ev = await lookups.event(String(input.event_key ?? ''))
        if (!ev) return { kind: 'reply', text: 'I couldn’t find that event to change.' }
        const { draft, notes } = draftFromInput(input, await loadRoster(), {
          users: (ev.users ?? []).map(String),
          groups: (ev.groups ?? []).map(String),
        })
        return { kind: 'eventForm', draft, notes, editKey: ev.instanceKey }
      }
      // A change: not made here. The app shows exactly what will be done,
      // and does it only once they confirm.
      const action = calls.find((c) => ACTIONS.includes(c.name as never) && isAppTool(c.name))
      if (action) return { kind: 'confirm', name: action.name, input: action.input }
      const final = calls.find((c) => c.name === 'answer')
      if (final) return finish(final.input as AnswerInput, lookups, viewer)

      // Looked up, and handed back for the next round.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
      for (const call of calls.filter((c) => !isAppTool(c.name))) {
        const input = call.input as { query?: string; date?: string; key?: string }
        let result: unknown
        try {
          result =
            call.name === 'people_and_groups'
              ? await loadRoster().then((r) => ({
                  groups: r.groups.map((g) => `${g.id}: ${g.name}`),
                  people: r.people.map((p) => `${p.id}: ${p.name}`),
                  teams: (r.commonTeams ?? []).map((t) => ({
                    name: t.name,
                    members: t.members.length,
                  })),
                  taskTemplates: (r.taskTemplates ?? []).map((t) => `${t.id}: ${t.name}`),
                }))
              : call.name === 'find_events'
                ? await lookups.findEvents(String(input.query ?? ''), String(input.date ?? ''))
                : call.name === 'get_event'
                  ? await lookups.getEvent(String(input.key ?? ''))
                  : call.name === 'event_availability'
                    ? await lookups.availability(String(input.key ?? ''))
                    : call.name === 'event_weather'
                      ? await lookups.weather(String(input.key ?? ''))
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
      // Lookups the app makes: handed to it, to carry on when it answers.
      const forApp = calls.filter((c) => isAppTool(c.name))
      if (forApp.length) {
        return {
          kind: 'run',
          calls: forApp.map((c) => ({ id: c.id, name: c.name, input: c.input })),
          state: seal(
            {
              uid,
              until: Date.now() + PAUSE_MS,
              round,
              alone,
              appTools,
              messages,
              done: results,
              waiting: forApp.map((c) => c.id),
            },
            key
          ),
        }
      }
      messages.push({ role: 'user', content: results })
    }
    return { kind: 'reply', text: 'I couldn’t work that out — try asking another way.' }
  }
)

interface AnswerInput {
  spoken: string
  open: 'event' | 'task' | 'availability' | 'screen' | 'video' | 'reorder' | 'none'
  target: string
  section: 'dress_code' | 'availability' | 'weather' | 'details' | 'none'
  choices?: string[]
  heard_name?: string
}

/** The answer, and where to show it — only somewhere this person may go. */
async function finish(input: AnswerInput, lookups: Lookups, viewer: Viewer) {
  const text = String(input.spoken ?? '').trim() || 'Sorry, I couldn’t find that.'
  let open: Open | null = null
  if (input.open === 'event' && (await lookups.event(String(input.target)))) {
    const section = ['dress_code', 'availability', 'weather', 'details'].includes(input.section)
      ? (input.section as 'dress_code' | 'availability' | 'weather' | 'details')
      : null
    open = { kind: 'event', key: String(input.target), section }
  } else if (input.open === 'task' && (await lookups.task(String(input.target)))) {
    open = { kind: 'task', id: String(input.target) }
  } else if (input.open === 'availability' && isAdminViewer(viewer)) {
    open = { kind: 'availability' }
  } else if (
    (input.open === 'screen' || input.open === 'video' || input.open === 'reorder') &&
    input.target
  ) {
    // Opened only if the app has it for this person: it checks again.
    open = { kind: input.open, id: String(input.target).slice(0, 80) }
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
