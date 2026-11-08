import { encodeOsc, type OscArg } from './osc'
import { CHANNELS, deskValue, type DeskLink } from './x32'
import { wingFollowing, wingMove, wingPrepare, wingPutBack } from './wingChannelMove'

/**
 * Moving channels on the desk: "move channels 15 through 20 to 25 through
 * 30". Each channel strip takes everything it has with it:
 * - its name, colour and icon;
 * - its input, so channel 25 still hears what's plugged into input 15;
 * - delay, trim, polarity and high-pass filter;
 * - gate, compressor, EQ and insert;
 * - fader, mute and pan;
 * - its main and centre sends;
 * - every send to a mix bus (the in-ear mixes);
 * - its DCAs and mute groups.
 * The preamp's gain and phantom power belong to the input, not the channel,
 * so they stay with the input, where the strip still listens.
 *
 * The channels moved onto are switched into the places the others left: two
 * ranges apart swap; ranges that overlap turn round (15–20 to 18–23 puts
 * 21–23 on 15–17). A stereo-linked pair moves as a pair, odd onto odd, or not
 * at all. Everything is read first, so it can all be put back.
 *
 * The addresses are the X32's own for a channel strip, as its remote-control
 * protocol (OSC) has them.
 */

/** A channel strip's settings: where each is under /ch/NN/, and what kind of value it holds. */
export const CHANNEL_SETTINGS: readonly { path: string; t: OscArg['t'] }[] = [
  // The name first: what's read first, to know the desk is there.
  { path: 'config/name', t: 's' },
  ...['icon', 'color', 'source'].map((s) => ({ path: `config/${s}`, t: 'i' as const })),
  { path: 'delay/on', t: 'i' },
  { path: 'delay/time', t: 'f' },
  { path: 'preamp/trim', t: 'f' },
  { path: 'preamp/invert', t: 'i' },
  { path: 'preamp/hpon', t: 'i' },
  { path: 'preamp/hpslope', t: 'i' },
  { path: 'preamp/hpf', t: 'f' },
  ...['on', 'mode'].map((s) => ({ path: `gate/${s}`, t: 'i' as const })),
  ...['thr', 'range', 'attack', 'hold', 'release'].map((s) => ({
    path: `gate/${s}`,
    t: 'f' as const,
  })),
  { path: 'gate/keysrc', t: 'i' },
  { path: 'gate/filter/on', t: 'i' },
  { path: 'gate/filter/type', t: 'i' },
  { path: 'gate/filter/f', t: 'f' },
  ...['on', 'mode', 'det', 'env'].map((s) => ({ path: `dyn/${s}`, t: 'i' as const })),
  { path: 'dyn/thr', t: 'f' },
  { path: 'dyn/ratio', t: 'i' },
  ...['knee', 'mgain', 'attack', 'hold', 'release'].map((s) => ({
    path: `dyn/${s}`,
    t: 'f' as const,
  })),
  { path: 'dyn/pos', t: 'i' },
  { path: 'dyn/keysrc', t: 'i' },
  { path: 'dyn/mix', t: 'f' },
  { path: 'dyn/auto', t: 'i' },
  { path: 'dyn/filter/on', t: 'i' },
  { path: 'dyn/filter/type', t: 'i' },
  { path: 'dyn/filter/f', t: 'f' },
  ...['on', 'pos', 'sel'].map((s) => ({ path: `insert/${s}`, t: 'i' as const })),
  { path: 'eq/on', t: 'i' },
  ...[1, 2, 3, 4].flatMap((b) => [
    { path: `eq/${b}/type`, t: 'i' as const },
    { path: `eq/${b}/f`, t: 'f' as const },
    { path: `eq/${b}/g`, t: 'f' as const },
    { path: `eq/${b}/q`, t: 'f' as const },
  ]),
  { path: 'mix/on', t: 'i' },
  { path: 'mix/fader', t: 'f' },
  { path: 'mix/st', t: 'i' },
  { path: 'mix/pan', t: 'f' },
  { path: 'mix/mono', t: 'i' },
  { path: 'mix/mlevel', t: 'f' },
  ...Array.from({ length: 16 }, (_, i) => i + 1).flatMap((bus) => [
    { path: `mix/${two(bus)}/on`, t: 'i' as const },
    { path: `mix/${two(bus)}/level`, t: 'f' as const },
    // Pan and where the send is taken from are set per pair of buses, on the odd one.
    ...(bus % 2
      ? [
          { path: `mix/${two(bus)}/pan`, t: 'f' as const },
          { path: `mix/${two(bus)}/type`, t: 'i' as const },
        ]
      : []),
  ]),
  { path: 'grp/dca', t: 'i' },
  { path: 'grp/mute', t: 'i' },
  { path: 'automix/group', t: 'i' },
  { path: 'automix/weight', t: 'f' },
]

function two(n: number): string {
  return String(n).padStart(2, '0')
}

/** Every setting's address on a channel. */
export const settingsOf = (ch: number) => CHANNEL_SETTINGS.map((s) => `/ch/${two(ch)}/${s.path}`)

/** The stereo link of a pair of channels (1 is channels 1–2), on or off. */
export const linkAddress = (pair: number) => `/config/chlink/${pair * 2 - 1}-${pair * 2}`
const pairOf = (ch: number) => Math.ceil(ch / 2)

// ─── Asking ─────────────────────────────────────────────────────────────────

export interface MoveAsk {
  /** The first channel moved, and where it goes. */
  from: number
  to: number
  /** How many, side by side. */
  count: number
}

export type MoveSaid =
  | { kind: 'move'; ask: MoveAsk }
  | { kind: 'unclear'; why: string }
  /** Two channels by their names, to be found on the desk: "swap the kick and the snare". */
  | { kind: 'names'; a: string; b: string }

const ONES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const TEENS = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]

/** Numbers said as words, as digits: "twenty five" is 25. Up to the desk's 32. */
export function withDigits(s: string): string {
  const one = (w: string) => ONES.indexOf(w) + 1
  return s
    .replace(
      new RegExp(`\\b(twenty|thirty)[\\s-](${ONES.join('|')})\\b`, 'g'),
      (_, tens: string, w: string) => String((tens === 'twenty' ? 20 : 30) + one(w))
    )
    .replace(/\btwenty\b/g, '20')
    .replace(/\bthirty\b/g, '30')
    .replace(new RegExp(`\\b(${TEENS.join('|')})\\b`, 'g'), (w) => String(10 + TEENS.indexOf(w)))
    .replace(new RegExp(`\\b(${ONES.join('|')})\\b`, 'g'), (w) => String(one(w)))
}

const MOVING = /\b(move|swap|switch|exchange|trade|shift)\b/
const CHANNEL_WORD = /\b(channels?|ch)\b/
// A level or a mute, not a move: "move channel 5 up 3 dB".
const NOT_A_MOVE =
  /%|\b(db|decibels?|percent|up|down|louder|quieter|softer|ears?|house|mute|unmute)\b/

/**
 * "Move channels 15 through 20 to 25 through 30", "move channels 15 to 20 to
 * 25", "switch channel 3 with channel 7", "swap channels 3 and 7": which, and
 * where to. Null when it isn't moving channels; unclear, with why, when the
 * numbers don't fit a desk of this many channels.
 */
export function channelMoveAsked(said: string, channels = CHANNELS): MoveSaid | null {
  const s = withDigits(said.toLowerCase().replace(/[–—]/g, '-'))
  // No numbers: two channels by name, or not a move at all.
  if (!/\d/.test(s)) return namedSwap(s)
  if (!MOVING.test(s) || !CHANNEL_WORD.test(s) || NOT_A_MOVE.test(s)) return null
  const nums = (s.match(/\d+/g) ?? []).map(Number)
  let ask: MoveAsk
  if (nums.length === 2) ask = { from: nums[0], to: nums[1], count: 1 }
  else if (nums.length === 3 || nums.length === 4) {
    const [a, b, c, d] = nums
    if (b < a) return { kind: 'unclear', why: `Say the channels lowest first: ${b} through ${a}.` }
    if (d !== undefined && d - c !== b - a) {
      return {
        kind: 'unclear',
        why: `${a} through ${b} is ${b - a + 1} channels, but ${c} through ${d} is ${d - c + 1}. They need to be the same number.`,
      }
    }
    ask = { from: a, to: c, count: b - a + 1 }
  } else return null
  const why = outOfRange(ask, channels)
  if (why) return { kind: 'unclear', why }
  if (ask.from === ask.to) return { kind: 'unclear', why: 'Those are the same channels.' }
  return { kind: 'move', ask }
}

/** "Swap the kick and the snare", "switch Mia Vox with Jacob Vox". */
const NAMED_SWAP =
  /^(?:(?:hey\s+)?(?:please|miriam|can\s+you|could\s+you)[,\s]+)*(?:swap|switch|exchange|trade)\s+(?:channels?\s+)?(.+?)\s+(?:and|with)\s+(.+?)(?:\s+please)?[.!?]*$/
/** Things swapped that aren't channels: in-ear packs (./swaps), cameras, songs. */
const NOT_CHANNELS =
  /\b(?:packs?|ears?|in-?ears?|iems?|cameras?|cams?|preview|program|songs?|places?|seats?|shifts?|days?|dates?)\b/
const nameSaid = (s: string) =>
  s
    .replace(/^(?:the|channel|ch)\s+/, '')
    .replace(/\s+channel$/, '')
    .trim()

/** Two channels said by name, to swap; null when it isn't that. */
function namedSwap(s: string): MoveSaid | null {
  if (NOT_A_MOVE.test(s) || NOT_CHANNELS.test(s)) return null
  const m = NAMED_SWAP.exec(s.trim())
  if (!m) return null
  const a = nameSaid(m[1])
  const b = nameSaid(m[2])
  return a && b ? { kind: 'names', a, b } : null
}

/** Why a move doesn't fit a desk of this many channels, or null when it does. */
export function outOfRange(ask: MoveAsk, channels: number): string | null {
  const last = Math.max(ask.from, ask.to) + ask.count - 1
  return Math.min(ask.from, ask.to) < 1 || last > channels
    ? `The desk’s channels are 1 to ${channels}.`
    : null
}

// ─── Where each goes ────────────────────────────────────────────────────────

/**
 * Where each channel's strip goes, old to new, for every channel that changes:
 * those asked for onto their new places, and the ones there into the places
 * they left, in order.
 */
export function movePlan(ask: MoveAsk): Map<number, number> {
  const range = (start: number) => Array.from({ length: ask.count }, (_, i) => start + i)
  const moved = range(ask.from)
  const onto = range(ask.to)
  const plan = new Map<number, number>(moved.map((ch, i) => [ch, onto[i]]))
  const displaced = onto.filter((ch) => !moved.includes(ch))
  const freed = moved.filter((ch) => !onto.includes(ch))
  displaced.forEach((ch, i) => plan.set(ch, freed[i]))
  return plan
}

/** The pair a linked pair would land on whole (odd onto odd, together), or null if it would be split. */
function pairLanding(plan: ReadonlyMap<number, number>, pair: number): number | null {
  const odd = plan.get(pair * 2 - 1) ?? pair * 2 - 1
  const even = plan.get(pair * 2) ?? pair * 2
  return odd % 2 === 1 && even === odd + 1 ? pairOf(odd) : null
}

// ─── Reading and writing ───────────────────────────────────────────────────

/** Everything the channels had, and their pairs' links: what a move starts from, and Undo puts back. */
export interface ChannelsBefore {
  values: Map<string, OscArg>
  /** Each pair touched: 1 linked, 0 not (an X32's; a WING has no pairs). */
  links: Map<number, number>
  /** A WING's: each moved channel's name as it shows. */
  shown?: Map<number, string>
}

export type Prepared =
  | { kind: 'ready'; before: ChannelsBefore }
  | { kind: 'unreachable' }
  /** A linked pair the move would split: these two channels. */
  | { kind: 'splits'; channels: [number, number] }

async function readAll(link: DeskLink, addresses: readonly string[]) {
  const out = new Map<string, OscArg>()
  for (let i = 0; i < addresses.length; i += 16) {
    const batch = addresses.slice(i, i + 16)
    const values = await Promise.all(batch.map((a) => deskValue(link, a)))
    batch.forEach((a, j) => {
      const v = values[j]
      if (v) out.set(a, v)
    })
  }
  return out
}

const pairsOf = (plan: ReadonlyMap<number, number>) => [...new Set([...plan.keys()].map(pairOf))]

/** Reads what the channels a move touches have now, and whether it would split a linked pair. */
export async function prepareMove(
  link: DeskLink,
  plan: ReadonlyMap<number, number>
): Promise<Prepared> {
  if (link.model === 'wing' && link.raw) {
    const before = await wingPrepare(link.raw, plan)
    return before
      ? { kind: 'ready', before: { values: before.values, links: new Map(), shown: before.shown } }
      : { kind: 'unreachable' }
  }
  // Whether the desk is there at all, before asking it hundreds of things.
  const first = [...plan.keys()][0]
  if (!first || !(await deskValue(link, settingsOf(first)[0]))) return { kind: 'unreachable' }
  const pairs = pairsOf(plan)
  const linkValues = await readAll(link, pairs.map(linkAddress))
  const links = new Map(pairs.map((p) => [p, linkValues.get(linkAddress(p))?.v ? 1 : 0]))
  for (const p of pairs) {
    if (links.get(p) && pairLanding(plan, p) === null) {
      return { kind: 'splits', channels: [p * 2 - 1, p * 2] }
    }
  }
  const values = await readAll(link, [...plan.keys()].flatMap(settingsOf))
  if (!values.size) return { kind: 'unreachable' }
  return { kind: 'ready', before: { values, links } }
}

const same = (a: OscArg | null | undefined, b: OscArg) =>
  !!a && a.t === b.t && (a.t === 's' || b.t === 's' ? a.v === b.v : Math.abs(a.v - b.v) < 1e-6)

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))

/**
 * Sends values to the desk, a few at a time, then reads them all back and
 * sends again what didn't take. What still hasn't is given back.
 */
async function writeAll(
  link: DeskLink,
  values: ReadonlyMap<string, OscArg>,
  pauseMs: number
): Promise<string[]> {
  const send = async (entries: [string, OscArg][]) => {
    for (let i = 0; i < entries.length; i += 24) {
      for (const [address, v] of entries.slice(i, i + 24)) await link.send(encodeOsc(address, [v]))
      if (pauseMs) await pause(pauseMs)
    }
  }
  const differing = async (entries: [string, OscArg][]) => {
    const now = await readAll(
      link,
      entries.map(([a]) => a)
    )
    return entries.filter(([a, v]) => !same(now.get(a), v))
  }
  let left = [...values]
  await send(left)
  left = await differing(left)
  if (left.length) {
    await send(left)
    left = await differing(left)
  }
  return left.map(([a]) => a)
}

/** The settings and links the desk should end with: each strip in its new place. */
function landed(before: ChannelsBefore, plan: ReadonlyMap<number, number>): ChannelsBefore {
  const values = new Map<string, OscArg>()
  for (const [from, to] of plan) {
    const src = settingsOf(from)
    settingsOf(to).forEach((address, i) => {
      const v = before.values.get(src[i])
      if (v) values.set(address, v)
    })
  }
  const links = new Map<number, number>([...before.links.keys()].map((p) => [p, 0]))
  for (const [p, on] of before.links) {
    const to = pairLanding(plan, p)
    if (on && to !== null) links.set(to, 1)
  }
  return { values, links }
}

/**
 * Puts the desk in this state: links off on the pairs touched (a linked pair
 * copies changes across, which would undo the move), every setting, then the
 * links as they should be. The settings that didn't take are given back.
 */
async function apply(link: DeskLink, state: ChannelsBefore, pauseMs: number): Promise<string[]> {
  const off = new Map<string, OscArg>(
    [...state.links.keys()].map((p) => [linkAddress(p), { t: 'i', v: 0 }])
  )
  await writeAll(link, off, pauseMs)
  const missed = await writeAll(link, state.values, pauseMs)
  const links = new Map<string, OscArg>(
    [...state.links].map(([p, on]) => [linkAddress(p), { t: 'i', v: on }])
  )
  return [...missed, ...(await writeAll(link, links, pauseMs))]
}

/** Moves the channels as planned, from what they had. The settings the desk didn't take are given back. */
export function moveChannels(
  link: DeskLink,
  plan: ReadonlyMap<number, number>,
  before: ChannelsBefore,
  pauseMs = 10
): Promise<string[]> {
  if (link.model === 'wing' && link.raw) {
    return wingMove(link.raw, plan, wingBefore(before), pauseMs)
  }
  return apply(link, landed(before, plan), pauseMs)
}

const wingBefore = (before: ChannelsBefore) => ({
  values: before.values,
  shown: before.shown ?? new Map<number, string>(),
})

/** How many direct outs and side-chains pointing at the channels follow them (a WING's). */
export const followingMove = (
  link: DeskLink,
  plan: ReadonlyMap<number, number>,
  before: ChannelsBefore
): number => (link.model === 'wing' ? wingFollowing(wingBefore(before), plan) : 0)

/** Puts the channels back as they were (Undo). The settings the desk didn't take are given back. */
export function putChannelsBack(
  link: DeskLink,
  before: ChannelsBefore,
  pauseMs = 10
): Promise<string[]> {
  if (link.model === 'wing' && link.raw) return wingPutBack(link.raw, wingBefore(before), pauseMs)
  return apply(link, before, pauseMs)
}

/** A channel's name before the move, or null for one not named. */
export const nameBefore = (before: ChannelsBefore, ch: number): string | null => {
  if (before.shown) return before.shown.get(ch) || null
  const v = before.values.get(settingsOf(ch)[0])
  return v?.t === 's' && v.v.trim() ? v.v.trim() : null
}

/** "channel 5", "channels 15–20". */
export const channelsSaid = (from: number, count: number) =>
  count === 1 ? `channel ${from}` : `channels ${from}–${from + count - 1}`
