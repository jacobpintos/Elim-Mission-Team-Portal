import { beforeEach, describe, expect, it } from 'vitest'
import {
  approve,
  CONFIRM_GAP_MS,
  corrected,
  forget,
  forgetCaches,
  learn,
  LEARNED_DOC,
  LEARNING_DOC,
  learnedExamples,
  listLearning,
  MAX_LEARNED,
  MAX_RETIRED,
  MAX_WAITING,
  ownKnowledge,
  sameKey,
  WAITING_MS,
  type OwnDb,
} from '../../functions/src/miriam/own/learn'
import { packVector } from '../../functions/src/miriam/own/vectors'
import { memoryOwnDb } from './__fixtures__/miriamOwnDb'

/**
 * What Miriam learns from Claude (functions/src/miriam/own/learn): a lesson
 * waits until Claude reads the same request the same way again, in another
 * conversation, or an admin approves it; Claude reading it otherwise takes
 * it back. Meanings here are made to be as near as each test needs.
 */

const MIN = 60 * 1000
const GAP = CONFIRM_GAP_MS
const DAY = 24 * 60 * MIN

/** A meaning this near (cosine) to A, turned toward `dim`: two turned different ways are only as near as each is to A. */
function near(cos: number, dim = 1): Float32Array {
  const v = new Float32Array(8)
  v[0] = cos
  v[dim] = Math.sqrt(1 - cos * cos)
  return v
}
const A = near(1)
/** A meaning near nothing else here. */
function apart(dim: number): Float32Array {
  const v = new Float32Array(8)
  v[dim] = 1
  return v
}

type Doc = Record<string, unknown>
const learnedOf = (db: ReturnType<typeof memoryOwnDb>) =>
  (db.docs.get(LEARNED_DOC)?.examples ?? []) as Doc[]
const learningOf = (db: ReturnType<typeof memoryOwnDb>) =>
  (db.docs.get(LEARNING_DOC) ?? {}) as { waiting?: Doc[]; retired?: Doc[]; handOn?: Doc[] }

/** Lessons in use, whose meanings are never near the tests' own. */
function filler(n: number, extra: Doc = {}): Doc[] {
  return Array.from({ length: n }, (_, i) => ({
    t: `filler ${i}`,
    s: 'event_place',
    v: packVector(new Float32Array([1, 0])),
    at: i,
    by: 'claude',
    y: 2,
    last: i,
    ...extra,
  }))
}

beforeEach(() => forgetCaches())

describe('a lesson', () => {
  it('waits, until Claude reads the same request the same way in another conversation', async () => {
    const db = memoryOwnDb()
    expect(await learn(db, 'when does the event get rolling', 'event_time', A, 0)).toMatchObject({
      kept: 'waiting',
    })
    expect(await learnedExamples(db, 0)).toEqual([])
    // The same words again, in the same conversation: still once.
    await learn(db, 'When does the event get rolling?', 'event_time', A, 5 * MIN)
    expect(learningOf(db).waiting).toMatchObject([{ y: 1, why: 'new' }])
    // In another: hers.
    expect(
      await learn(db, 'when does the event get rolling', 'event_time', A, 5 * MIN + GAP)
    ).toMatchObject({ kept: 'in use' })
    expect(learnedOf(db)).toMatchObject([
      { t: 'when does the event get rolling', s: 'event_time', by: 'claude', y: 2 },
    ])
    expect(learningOf(db).waiting).toEqual([])
    forgetCaches()
    expect((await learnedExamples(db, 5 * MIN + GAP)).map((e) => e.skill)).toEqual(['event_time'])
  })

  it('is confirmed by a request this near, and not by one less near', async () => {
    const db = memoryOwnDb()
    await learn(db, 'when does the event get rolling', 'event_time', A, 0)
    // 0.90: another request — a lesson of its own, and no confirmation.
    await learn(db, 'when do things kick off at the event', 'event_time', near(0.9, 2), GAP)
    expect(learningOf(db).waiting?.map((e) => e.y)).toEqual([1, 1])
    // 0.99: the same request, in other words.
    await learn(db, 'when does the event get going', 'event_time', near(0.99), 2 * GAP)
    expect(learnedOf(db).map((e) => e.t)).toEqual(['when does the event get rolling'])
    expect(learningOf(db).waiting?.map((e) => e.t)).toEqual([
      'when do things kick off at the event',
    ])
  })

  it('is taken back when Claude reads the same request another way — kept, flagged, if approved', async () => {
    const db = memoryOwnDb()
    await learn(db, 'what to wear to the event', 'event_time', A, 0)
    await learn(db, 'what to wear to the event', 'event_time', A, GAP)
    await learn(db, 'is the event formal', 'event_time', apart(3), 0)
    await approve(db, { key: sameKey('is the event formal') }, 1)
    const out = await learn(db, 'what to wear to the event?', 'event_dress', A, 2 * GAP)
    expect(out).toMatchObject({ kept: 'waiting', retired: 1 })
    expect(learnedOf(db).map((e) => e.t)).toEqual(['is the event formal'])
    expect(learningOf(db).retired).toMatchObject([
      { t: 'what to wear to the event', s: 'event_time', why: 'claude:event_dress' },
    ])
    expect(learningOf(db).waiting).toMatchObject([{ s: 'event_dress', y: 1 }])
    // Approved: kept, and flagged for the admin.
    await learn(db, 'is the event formal', 'event_dress', apart(3), 3 * GAP)
    expect(learnedOf(db)).toMatchObject([{ t: 'is the event formal', ok: true, d: 1 }])
  })

  it('isn’t learned again once an admin says it’s wrong — until taken off the list', async () => {
    const db = memoryOwnDb()
    await learn(db, 'is it cold out at the event', 'event_place', A, 0)
    await forget(db, { key: sameKey('is it cold out at the event') }, 1)
    expect(learningOf(db).retired).toMatchObject([{ s: 'event_place', why: 'admin' }])
    expect(await learn(db, 'is it cold out at the event', 'event_place', A, GAP)).toMatchObject({
      kept: 'not kept',
    })
    // Another skill is Claude's to say.
    expect(await learn(db, 'is it cold out at the event', 'event_weather', A, GAP)).toMatchObject({
      kept: 'waiting',
    })
    // Taken off the list: no longer kept to — and the other skill's lesson untouched.
    await forget(db, { key: sameKey('is it cold out at the event'), skill: 'event_place' }, 2 * GAP)
    expect(learningOf(db).retired).toEqual([])
    expect(learningOf(db).waiting).toMatchObject([{ s: 'event_weather' }])
  })

  it('is used once approved, whether waiting or taken back', async () => {
    const db = memoryOwnDb()
    await learn(db, 'who’s driving to the event', 'event_car', A, 0)
    expect(await approve(db, { key: sameKey('who’s driving to the event') }, 1)).toBe('in use')
    expect(learnedOf(db)).toMatchObject([{ by: 'admin', ok: true }])
    await forget(db, { key: sameKey('who’s driving to the event') }, 2)
    expect(await approve(db, { key: sameKey('who’s driving to the event') }, 3)).toBe('in use')
    expect(learningOf(db).retired).toEqual([])
    expect(await approve(db, { key: sameKey('never learned') }, 4)).toBe('not found')
  })
})

describe('what was learned before checking began', () => {
  it('isn’t used, and waits from the next change, as read once', async () => {
    const db = memoryOwnDb()
    db.docs.set(LEARNED_DOC, {
      examples: [
        { t: 'when does the event get rolling', s: 'event_time', v: packVector(A), at: 1 },
      ],
    })
    expect(await learnedExamples(db, 2)).toEqual([])
    expect((await listLearning(db)).waiting).toMatchObject([{ why: 'unchecked' }])
    await learn(db, 'something else entirely', 'web', apart(4), 10)
    expect(learnedOf(db)).toEqual([])
    expect(learningOf(db).waiting).toMatchObject([
      { t: 'when does the event get rolling', why: 'unchecked', y: 1 },
      { t: 'something else entirely', why: 'new' },
    ])
    // One more of Claude's readings, in another conversation: hers.
    await learn(db, 'when does the event get rolling', 'event_time', A, 10 + GAP)
    expect(learnedOf(db)).toMatchObject([{ t: 'when does the event get rolling', by: 'claude' }])
  })
})

describe('while an older version of her serves too (a deploy, a rollback)', () => {
  /** Today's learning, before checking began: what an older version does. */
  async function oldLearn(db: OwnDb, text: string, skill: string, v: Float32Array, now: number) {
    const ref = db.doc(LEARNED_DOC)
    const key = sameKey(text)
    await db.runTransaction(async (tx) => {
      const list = ((await tx.get(ref)).data()?.examples ?? []) as Doc[]
      const kept = list
        .filter(
          (e) => typeof e.t === 'string' && typeof e.v === 'string' && typeof e.s === 'string'
        )
        .filter((e) => sameKey(e.t as string) !== key)
      const examples = [
        ...kept,
        { t: text.slice(0, 300), s: skill, v: packVector(v), at: now },
      ].slice(-1200)
      tx.set(ref, { examples })
    })
  }

  it('loses nothing of what this one keeps, and what it learns waits here', async () => {
    const db = memoryOwnDb()
    await learn(db, 'when does the event get rolling', 'event_time', A, 0)
    await learn(db, 'when does the event get rolling', 'event_time', A, GAP)
    await approve(db, { key: sameKey('when does the event get rolling') }, GAP + 1)
    await learn(db, 'is the event outside', 'event_place', apart(5), GAP + 2)
    const learning = structuredClone(db.docs.get(LEARNING_DOC))
    await oldLearn(db, 'where do I park for the event', 'event_place', apart(6), GAP + 3)
    // Its own: checked, approved, read twice — kept whole.
    expect(learnedOf(db)[0]).toMatchObject({ by: 'claude', ok: true, y: 2, d: 0 })
    expect(db.docs.get(LEARNING_DOC)).toEqual(learning)
    // What it learned unchecked isn't read here.
    forgetCaches()
    expect((await learnedExamples(db, GAP + 4)).map((e) => e.text)).toEqual([
      'when does the event get rolling',
    ])
  })

  it('keeps what a version knowing more skills learned, though it can’t read it', async () => {
    const db = memoryOwnDb()
    const newer = { t: 'I’ll bring the event', s: 'a_newer_skill', v: packVector(A), at: 1 }
    db.docs.set(LEARNED_DOC, { examples: [newer] })
    db.docs.set(LEARNING_DOC, {
      waiting: [{ ...newer, last: 1, y: 1, why: 'new' }],
      retired: [{ ...newer, gone: 1, why: 'admin' }],
      somethingNew: 7,
    })
    expect(await learnedExamples(db, 2)).toEqual([])
    await learn(db, 'I’ll bring the event', 'food_signup', A, 3)
    await forget(db, { key: sameKey('I’ll bring the event') }, 4)
    await approve(db, { key: sameKey('I’ll bring the event') }, 5)
    expect(learnedOf(db).map((e) => e.s)).toEqual(['a_newer_skill', 'food_signup'])
    expect(learningOf(db).waiting?.map((e) => e.s)).toEqual(['a_newer_skill'])
    expect(learningOf(db).retired?.map((e) => e.s)).toEqual(['a_newer_skill'])
    expect(db.docs.get(LEARNING_DOC)?.somethingNew).toBe(7)
  })
})

describe('room', () => {
  it('is made by letting go the lesson read so longest ago — back on its next reading', async () => {
    const db = memoryOwnDb()
    db.docs.set(LEARNED_DOC, { examples: filler(MAX_LEARNED) })
    await learn(db, 'when does the event get rolling', 'event_time', A, 1)
    expect(
      await learn(db, 'when does the event get rolling', 'event_time', A, 1 + GAP)
    ).toMatchObject({ kept: 'in use' })
    expect(learnedOf(db)).toHaveLength(MAX_LEARNED)
    expect(learnedOf(db).some((e) => e.t === 'filler 0')).toBe(false)
    expect(learningOf(db).waiting).toMatchObject([{ t: 'filler 0', why: 'room', y: 1 }])
    // Asked again: back in use, the next longest ago let go.
    await learn(db, 'filler 0', 'event_place', new Float32Array([0, 0, 1]), 1 + 2 * GAP)
    expect(learnedOf(db).some((e) => e.t === 'filler 0')).toBe(true)
    expect(learningOf(db).waiting).toMatchObject([{ t: 'filler 1', why: 'room' }])
  })

  it('is never made from approved lessons', async () => {
    const db = memoryOwnDb()
    db.docs.set(LEARNED_DOC, { examples: filler(MAX_LEARNED, { ok: true }) })
    await learn(db, 'when does the event get rolling', 'event_time', A, 1)
    expect(
      await learn(db, 'when does the event get rolling', 'event_time', A, 1 + GAP)
    ).toMatchObject({ kept: 'full' })
    expect(learningOf(db).waiting).toMatchObject([{ y: 2 }])
    expect(await approve(db, { key: sameKey('when does the event get rolling') }, 2 + GAP)).toBe(
      'full'
    )
  })

  it('keeps each document under a megabyte, however long the requests', async () => {
    const db = memoryOwnDb()
    const long = (i: number) =>
      `${'a very long request about the event '.repeat(9)}${i}`.slice(0, 300)
    const meaning = packVector(new Float32Array(384).map((_, i) => Math.sin(i)))
    db.docs.set(LEARNED_DOC, {
      examples: filler(MAX_LEARNED - 1).map((e, i) => ({ ...e, t: long(i), v: meaning })),
    })
    await learn(db, long(9999), 'event_time', A, 1)
    await learn(db, long(9999), 'event_time', A, 1 + GAP)
    expect(JSON.stringify(learnedOf(db)).length).toBeLessThanOrEqual(950_000)
    expect(learnedOf(db).some((e) => e.t === long(9999))).toBe(true)
  })

  it('lets go of what waits too long, or too much of it, and of the oldest taken back', async () => {
    const db = memoryOwnDb()
    const waiting = Array.from({ length: MAX_WAITING + 5 }, (_, i) => ({
      t: `waiting ${i}`,
      s: 'event_time',
      v: packVector(new Float32Array([1, 0])),
      at: i,
      last: WAITING_MS + i,
      y: 1,
      why: 'new',
    }))
    waiting[0].last = 0 // waited too long
    const retired = Array.from({ length: MAX_RETIRED + 5 }, (_, i) => ({
      t: `gone ${i}`,
      s: 'event_time',
      v: packVector(new Float32Array([1, 0])),
      at: i,
      gone: i,
      why: 'claude:event_place',
    }))
    db.docs.set(LEARNING_DOC, { waiting, retired, handOn: [] })
    await learn(db, 'something else entirely', 'web', A, WAITING_MS + 10)
    const after = learningOf(db)
    expect(after.waiting).toHaveLength(MAX_WAITING)
    expect(after.waiting?.some((e) => e.t === 'waiting 0')).toBe(false)
    expect(after.waiting?.some((e) => e.t === 'something else entirely')).toBe(true)
    expect(after.retired).toHaveLength(MAX_RETIRED)
    expect(after.retired?.[0].t).toBe('gone 5')
  })
})

describe('someone saying an answer wasn’t what they meant', () => {
  async function inUse(
    db: OwnDb,
    text: string,
    skill: 'event_dress' | 'event_time',
    v: Float32Array
  ) {
    await learn(db, text, skill, v, 0)
    await learn(db, text, skill, v, GAP)
  }

  it('flags the lessons that led her, and hands the words to Claude', async () => {
    const db = memoryOwnDb()
    await inUse(db, 'when is the event', 'event_dress', A)
    await corrected(
      db,
      { key: sameKey('when is it'), from: [sameKey('when is the event')] },
      GAP + 1
    )
    expect(learnedOf(db)).toMatchObject([{ t: 'when is the event', d: 1 }])
    forgetCaches()
    expect((await ownKnowledge(db, GAP + 2)).handOn.has(sameKey('when is it'))).toBe(true)
  })

  it('sends them back to wait when Claude reads it another way — and not when the same', async () => {
    const db = memoryOwnDb()
    await inUse(db, 'when is the event', 'event_dress', A)
    const fix = { read: 'event_dress' as const, from: [sameKey('when is the event')] }
    // Claude: the same reading — the answer missed, not her reading.
    await learn(db, 'when is it', 'event_dress', apart(5), 2 * GAP, { corrected: fix })
    expect(learnedOf(db).map((e) => e.t)).toEqual(['when is the event'])
    // Claude: another.
    const out = await learn(db, 'when is it', 'event_time', apart(5), 3 * GAP, {
      corrected: fix,
      keep: false,
    })
    expect(out).toMatchObject({ kept: 'not kept', demoted: 1 })
    expect(learnedOf(db)).toEqual([])
    expect(learningOf(db).waiting).toMatchObject([
      { t: 'when is it', s: 'event_dress' },
      { t: 'when is the event', why: 'corrected', y: 1 },
    ])
  })

  it('hands the words on until she reads them as Claude does', async () => {
    const db = memoryOwnDb()
    const key = sameKey('when is it')
    await corrected(db, { key, from: [] }, 0)
    // Claude read it as event_time; she still reads event_dress: kept handed on.
    await learn(db, 'when is it', 'event_time', A, DAY, {
      herReading: { skill: 'event_dress', key },
    })
    expect(learningOf(db).handOn).toEqual([{ k: key, at: DAY }])
    // Even where nothing is kept as a lesson.
    await learn(db, 'when is it', 'event_time', A, 2 * DAY, {
      keep: false,
      herReading: { skill: 'event_time', key },
    })
    expect(learningOf(db).handOn).toEqual([])
  })
})

describe('Admin → Miriam', () => {
  it('lists what waits, what is used and what was taken back — never who asked', async () => {
    const db = memoryOwnDb()
    await learn(db, 'when does the event get rolling', 'event_time', A, 0)
    await learn(db, 'when does the event get rolling', 'event_time', A, GAP)
    await learn(db, 'is the event outside', 'event_place', apart(5), GAP)
    await learn(db, 'is it cold at the event', 'event_place', apart(6), GAP)
    await forget(db, { key: sameKey('is it cold at the event') }, GAP + 1)
    expect(await listLearning(db)).toEqual({
      inUse: [
        {
          key: sameKey('when does the event get rolling'),
          text: 'when does the event get rolling',
          skill: 'event_time',
          at: 0,
          last: GAP,
          y: 2,
          by: 'claude',
          flagged: false,
          approved: false,
        },
      ],
      waiting: [
        {
          key: sameKey('is the event outside'),
          text: 'is the event outside',
          skill: 'event_place',
          at: GAP,
          last: GAP,
          y: 1,
          why: 'new',
        },
      ],
      retired: [
        {
          key: sameKey('is it cold at the event'),
          text: 'is it cold at the event',
          skill: 'event_place',
          at: GAP,
          gone: GAP + 1,
          why: 'admin',
        },
      ],
      room: { used: 1, max: MAX_LEARNED },
    })
  })
})
