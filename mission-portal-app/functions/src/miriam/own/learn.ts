import { createHash } from 'crypto'
import { similarity } from './encoder'
import { forgetStory } from './leaders'
import type { Example } from './understand'
import { OWN_SKILLS, type Skill } from './skills'
import { packVector, unpackVector } from './vectors'

/**
 * What Miriam has learned, and what she has been taught — kept on the server
 * only (firestore.rules: miriamOwn, read by no device), each list in one
 * document so that reading it is one read however much there is.
 *
 * Learned: requests Claude handled, each a lesson in the skill Claude said
 * it was (../plan: answer's `skill`; ./labels), kept as she read it — each
 * event's name as "the event" — with its meaning, never who asked. A lesson
 * waits, unused, until Claude has read the same request the same way again,
 * in another conversation (CONFIRM_GAP_MS apart), or an admin approves it:
 * one wrong reading from Claude never answers anyone. Only then is it hers to
 * answer by (LEARNED_DOC, where every version of her reads it). Claude
 * reading the same request another way takes it back; so does someone saying
 * an answer from it wasn't what they meant (../askMiriam: correct), and the
 * words they said it to are handed to Claude until she reads them as Claude
 * does. What waits, what was taken back, and those words are kept apart
 * (LEARNING_DOC), read by this version and later ones only.
 *
 * Taught: answers an admin has given her for questions people ask — what the
 * church believes, where to park — said as written when a question means
 * the same (./index). Admins see and change both in the app (../ownAdmin).
 */

export const LEARNED_DOC = 'miriamOwn/learned'
export const LEARNING_DOC = 'miriamOwn/learning'
export const TAUGHT_DOC = 'miriamOwn/taught'
export const WEB_DOC = 'miriamOwn/web'

const DAY_MS = 24 * 60 * 60 * 1000
/**
 * Lessons in use, at most. An older version cuts the list to its own copy of
 * this whenever it writes it (a deploy, a rollback), so it stays as it was.
 */
export const MAX_LEARNED = 1200
/** Waiting, at most: room for all that was learned before checking began. */
export const MAX_WAITING = 1200
/** Taken back, kept to show admins (and an admin's "not this", to keep to): the latest. */
export const MAX_RETIRED = 100
/** Words handed to Claude after a correction, at most. */
export const MAX_HAND_ON = 200
/** A lesson waiting this long since Claude last read it so, or words handed on this long: let go. */
export const WAITING_MS = 60 * DAY_MS
export const HAND_ON_MS = 60 * DAY_MS
/**
 * The same request: the same words, or meanings this near. No two requests
 * of different skills in her tests come this near ("when's the event this
 * year" and "where's the event at this year": 0.925), so a reading of one
 * never confirms, or takes back, a lesson of the other.
 */
export const SAME_REQUEST = 0.95
/**
 * Readings this far apart count as two: another conversation, perhaps
 * another person — who asked is never kept to tell.
 */
export const CONFIRM_GAP_MS = 10 * 60 * 1000
/** One document holds a little under a megabyte: each list's document, this much at most. */
const MAX_DOC_BYTES = 950_000
/** One document holds a little under a megabyte: about 1,500 of these. */
export const MAX_TAUGHT = 200
/** A taught answer, whole: a statement of belief runs to a few paragraphs. */
export const MAX_TAUGHT_ANSWER = 6000
/** All she is taught is kept in one document: this much of its megabyte, at most. */
const MAX_TAUGHT_BYTES = 900_000

/** A lesson as stored: its skill may be one a newer version of her knows, and it may carry more. */
interface Lesson {
  /** The request as she read it. */
  t: string
  s: string
  /** Its meaning (./vectors). */
  v: string
  at: number
}

/** In use (LEARNED_DOC). Without `by`: learned unchecked — before checking began, or by an older version. */
interface InUse extends Lesson {
  by?: 'claude' | 'admin'
  /** Claude's readings of it, the same way, in as many conversations. */
  y?: number
  /** When last read so, or approved. */
  last?: number
  /** How often someone said an answer from it wasn't what they meant, or Claude read it otherwise, since kept. */
  d?: number
  /** Approved by an admin: kept through any of that. */
  ok?: true
}

/** Why a lesson waits: read once, learned unchecked, taken back after a correction, or let go to make room. */
export type WaitWhy = 'new' | 'unchecked' | 'corrected' | 'room'
interface Waiting extends Lesson {
  last: number
  y: number
  why: WaitWhy
}

/** Taken back: by Claude ("claude:<skill>", what Claude read it as), or by an admin ("admin"). */
interface Retired extends Lesson {
  gone: number
  why: string
}

/** Words handed to Claude after a correction (their sameKey), and when last. */
interface Marker {
  k: string
  at: number
  /**
   * Her reading wasn't what led her wrong (an event's page; or Claude read
   * it as she did): handed on until it expires, not let go when she reads
   * it as Claude does — she already did.
   */
  hold?: true
}

export interface TaughtEntry {
  id: string
  q: string
  a: string
  v: string
  at: number
  by: string
}

/** The little of Firestore used here, so the app's tests need nothing from firebase-admin. */
export interface OwnDb {
  doc(path: string): {
    get(): Promise<{ data(): Record<string, unknown> | undefined }>
    set(data: Record<string, unknown>, options?: { merge: boolean }): Promise<unknown>
  }
  runTransaction<T>(fn: (tx: OwnTx) => Promise<T>): Promise<T>
}
export interface OwnTx {
  get(ref: ReturnType<OwnDb['doc']>): Promise<{ data(): Record<string, unknown> | undefined }>
  set(ref: ReturnType<OwnDb['doc']>, data: Record<string, unknown>): unknown
}

/** Read again after this long: what another server instance learned, picked up. */
const FRESH_MS = 5 * 60 * 1000
let knowledgeCache: { at: number; knowledge: Knowledge } | null = null
let taughtCache: { at: number; answers: (TaughtEntry & { vec: Float32Array })[] } | null = null

/** Same words, same request. */
export const sameKey = (text: string) =>
  createHash('sha1')
    .update(
      text
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .digest('hex')
    .slice(0, 16)

const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

/** A skill this version knows: only those are weighed, moved or let go. Any other is kept as it is. */
const knownSkill = (s: string): s is Skill =>
  (OWN_SKILLS as readonly string[]).includes(s) || s === 'other'

/** Checked: confirmed by Claude's readings, or approved. */
const checked = (e: InUse) => e.by === 'claude' || e.by === 'admin'

/** The lessons stored in a list, whatever their skill: kept as they are when the list is written again. */
function lessonsIn(list: unknown): Lesson[] {
  return (Array.isArray(list) ? list : []).filter(
    (e): e is Lesson =>
      !!e &&
      typeof (e as Lesson).t === 'string' &&
      typeof (e as Lesson).v === 'string' &&
      typeof (e as Lesson).s === 'string'
  )
}

/** All that is stored of her learning, as it is worked on. */
interface State {
  inUse: InUse[]
  waiting: Waiting[]
  retired: Retired[]
  handOn: Marker[]
  /** Anything else a newer version keeps in LEARNING_DOC: kept. */
  rest: Record<string, unknown>
}

function stateOf(
  learned: Record<string, unknown> | undefined,
  learning: Record<string, unknown> | undefined
): State {
  const { waiting, retired, handOn, ...rest } = learning ?? {}
  return {
    inUse: lessonsIn(learned?.examples) as InUse[],
    waiting: lessonsIn(waiting).map((e) => {
      const w = e as Partial<Waiting> & Lesson
      return {
        ...w,
        last: num(w.last) || num(w.at),
        y: num(w.y) || 1,
        why: typeof w.why === 'string' ? w.why : 'new',
      } as Waiting
    }),
    retired: lessonsIn(retired).map((e) => {
      const r = e as Partial<Retired> & Lesson
      return { ...r, gone: num(r.gone) || num(r.at), why: typeof r.why === 'string' ? r.why : '' }
    }),
    handOn: (Array.isArray(handOn) ? handOn : []).filter(
      (m): m is Marker =>
        !!m && typeof (m as Marker).k === 'string' && typeof (m as Marker).at === 'number'
    ),
    rest,
  }
}

const waitingAs = (e: Lesson, why: WaitWhy, now: number): Waiting => ({
  t: e.t,
  s: e.s,
  v: e.v,
  at: num(e.at) || now,
  last: now,
  y: 1,
  why,
})
const retiredAs = (e: Lesson, why: string, now: number): Retired => ({
  t: e.t,
  s: e.s,
  v: e.v,
  at: num(e.at) || now,
  gone: now,
  why,
})
/** When last read so: what makes room goes by. */
const lastOf = (e: InUse | Waiting) => num(e.last) || num(e.at)

/**
 * Room for one more lesson in use, made by letting go — to wait again — the
 * one Claude confirmed that was last read so longest ago (her lessons in use
 * never reach Claude, so that is least asked of her). Approved ones stay.
 * False when there is no room to make.
 */
function roomFor(st: State, adding: Lesson, now: number): boolean {
  let bytes = JSON.stringify(st.inUse).length + JSON.stringify(adding).length + 1
  while (st.inUse.length >= MAX_LEARNED || bytes > MAX_DOC_BYTES) {
    let oldest = -1
    st.inUse.forEach((e, i) => {
      if (e.by !== 'claude' || e.ok || !knownSkill(e.s)) return
      if (oldest < 0 || lastOf(e) < lastOf(st.inUse[oldest])) oldest = i
    })
    if (oldest < 0) return false
    const [gone] = st.inUse.splice(oldest, 1)
    bytes -= JSON.stringify(gone).length + 1
    st.waiting.push(waitingAs(gone, 'room', now))
  }
  return true
}

/** Within bounds, and in an order an older version's cut (oldest first) keeps the right ones by. */
function bounded(st: State, now: number): void {
  st.waiting = st.waiting
    .filter((e) => !knownSkill(e.s) || now - e.last < WAITING_MS)
    .sort((a, b) => a.last - b.last)
    .slice(-MAX_WAITING)
  // An admin's "not this" kept apart from Claude's readings otherwise: never pushed out by them.
  const byAdmin = (e: Retired) => e.why === 'admin'
  st.retired = [
    ...st.retired
      .filter(byAdmin)
      .sort((a, b) => a.gone - b.gone)
      .slice(-MAX_RETIRED),
    ...st.retired
      .filter((e) => !byAdmin(e))
      .sort((a, b) => a.gone - b.gone)
      .slice(-MAX_RETIRED),
  ].sort((a, b) => a.gone - b.gone)
  st.handOn = st.handOn
    .filter((m) => now - m.at < HAND_ON_MS)
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_HAND_ON)
  // Approved last, then by when last read so: an older version cuts from the front.
  st.inUse = st.inUse.sort((a, b) => (a.ok ? 1 : 0) - (b.ok ? 1 : 0) || lastOf(a) - lastOf(b))
  while (st.waiting.length && JSON.stringify(learningOf(st)).length > MAX_DOC_BYTES) {
    st.waiting.shift()
  }
}

const learningOf = (st: State) => ({
  ...st.rest,
  waiting: st.waiting,
  retired: st.retired,
  handOn: st.handOn,
})

/**
 * Her learning, worked on in one transaction: both documents read, `change`
 * made, and each written only if it changed. The knowledge she reads by is
 * read again on this instance; others pick it up within FRESH_MS.
 */
async function changing<T>(db: OwnDb, now: number, change: (st: State) => T): Promise<T> {
  const learnedRef = db.doc(LEARNED_DOC)
  const learningRef = db.doc(LEARNING_DOC)
  const result = await db.runTransaction(async (tx) => {
    const learned = (await tx.get(learnedRef)).data()
    const learning = (await tx.get(learningRef)).data()
    const st = stateOf(learned, learning)
    const before = [JSON.stringify(st.inUse), JSON.stringify(learningOf(st))]
    // Learned unchecked — before checking began, or by an older version since: waits, as one reading.
    st.inUse = st.inUse.filter((e) => {
      if (checked(e) || !knownSkill(e.s)) return true
      st.waiting.push(waitingAs(e, 'unchecked', now))
      return false
    })
    const out = change(st)
    bounded(st, now)
    if (JSON.stringify(st.inUse) !== before[0]) tx.set(learnedRef, { examples: st.inUse })
    const after = learningOf(st)
    if (JSON.stringify(after) !== before[1]) tx.set(learningRef, after)
    return out
  })
  knowledgeCache = null
  return result
}

/** What she reads requests by: her lessons in use, and the words to hand to Claude. */
export interface Knowledge {
  examples: Example[]
  /** sameKey of words someone said an answer to wasn't what they meant: Claude's, for now. */
  handOn: Set<string>
}

/** What she has learned, as she reads requests by it (./understand, ./index). */
export async function ownKnowledge(db: OwnDb, now = Date.now()): Promise<Knowledge> {
  if (knowledgeCache && now - knowledgeCache.at < FRESH_MS) return knowledgeCache.knowledge
  const [learned, learning] = await Promise.all([
    db.doc(LEARNED_DOC).get(),
    db.doc(LEARNING_DOC).get(),
  ])
  const st = stateOf(learned.data(), learning.data())
  const examples: Example[] = []
  for (const e of st.inUse) {
    // Only checked lessons; one learned unchecked waits (above), even before it is moved.
    if (!checked(e) || !knownSkill(e.s)) continue
    const v = unpackVector(e.v)
    if (v) examples.push({ text: e.t, skill: e.s, v, key: sameKey(e.t) })
  }
  const handOn = new Set(st.handOn.filter((m) => now - m.at < HAND_ON_MS).map((m) => m.k))
  const knowledge = { examples, handOn }
  knowledgeCache = { at: now, knowledge }
  return knowledge
}

/** Her lessons in use, as examples to read requests by (./understand). */
export async function learnedExamples(db: OwnDb, now = Date.now()): Promise<Example[]> {
  return (await ownKnowledge(db, now)).examples
}

export interface LearnOptions {
  /**
   * Kept as a lesson (the default). False where it can't be one — read as
   * something it plainly isn't (./guards), or "other" where she leaned
   * toward nothing — and only the words handed on are kept up (below).
   */
  keep?: boolean
  /**
   * An ordinary reading of Claude's: how she read it herself, and the key of
   * the words as she read them. Words handed on after a correction are let
   * go once she reads them as Claude does.
   */
  herReading?: { skill: Skill; key: string }
  /**
   * A correction's reading (../askMiriam: correct): what she had read it as
   * (null: not by her reading), and the lessons that led her (sameKey).
   */
  corrected?: { read: Skill | null; from: string[]; key?: string }
}

export interface Learned {
  /** Where the lesson is now: waiting, in use, waiting for room ('full'), or not kept. */
  kept: 'waiting' | 'in use' | 'full' | 'not kept'
  /** Lessons taken back: Claude read the same request otherwise. */
  retired: number
  /** Lessons sent back to wait: a correction Claude read otherwise. */
  demoted: number
}

/**
 * Claude's reading of a request she handed on: `text` as she read it, the
 * skill Claude said it was, and its meaning. A lesson of the same request
 * and skill (the same words, or SAME_REQUEST near) is read so once more —
 * once a conversation — and in use from the second; any of another skill is
 * taken back. A new request waits, read once.
 */
export async function learn(
  db: OwnDb,
  text: string,
  skill: Skill,
  v: Float32Array,
  now = Date.now(),
  opts: LearnOptions = {}
): Promise<Learned> {
  const key = sameKey(text)
  return changing(db, now, (st) => {
    const out: Learned = { kept: 'not kept', retired: 0, demoted: 0 }
    const meanings = new Map<string, Float32Array | null>()
    const same = (e: Lesson) => {
      if (sameKey(e.t) === key) return true
      if (!meanings.has(e.v)) meanings.set(e.v, unpackVector(e.v))
      const m = meanings.get(e.v)
      return !!m && m.length === v.length && similarity(m, v) >= SAME_REQUEST
    }

    // A correction Claude read otherwise: the lessons that led her wait again — unless approved.
    const fix = opts.corrected
    if (fix?.read && fix.read !== skill) {
      const from = new Set(fix.from)
      st.inUse = st.inUse.filter((e) => {
        if (e.s !== fix.read || e.ok || !from.has(sameKey(e.t))) return true
        st.waiting.push(waitingAs(e, 'corrected', now))
        out.demoted++
        return false
      })
    }

    // Not her reading's doing — an event's page, or Claude read it as she
    // did: the words stay handed on until they expire.
    if (fix?.key && !(fix.read && fix.read !== skill)) {
      const m = st.handOn.find((h) => h.k === fix.key)
      if (m) m.hold = true
    }

    // Words handed on after a correction: let go once she reads them as Claude does.
    const mine = opts.herReading
    if (mine) {
      const at = st.handOn.findIndex((m) => m.k === mine.key && !m.hold)
      if (at >= 0) {
        if (mine.skill === skill) st.handOn.splice(at, 1)
        else st.handOn[at] = { k: mine.key, at: now }
      }
    }

    // An admin said these words aren't this skill: not learned so again.
    const barred = st.retired.some((e) => e.why === 'admin' && e.s === skill && same(e))
    if (barred) return out
    // Kept or not, Claude reading it as "only Claude's" still takes back a
    // lesson of hers for it: one read another way in between is never used.
    // A reading her guards refuse is no reading to go by.
    if (opts.keep === false && skill !== 'other') return out

    // Read otherwise: taken back — an approved one kept, and flagged for an admin.
    st.inUse = st.inUse.filter((e) => {
      if (e.s === skill || !knownSkill(e.s) || !same(e)) return true
      if (e.ok) {
        e.d = num(e.d) + 1
        return true
      }
      st.retired.push(retiredAs(e, `claude:${skill}`, now))
      out.retired++
      return false
    })
    st.waiting = st.waiting.filter((e) => {
      if (e.s === skill || !knownSkill(e.s) || !same(e)) return true
      st.retired.push(retiredAs(e, `claude:${skill}`, now))
      out.retired++
      return false
    })
    if (opts.keep === false) return out

    // Read the same way again: counted, once a conversation.
    let found = false
    for (const e of [...st.inUse, ...st.waiting]) {
      if (e.s !== skill || !same(e)) continue
      found = true
      if (now - lastOf(e) >= CONFIRM_GAP_MS) {
        e.y = (num(e.y) || 1) + 1
        e.last = now
      }
    }
    if (!found)
      st.waiting.push({
        ...waitingAs({ t: text.slice(0, 300), s: skill, v: packVector(v), at: now }, 'new', now),
      })

    // Read so twice: hers, room made for it.
    let full = false
    for (const e of st.waiting.filter((w) => w.y >= 2 && knownSkill(w.s))) {
      const lesson: InUse = { t: e.t, s: e.s, v: e.v, at: e.at, by: 'claude', y: e.y, last: e.last }
      // Room made lets one go to wait: after these are taken out, not among them.
      if (!roomFor(st, lesson, now)) {
        full = true
        continue
      }
      st.waiting.splice(st.waiting.indexOf(e), 1)
      st.inUse.push(lesson)
    }
    const inUse = st.inUse.some((e) => e.s === skill && same(e))
    out.kept = inUse ? 'in use' : full ? 'full' : 'waiting'
    return out
  })
}

/**
 * Someone said an answer of hers wasn't what they meant (../askMiriam:
 * correct): the lessons that led her (`from`) flagged, and the words they
 * said it to (`key`) handed to Claude until she reads them as Claude does.
 */
export async function corrected(
  db: OwnDb,
  { key, from }: { key: string; from: string[] },
  now = Date.now()
): Promise<void> {
  const led = new Set(from)
  await changing(db, now, (st) => {
    for (const e of st.inUse) if (led.has(sameKey(e.t))) e.d = num(e.d) + 1
    st.handOn = [...st.handOn.filter((m) => m.k !== key), { k: key, at: now }]
  })
}

/** A lesson an admin names: by its words (sameKey), and its skill — any, from an older app. */
export interface Which {
  key: string
  skill?: string
}
const isIt =
  ({ key, skill }: Which) =>
  (e: Lesson) =>
    knownSkill(e.s) && sameKey(e.t) === key && (!skill || e.s === skill)

/**
 * An admin's "this is right": the lesson in use from now on, kept through
 * any correction or other reading. 'full' when there is no room for it.
 */
export async function approve(
  db: OwnDb,
  which: Which,
  now = Date.now()
): Promise<'in use' | 'full' | 'not found'> {
  const { key } = which
  const is = isIt(which)
  return changing(db, now, (st) => {
    /** Another skill's lessons of the same request: an admin said this one is right. */
    const others = (e: Lesson) => {
      const v = unpackVector(e.v)
      const sameAs = (l: Lesson) => {
        if (!knownSkill(l.s) || l.s === e.s) return false
        if (sameKey(l.t) === sameKey(e.t)) return true
        const m = unpackVector(l.v)
        return !!v && !!m && m.length === v.length && similarity(m, v) >= SAME_REQUEST
      }
      const take = (l: Lesson) => {
        if (!sameAs(l)) return true
        st.retired.push(retiredAs(l, 'admin', now))
        return false
      }
      st.inUse = st.inUse.filter(take)
      st.waiting = st.waiting.filter(take)
    }
    const using = st.inUse.find(is)
    if (using) {
      others(using)
      using.ok = true
      using.d = 0
      using.by ??= 'admin'
      using.last = now
      return 'in use'
    }
    const e = [...st.waiting, ...st.retired].find(is)
    if (!e) return 'not found'
    const lesson: InUse = {
      t: e.t,
      s: e.s,
      v: e.v,
      at: e.at,
      by: 'admin',
      ok: true,
      y: num((e as Partial<Waiting>).y) || 1,
      last: now,
    }
    if (!roomFor(st, lesson, now)) return 'full'
    others(e)
    const other = (l: Lesson) => !(l.s === e.s && sameKey(l.t) === key)
    st.waiting = st.waiting.filter(other)
    st.retired = st.retired.filter(other)
    st.inUse.push(lesson)
    return 'in use'
  })
}

/**
 * An admin's "this is wrong": the lesson taken back, and never learned so
 * again (an admin's "not this", kept while it is among the latest taken
 * back). One already taken back is taken away altogether.
 */
export async function forget(db: OwnDb, which: Which, now = Date.now()): Promise<void> {
  const is = isIt(which)
  await changing(db, now, (st) => {
    const gone: Retired[] = []
    const take = (e: Lesson) => {
      if (!is(e)) return true
      gone.push(retiredAs(e, 'admin', now))
      return false
    }
    st.inUse = st.inUse.filter(take)
    st.waiting = st.waiting.filter(take)
    if (gone.length) st.retired.push(...gone)
    else st.retired = st.retired.filter((e) => !is(e))
  })
}

/** Taken off the list of those taken back — an admin's "not this" with it: never a lesson waiting or in use. */
export async function takeOff(db: OwnDb, which: Which, now = Date.now()): Promise<void> {
  const is = isIt(which)
  await changing(db, now, (st) => {
    st.retired = st.retired.filter((e) => !is(e))
  })
}

export interface LessonShown {
  key: string
  text: string
  skill: Skill
  at: number
}

/** All she is learning, for Admin → Miriam (../ownAdmin): never who asked. */
export async function listLearning(db: OwnDb): Promise<{
  inUse: (LessonShown & {
    last: number
    y: number
    by: string
    flagged: boolean
    approved: boolean
  })[]
  waiting: (LessonShown & { last: number; y: number; why: WaitWhy })[]
  retired: (LessonShown & { gone: number; why: string })[]
  room: { used: number; max: number }
}> {
  const [learned, learning] = await Promise.all([
    db.doc(LEARNED_DOC).get(),
    db.doc(LEARNING_DOC).get(),
  ])
  const st = stateOf(learned.data(), learning.data())
  const shown = (e: Lesson) => ({
    key: sameKey(e.t),
    text: e.t,
    skill: e.s as Skill,
    at: num(e.at),
  })
  const inUse = st.inUse
    .filter((e) => knownSkill(e.s) && checked(e))
    .map((e) => ({
      ...shown(e),
      last: lastOf(e),
      y: num(e.y),
      by: String(e.by),
      flagged: num(e.d) > 0,
      approved: !!e.ok,
    }))
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.last - a.last)
  // Learned unchecked, not yet moved to wait: shown waiting, as they are read.
  const unchecked = st.inUse
    .filter((e) => knownSkill(e.s) && !checked(e))
    .map((e) => ({ ...shown(e), last: num(e.at), y: 1, why: 'unchecked' as WaitWhy }))
  const waiting = [
    ...st.waiting
      .filter((e) => knownSkill(e.s))
      .map((e) => ({ ...shown(e), last: e.last, y: e.y, why: e.why as WaitWhy })),
    ...unchecked,
  ].sort((a, b) => Number(b.why === 'corrected') - Number(a.why === 'corrected') || b.last - a.last)
  const retired = st.retired
    .filter((e) => knownSkill(e.s))
    .map((e) => ({ ...shown(e), gone: e.gone, why: e.why }))
    .sort((a, b) => b.gone - a.gone)
  return { inUse, waiting, retired, room: { used: st.inUse.length, max: MAX_LEARNED } }
}

function taughtFrom(data: Record<string, unknown> | undefined): TaughtEntry[] {
  const list = Array.isArray(data?.answers) ? (data!.answers as unknown[]) : []
  return list.filter(
    (e): e is TaughtEntry =>
      !!e &&
      typeof (e as TaughtEntry).q === 'string' &&
      typeof (e as TaughtEntry).a === 'string' &&
      typeof (e as TaughtEntry).v === 'string'
  )
}

/** What she has been taught, with each question's meaning. */
export async function taughtAnswers(
  db: OwnDb,
  now = Date.now()
): Promise<(TaughtEntry & { vec: Float32Array })[]> {
  if (taughtCache && now - taughtCache.at < FRESH_MS) return taughtCache.answers
  const answers: (TaughtEntry & { vec: Float32Array })[] = []
  for (const e of taughtFrom((await db.doc(TAUGHT_DOC).get()).data())) {
    const vec = unpackVector(e.v)
    if (vec) answers.push({ ...e, vec })
  }
  taughtCache = { at: now, answers }
  return answers
}

export async function teach(
  db: OwnDb,
  entry: { q: string; a: string; v: Float32Array; by: string },
  now = Date.now()
): Promise<string> {
  const ref = db.doc(TAUGHT_DOC)
  const id = `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`
  await db.runTransaction(async (tx) => {
    const answers = taughtFrom((await tx.get(ref)).data())
    if (answers.length >= MAX_TAUGHT) throw new Error('full')
    const next = [
      ...answers,
      {
        id,
        q: entry.q.slice(0, 300),
        a: entry.a.slice(0, MAX_TAUGHT_ANSWER),
        v: packVector(entry.v),
        at: now,
        by: entry.by,
      },
    ]
    // Kept whole, or not at all: never cut to fit.
    if (Buffer.byteLength(JSON.stringify(next), 'utf8') > MAX_TAUGHT_BYTES) throw new Error('full')
    tx.set(ref, { answers: next })
  })
  taughtCache = null
  return id
}

/**
 * An answer she was taught, changed where it is — its question, its answer,
 * or both — as it would be taught now: false if it is no longer there.
 */
export async function retaught(
  db: OwnDb,
  id: string,
  entry: { q: string; a: string; v: Float32Array; by: string },
  now = Date.now()
): Promise<boolean> {
  const ref = db.doc(TAUGHT_DOC)
  const found = await db.runTransaction(async (tx) => {
    const answers = taughtFrom((await tx.get(ref)).data())
    if (!answers.some((e) => e.id === id)) return false
    const next = answers.map((e) =>
      e.id === id
        ? {
            ...e,
            q: entry.q.slice(0, 300),
            a: entry.a.slice(0, MAX_TAUGHT_ANSWER),
            v: packVector(entry.v),
            at: now,
            by: entry.by,
          }
        : e
    )
    // Kept whole, or not at all: never cut to fit.
    if (Buffer.byteLength(JSON.stringify(next), 'utf8') > MAX_TAUGHT_BYTES) throw new Error('full')
    tx.set(ref, { answers: next })
    return true
  })
  taughtCache = null
  return found
}

export async function untaught(db: OwnDb, id: string): Promise<void> {
  const ref = db.doc(TAUGHT_DOC)
  await db.runTransaction(async (tx) => {
    tx.set(ref, { answers: taughtFrom((await tx.get(ref)).data()).filter((e) => e.id !== id) })
  })
  taughtCache = null
}

export async function listTaught(
  db: OwnDb
): Promise<{ id: string; q: string; a: string; at: number }[]> {
  return taughtFrom((await db.doc(TAUGHT_DOC).get()).data()).map(({ id, q, a, at }) => ({
    id,
    q,
    a,
    at,
  }))
}

/** Only for tests: as a new server instance. */
export function forgetCaches(): void {
  knowledgeCache = null
  taughtCache = null
  forgetStory()
}
