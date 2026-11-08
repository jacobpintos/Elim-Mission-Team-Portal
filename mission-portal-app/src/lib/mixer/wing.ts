import { decodeOsc, encodeOsc, type OscArg, type OscMessage } from './osc'
import { dbToFader, faderToDb, type DeskLink } from './x32'

/**
 * The Behringer WING sound desk, over its own Wi-Fi.
 *
 * It takes OSC on UDP port 2223, in its own words: a strip's address is its
 * place in the desk's tree, numbered from 1 without leading zeros (/ch/15,
 * /bus/3, /main/1), and every setting has a kind. Asked for a value (the
 * address, with an empty type list), it answers with the value said in words,
 * and then, for a number, its place between the setting's ends (0–1) and the
 * number itself: ",sff" for a level in dB, ",sfi" for an on/off or a count, ",s"
 * for a name or a choice. A value is set by sending it alone (",f", ",i", ",s");
 * nothing comes back.
 *
 * As the desk's tree has it (Behringer's WING remote protocols; the community's
 * libraries that speak it, such as libwing):
 * - 40 channels (/ch/1–40) and 8 aux inputs (/aux/1–8); 16 buses, 4 mains, 8
 *   matrices.
 * - A level is in dB (fader: /fdr; a send: /send/N/lvl), −144 for nothing,
 *   +10 at the top.
 * - /mute is 1 for muted.
 * - A strip has two names: its own (/name), and the one it shows (/$name),
 *   which is its input's when it's set to take its look from the input
 *   (/clink, "link customization to source").
 * - It must be let take changes: Setup → Remote, OSC on, and Remote Lock off.
 *
 * The rest of the app asks every desk as it asks an X32 (./x32: DeskLink);
 * `wingLink` puts those questions in the WING's words, and its answers back.
 */

export const WING_PORT = 2223
/** Where it answers "WING?" with who it is, for finding it on the network. */
export const WING_FIND_PORT = 2222

/** What kind of value a setting holds: a number in its units, a whole number, or words. */
export type WingKind = 'f' | 'i' | 's'

/** The value in a WING's answer: the number itself for a number, else the words. */
export function wingValueOf(m: OscMessage | null, kind: WingKind): OscArg | null {
  if (!m || !m.args.length) return null
  const last = <T extends OscArg['t']>(t: T) =>
    [...m.args].reverse().find((a): a is Extract<OscArg, { t: T }> => a.t === t)
  if (kind === 's') return m.args[0].t === 's' ? m.args[0] : null
  if (kind === 'i') {
    const i = last('i')
    if (i) return i
    const f = last('f')
    return f ? { t: 'i', v: Math.round(f.v) } : null
  }
  return last('f') ?? null
}

const ANSWER_MS = 400

/** A setting's value, asked of the WING in its own words (twice: UDP can drop one), or null. */
export async function wingGet(raw: DeskLink, path: string, kind: WingKind): Promise<OscArg | null> {
  for (let tries = 0; tries < 2; tries++) {
    const reply = await raw.exchange(encodeOsc(path, [], true), ANSWER_MS)
    const m = reply ? decodeOsc(reply) : null
    if (m && m.address === path) {
      const v = wingValueOf(m, kind)
      if (v) return v
    }
  }
  return null
}

/** Sets a setting on the WING, in its own words. */
export function wingSet(raw: DeskLink, path: string, value: OscArg): Promise<void> {
  return raw.send(encodeOsc(path, [value]))
}

/** "WING,192.168.1.62,Sanctuary,ngc-full,S123,3.0.6": what a WING answers "WING?" with. */
export function wingFromAnswer(answer: Uint8Array | null): { name: string; model: string } | null {
  if (!answer) return null
  const parts = new TextDecoder().decode(answer).trim().split(',')
  if (parts[0] !== 'WING' || parts.length < 4) return null
  return { name: parts[2] ?? '', model: wingModelSaid(parts[3] ?? '') }
}

/** A WING's model, as people say it: "ngc-rack" is a WING Rack. */
export function wingModelSaid(model: string): string {
  if (/rack|rck/i.test(model)) return 'WING Rack'
  if (/compact|cmpct/i.test(model)) return 'WING Compact'
  return 'WING'
}

/** "WING?", as sent to find one. */
export const WING_ASK = new TextEncoder().encode('WING?')

// ─── The X32's way of asking, in the WING's words ──────────────────────────

const n = (two: string) => String(Number(two))
const levelOf = (db: number) => (db <= -144 ? 0 : dbToFader(db))
const dbOf = (fader: number) => {
  const db = faderToDb(fader)
  return db === -Infinity ? -144 : Math.round(db * 100) / 100
}

/** A strip's name, as asked the X32's way, and where the WING has it. */
const NAMED: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/ch\/(\d\d)\/config\/name$/, (m) => `/ch/${n(m[1])}`],
  [/^\/auxin\/(\d\d)\/config\/name$/, (m) => `/aux/${n(m[1])}`],
  [/^\/bus\/(\d\d)\/config\/name$/, (m) => `/bus/${n(m[1])}`],
  [/^\/main\/(\d\d)\/config\/name$/, (m) => `/main/${n(m[1])}`],
  [/^\/mtx\/(\d\d)\/config\/name$/, (m) => `/mtx/${n(m[1])}`],
]

/**
 * A setting asked the X32's way, in the WING's: where it is, what kind it is,
 * and how its value reads either way. Null for one with no counterpart.
 */
interface Said {
  path: string
  kind: WingKind
  /** The WING's value, the X32's way. */
  read: (v: OscArg) => OscArg
  /** The X32's value, the WING's way. */
  write: (v: OscArg) => OscArg
}

const same = (v: OscArg) => v
const onOf = (v: OscArg): OscArg => ({ t: 'i', v: 1 - Number(v.v) })
const levelRead = (v: OscArg): OscArg => ({ t: 'f', v: levelOf(Number(v.v)) })
const levelWrite = (v: OscArg): OscArg => ({ t: 'f', v: dbOf(Number(v.v)) })

function said(address: string): Said | null {
  let m: RegExpMatchArray | null
  if ((m = address.match(/^\/ch\/(\d\d)\/mix\/on$/))) {
    // The X32's "on" is heard; the WING's "mute" is muted.
    return { path: `/ch/${n(m[1])}/mute`, kind: 'i', read: onOf, write: onOf }
  }
  if ((m = address.match(/^\/ch\/(\d\d)\/mix\/fader$/))) {
    return { path: `/ch/${n(m[1])}/fdr`, kind: 'f', read: levelRead, write: levelWrite }
  }
  if ((m = address.match(/^\/ch\/(\d\d)\/mix\/(\d\d)\/on$/))) {
    return { path: `/ch/${n(m[1])}/send/${n(m[2])}/on`, kind: 'i', read: same, write: same }
  }
  if ((m = address.match(/^\/ch\/(\d\d)\/mix\/(\d\d)\/level$/))) {
    return {
      path: `/ch/${n(m[1])}/send/${n(m[2])}/lvl`,
      kind: 'f',
      read: levelRead,
      write: levelWrite,
    }
  }
  if ((m = address.match(/^\/bus\/(\d\d)\/mix\/fader$/))) {
    return { path: `/bus/${n(m[1])}/fdr`, kind: 'f', read: levelRead, write: levelWrite }
  }
  if ((m = address.match(/^\/ch\/(\d\d)\/main\/(\d)\/on$/))) {
    return { path: `/ch/${n(m[1])}/main/${m[2]}/on`, kind: 'i', read: same, write: same }
  }
  if ((m = address.match(/^\/ch\/(\d\d)\/main\/(\d)\/level$/))) {
    return {
      path: `/ch/${n(m[1])}/main/${m[2]}/lvl`,
      kind: 'f',
      read: levelRead,
      write: levelWrite,
    }
  }
  return null
}

/** A strip asked for by name: its place in the WING's tree, or null. */
function namedStrip(address: string): string | null {
  for (const [re, at] of NAMED) {
    const m = address.match(re)
    if (m) return at(m)
  }
  return null
}

/**
 * Where a strip's name is written so that it shows: its own name, or, when it
 * takes its look from its input, the input's (one name, wherever it's used).
 */
async function nameTo(raw: DeskLink, strip: string): Promise<string> {
  if (!/^\/(ch|aux)\//.test(strip)) return `${strip}/name`
  const linked = await wingGet(raw, `${strip}/clink`, 'i')
  if (linked?.v !== 1) return `${strip}/name`
  const grp = await wingGet(raw, `${strip}/in/conn/grp`, 's')
  const input = await wingGet(raw, `${strip}/in/conn/in`, 'i')
  return grp?.v && grp.v !== 'OFF' && input ? `/io/in/${grp.v}/${input.v}/name` : `${strip}/name`
}

/** The WING's own name and model, as the X32 answers "/xinfo": address, name, model, firmware. */
async function info(raw: DeskLink): Promise<Uint8Array | null> {
  const name = await wingGet(raw, '/$syscfg/consolename', 's')
  const model = await wingGet(raw, '/$syscfg/$cnsmdl', 's')
  if (!name && !model) return null
  return encodeOsc(
    '/xinfo',
    ['', String(name?.v ?? ''), wingModelSaid(String(model?.v ?? '')), ''].map((v) => ({
      t: 's' as const,
      v,
    }))
  )
}

/**
 * A link to a WING that's asked the X32's way (./x32), and answers the same
 * way: names, mutes, faders, in-ear sends and mains, put into the WING's
 * words and back. Anything else goes to the WING as it is, for what speaks
 * its words already (./wingChannelMove). `raw` is the link in its own words.
 */
export function wingLink(raw: DeskLink): DeskLink {
  return {
    model: 'wing',
    raw,
    exchange: async (message, timeoutMs) => {
      const m = decodeOsc(message)
      if (!m || m.args.length) return raw.exchange(message, timeoutMs)
      if (m.address === '/xinfo') return info(raw)
      const strip = namedStrip(m.address)
      if (strip) {
        const shown = await wingGet(raw, `${strip}/$name`, 's')
        const own = shown?.v ? shown : await wingGet(raw, `${strip}/name`, 's')
        return own ? encodeOsc(m.address, [own]) : null
      }
      const s = said(m.address)
      if (!s) return raw.exchange(message, timeoutMs)
      const v = await wingGet(raw, s.path, s.kind)
      return v ? encodeOsc(m.address, [s.read(v)]) : null
    },
    send: async (message) => {
      const m = decodeOsc(message)
      if (!m || m.args.length !== 1) return raw.send(message)
      const strip = namedStrip(m.address)
      if (strip) return wingSet(raw, await nameTo(raw, strip), m.args[0])
      const s = said(m.address)
      return s ? wingSet(raw, s.path, s.write(m.args[0])) : raw.send(message)
    },
  }
}
