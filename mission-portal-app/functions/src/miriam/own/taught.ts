import { askKind } from './asked'
import { similarity } from './encoder'
import { taughtAnswers, type OwnDb, type TaughtEntry } from './learn'
import { rarity, topicWords } from './site'

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
 *     question's, and all it asks about in the question or the answer;
 *  4. or asked yes or no of what was taught (TAUGHT_ABOUT): "Is abortion a
 *     sin?" of "What is your view on abortion?", "Is The Well cessationist?"
 *     of "Gifts of the Spirit, Cessationism…" — its subject all in the
 *     question taught, with at most one thing said of it.
 * A time or a place asked for is only ever answered with one (./asked:
 * askKind) — but a question of faith asks what it asks: "When will Jesus
 * return?" is answered by "…no one knows when Christ will return".
 */

/** As near as the same question, however worded. */
export const TAUGHT_NEAR = 0.8
/** Nearly as near, with most of what it asks about in the question or answer. */
export const TAUGHT_NEARLY = 0.7
/** Further off in words, with its subject the question's and all it asks about there. */
export const TAUGHT_OTHER_WORDS = 0.4
/** Asked yes or no of what was taught: its words say what it is about, more than its meaning. */
export const TAUGHT_ABOUT = 0.25

/** What a question asks about, as compared (./site): its telling words. */
export { topicWords }

/** A yes-or-no question: "Is abortion a sin?", "Are the gifts of the Spirit active?", "Does The Well…?". */
const YES_NO =
  /^(?:(?:so|and|but|hey|ok|okay)[,\s]+)?(?:miriam[,\s]+)?(?:is|are|was|were|isn'?t|aren'?t|does|do|did|doesn'?t|don'?t|can|could|will|would|should|has|have)\b/i
/** …asked of "it" or "there": "Is it a sin to get a tattoo?" is about the tattoo, not sin. */
const OF_IT =
  /^(?:(?:so|and|but|hey|ok|okay)[,\s]+)?(?:miriam[,\s]+)?(?:is|are|was|were|isn'?t|aren'?t)\s+(?:it|there|this|that)\b/i
/** Asked of themselves: "Is God angry with me?" — theirs to talk over with a pastor, not a statement of belief. */
const OF_ME = /\b(?:i|i'?m|me|my|mine|myself)\b/i
/** Said of a subject, never one: "a sin", "wrong", "biblical". */
const SAID_OF = new Set([
  'sin',
  'wrong',
  'right',
  'ok',
  'okay',
  'bad',
  'evil',
  'good',
  'fine',
  'bible',
])

/** What an answer is about, as it begins: "We believe in one God…" — "god". */
function answerSubject(answer: string): Set<string> {
  const m =
    /^\s*(?:we\s+(?:believe|affirm|teach|hold)|there\s+is)\s+(?:that\s+)?(?:in\s+)?(?:the\s+|one\s+|a\s+|an\s+|only\s+)?(?:deity\s+of\s+(?:our\s+)?)?(?:lord\s+|true\s+)?([a-z’']+(?:\s+[a-z’']+)?)/i.exec(
      answer
    )
  return new Set(m ? topicWords(m[1]) : [])
}

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
  how: 'same' | 'nearly' | 'other words' | 'about'
}

type Taught = TaughtEntry & { vec: Float32Array }

const rarities = new WeakMap<readonly Taught[], (w: string) => number>()

/**
 * The answer taught for a question that means the same as this one, if one
 * does — strict: only as near as the same question (for what leans on what
 * was said before: "what about that?"); faith: a question of faith, whatever
 * it asks (a time, a place).
 */
export function taughtFound(
  text: string,
  v: Float32Array,
  taught: readonly Taught[],
  { strict = false, faith = false }: { strict?: boolean; faith?: boolean } = {}
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
  const yesNo = YES_NO.test(text.trim()) && !OF_IT.test(text.trim()) && !OF_ME.test(text)
  let best: TaughtFound | null = null
  for (const t of taught) {
    const near = similarity(v, t.vec)
    if (near < TAUGHT_ABOUT || (!faith && !kindsAgree(text, t.q))) continue
    const inQuestion = new Set(topicWords(t.q))
    const there = new Set([...inQuestion, ...topicWords(t.a)])
    // How much of what it asks about they say, each word counting as much as it is rare.
    const said = all ? asks.filter((w) => there.has(w)).reduce((n, w) => n + rare(w), 0) / all : 0
    // Asked yes or no of what was taught: its subject — the words it starts
    // with — all in the question taught, and at most one thing said of it.
    let subject = 0
    while (subject < asks.length && inQuestion.has(asks[subject])) subject++
    const about =
      yesNo &&
      subject > 0 &&
      asks.length - subject <= 1 &&
      asks.slice(0, subject).some((w) => !SAID_OF.has(w))
    // How much of it the question taught names: all of it, for a question
    // taught as its subjects ("Second coming of Christ and judgment. Heaven
    // and Hell.") and asked in a sentence ("When will Jesus return?").
    const named = all
      ? asks.filter((w) => inQuestion.has(w)).reduce((n, w) => n + rare(w), 0) / all
      : 0
    const how: TaughtFound['how'] | null =
      near >= TAUGHT_NEAR && (asks.length ? said > 0 : inQuestion.size === 0)
        ? 'same'
        : strict
          ? null
          : near >= TAUGHT_NEARLY && said >= 0.5
            ? 'nearly'
            : (near >= TAUGHT_OTHER_WORDS && asks.some((w) => inQuestion.has(w)) && said >= 0.75) ||
                (named >= 0.99 && asks.some((w) => !SAID_OF.has(w)))
              ? 'other words'
              : about
                ? 'about'
                : null
    if (!how) continue
    // Nearest in meaning, saying the most of what it asks, its question
    // naming the most of it ("When will Jesus return?": "Second coming of
    // Christ…" before "Who is Jesus?") — and an answer that is itself about
    // what was asked ("We believe in one God…") first.
    const ofIt = asks.some((w) => answerSubject(t.a).has(w)) ? 0.05 : 0
    const score = near * 0.5 + said * 0.25 + named * 0.25 + ofIt
    if (!best || score > best.score) best = { a: t.a, score, how }
  }
  return best
}

/** An answer an admin taught her to a question that means the same as this one, if there is one. */
export async function taughtFor(
  text: string,
  v: () => Float32Array,
  db: OwnDb,
  opts?: { strict?: boolean; faith?: boolean }
): Promise<string | null> {
  const taught = await taughtAnswers(db).catch(() => [])
  if (taught.length === 0) return null
  return taughtFound(text, v(), taught, opts)?.a ?? null
}
