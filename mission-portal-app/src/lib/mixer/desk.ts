import type { MixAmount, MixerAsk } from './asked'
import { mixerPlain } from './asked'
import { isMicWord, sameMeaning, withPhrases } from './lingo'
import { liveSwaps, sameName, whoseFor, type Swap } from './swaps'
import {
  dbToFader,
  deskValue,
  faderToDb,
  setDeskValue,
  snapFader,
  X32,
  type DeskLink,
  type DeskNames,
} from './x32'

/**
 * A request to the desk (./asked) worked out against what is on it: which
 * channel and which in-ear mix, by the names on the desk, and the change.
 *
 * The rules, for live sound: muting and turning down are done at once, with
 * Undo. Unmuting and turning up are asked first, and turning up goes 6 dB at
 * most at a time: a mistake there is feedback, or a mic live at the wrong
 * moment.
 */

/** Turned up, at most this much at a time. */
export const MAX_UP_DB = 6
/** "Turn it down" with no amount: this much. */
const STEP_DB: Record<'little' | 'some' | 'lot', number> = { little: 2, some: 3, lot: 6 }

/** Words, as said or as on the desk, read the same way (./lingo: "electric guitar" is "eg"). */
const words = (s: string) =>
  withPhrases(mixerPlain(s).replace(/'s\b|s'(?=\s|$)/g, ''))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

/**
 * A word said and a word on the desk alike: the same, one the start of the
 * other (3+ letters), or two ways of saying the same thing ("mic" and "Vox").
 */
const alike = (said: string, on: string) =>
  said === on ||
  (said.length >= 3 && on.startsWith(said)) ||
  (on.length >= 3 && said.startsWith(on)) ||
  sameMeaning(said, on)

/** How well what was said names this: 3 all of it, 2 all said found in it (or it in what was said), 0 not. */
function fit(said: string[], name: string[]): number {
  if (!said.length || !name.length) return 0
  if (said.join('') === name.join('')) return 3
  const same = (a: string, b: string) => a === b || sameMeaning(a, b)
  const sameSet =
    said.length === name.length &&
    said.every((w) => name.some((n) => same(w, n))) &&
    name.every((n) => said.some((w) => same(w, n)))
  if (sameSet) return 3
  if (said.every((w) => name.some((n) => alike(w, n)))) return 2
  if (name.every((n) => said.some((w) => alike(w, n)))) return 2
  return 0
}

export type Found =
  | { kind: 'one'; n: number; name: string }
  | { kind: 'several'; options: { n: number; name: string }[] }
  | { kind: 'none' }

const foundOf = (options: { n: number; name: string }[]): Found =>
  !options.length
    ? { kind: 'none' }
    : options.length === 1
      ? { kind: 'one', ...options[0] }
      : { kind: 'several', options }

function best(
  said: string[],
  names: readonly string[],
  skip: (w: string) => boolean = () => false
): Found {
  const said2 = said.filter((w) => !skip(w))
  let top = 0
  let options: { n: number; name: string }[] = []
  names.forEach((name, i) => {
    const f = fit(
      said2,
      words(name).filter((w) => !skip(w))
    )
    if (f > top) {
      top = f
      options = []
    }
    if (f && f === top) options.push({ n: i + 1, name })
  })
  return foundOf(options)
}

/** Which of these names is meant, as said: shared with the video switcher (lib/switcher). */
export const namesFound = (said: string, names: readonly string[]): Found =>
  best(words(said), names)

/** A word that makes a channel someone's mic ("Jacob Vox", "Mia Mic"): ./lingo. A channel named only for them is too. */
const MIC_WORDS = { test: isMicWord }

/** The words of a channel's name besides this person's, and whether the name is theirs at all. */
function besides(person: string[], name: string[]) {
  return {
    theirs: name.some((n) => alike(person[0], n)),
    rest: name.filter((n) => !person.some((p) => alike(p, n))),
  }
}

/** Someone's mic channels on the desk. */
export function micsOf(person: string, names: readonly string[]) {
  const p = words(person)
  return names
    .map((name, i) => ({ n: i + 1, name }))
    .filter(({ name }) => {
      const b = besides(p, words(name))
      return b.theirs && b.rest.every((w) => MIC_WORDS.test(w))
    })
}

/** The channel said, among the desk's: by its name, or "channel 7". */
export function channelFound(said: string, names: DeskNames): Found {
  const n = /^(?:channel|ch)?\s*(\d{1,2})$/.exec(mixerPlain(said))
  if (n && Number(n[1]) >= 1 && Number(n[1]) <= names.channels.length) {
    const i = Number(n[1])
    return { kind: 'one', n: i, name: names.channels[i - 1] || `Channel ${i}` }
  }
  return best(words(said), names.channels)
}

/**
 * The channel said, with who is using whose mic: "Mia vox", with Mia on
 * Jacob's mic, is Jacob's mic channel. Only her mic moves: "Mia keys" is still
 * Mia Keys, and plain "Mia" is either. `note`: said after the channel's name.
 */
export function channelWithSwaps(
  said: string,
  names: DeskNames,
  swaps: readonly Swap[],
  now: number
): { found: Found; note: (n: number) => string | undefined } {
  const saidWords = words(said)
  const mics = liveSwaps(swaps, now).filter((p) => p.item === 'mic')
  for (const p of mics) {
    const b = besides(words(p.user), saidWords)
    if (!b.theirs || b.rest.some((w) => !MIC_WORDS.test(w))) continue
    const theirMic = micsOf(p.owner, names.channels)
    // Plain "Mia": her mic (Jacob's now) or anything else of hers.
    const user = words(p.user)
    const rest = b.rest.length
      ? []
      : names.channels
          .map((name, i) => ({ n: i + 1, name }))
          .filter(({ name }) => {
            const c = besides(user, words(name))
            return c.theirs && c.rest.some((w) => !MIC_WORDS.test(w))
          })
    const micNs = new Set(theirMic.map((o) => o.n))
    return {
      found: foundOf([...theirMic, ...rest]),
      note: (n) => (micNs.has(n) ? `${p.user}’s mic` : undefined),
    }
  }
  const found = channelFound(said, names)
  // Someone's own mic, named, that another is using: said who has it.
  const note = (n: number) => {
    const lent = mics.find(
      (p) =>
        micsOf(p.owner, [names.channels[n - 1] ?? '']).length &&
        !mics.some((q) => sameName(q.user, p.owner))
    )
    return lent ? `${lent.user} has it` : undefined
  }
  return { found, note }
}

/** Words on an in-ear mix's name that aren't the person: "Sunny IEM", "Mitch Ears L". */
const MIX_WORDS = /^(?:iems?|ears?|inears?|in|ear|mons?|monitors?|mix|wedges?|pack|l|r|st|stereo)$/

/** The in-ear mix named after this person, among the desk's buses. */
export function earsFound(person: string, names: DeskNames): Found {
  return best(words(person), names.buses, (w) => MIX_WORDS.test(w))
}

/** Where a request lands: the channel, and the in-ear mix if it's for someone's ears. */
export interface Target {
  ch: number
  chName: string
  /** Said after the channel's name: "Mia’s mic", "Mia has it". */
  chNote?: string
  /** The in-ear mix, whose ears were said, and whose pack it is if not theirs. */
  ears?: { bus: number; busName: string; person: string; note?: string }
  /** Mix buses that feed house speakers ("Subs", "Front Fill"): part of "the house". */
  houseBuses?: number[]
  /** A WING's mains that feed the house (not the stream's): the house there, in place of the X32's left/right and mono. */
  houseMains?: number[]
}

/** A mix bus named for house speakers, not someone's in-ears. */
const HOUSE_BUS =
  /\b(?:subs?|sub\s*woofers?|subwoofers?|fills?|front\s*fills?|frontfill|delays?|pa|mains?|house|foh|sides?|centre|center|cluster|lcr)\b/i

/** The desk's mix buses that feed house speakers, by their names. */
export const houseBusesOf = (names: DeskNames) =>
  names.buses.flatMap((name, i) => (HOUSE_BUS.test(name) ? [i + 1] : []))

/** A main named for somewhere other than the room's speakers: the stream, a recording, the lobby. */
const NOT_THE_ROOM =
  /\b(?:stream|streaming|livestream|broadcast|bcast|web|online|record|recording|rec|pro\s*tools|daw|iem|ears?|monitors?|mons?|wedges?|lobby|foyer|nursery|overflow|cry\s*room)\b/i

/**
 * A WING's mains that feed the house: main 1 unless it's named for elsewhere,
 * and any other named for house speakers (./desk HOUSE_BUS: "Subs", "PA").
 * One named for the stream ("Stream", "Pro Tools") never is.
 */
export const houseMainsOf = (names: DeskNames) =>
  (names.mains ?? []).flatMap((name, i) =>
    !NOT_THE_ROOM.test(name) && (i === 0 || HOUSE_BUS.test(name)) ? [i + 1] : []
  )

export type Aimed =
  | { kind: 'target'; target: Target }
  | { kind: 'which channel'; options: { n: number; name: string }[] }
  | { kind: 'no channel' }
  /** Several in-ear mixes for one person: `target` and `ears` waiting for the bus picked. */
  | {
      kind: 'which mix'
      options: { n: number; name: string }[]
      who: string
      target: Target
      ears: { person: string; note?: string }
    }
  | { kind: 'no mix'; who: string }
  | { kind: 'stream' }

const titledName = (s: string) => s.replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())

/** Which channel and mix a request is for, with today's swaps. `me`: the name of whoever is asking. */
export function aim(
  ask: MixerAsk,
  names: DeskNames,
  swaps: readonly Swap[],
  me: string,
  now: number
): Aimed {
  if (ask.place?.kind === 'stream') return { kind: 'stream' }
  const { found, note: noteFor } = channelWithSwaps(ask.channel, names, swaps, now)
  if (found.kind === 'several') return { kind: 'which channel', options: found.options }
  if (found.kind === 'none') return { kind: 'no channel' }
  const target: Target = {
    ch: found.n,
    chName: found.name || `Channel ${found.n}`,
    chNote: noteFor(found.n),
    houseBuses: houseBusesOf(names),
    ...(names.mains ? { houseMains: houseMainsOf(names) } : {}),
  }
  if (ask.place?.kind !== 'ears') return { kind: 'target', target }
  const person = titledName(ask.place.who === 'me' ? me : ask.place.who)
  const pack = whoseFor('pack', person, swaps, now)
  const note = pack.swap
    ? `${pack.owner}’s pack`
    : pack.lentTo
      ? `${pack.lentTo} has that pack`
      : undefined
  const mix = earsFound(pack.owner, names)
  if (mix.kind === 'several') {
    return {
      kind: 'which mix',
      options: mix.options,
      who: pack.owner,
      target,
      ears: { person, note },
    }
  }
  if (mix.kind === 'none') return { kind: 'no mix', who: pack.owner }
  return {
    kind: 'target',
    target: { ...target, ears: { bus: mix.n, busName: mix.name, person, note } },
  }
}

/** The channel said back: "Jacob Vox (Mia’s mic)". */
export const channelSaid = (t: Target) => (t.chNote ? `${t.chName} (${t.chNote})` : t.chName)

/** Whose ears, said back: "Mia’s ears (Sunny’s pack)"; the person's own: "your ears". */
export function earsSaid(e: NonNullable<Target['ears']>): string {
  const whose = e.person === 'you' ? 'your ears' : `${e.person}’s ears`
  return `${whose}${e.note ? ` (${e.note})` : ''}`
}

/** A level as said: "-6 dB", "+2.5 dB", "all the way down". */
export function dbSaid(db: number): string {
  if (db === -Infinity || db <= -90) return 'all the way down'
  const r = Math.round(db * 10) / 10
  return `${r > 0 ? '+' : ''}${r === 0 ? 0 : r} dB`
}

/** A change to the desk, worked out and ready: what it does, and how to put it back. */
export interface DeskChange {
  /** Asked first: unmuting, or turning up. */
  askFirst: boolean
  /** Asked as: "Unmute Mitch EG?" */
  question: string
  /** Makes it; the words to say once it's made, or null if the desk didn't take it. */
  make: () => Promise<string | null>
  /** Puts it back as it was; the words to say. */
  undo: () => Promise<string>
}

export type Worked =
  | { kind: 'change'; change: DeskChange }
  /** Nothing to change ("already muted"), said. */
  | { kind: 'said'; text: string }
  | { kind: 'unreachable' }

const asInt = (v: { t: string; v: number | string } | null) =>
  v && v.t === 'i' ? Number(v.v) : null
const asFloat = (v: { t: string; v: number | string } | null) =>
  v && v.t === 'f' ? Number(v.v) : null

function deltaOf(by: MixAmount, from: number, up: boolean): { to: number; capped: boolean } {
  const fromDb = faderToDb(from)
  let to: number
  if (by.unit === '%') to = snapFader(from + ((up ? 1 : -1) * by.amount) / 100)
  else {
    const db = by.unit === 'dB' ? by.amount : STEP_DB[by.size]
    const start = fromDb === -Infinity ? -90 : fromDb
    to = dbToFader(start + (up ? db : -db))
  }
  if (up && faderToDb(to) - (fromDb === -Infinity ? -90 : fromDb) > MAX_UP_DB + 0.05) {
    return { to: dbToFader((fromDb === -Infinity ? -90 : fromDb) + MAX_UP_DB), capped: true }
  }
  return { to, capped: false }
}

const changeSize = (from: number, to: number) => {
  const a = faderToDb(from)
  const b = faderToDb(to)
  if (a === -Infinity || b === -Infinity) return null
  return Math.round(Math.abs(b - a) * 10) / 10
}

const NOT_TAKEN = 'The desk didn’t take that. Check it on the desk.'

/**
 * What a channel's house feeds were turned off by "mute it in the house", by
 * channel, on this phone: "unmute it in the house" turns the same ones back on.
 */
const outOfTheHouse = new Map<number, string[]>()

/** Forgets what was taken out of the house (tests). */
export function forgetHouseMutes(): void {
  outOfTheHouse.clear()
}

/**
 * "In the house" is every speaker in the room, subs too: on an X32, the
 * channel's feed to the main left/right and to the mono/centre bus (which
 * often feeds the subs); on a WING, to its mains that feed the house (not the
 * stream's); and on either, to any mix bus named for house speakers ("Subs",
 * "Front Fill"). Muted there, each feed that is on is turned off, and
 * remembered. Unmuted, those are turned back on. With nothing remembered
 * (another phone muted it, or the app was closed), the first (the main
 * left/right, or main 1) is, and any other feed whose level is up: one set
 * to be heard.
 */
async function houseMute(link: DeskLink, mute: boolean, t: Target, name: string): Promise<Worked> {
  const mains: { address: string; level: string | null }[] = t.houseMains
    ? t.houseMains.map((m) => ({ address: X32.mainOn(t.ch, m), level: X32.mainLevel(t.ch, m) }))
    : [
        { address: X32.mainLR(t.ch), level: null },
        { address: X32.mainMono(t.ch), level: X32.monoLevel(t.ch) },
      ]
  const feeds = [
    ...mains,
    ...(t.houseBuses ?? []).map((b) => ({
      address: X32.sendOn(t.ch, b),
      level: X32.sendLevel(t.ch, b),
    })),
  ]
  const states: number[] = []
  for (const f of feeds) {
    const v = asInt(await deskValue(link, f.address))
    if (v === null) return { kind: 'unreachable' }
    states.push(v)
  }
  const on = feeds.filter((_, i) => states[i] === 1).map((f) => f.address)
  const lrOn = states[0] === 1
  let change: string[]
  if (mute) {
    if (!on.length) return { kind: 'said', text: `${name} is already muted in the house.` }
    change = on
  } else {
    const remembered = outOfTheHouse.get(t.ch)
    if (remembered) {
      change = remembered.filter((a) => !on.includes(a))
    } else if (lrOn) {
      change = []
    } else {
      change = feeds.length ? [feeds[0].address] : []
      for (const f of feeds.slice(1)) {
        if (on.includes(f.address) || !f.level) continue
        const level = asFloat(await deskValue(link, f.level))
        if (level !== null && level > 0) change.push(f.address)
      }
    }
    if (!change.length) return { kind: 'said', text: `${name} isn’t muted in the house.` }
  }
  const setAll = async (v: number) => {
    let ok = true
    for (const a of change) ok = (await setDeskValue(link, a, { t: 'i', v })) && ok
    return ok
  }
  return {
    kind: 'change',
    change: {
      askFirst: !mute,
      question: `Put ${name} back in the house?`,
      make: async () => {
        if (!(await setAll(mute ? 0 : 1))) return null
        if (mute) outOfTheHouse.set(t.ch, change)
        else outOfTheHouse.delete(t.ch)
        return mute ? `Muted ${name} in the house.` : `${name} is back in the house.`
      },
      undo: async () => {
        if (!(await setAll(mute ? 1 : 0))) return NOT_TAKEN
        if (mute) outOfTheHouse.delete(t.ch)
        else outOfTheHouse.set(t.ch, change)
        return mute ? `${name} is back in the house.` : `${name} is muted in the house again.`
      },
    },
  }
}

/**
 * A whole in-ear mix louder or quieter: its bus's own fader, which every
 * channel in it goes through. Turning up is asked first and goes 6 dB at
 * most, as a channel's does.
 */
export async function mixLevel(
  link: DeskLink,
  bus: number,
  up: boolean,
  by: MixAmount
): Promise<Worked> {
  const address = X32.busFader(bus)
  const from = asFloat(await deskValue(link, address))
  if (from === null) return { kind: 'unreachable' }
  const { to, capped } = deltaOf(by, from, up)
  if (to === snapFader(from)) {
    return {
      kind: 'said',
      text: `Your mix is already all the way ${up ? 'up' : 'down'} (${dbSaid(faderToDb(from))}).`,
    }
  }
  const size = changeSize(from, to)
  const how = `${up ? 'up' : 'down'}${size === null ? '' : ` ${size} dB`}`
  const set = (v: number) => setDeskValue(link, address, { t: 'f', v })
  return {
    kind: 'change',
    change: {
      askFirst: up,
      question: `Turn your whole mix ${how}, to ${dbSaid(faderToDb(to))}?${
        capped ? ' That’s as far as I’ll turn it up at once.' : ''
      }`,
      make: async () =>
        (await set(to)) ? `Your whole mix ${how}, to ${dbSaid(faderToDb(to))}.` : null,
      undo: async () =>
        (await set(from)) ? `Your mix is back to ${dbSaid(faderToDb(from))}.` : NOT_TAKEN,
    },
  }
}

/** The change a request makes, worked out from the desk as it is now. */
export async function workOut(link: DeskLink, ask: MixerAsk, t: Target): Promise<Worked> {
  const name = channelSaid(t)
  const where = t.ears
    ? ` in ${earsSaid(t.ears)}`
    : ask.place?.kind === 'house'
      ? ' in the house'
      : ''

  if (ask.kind === 'mute' && ask.place?.kind === 'house' && !t.ears) {
    return houseMute(link, ask.mute, t, name)
  }

  if (ask.kind === 'mute') {
    // Someone's in-ears: the channel's send to their mix.
    // Neither: the channel's own mute button, as on the desk.
    const address = t.ears ? X32.sendOn(t.ch, t.ears.bus) : X32.on(t.ch)
    const now = asInt(await deskValue(link, address))
    if (now === null) return { kind: 'unreachable' }
    const heard = now === 1
    if (ask.mute && !heard) return { kind: 'said', text: `${name} is already muted${where}.` }
    if (!ask.mute && heard) return { kind: 'said', text: `${name} isn’t muted${where}.` }
    const set = (v: number) => setDeskValue(link, address, { t: 'i', v })
    return {
      kind: 'change',
      change: {
        askFirst: !ask.mute,
        question: `Unmute ${name}${where}?`,
        make: async () => {
          if (!(await set(ask.mute ? 0 : 1))) return null
          return ask.mute ? `Muted ${name}${where}.` : `${name} is unmuted${where}.`
        },
        undo: async () =>
          (await set(heard ? 1 : 0))
            ? heard
              ? `${name} is back on${where}.`
              : `${name} is muted again${where}.`
            : NOT_TAKEN,
      },
    }
  }

  // A level: the channel's fader in the house, or its send to someone's in-ears.
  const address = t.ears ? X32.sendLevel(t.ch, t.ears.bus) : X32.fader(t.ch)
  const from = asFloat(await deskValue(link, address))
  if (from === null) return { kind: 'unreachable' }
  const { to, capped } = deltaOf(ask.by, from, ask.up)
  const place = where || ' in the house'
  if (to === snapFader(from)) {
    return {
      kind: 'said',
      text: `${name} is already all the way ${ask.up ? 'up' : 'down'}${place} (${dbSaid(faderToDb(from))}).`,
    }
  }
  const size = changeSize(from, to)
  const how = `${ask.up ? 'up' : 'down'}${size === null ? '' : ` ${size} dB`}`
  // Muted, it won't be heard however it's set: said, so nobody wonders why.
  const muteAddress = t.ears ? X32.sendOn(t.ch, t.ears.bus) : X32.on(t.ch)
  const muted = asInt(await deskValue(link, muteAddress)) === 0
  const set = (v: number) => setDeskValue(link, address, { t: 'f', v })
  return {
    kind: 'change',
    change: {
      askFirst: ask.up,
      question: `Turn ${name} ${how}${place}, to ${dbSaid(faderToDb(to))}?${
        capped ? ` That’s as far as I’ll turn it up at once.` : ''
      }`,
      make: async () => {
        if (!(await set(to))) return null
        return `${name} ${how}${place}, to ${dbSaid(faderToDb(to))}.${
          muted ? ' It’s muted, though.' : ''
        }`
      },
      undo: async () =>
        (await set(from)) ? `${name} is back to ${dbSaid(faderToDb(from))}${place}.` : NOT_TAKEN,
    },
  }
}
