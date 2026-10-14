import { askKind } from './asked'
import { similarity } from './encoder'
import { taughtAnswers, type OwnDb, type TaughtEntry } from './learn'
import { faithWords, rarity } from './site'

/**
 * An answer an admin taught her (Admin → Miriam), for a question that means
 * the same however it is worded — "What is your viewpoint on the authority
 * of the Bible?" for "What is your view on the scriptures or the Bible", or
 * "Is the Bible true?" for an answer that says it is truth — and never for
 * one that only sounds like it: "What do you believe about Jesus?" is not
 * "…about God?", nor "Where is youth group?" "When is…?".
 *
 * How near in meaning (./encoder) it is to the question taught, and what it
 * asks about: its telling words (./site: faithWords), leaving out those any
 * question has ("view", "believe", "true"), found in that question or its
 * answer —
 *  1. as near as the same question (TAUGHT_NEAR), asking about something they say;
 *  2. nearly as near (TAUGHT_NEARLY), with most of what it asks about there;
 *  3. or in other words altogether (TAUGHT_OTHER_WORDS): its subject the
 *     question's, and all it asks about in the question or the answer.
 * A time or a place asked for is only ever answered with one (./asked: askKind).
 */

/** As near as the same question, however worded. */
export const TAUGHT_NEAR = 0.8
/** Nearly as near, with most of what it asks about in the question or answer. */
export const TAUGHT_NEARLY = 0.7
/** Further off in words, with its subject the question's and all it asks about there. */
export const TAUGHT_OTHER_WORDS = 0.4

/** Words any question of its kind has: "what is your view on…", "do you believe…", "is it true…". */
const ASKING = new Set(
  'view viewpoint point stance position opinion thought belief teach taught stand perspective approach understand mean official general christian believer yall guy folk exactly basically kind sort type still today nowadays currently ever real true'.split(
    ' '
  )
)

/** What a question asks about, as compared: its telling words. */
export const topicWords = (text: string) => [
  ...new Set(faithWords(text).filter((w) => !ASKING.has(w))),
]

/** A time or a place asked for, answered only by an answer to the same; anything else, alike. */
function kindsAgree(asked: string, taught: string): boolean {
  const a = askKind(asked)
  const t = askKind(taught)
  const exact = (k: string) => k === 'time' || k === 'place'
  return a === t || (!exact(a) && !exact(t))
}

export interface TaughtFound {
  a: string
  score: number
  /** Which way it was found, for the logs. */
  how: 'same' | 'nearly' | 'other words'
}

type Taught = TaughtEntry & { vec: Float32Array }

const rarities = new WeakMap<readonly Taught[], (w: string) => number>()

/**
 * The answer taught for a question that means the same as this one, if one
 * does — strict: only as near as the same question (for what leans on what
 * was said before: "what about that?").
 */
export function taughtFound(
  text: string,
  v: Float32Array,
  taught: readonly Taught[],
  { strict = false }: { strict?: boolean } = {}
): TaughtFound | null {
  if (taught.length === 0) return null
  // How rare each word is among what was taught: "God" says little, "baptism" a lot.
  let rare = rarities.get(taught)
  if (!rare) {
    rare = rarity(taught.map((t) => ({ text: `${t.q} ${t.a}` })))
    rarities.set(taught, rare)
  }
  const asks = topicWords(text)
  const all = asks.reduce((n, w) => n + rare(w), 0)
  let best: TaughtFound | null = null
  for (const t of taught) {
    const near = similarity(v, t.vec)
    if (near < TAUGHT_OTHER_WORDS || !kindsAgree(text, t.q)) continue
    const inQuestion = new Set(topicWords(t.q))
    const there = new Set([...inQuestion, ...topicWords(t.a)])
    // How much of what it asks about they say, each word counting as much as it is rare.
    const said = all ? asks.filter((w) => there.has(w)).reduce((n, w) => n + rare(w), 0) / all : 0
    const how: TaughtFound['how'] | null =
      near >= TAUGHT_NEAR && (asks.length ? said > 0 : inQuestion.size === 0)
        ? 'same'
        : strict
          ? null
          : near >= TAUGHT_NEARLY && said >= 0.5
            ? 'nearly'
            : asks.some((w) => inQuestion.has(w)) && said >= 0.75
              ? 'other words'
              : null
    if (!how) continue
    const score = near * 0.6 + said * 0.4
    if (!best || score > best.score) best = { a: t.a, score, how }
  }
  return best
}

/** An answer an admin taught her to a question that means the same as this one, if there is one. */
export async function taughtFor(
  text: string,
  v: () => Float32Array,
  db: OwnDb,
  opts?: { strict?: boolean }
): Promise<string | null> {
  const taught = await taughtAnswers(db).catch(() => [])
  if (taught.length === 0) return null
  return taughtFound(text, v(), taught, opts)?.a ?? null
}
