import { decodeOsc, encodeOsc, type OscArg } from './osc'

/**
 * The Behringer X32 sound desk, over its own Wi-Fi: what it answers to, and
 * how its faders read in dB.
 *
 * Addresses, values and the fader scale are as the desk has them, and as
 * Patrick-Gilles Maillot's X32 emulator (github.com/pmaillot/X32-Behringer,
 * X32Channel.h, X32Bus.h, X32.c) has them too.
 */

/** The port the desk listens on. */
export const X32_PORT = 10023
export const CHANNELS = 32
/** The mix buses: in-ear mixes are made on these. */
export const BUSES = 16

/** A fader has 1024 positions, from 0 (nothing) to 1 (+10 dB). */
const STEPS = 1023
const clamp = (f: number) => Math.min(1, Math.max(0, f))

/** A fader or send position on the desk's own scale: the nearest of its 1024. */
export const snapFader = (f: number) => Math.round(clamp(f) * STEPS) / STEPS

/**
 * A position in dB, as the desk shows it: four straight stretches, −∞ at the
 * bottom, −10 dB halfway up, 0 dB three quarters of the way, +10 dB at the top.
 */
export function faderToDb(f: number): number {
  if (f <= 0) return -Infinity
  if (f >= 0.5) return f * 40 - 30
  if (f >= 0.25) return f * 80 - 50
  if (f >= 0.0625) return f * 160 - 70
  return f * 480 - 90
}

/** The position for a level in dB (the nearest the desk has). */
export function dbToFader(db: number): number {
  if (db <= -90) return 0
  let f: number
  if (db < -60) f = (db + 90) / 480
  else if (db < -30) f = (db + 70) / 160
  else if (db < -10) f = (db + 50) / 80
  else f = (db + 30) / 40
  return snapFader(f)
}

const two = (n: number) => String(n).padStart(2, '0')

/** Where each thing is on the desk. Channels 1–32, buses 1–16. */
export const X32 = {
  channelName: (ch: number) => `/ch/${two(ch)}/config/name`,
  busName: (bus: number) => `/bus/${two(bus)}/config/name`,
  /** The channel's mute button: 1 is on (heard), 0 is muted. */
  on: (ch: number) => `/ch/${two(ch)}/mix/on`,
  /** The channel's fader: its level in the house (the main speakers). */
  fader: (ch: number) => `/ch/${two(ch)}/mix/fader`,
  /** Whether the channel goes to the main left/right: the house speakers. */
  mainLR: (ch: number) => `/ch/${two(ch)}/mix/st`,
  /** Whether the channel goes to the mono/centre bus, which often feeds the subs. */
  mainMono: (ch: number) => `/ch/${two(ch)}/mix/mono`,
  /** The channel's level to the mono/centre bus. */
  monoLevel: (ch: number) => `/ch/${two(ch)}/mix/mlevel`,
  /** The channel's send to a mix bus (an in-ear mix): on, and its level. */
  sendOn: (ch: number, bus: number) => `/ch/${two(ch)}/mix/${two(bus)}/on`,
  sendLevel: (ch: number, bus: number) => `/ch/${two(ch)}/mix/${two(bus)}/level`,
}

/** The way to the desk: one message out, and the desk's answer back. */
export interface DeskLink {
  /** Sends this and gives back the first answer, or null if none came in time. */
  exchange(message: Uint8Array, timeoutMs: number): Promise<Uint8Array | null>
  /** Sends this, expecting no answer (the desk doesn't answer a change). */
  send(message: Uint8Array): Promise<void>
}

/** How long to wait for the desk to answer: on its own Wi-Fi, it answers in milliseconds. */
const ANSWER_MS = 400

/** The desk's value at an address, or null if it didn't answer (asked twice: UDP can drop one). */
export async function deskValue(link: DeskLink, address: string): Promise<OscArg | null> {
  for (let tries = 0; tries < 2; tries++) {
    const reply = await link.exchange(encodeOsc(address), ANSWER_MS)
    const m = reply ? decodeOsc(reply) : null
    if (m && m.address === address && m.args.length) return m.args[0]
  }
  return null
}

const sameValue = (a: OscArg, b: OscArg) =>
  a.t === 's' || b.t === 's' ? a.v === b.v : Math.abs(a.v - b.v) < 0.5 / STEPS

/** Changes a value, then reads it back: true once the desk has it. */
export async function setDeskValue(
  link: DeskLink,
  address: string,
  value: OscArg
): Promise<boolean> {
  await link.send(encodeOsc(address, [value]))
  const now = await deskValue(link, address)
  return now !== null && sameValue(now, value)
}

/** The desk's own name and model (Setup → Network), or null when it can't be reached. */
export async function deskInfo(link: DeskLink): Promise<{ name: string; model: string } | null> {
  const reply = await link.exchange(encodeOsc('/xinfo'), ANSWER_MS * 2)
  const m = reply ? decodeOsc(reply) : null
  if (!m || m.address !== '/xinfo') return null
  const [, name, model] = m.args.map((a) => (a.t === 's' ? a.v : ''))
  return { name: name ?? '', model: model ?? '' }
}

/** The names on the desk's channels and mix buses ('' for one not named), by number from 1. */
export interface DeskNames {
  channels: string[]
  buses: string[]
}

/** Every channel's and bus's name, or null when the desk can't be reached. */
export async function readDeskNames(link: DeskLink): Promise<DeskNames | null> {
  // One first, on its own: whether the desk is there at all.
  const first = await deskValue(link, X32.channelName(1))
  if (!first) return null
  const addresses = [
    ...Array.from({ length: CHANNELS - 1 }, (_, i) => X32.channelName(i + 2)),
    ...Array.from({ length: BUSES }, (_, i) => X32.busName(i + 1)),
  ]
  const values: (OscArg | null)[] = []
  // A few at a time: quick, without flooding the desk.
  for (let i = 0; i < addresses.length; i += 8) {
    values.push(...(await Promise.all(addresses.slice(i, i + 8).map((a) => deskValue(link, a)))))
  }
  const text = (v: OscArg | null) => (v?.t === 's' ? v.v.trim() : '')
  return {
    channels: [text(first), ...values.slice(0, CHANNELS - 1).map(text)],
    buses: values.slice(CHANNELS - 1).map(text),
  }
}
