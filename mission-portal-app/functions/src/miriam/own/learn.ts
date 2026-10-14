import { createHash } from 'crypto'
import type { Example } from './understand'
import { OWN_SKILLS, type Skill } from './skills'
import { packVector, unpackVector } from './vectors'

/**
 * What Miriam has learned, and what she has been taught — kept on the server
 * only (firestore.rules: miriamOwn, read by no device), each in one document
 * so that reading it is one read however much there is.
 *
 * Learned: requests Claude handled, each kept as an example of the skill it
 * was (Claude says which: plan.ts, answer's `skill`), so the next worded like
 * it is hers. Kept as she read it — each event's name as "the event" — with
 * its meaning, never who asked. The newest MAX_LEARNED are kept.
 *
 * Taught: answers an admin has given her for questions people ask — what the
 * church believes, where to park — said as written when a question means
 * the same (./index). Admins see and change both in the app (../ownAdmin).
 */

export const LEARNED_DOC = 'miriamOwn/learned'
export const TAUGHT_DOC = 'miriamOwn/taught'
export const WEB_DOC = 'miriamOwn/web'

/** One document holds a little under a megabyte: about 1,500 of these. */
export const MAX_LEARNED = 1200
export const MAX_TAUGHT = 200
/** A taught answer, whole: a statement of belief runs to a few paragraphs. */
export const MAX_TAUGHT_ANSWER = 6000
/** All she is taught is kept in one document: this much of its megabyte, at most. */
const MAX_TAUGHT_BYTES = 900_000

export interface LearnedEntry {
  /** The request as she read it. */
  t: string
  s: Skill
  /** Its meaning (./vectors). */
  v: string
  at: number
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
let learnedCache: { at: number; examples: Example[] } | null = null
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

function learnedFrom(data: Record<string, unknown> | undefined): LearnedEntry[] {
  const list = Array.isArray(data?.examples) ? (data!.examples as unknown[]) : []
  return list.filter(
    (e): e is LearnedEntry =>
      !!e &&
      typeof (e as LearnedEntry).t === 'string' &&
      typeof (e as LearnedEntry).v === 'string' &&
      ((OWN_SKILLS as readonly string[]).includes((e as LearnedEntry).s) ||
        (e as LearnedEntry).s === 'other')
  )
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

/** What she has learned, as examples to read requests by (./understand). */
export async function learnedExamples(db: OwnDb, now = Date.now()): Promise<Example[]> {
  if (learnedCache && now - learnedCache.at < FRESH_MS) return learnedCache.examples
  const snap = await db.doc(LEARNED_DOC).get()
  const examples: Example[] = []
  for (const e of learnedFrom(snap.data())) {
    const v = unpackVector(e.v)
    if (v) examples.push({ text: e.t, skill: e.s, v })
  }
  learnedCache = { at: now, examples }
  return examples
}

/** One more example learned: the newest of the same words replaces the older. */
export async function learn(
  db: OwnDb,
  text: string,
  skill: Skill,
  v: Float32Array,
  now = Date.now()
): Promise<void> {
  const ref = db.doc(LEARNED_DOC)
  const key = sameKey(text)
  await db.runTransaction(async (tx) => {
    const kept = learnedFrom((await tx.get(ref)).data()).filter((e) => sameKey(e.t) !== key)
    const examples = [
      ...kept,
      { t: text.slice(0, 300), s: skill, v: packVector(v), at: now },
    ].slice(-MAX_LEARNED)
    tx.set(ref, { examples })
  })
  // Here at once; other instances within FRESH_MS.
  if (learnedCache) {
    learnedCache.examples = [
      ...learnedCache.examples.filter((e) => sameKey(e.text) !== key),
      { text, skill, v },
    ]
  }
}

/** Forgotten: an example an admin says was learned wrong. */
export async function forget(db: OwnDb, text: string): Promise<void> {
  const ref = db.doc(LEARNED_DOC)
  const key = sameKey(text)
  await db.runTransaction(async (tx) => {
    const examples = learnedFrom((await tx.get(ref)).data()).filter((e) => sameKey(e.t) !== key)
    tx.set(ref, { examples })
  })
  learnedCache = null
}

export async function listLearned(
  db: OwnDb
): Promise<{ text: string; skill: Skill; at: number }[]> {
  return learnedFrom((await db.doc(LEARNED_DOC).get()).data())
    .map((e) => ({ text: e.t, skill: e.s, at: e.at }))
    .reverse()
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
  learnedCache = null
  taughtCache = null
}
