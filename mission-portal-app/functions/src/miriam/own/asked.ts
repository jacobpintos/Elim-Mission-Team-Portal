import { similarity } from './encoder'

/**
 * The questions people ask Miriam (src/lib/miriamAsked: the words, and what
 * kind of account asked — never who), grouped by what they mean for Admin →
 * Analytics: "when is youth night?" and "what time does youth night start?"
 * are one question, asked twice — and "when is the picnic?" another.
 */

export const ASKED = 'miriamAsked'
/** Kept a little over a year, then cleared (../../cleanup). */
export const ASKED_KEEP_DAYS = 400
/** How near in meaning (./encoder) two questions must be to be one. */
export const SAME_QUESTION = 0.82

export interface AskedGroup {
  /** As it is most often asked. */
  text: string
  /** How many times, all its ways together. */
  count: number
  /** Other ways it was asked, the commonest first. */
  also: string[]
}

/** The words, as compared: lowercase, no punctuation, her name said first gone. */
export const plainAsked = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^(?:(?:hey|ok|okay)\s+)?miriam[,\s]+/, '')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * What a question asks for: a time, a place, a who, a why — never one
 * group, however near their words ("when is youth night?" and "where is
 * youth night?" are as near as two questions get).
 */
export function askKind(text: string): 'time' | 'place' | 'who' | 'why' | 'other' {
  const s = plainAsked(text)
  if (/\b(?:when|what time|how long until|how soon)\b/.test(s)) return 'time'
  if (
    /\bwhere(?:'s|\s+(?:is|are|was|were|will|do|can|should|does\s+\w+\s+(?:meet|start|happen)))\b|\baddress\b|\bdirections\b|\bhow do (?:i|we) get\b/.test(
      s
    )
  )
    return 'place'
  if (/\bwho\b/.test(s)) return 'who'
  if (/\bwhy\b/.test(s)) return 'why'
  return 'other'
}

/**
 * The questions, grouped: the same words first, then each — the most asked
 * first — joined to the first group whose question means the same and asks
 * for the same kind of thing, or the start of its own. Most asked first.
 */
export function groupAsked(
  asked: readonly { text: string; v: Float32Array }[],
  near = SAME_QUESTION
): AskedGroup[] {
  const byWords = new Map<
    string,
    { v: Float32Array; count: number; spelled: Map<string, number> }
  >()
  for (const a of asked) {
    const key = plainAsked(a.text)
    if (!key) continue
    const same = byWords.get(key) ?? { v: a.v, count: 0, spelled: new Map<string, number>() }
    same.count++
    same.spelled.set(a.text, (same.spelled.get(a.text) ?? 0) + 1)
    byWords.set(key, same)
  }
  const groups: {
    v: Float32Array
    kind: ReturnType<typeof askKind>
    count: number
    ways: { text: string; count: number }[]
  }[] = []
  for (const same of [...byWords.values()].sort((a, b) => b.count - a.count)) {
    // As it was most often written.
    const text = [...same.spelled.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const kind = askKind(text)
    const group = groups.find((g) => g.kind === kind && similarity(g.v, same.v) >= near)
    if (group) {
      group.count += same.count
      group.ways.push({ text, count: same.count })
    } else {
      groups.push({ v: same.v, kind, count: same.count, ways: [{ text, count: same.count }] })
    }
  }
  return groups
    .sort((a, b) => b.count - a.count)
    .map((g) => ({
      text: g.ways[0].text,
      count: g.count,
      also: g.ways.slice(1, 4).map((w) => w.text),
    }))
}
