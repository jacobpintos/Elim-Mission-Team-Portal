import { shiftDate, type Viewer } from '../data'
import type { Lookups } from '../lookups'
import { publicReply, PUBLIC_NOT_HERS, type AppToolName } from '../plan'
import { answerFor, said, toStay, type OwnResult } from './answers'
import { embed } from './encoder'
import { mentionsIn } from './events'
import { notHers } from './guards'
import { learnedExamples, WEB_DOC, type OwnDb } from './learn'
import type { Skill } from './skills'
import { read, seedExamples, type Reading } from './understand'
import { webAnswer } from './web'
import { aboutScripture, faithAnswer, isFaithReply, LEADERSHIP } from './faith'
import { CHURCH_SITE, siteKnowledge } from './site'
import { nameAnswer, nameAsked } from './names'
import { taughtFor } from './taught'

/**
 * Miriam, on her own: a request she understands and can answer herself, she
 * does — no Claude, no cost — and anything else goes on to Claude as before.
 *
 *  1. An answer an admin has taught her, if the question means the same,
 *     however it is worded (./taught).
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

/** The app's own things: "look up my tasks", "look up the set list" are the app's to find, not the web's. */
const THE_APPS =
  /\b(?:my|our|mine|the church|the well|set ?lists?|tasks?|to-?dos?|sermons?|songs?|chords?|chord sheets?|announcements?|messages?|events?|calendar|notes?|reminders?|availability|carpools?|teams?|schedule|content|videos?)\b/i

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

/** Asking more about what was just said: "why?", "what about…", "tell me more". */
const FOLLOWS_ON =
  /^(?:why|how so|how come|what do you mean|tell me more|explain|can you explain|could you explain|more|really|are you sure|but|so|what about|and|then|ok but|okay but|wait|huh|is that|does that|what does that)\b/i
const followsOn = (text: string) =>
  FOLLOWS_ON.test(text.trim()) || LEANS_BACK.test(text) || text.trim().split(/\s+/).length <= 3
/** Whether an answer is the one just given (kept in the conversation cut at 600 characters: their starts compared). */
const justSaid = (answer: string, reply: string) =>
  answer.trim().slice(0, 500) === reply.trim().slice(0, 500)
/** Only said back — "thanks", "amen", "ok", "bye": not more asked. */
const SAID_BACK =
  /^(?:(?:ok(?:ay)?|oh|ah|wow|great|cool|awesome|nice|perfect|good|amen|so true|got it|i see|makes sense|that(?:'|’)?s (?:helpful|good|great|nice|cool|beautiful|true)|that helps|thanks|thank you|thx|ty|appreciate it|so much|very much|a lot|miriam|no|nope|nah|no thanks|hi|hello|hey|bye|goodbye|good night|see you|see ya|later|have a good (?:day|night|one))[\s,.!]*)+$/i

/** Beliefs aren't hers to discuss: the church's leadership, and its website. */
function fromLeadership(can: readonly string[]): OwnResult {
  return said(
    LEADERSHIP,
    can.includes('link') ? { kind: 'link', url: CHURCH_SITE, label: 'thewellofiowa.com' } : null
  )
}

/** A question of faith answered (./faith), as the app can show it. */
async function fromFaith(
  text: string,
  db: OwnDb,
  can: readonly string[],
  v?: Float32Array
): Promise<OwnResult> {
  const f = await faithAnswer(text, db, v)
  const r = said(f.text, f.link && can.includes('link') ? { kind: 'link', ...f.link } : null)
  // The church's own answer stays to be read; "reach out to our leadership" goes as any answer does.
  return f.from === 'leadership' ? r : toStay(r)
}

/** A request, read: its events' names, its meaning, and which of her skills it is. */
interface Understood {
  mentions: ReturnType<typeof mentionsIn>['mentions']
  /** Its meaning as said, not masked. */
  rawV: () => Float32Array
  reading: Reading
  own: OwnRead
}

/**
 * What it is (./understand), read with each event's name as "the event"
 * (./events) — and, if that isn't plain, as said.
 */
async function understand(input: OwnInput, text = input.text): Promise<Understood> {
  const { today, lookups, db } = input
  const events = await lookups.eventsBetween(shiftDate(today, -1), shiftDate(today, 365))
  const { masked, mentions } = mentionsIn(
    text,
    events.map((e) => e.title)
  )
  const v = embed(masked)
  let raw: Float32Array | null = masked === text ? v : null
  const rawV = () => (raw ??= embed(text))

  const examples = [...seedExamples(), ...(await learnedExamples(db).catch(() => []))]
  let reading = read(v, examples)
  // Asked to look it up: the web — but a question of faith is still one
  // (./faith), and the app's own things are the app's.
  if (
    mentions.length === 0 &&
    LOOK_IT_UP.test(text.trim()) &&
    reading.skill !== 'faith' &&
    !THE_APPS.test(text)
  ) {
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
  return {
    mentions,
    rawV,
    reading,
    own: {
      masked: readText,
      v: readV,
      skill: reading.skill,
      score: reading.score,
      margin: reading.margin,
    },
  }
}

/**
 * Whether what came before was about faith: one of her answers on it, or a
 * question of faith (answered with one she was taught, as Admin → Miriam
 * has it, which reads like any other answer).
 */
async function onFaith(input: OwnInput, last: { said: string; reply: string }): Promise<boolean> {
  if (isFaithReply(last.reply)) return true
  if (!last.said.trim()) return false
  const { reading } = await understand(input, last.said)
  return reading.skill === 'faith' && sure(reading)
}

export async function ownAnswer(input: OwnInput): Promise<Own> {
  const { text, today, history, lookups, db } = input
  // Where the names Elim and Miriam come from, as the church gave them
  // (./names) — whatever came before it, and unless an admin taught her otherwise.
  if (nameAsked(text)) {
    const taught = await taughtFor(text, () => embed(text), db)
    if (taught) return { result: toStay(said(taught)), read: null, why: 'taught' }
    const named = nameAnswer(text, await siteKnowledge(db).catch(() => []))
    if (named) {
      return {
        result: toStay(
          said(
            named.text,
            input.can.includes('link')
              ? { kind: 'link', url: named.link.url, label: named.link.label }
              : null
          )
        ),
        read: null,
        why: `names: ${named.which}`,
      }
    }
  }
  const last = history[history.length - 1]
  // Read once, when first needed.
  let understood: Promise<Understood> | null = null
  const whatItIs = () => (understood ??= understand(input))
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
    // More asked about an answer on faith — "why?", "what about…", leaning
    // on what was said — she doesn't discuss beliefs: an answer she was taught
    // for just that (not the one she gave), else the church's leadership. A
    // question of faith of its own is answered as any is, below, however it
    // is worded; something else asked ("who's driving?") as ever; and
    // "thanks" isn't more asked.
    if (!SAID_BACK.test(text.trim()) && followsOn(text) && (await onFaith(input, last))) {
      const { reading, rawV } = await whatItIs()
      if (reading.skill === 'faith' || reading.skill === 'other' || aboutScripture(text)) {
        const taught = await taughtFor(text, rawV, db, { strict: true })
        if (taught && !justSaid(taught, last.reply)) {
          return { result: toStay(said(taught)), read: null, why: 'taught' }
        }
        return { result: fromLeadership(input.can), read: null, why: 'faith: more asked' }
      }
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

  const { mentions, rawV, reading, own } = await whatItIs()

  // 1. Taught: said as an admin wrote it — on faith, kept open to be read.
  const faith = reading.skill === 'faith' || aboutScripture(text)
  const taught = await taughtFor(text, rawV, db, { faith })
  if (taught) {
    const answer = said(taught)
    return {
      result: faith || aboutScripture(taught) ? toStay(answer) : answer,
      read: null,
      why: 'taught',
    }
  }

  // 2. What it is (understand, above).
  if (reading.skill === 'other') return { result: null, read: own, why: 'not hers' }
  if (!sure(reading))
    return {
      result: null,
      read: own,
      why: `not sure (${reading.skill} ${reading.score.toFixed(2)}/${reading.margin.toFixed(2)})`,
    }
  const guarded = notHers(text, reading.skill)
  if (guarded) return { result: null, read: own, why: `${reading.skill}, but ${guarded}` }

  // 3. Her answer. On God or the Bible, only the church's own (./faith) — never the web's.
  if (reading.skill === 'faith' || (reading.skill === 'web' && aboutScripture(text))) {
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
  input: Pick<OwnInput, 'db' | 'today' | 'can' | 'web'> & Partial<Pick<OwnInput, 'history'>>
): Promise<OwnResult | null> {
  // On God or the Bible, only the church's own (./faith) — never the web's.
  if (skill === 'faith' || (skill === 'web' && aboutScripture(text))) {
    // More asked after an answer about faith — "why?", "what about…": an
    // answer she was taught for just that, else the church's leadership, not her.
    const last = input.history?.[input.history.length - 1]
    if (last && isFaithReply(last.reply) && followsOn(text)) {
      const taught = await taughtFor(text, () => embed(text), input.db, { strict: true })
      return taught && !justSaid(taught, last.reply)
        ? toStay(said(taught))
        : fromLeadership(input.can)
    }
    return fromFaith(text, input.db, input.can)
  }
  if (skill !== 'web') return null
  const key = await braveKeyOf(input.db).catch(() => null)
  const found = input.web
    ? await input.web(text, key)
    : await webAnswer(text, { braveKey: key, today: input.today }).catch(() => null)
  return fromWeb(found, input.can)
}

/** Asking something: "what…", "is…", "do you…", or a question mark. */
const ASKS =
  /\?$|^(?:(?:hey|ok|okay|so|and|but)[,\s]+)?(?:miriam[,\s]+)?(?:what|what's|whats|why|how|who|whom|whose|which|where|when|is|are|was|were|do|does|did|can|could|will|would|should|may|might|tell me|explain)\b/i

/**
 * For a public follower, what she couldn't answer herself — nothing goes to
 * Claude: a question of faith is still the church's to answer, or its
 * leadership's (./faith); anything else, said so (../plan: publicReply).
 */
export async function publicAnswer(
  text: string,
  input: Pick<OwnInput, 'db' | 'today' | 'can' | 'web'> & Partial<Pick<OwnInput, 'history'>>
): Promise<OwnResult> {
  const back = publicReply(text)
  if (back === PUBLIC_NOT_HERS && aboutScripture(text) && ASKS.test(text.trim())) {
    const faith = await webOrFaith('faith', text, input).catch(() => null)
    if (faith) return faith
  }
  return said(back)
}
