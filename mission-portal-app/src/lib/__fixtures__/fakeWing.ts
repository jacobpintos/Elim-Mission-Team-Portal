import { decodeOsc, encodeOsc, type OscArg } from '../mixer/osc'
import { WING_CHANNEL_SETTINGS } from '../mixer/wingChannelMove'
import { wingLink } from '../mixer/wing'
import type { DeskLink } from '../mixer/x32'

/**
 * A Behringer WING for the tests, as the real desk answers over OSC
 * (src/lib/mixer/wing): asked for a setting (its address, an empty type
 * list), it answers ",s" with words, ",sfi" with a whole number, or ",sff"
 * with a number in its units, the number last; sent a value, it takes it,
 * unanswered; an address it doesn't have is ignored. A strip shows its
 * input's name when it takes its look from its input (clink). Every message
 * goes through the real encoding.
 */

type Kind = 'f' | 'i' | 's'

export function fakeWing(
  setup: {
    channels?: Record<number, string>
    buses?: Record<number, string>
    mains?: Record<number, string>
    /** The open show's scenes, numbered from 1 on its list; none: no show open. */
    scenes?: string[]
    /** Channel names a scene brings with it, by scene. */
    sceneNames?: Record<string, Record<number, string>>
  } = {}
) {
  const state = new Map<string, { kind: Kind; v: number | string }>()
  const put = (path: string, kind: Kind, v: number | string) => state.set(path, { kind, v })

  for (let ch = 1; ch <= 40; ch++) {
    for (const s of WING_CHANNEL_SETTINGS)
      put(`/ch/${ch}/${s.path}`, s.kind, s.kind === 's' ? '' : 0)
    put(`/ch/${ch}/name`, 's', setup.channels?.[ch] ?? '')
    put(`/ch/${ch}/in/conn/grp`, 's', 'LCL')
    put(`/ch/${ch}/in/conn/in`, 'i', ch)
    put(`/ch/${ch}/fdr`, 'f', 0)
    put(`/ch/${ch}/gatesc/src`, 's', 'SELF')
    put(`/ch/${ch}/dynsc/src`, 's', 'SELF')
    put(`/ch/${ch}/main/1/on`, 'i', 1)
    for (let m = 2; m <= 4; m++) put(`/ch/${ch}/main/${m}/on`, 'i', 0)
    for (let m = 1; m <= 4; m++) put(`/ch/${ch}/main/${m}/lvl`, 'f', m === 1 ? 0 : -144)
    for (let b = 1; b <= 16; b++) {
      put(`/ch/${ch}/send/${b}/on`, 'i', 1)
      put(`/ch/${ch}/send/${b}/lvl`, 'f', 0)
      put(`/ch/${ch}/send/${b}/mode`, 's', 'POST')
    }
  }
  for (let a = 1; a <= 8; a++) {
    put(`/aux/${a}/name`, 's', '')
    put(`/aux/${a}/clink`, 'i', 0)
    put(`/aux/${a}/in/conn/grp`, 's', 'AUX')
    put(`/aux/${a}/in/conn/in`, 'i', a)
  }
  for (let b = 1; b <= 16; b++) {
    put(`/bus/${b}/name`, 's', setup.buses?.[b] ?? '')
    put(`/bus/${b}/fdr`, 'f', 0)
  }
  for (let m = 1; m <= 4; m++) put(`/main/${m}/name`, 's', setup.mains?.[m] ?? '')
  for (let x = 1; x <= 8; x++) put(`/mtx/${x}/name`, 's', '')
  for (let u = 1; u <= 24; u++) {
    put(`/io/in/USR/${u}/user/grp`, 's', 'OFF')
    put(`/io/in/USR/${u}/user/in`, 'i', 1)
  }
  for (const grp of ['LCL', 'AUX', 'A']) {
    for (let i = 1; i <= 48; i++) put(`/io/in/${grp}/${i}/name`, 's', '')
  }
  put('/$syscfg/consolename', 's', 'Sanctuary')
  put('/$syscfg/$cnsmdl', 's', 'ngc-full')
  // The library: the open show and the scene that's on.
  const scenes = setup.scenes ?? []
  put('/$ctl/lib/$actshow', 's', scenes.length ? 'Services' : '')
  put('/$ctl/lib/$active', 's', scenes.length ? `Services/${scenes[0]}.snap` : '')
  put('/$ctl/lib/$actidx', 'i', scenes.length ? 1 : 0)
  put('/$ctl/lib/$actionidx', 'i', 0)
  put('/$ctl/lib/$action', 's', 'IDLE')
  const recall = (n: number) => {
    if (n < 1 || n > scenes.length) return
    put('/$ctl/lib/$actidx', 'i', n)
    put('/$ctl/lib/$active', 's', `Services/${scenes[n - 1]}.snap`)
    for (const [ch, name] of Object.entries(setup.sceneNames?.[scenes[n - 1]] ?? {})) {
      put(`/ch/${ch}/name`, 's', name)
    }
  }

  /** What a strip shows: its input's name when it takes its look from it, else its own. */
  const shown = (strip: string): string => {
    if (state.get(`${strip}/clink`)?.v === 1) {
      const grp = state.get(`${strip}/in/conn/grp`)?.v
      const input = state.get(`${strip}/in/conn/in`)?.v
      const name = state.get(`/io/in/${grp}/${input}/name`)?.v
      if (typeof name === 'string') return name
    }
    return String(state.get(`${strip}/name`)?.v ?? '')
  }

  const answer = (path: string): Uint8Array | null => {
    const dollar = /^(\/(?:ch|aux|bus|main|mtx)\/\d+)\/\$name$/.exec(path)
    if (dollar) return encodeOsc(path, [{ t: 's', v: shown(dollar[1]) }])
    const s = state.get(path)
    if (!s) return null
    if (s.kind === 's') return encodeOsc(path, [{ t: 's', v: String(s.v) }])
    const v = Number(s.v)
    const words: OscArg = { t: 's', v: String(v) }
    return encodeOsc(
      path,
      s.kind === 'i'
        ? [words, { t: 'f', v: 0 }, { t: 'i', v }]
        : [words, { t: 'f', v: 0 }, { t: 'f', v }]
    )
  }

  const changed: string[] = []
  let down = false
  const raw: DeskLink = {
    exchange: async (bytes) => {
      if (down) return null
      const m = decodeOsc(bytes)
      return m && !m.args.length ? answer(m.address) : null
    },
    send: async (bytes) => {
      if (down) return
      const m = decodeOsc(bytes)
      const s = m ? state.get(m.address) : undefined
      if (!m || !s || m.args.length !== 1) return
      const a = m.args[0]
      // Taken as the setting's kind, as the desk does.
      const v =
        s.kind === 's' ? String(a.v) : s.kind === 'i' ? Math.round(Number(a.v)) : Number(a.v)
      changed.push(m.address)
      state.set(m.address, { kind: s.kind, v })
      if (m.address === '/$ctl/lib/$action') {
        const on = Number(state.get('/$ctl/lib/$actidx')?.v)
        if (v === 'GO') recall(Number(state.get('/$ctl/lib/$actionidx')?.v))
        if (v === 'GONEXT') recall(on + 1)
        if (v === 'GOPREV') recall(on - 1)
      }
    },
  }
  return {
    /** The WING asked the X32's way, as the app asks it. */
    link: wingLink(raw),
    raw,
    /** A setting's value now, by its place on the WING. */
    value: (path: string) => state.get(path)?.v,
    set: (path: string, v: number | string) => {
      const s = state.get(path)
      state.set(path, { kind: s?.kind ?? (typeof v === 'string' ? 's' : 'f'), v })
    },
    /** The places changed, in order. */
    changed,
    unplug: () => {
      down = true
    },
  }
}
