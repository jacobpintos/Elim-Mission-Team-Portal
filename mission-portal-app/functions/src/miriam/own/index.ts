import { shiftDate, type Viewer } from '../data'
import type { Lookups } from '../lookups'
import type { AppToolName } from '../plan'
import { answerFor, said, type OwnResult } from './answers'
import { embed, similarity } from './encoder'
import { mentionsIn } from './events'
import { notHers } from './guards'
import { learnedExamples, taughtAnswers, WEB_DOC, type OwnDb } from './learn'
import type { Skill } from './skills'
import { read, seedExamples, type Reading } from './understand'
import { webAnswer } from './web'
import { faithAnswer } from './faith'

/**
 * Miriam, on her own: a request she understands and can answer herself, she
 * does — no Claude, no cost — and anything else goes on to Claude as before.
 *
 *  1. An answer an admin has taught her, if the question means the same.
 *  2. Otherwise what it is (./understand), read with each event's name as
 *     "the event" (./events) — and, if that isn't plain, as said.
 *  3. Hers only when she is sure (SURE, CLEAR), the words agree (./guards),
 *     and the answer can be had plainly (./answers, ./web).
 *
 * What she read comes back either way, for Claude's answer to teach her
 * (../askMiriam: learn).
 */

/** Near enough its examples, and nearer than the next skill by enough — or nearly, by a lot. */
export const sure = (r: Pick<Reading, 'score' | 'margin'>) =>
  (r.score >= 0.6 && r.margin >= 0.05) || (r.score >= 0.4 && r.margin >= 0.1)

/** A taught answer is said when the question is this near the one it was taught for. */
export const TAUGHT_NEAR = 0.8

export interface OwnInput {
  text: string
  today: string
  /** Their clock, "HH:MM", from the app (newer versions). */
  now: string | null
  history: { said: string; reply: string }[]
  appTools: readonly AppToolName[]
  /** What this version of the app can show: "link". */
  can: readonly string[]
  viewer: Viewer
  lookups: Lookups
  db: OwnDb
  /** For tests: the web as it would answer. */
  web?: (
    text: string,
    braveKey: string | null
  ) => Promise<{ text: string; url: string | null; source: string } | null>
}

export interface OwnRead {
  /** The request as she read it. */
  masked: string
  v: Float32Array
  skill: Skill
  score: number
  margin: number
}

export interface Own {
  result: OwnResult | null
  read: OwnRead | null
  /** Why, for the logs: "taught", "event_time", "not sure", … */
  why: string
}

/** Her offer of maps, made on an event's day (./answers: event_place). */
const MAPS_OFFER = /Want me to open maps for it\?$/
const YES =
  /^(?:yes|yeah|yep|yup|sure|ok|okay|please|please do|do it|go ahead|yes please|sounds good|absolutely|of course)\b/i
const NO = /^(?:no|nope|nah|no thanks|not now|never mind|that's ok(?:ay)?)\b/i
/** Asked plainly to look something up: the web, when no event of theirs is named. */
const LOOK_IT_UP =
  /^(?:(?:hey|ok|okay)\s+)?(?:miriam[,\s]+)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:look\s+up|google|search\s+(?:the\s+)?(?:web|internet|online)\b|search\s+(?:online\s+)?for|look\s+online\s+for|check\s+(?:the\s+)?(?:internet|web)\s+for)\b/i

/** Words that lean on what was said before. */
const LEANS_BACK =
  /\b(?:it|that|this one|that one|there|then|them|him|her|same|again|those|these)\b/i

let braveKey: { at: number; key: string | null } | null = null
async function braveKeyOf(db: OwnDb, now = Date.now()): Promise<string | null> {
  if (braveKey && now - braveKey.at < 5 * 60 * 1000) return braveKey.key
  const key = (await db.doc(WEB_DOC).get()).data()?.braveKey
  braveKey = { at: now, key: typeof key === 'string' && key.trim() ? key.trim() : null }
  return braveKey.key
}
/** Only for tests, and when an admin changes the key. */
export function forgetBraveKey(): void {
  braveKey = null
}

/** An answer from the web, as the app can show it. */
function fromWeb(
  found: { text: string; url: string | null; source: string } | null,
  can: readonly string[]
): OwnResult {
  if (!found) {
    return said('I couldn’t find a clear answer to that online.')
  }
  // A button to the page, on a version of the app that shows one ("Open the page — costco.com").
  const link =
    found.url && can.includes('link')
      ? { kind: 'link' as const, url: found.url, label: found.source }
      : null
  return said(`${found.text} (from ${found.source})`, link)
}

/** A question of faith answered (./faith), as the app can show it. */
async function fromFaith(
  text: string,
  db: OwnDb,
  can: readonly string[],
  v?: Float32Array
): Promise<OwnResult> {
  const f = await faithAnswer(text, db, v)
  return said(f.text, f.link && can.includes('link') ? { kind: 'link', ...f.link } : null)
}

export async function ownAnswer(input: OwnInput): Promise<Own> {
  const { text, today, history, lookups, db } = input
  const last = history[history.length - 1]
  if (last) {
    // Her own offer of maps, answered.
    if (MAPS_OFFER.test(last.reply.trim()) && (YES.test(text.trim()) || NO.test(text.trim()))) {
      if (NO.test(text.trim())) return { result: said('Okay.'), read: null, why: 'maps declined' }
      const titles = (await lookups.eventsBetween(today, today)).map((e) => e.title)
      const { mentions } = mentionsIn(last.said, titles)
      const evs = (await lookups.eventsBetween(today, today)).filter((e) =>
        mentions.some((m) => m.titles.includes(e.title))
      )
      if (evs.length === 1) {
        return {
          result: {
            kind: 'answer',
            text: `Opening maps to ${evs[0].title}.`,
            // The app opens maps to its place (src/features/miriam: open "directions").
            open: { kind: 'directions', key: evs[0].instanceKey },
            choices: [],
            heardName: '',
            followUp: false,
            understood: '',
            misheard: [],
          },
          read: null,
          why: 'maps',
        }
      }
      return { result: null, read: null, why: 'maps: which event' }
    }
    // An answer to a question asked, or leaning on what came before: Claude has the thread.
    if (
      /\?\s*$/.test(last.reply.trim()) ||
      LEANS_BACK.test(text) ||
      text.trim().split(/\s+/).length <= 2
    ) {
      return { result: null, read: null, why: 'carries on a conversation' }
    }
  }

  const events = await lookups.eventsBetween(shiftDate(today, -1), shiftDate(today, 365))
  const { masked, mentions } = mentionsIn(
    text,
    events.map((e) => e.title)
  )
  const v = embed(masked)
  let raw: Float32Array | null = masked === text ? v : null
  const rawV = () => (raw ??= embed(text))

  // 1. Taught: said as an admin wrote it.
  const taught = await taughtAnswers(db).catch(() => [])
  if (taught.length) {
    const q = rawV()
    let best: { a: string; sim: number } | null = null
    for (const t of taught) {
      const sim = similarity(q, t.vec)
      if (!best || sim > best.sim) best = { a: t.a, sim }
    }
    if (best && best.sim >= TAUGHT_NEAR) {
      return { result: said(best.a), read: null, why: `taught (${best.sim.toFixed(2)})` }
    }
  }

  // 2. What it is.
  const examples = [...seedExamples(), ...(await learnedExamples(db).catch(() => []))]
  let reading = read(v, examples)
  if (mentions.length === 0 && LOOK_IT_UP.test(text.trim())) {
    reading = {
      ...reading,
      skill: 'web',
      score: Math.max(reading.score, 0.6),
      margin: Math.max(reading.margin, 0.1),
    }
  }
  let readV = v
  let readText = masked
  if (!sure(reading) && masked !== text) {
    // "What does the Bible say": not Bible Study after all, read as said.
    const asSaid = read(rawV(), examples)
    if (sure(asSaid) || asSaid.score > reading.score) {
      reading = asSaid
      readV = rawV()
      readText = text
    }
  }
  const own: OwnRead = {
    masked: readText,
    v: readV,
    skill: reading.skill,
    score: reading.score,
    margin: reading.margin,
  }
  if (reading.skill === 'other') return { result: null, read: own, why: 'not hers' }
  if (!sure(reading))
    return {
      result: null,
      read: own,
      why: `not sure (${reading.skill} ${reading.score.toFixed(2)}/${reading.margin.toFixed(2)})`,
    }
  const guarded = notHers(text, reading.skill)
  if (guarded) return { result: null, read: own, why: `${reading.skill}, but ${guarded}` }

  // 3. Her answer.
  if (reading.skill === 'faith') {
    return { result: await fromFaith(text, db, input.can, rawV()), read: own, why: 'faith' }
  }
  if (reading.skill === 'web') {
    const key = await braveKeyOf(db).catch(() => null)
    const found = input.web
      ? await input.web(text, key)
      : await webAnswer(text, { braveKey: key, today }).catch(() => null)
    return { result: fromWeb(found, input.can), read: own, why: 'web' }
  }
  const result = await answerFor(reading.skill, {
    text,
    today,
    now: input.now,
    mentions,
    lookups,
    viewer: input.viewer,
    appTools: input.appTools,
  })
  return { result, read: own, why: result ? reading.skill : `${reading.skill}: no plain answer` }
}

/** Claude's answer to a request she handed on, when it says what it was: hers to answer from now on. */
export async function webOrFaith(
  skill: Skill,
  text: string,
  input: Pick<OwnInput, 'db' | 'today' | 'can' | 'web'>
): Promise<OwnResult | null> {
  if (skill === 'faith') return fromFaith(text, input.db, input.can)
  if (skill !== 'web') return null
  const key = await braveKeyOf(input.db).catch(() => null)
  const found = input.web
    ? await input.web(text, key)
    : await webAnswer(text, { braveKey: key, today: input.today }).catch(() => null)
  return fromWeb(found, input.can)
}
