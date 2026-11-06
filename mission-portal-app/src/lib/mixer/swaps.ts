import { mixerPlain } from './asked'

/**
 * Who is using whose in-ear pack, or whose mic, today. The desk's in-ear mixes
 * and mic channels are named after the people they're for ("Sunny IEM",
 * "Jacob Vox"), so when someone uses another's, Miriam goes by what they have:
 *
 *   "Mia is using Sunny's pack, and Sunny is using Mia's pack"
 *     "in Mia's ears" is Sunny's mix, and "in Sunny's ears" Mia's.
 *   "Joel is using Jacob's pack" (Joel has no mix of his own)
 *     "in Joel's ears" is Jacob's mix.
 *   "Mia is using Jacob's mic"
 *     "mute Mia vox" is Jacob Vox, even with a Mia Vox on the desk. Her
 *     instruments stay hers: "Mia keys" is still Mia Keys.
 *
 * One pack or mic, one person. Each swap lasts 12 hours, or until "reset the
 * packs" (or the mics).
 */

export type SwapItem = 'pack' | 'mic'

export interface Swap {
  item: SwapItem
  /** Who is using it, as said. */
  user: string
  /** Whose it is: who its mix or channel is named after. */
  owner: string
  /** When it was said (ms). */
  at: number
}

export const SWAP_HOURS = 12
const SWAP_MS = SWAP_HOURS * 60 * 60 * 1000

export type SwapsSaid =
  /** `owner` the same as `user`: back on their own. */
  | { kind: 'using'; pairs: { item: SwapItem; user: string; owner: string }[] }
  /** Every swap of these items forgotten. */
  | { kind: 'reset'; items: SwapItem[] }
  | { kind: 'which' }

const PACK = String.raw`(?:(?:in[\s-]?ear\s+)?packs?|in[\s-]?ears?|iems?|belt\s*packs?|receivers?)`
const MIC = String.raw`(?:(?:vocal\s+|handheld\s+|wireless\s+|headset\s+)?mics?|microphones?|handhelds?|headsets?)`
const ITEM = `(${PACK}|${MIC})`
const itemOf = (word: string): SwapItem => (new RegExp(`^${MIC}$`).test(word) ? 'mic' : 'pack')

const NAME = String.raw`[\p{L}][\p{L}.-]*(?:\s+[\p{L}][\p{L}.-]*)??`
const OWN = /^(?:(?:her|his|their|my)(?:\s+own)?|own)$/
const OWNER = String.raw`(?:the\s+)?(${NAME}|her\s+own|his\s+own|their\s+own|her|his|their)(?:'s|s')?\s+(?:own\s+)?`
const VERB = String.raw`(?:'s|\s+is|\s+will\s+be|'ll\s+be)?(?:\s+back)?\s+(?:using|wearing|on|borrowing|taking|got|has|have|with|singing\s+on)\s+`

/** "Mia is using Sunny's pack", "Mia's on her own mic". */
const WHEN = String.raw`(?:\s+back)?(?:\s+(?:today|tonight|this\s+morning|this\s+week|for\s+now|for\s+today))?`
const USING = new RegExp(`^(${NAME})${VERB}${OWNER}${ITEM}${WHEN}$`, 'u')
/** "…and Jacob's mic": another one for the same person. */
const ALSO = new RegExp(`^${OWNER}${ITEM}${WHEN}$`, 'u')
/** "Mia and Sunny swapped packs". */
const SWAPPED = new RegExp(
  `^(${NAME})\\s+and\\s+(${NAME})\\s+(?:have\\s+|are\\s+)?(?:swapped|switched|traded|exchanged|swapping|switching|trading|swap|switch|trade)\\s+${ITEM}$`,
  'u'
)
const RESET_WORD = /\b(?:reset|clear|undo|forget|cancel|end)\b/
const ALL_OWN =
  /\beveryone(?:'s|\s+is|\s+has)?\s+(?:back\s+)?(?:on|using|wearing|has|got)?\s*(?:their|his|her)?\s*own\b/
const WHICH =
  /\bwho(?:'s|\s+is|\s+has)\s+(?:using|wearing|on|got)?\s*(?:whose|which|what)\b|\bwhat\s+are\s+the\s+(?:swaps|packs|mics)\b|\bwho\s+has\s+whose\b|\bany\s+(?:pack\s+|mic\s+)?swaps\b/

const titled = (name: string) => name.replace(/(^|\s|-)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())

const mentions = (s: string) => ({
  packs: new RegExp(`\\b${PACK}\\b`).test(s) || /\bpack\s+(?:names|swaps?)\b/.test(s),
  mics: new RegExp(`\\b${MIC}\\b`).test(s),
  swaps: /\bswaps?\b/.test(s),
})

/** What was said about who is using whose pack or mic, or null when it wasn't about that. */
export function swapsSaid(said: string): SwapsSaid | null {
  const s = mixerPlain(said).replace(
    /^(?:(?:hey\s+)?miriam\s+)?(?:(?:so|ok|okay|today|tonight)\s+)*/,
    ''
  )
  const m = mentions(s)
  const items = (): SwapItem[] =>
    m.swaps || (m.packs && m.mics) || (!m.packs && !m.mics)
      ? ['pack', 'mic']
      : m.packs
        ? ['pack']
        : ['mic']
  if (RESET_WORD.test(s) && (m.packs || m.mics || m.swaps)) return { kind: 'reset', items: items() }
  if (ALL_OWN.test(s) && (m.packs || m.mics)) return { kind: 'reset', items: items() }
  if (WHICH.test(s) && (m.packs || m.mics || m.swaps)) return { kind: 'which' }
  const swapped = SWAPPED.exec(s)
  if (swapped) {
    const [a, b] = [titled(swapped[1]), titled(swapped[2])]
    const item = itemOf(swapped[3])
    return {
      kind: 'using',
      pairs: [
        { item, user: a, owner: b },
        { item, user: b, owner: a },
      ],
    }
  }
  const pairs: { item: SwapItem; user: string; owner: string }[] = []
  let user = ''
  for (const clause of s.split(/\s*(?:,|;|\band\s+then\b|\band\b|\balso\b|\bwhile\b)\s*/)) {
    if (!clause) continue
    const u = USING.exec(clause)
    const also = u ? null : ALSO.exec(clause)
    if (u) user = titled(u[1])
    else if (!also || !user) return null
    const [owner, item] = u ? [u[2], u[3]] : [also![1], also![2]]
    pairs.push({ item: itemOf(item), user, owner: OWN.test(owner) ? user : titled(owner) })
  }
  return pairs.length ? { kind: 'using', pairs } : null
}

const tokens = (name: string) =>
  mixerPlain(name)
    .replace(/'s\b|s'$/g, '')
    .split(/[\s-]+/)
    .filter(Boolean)

/** The same person: "Mia" and "mia", or "Mia" and "Mia Torres". */
export function sameName(a: string, b: string): boolean {
  const x = tokens(a)
  const y = tokens(b)
  if (!x.length || !y.length) return false
  if (x.join(' ') === y.join(' ')) return true
  return (x.length === 1 || y.length === 1) && x[0] === y[0]
}

/** The swaps still in force: each for 12 hours from when it was said. */
export const liveSwaps = (swaps: readonly Swap[], now: number) =>
  swaps.filter((p) => now - p.at < SWAP_MS && now >= p.at - 60_000)

/** When a swap ends by itself. */
export const swapEnds = (p: Swap) => p.at + SWAP_MS

/**
 * The swaps once these are said: each person on the pack or mic named, and
 * each pack or mic with one person only. `moved`: who had one that someone
 * else has now, and wasn't given another in the same breath.
 */
export function withSwaps(
  swaps: readonly Swap[],
  pairs: readonly { item: SwapItem; user: string; owner: string }[],
  now: number
): { swaps: Swap[]; moved: { item: SwapItem; owner: string; from: string; to: string }[] } {
  let live = liveSwaps(swaps, now)
  const moved: { item: SwapItem; owner: string; from: string; to: string }[] = []
  for (const { item, user, owner } of pairs) {
    const had = live.find(
      (p) => p.item === item && sameName(p.owner, owner) && !sameName(p.user, user)
    )
    if (had && !pairs.some((q) => q.item === item && sameName(q.user, had.user))) {
      moved.push({ item, owner: had.owner, from: had.user, to: user })
    }
    live = live.filter(
      (p) => p.item !== item || (!sameName(p.user, user) && !sameName(p.owner, owner))
    )
    // Back on their own: nothing to remember.
    if (!sameName(user, owner)) live.push({ item, user, owner, at: now })
  }
  return { swaps: live, moved }
}

/** Every swap of these items forgotten. */
export const resetSwaps = (swaps: readonly Swap[], items: readonly SwapItem[], now: number) =>
  liveSwaps(swaps, now).filter((p) => !items.includes(p.item))

/**
 * Whose pack or mic someone's name means now: the owner of the one they're
 * using. Their own, if they aren't using another's — with who has it, if
 * someone else does.
 */
export function whoseFor(
  item: SwapItem,
  person: string,
  swaps: readonly Swap[],
  now: number
): { owner: string; swap: Swap | null; lentTo: string | null } {
  const live = liveSwaps(swaps, now).filter((p) => p.item === item)
  const using = live.find((p) => sameName(p.user, person))
  if (using) return { owner: using.owner, swap: using, lentTo: null }
  const lent = live.find((p) => sameName(p.owner, person))
  return { owner: person, swap: null, lentTo: lent ? lent.user : null }
}

/** The swaps said back: "Mia has Sunny’s pack; Joel has Jacob’s pack; Mia has Jacob’s mic." */
export function swapsListed(swaps: readonly Swap[], now: number): string {
  const live = liveSwaps(swaps, now)
  if (!live.length) return 'Everyone is on their own packs and mics.'
  return `${live.map((p) => `${p.user} has ${p.owner}’s ${p.item}`).join('; ')}.`
}
