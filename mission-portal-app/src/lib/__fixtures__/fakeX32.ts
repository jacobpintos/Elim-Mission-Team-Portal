import { decodeOsc, encodeOsc, type OscArg } from '../mixer/osc'
import { BUSES, CHANNELS, snapFader, X32, type DeskLink } from '../mixer/x32'

/**
 * An X32 for the tests, as the real desk behaves over OSC: a message with no
 * values is answered with the value at its address; one with a value changes
 * it, unanswered; an address it doesn't have is ignored. Faders land on the
 * desk's own 1024 positions. Every message goes through the real encoding.
 */
export function fakeX32(
  setup: { channels?: Record<number, string>; buses?: Record<number, string> } = {}
) {
  const state = new Map<string, OscArg>()
  for (let ch = 1; ch <= CHANNELS; ch++) {
    state.set(X32.channelName(ch), { t: 's', v: setup.channels?.[ch] ?? '' })
    state.set(X32.on(ch), { t: 'i', v: 1 })
    state.set(X32.fader(ch), { t: 'f', v: snapFader(0.75) })
    state.set(X32.mainLR(ch), { t: 'i', v: 1 })
    state.set(X32.mainMono(ch), { t: 'i', v: 0 })
    state.set(X32.monoLevel(ch), { t: 'f', v: 0 })
    for (let bus = 1; bus <= BUSES; bus++) {
      state.set(X32.sendOn(ch, bus), { t: 'i', v: 1 })
      state.set(X32.sendLevel(ch, bus), { t: 'f', v: snapFader(0.75) })
    }
  }
  for (let bus = 1; bus <= BUSES; bus++) {
    state.set(X32.busName(bus), { t: 's', v: setup.buses?.[bus] ?? '' })
  }
  const changed: string[] = []
  let down = false
  const link: DeskLink = {
    exchange: async (bytes) => {
      if (down) return null
      const m = decodeOsc(bytes)
      // Its own name and model, as the desk answers /xinfo: address, name, model, firmware.
      if (m?.address === '/xinfo') {
        return encodeOsc(
          '/xinfo',
          ['192.168.0.64', 'Sanctuary', 'X32', '4.06'].map((v) => ({ t: 's', v }))
        )
      }
      const v = m && !m.args.length ? state.get(m.address) : undefined
      return m && v ? encodeOsc(m.address, [v]) : null
    },
    send: async (bytes) => {
      if (down) return
      const m = decodeOsc(bytes)
      if (!m || m.args.length !== 1 || !state.has(m.address)) return
      const a = m.args[0]
      changed.push(m.address)
      state.set(m.address, a.t === 'f' ? { t: 'f', v: snapFader(a.v) } : a)
    },
  }
  return {
    link,
    /** The value at an address now. */
    value: (address: string) => state.get(address)?.v,
    set: (address: string, v: OscArg) => state.set(address, v),
    /** The addresses changed, in order. */
    changed,
    /** Off its Wi-Fi: nothing answers. */
    unplug: () => {
      down = true
    },
  }
}
