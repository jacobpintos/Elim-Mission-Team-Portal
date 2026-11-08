import { mixerAsked, type MixAmount, type MixerAsk } from './asked'
import {
  channelFound,
  micsOf,
  mixLevel,
  workOut,
  type DeskChange,
  type Target,
  type Worked,
} from './desk'
import type { DeskLink, DeskNames } from './x32'

/**
 * Someone's own in-ears, changed from Worship → In-ear Adjustment
 * (features/worship/InEarTab): the worship team and guests pick the pack
 * they're wearing, which is a mix bus on the desk, and say what they need
 * ("more vocals", "less bass", "mute the click", "my mix louder"). Whatever
 * they say changes that bus only: a channel's send into it, or the bus's own
 * fader. Nothing in the house, nobody else's mix.
 */

/** The pack someone has on: its mix bus, and the bus's name on the desk. */
export interface Pack {
  bus: number
  name: string
}

export type InEarAsk =
  /** A channel in their mix: muted, unmuted, up or down. */
  | { kind: 'channel'; ask: MixerAsk }
  /** Their whole mix louder or quieter. */
  | { kind: 'mix'; up: boolean; by: MixAmount }
  /** Asked of the house or the stream: not theirs to change. */
  | { kind: 'elsewhere' }

/** The whole mix: "my mix", "everything", "overall". */
const WHOLE_MIX =
  /^(?:my\s+)?(?:(?:whole|entire)\s+)?(?:mix|ears|in-?ears|everything|it\s+all|all\s+of\s+it|all|overall(?:\s+volume)?|volume|the\s+mix|monitor|monitors)$/
/** Themselves: "more me", "my voice". */
const ME = /^(?:me|myself|my\s+(?:voice|mic|vocals?|vox|singing))$/

/** What someone asked of their own mix, or null when it isn't about a mix. */
export function inEarAsked(said: string): InEarAsk | null {
  const s = said
    .toLowerCase()
    .replace(/[.!?]+$/, '')
    .trim()
  if (/^(?:louder|turn\s+it\s+up|turn\s+me\s+up|more\s+volume|up)$/.test(s)) {
    return { kind: 'mix', up: true, by: { unit: 'step', size: 'some' } }
  }
  if (/^(?:quieter|softer|turn\s+it\s+down|turn\s+me\s+down|less\s+volume|down)$/.test(s)) {
    return { kind: 'mix', up: false, by: { unit: 'step', size: 'some' } }
  }
  const ask = mixerAsked(said)
  if (!ask) return null
  if (ask.place && ask.place.kind !== 'ears') return { kind: 'elsewhere' }
  if (ask.kind === 'level' && WHOLE_MIX.test(ask.channel)) {
    return { kind: 'mix', up: ask.up, by: ask.by }
  }
  return { kind: 'channel', ask }
}

export type Aimed =
  | { kind: 'channels'; channels: { n: number; name: string }[] }
  /** A name that fits several: which, or all of them. */
  | { kind: 'which'; said: string; options: { n: number; name: string }[] }
  | { kind: 'none'; said: string }

/** The channels a request is for: by name on the desk, "me" by the person's own name. */
export function aimInEar(channel: string, names: DeskNames, me: string): Aimed {
  if (ME.test(channel) && me) {
    const mine = micsOf(me, names.channels)
    if (mine.length === 1) return { kind: 'channels', channels: mine }
    channel = me
  }
  const found = channelFound(channel, names)
  if (found.kind === 'one') {
    return { kind: 'channels', channels: [{ n: found.n, name: found.name }] }
  }
  if (found.kind === 'several') return { kind: 'which', said: channel, options: found.options }
  return { kind: 'none', said: channel }
}

/** The target in someone's own mix: the channel, sending into their pack's bus. */
const inPack = (ch: { n: number; name: string }, pack: Pack): Target => ({
  ch: ch.n,
  chName: ch.name || `Channel ${ch.n}`,
  ears: { bus: pack.bus, busName: pack.name, person: 'you' },
})

/**
 * Several changes as one: "more vocals", for all the vocals. Asked first if
 * any of them would be; made and put back together.
 */
function together(changes: DeskChange[], question: string): DeskChange {
  return {
    askFirst: changes.some((c) => c.askFirst),
    question,
    make: async () => {
      const said: string[] = []
      for (const c of changes) {
        const text = await c.make()
        if (text === null) return null
        said.push(text)
      }
      return said.join(' ')
    },
    undo: async () => {
      const said: string[] = []
      for (const c of [...changes].reverse()) said.unshift(await c.undo())
      return said.join(' ')
    },
  }
}

/**
 * The change a request makes to someone's own mix, worked out from the desk
 * as it is now: each channel's send into their bus (./desk workOut, aimed at
 * their pack), or the bus's own fader.
 */
export async function inEarChange(
  link: DeskLink,
  pack: Pack,
  ask: InEarAsk,
  channels: readonly { n: number; name: string }[]
): Promise<Worked> {
  if (ask.kind === 'mix') return mixLevel(link, pack.bus, ask.up, ask.by)
  if (ask.kind !== 'channel')
    return { kind: 'said', text: 'Only your in-ears can be changed here.' }
  const mine: MixerAsk = { ...ask.ask, place: { kind: 'ears', who: 'me' } }
  const worked: Worked[] = []
  for (const ch of channels) worked.push(await workOut(link, mine, inPack(ch, pack)))
  if (worked.some((w) => w.kind === 'unreachable')) return { kind: 'unreachable' }
  const changes = worked.flatMap((w) => (w.kind === 'change' ? [w.change] : []))
  if (!changes.length) {
    return { kind: 'said', text: worked.map((w) => (w.kind === 'said' ? w.text : '')).join(' ') }
  }
  if (changes.length === 1) return { kind: 'change', change: changes[0] }
  const names = channels.map((c) => c.name).join(', ')
  const how =
    mine.kind === 'mute' ? (mine.mute ? 'Mute' : 'Unmute') : mine.up ? 'Turn up' : 'Turn down'
  return { kind: 'change', change: together(changes, `${how} ${names} in your ears?`) }
}
