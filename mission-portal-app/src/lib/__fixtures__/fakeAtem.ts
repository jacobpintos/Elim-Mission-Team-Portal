import {
  makeCommand,
  makePacket,
  readCommands,
  readPacket,
  type UdpSession,
} from '../switcher/atem'

/**
 * An ATEM for the tests, speaking the protocol as src/lib/switcher/atem.ts
 * reads it (from the atem-connection library): it answers hello with a
 * session, sends its state in numbered packets until "init complete", resends
 * from the last one acknowledged, takes commands only on the session it gave,
 * acks them, and says what changed. On a clock of its own: waiting for a
 * datagram that isn't coming moves the clock on rather than taking time.
 */

export interface FakeInput {
  id: number
  long: string
  short?: string
  /** Not black, bars or a media player. Default true. */
  external?: boolean
}

const HELLO_SESSION = 0x53ab
const SESSION = 0x8123
const FLAG = { ackRequest: 0x01, newSession: 0x02, ackReply: 0x10 }

const name20 = (s: string, length: number) => {
  const out = new Uint8Array(length)
  out.set(new TextEncoder().encode(s).subarray(0, length))
  return Array.from(out)
}
const two = (v: number) => [(v >> 8) & 0xff, v & 0xff]

export function fakeAtem(
  setup: {
    inputs?: FakeInput[]
    program?: number
    preview?: number
    /** State packets lost the first time they're sent: resent once the client's acks show it. */
    drop?: number[]
    /** Takes no commands (never acks them). */
    deaf?: boolean
    /** Never answers at all. */
    silent?: boolean
  } = {}
) {
  const inputs: FakeInput[] = setup.inputs ?? [
    { id: 0, long: 'Black', short: 'Blk', external: false },
    { id: 1, long: 'Camera 1', short: 'Cam1' },
    { id: 2, long: 'Camera 2', short: 'Cam2' },
    { id: 1000, long: 'Color Bars', short: 'Bars', external: false },
  ]
  const live = { program: setup.program ?? 1, preview: setup.preview ?? 2, black: false }
  let now = 0
  const commands: string[] = []
  let opened = 0
  let closed = 0

  const statePackets = (): number[][] => {
    const cmds: number[][] = [
      Array.from(makeCommand('_ver', [0, 2, 0, 30])),
      Array.from(makeCommand('_pin', [...name20('ATEM Television Studio Pro HD', 40), 0, 0, 0, 0])),
      ...inputs.map((i) =>
        Array.from(
          makeCommand('InPr', [
            ...two(i.id),
            ...name20(i.long, 20),
            ...name20(i.short ?? '', 4),
            0,
            0,
            0,
            0,
            0,
            1,
            i.external === false ? 1 : 0,
            0,
            0,
            0,
          ])
        )
      ),
      Array.from(makeCommand('PrgI', [0, 0, ...two(live.program)])),
      Array.from(makeCommand('PrvI', [0, 0, ...two(live.preview)])),
      Array.from(makeCommand('FtbS', [0, live.black ? 1 : 0, 0, 0])),
    ]
    // A few commands to a packet, then init complete on its own.
    const packets: number[][] = []
    for (let i = 0; i < cmds.length; i += 3) packets.push(cmds.slice(i, i + 3).flat())
    packets.push(Array.from(makeCommand('InCm', [1, 0, 0, 0])))
    return packets
  }

  /** The open session's way to send state, and whether it has gone quiet. */
  let pushState: ((payloads: number[][]) => void) | null = null
  let quiet = false

  const open = async (): Promise<UdpSession | null> => {
    opened++
    quiet = false
    const inbox: Uint8Array[] = []
    let sent: Uint8Array[] = []
    let nextId = 1
    let resentFor = -1
    const dropped = new Set(setup.drop ?? [])
    const sendState = (payloads: number[][]) => {
      for (const p of payloads) {
        const id = nextId++
        const packet = makePacket(FLAG.ackRequest, SESSION, { packetId: id }, Uint8Array.from(p))
        sent[id] = packet
        if (dropped.has(id)) dropped.delete(id)
        else inbox.push(packet)
      }
    }
    pushState = sendState
    const session: UdpSession = {
      send: async (bytes) => {
        if (setup.silent || quiet) return true
        const p = readPacket(bytes)
        if (!p) return true
        if (p.flags & FLAG.newSession) {
          sent = []
          nextId = 1
          inbox.push(makePacket(FLAG.newSession, HELLO_SESSION, { packetId: 0 }, new Uint8Array(8)))
          return true
        }
        if (p.flags & FLAG.ackReply) {
          // The hello acked: the state, from packet 1.
          if (p.ackId === 0 && nextId === 1) sendState(statePackets())
          // Acked short of what was sent: resent from there, once for each place it stops.
          else if (p.ackId < nextId - 1 && resentFor !== p.ackId) {
            resentFor = p.ackId
            for (let id = p.ackId + 1; id < nextId; id++) inbox.push(sent[id])
          }
          return true
        }
        if (p.flags & FLAG.ackRequest && p.session === SESSION && !setup.deaf) {
          for (const c of readCommands(p.payload)) {
            commands.push(c.name)
            const input = (c.data[2] << 8) | c.data[3]
            if (c.name === 'CPgI') live.program = input
            if (c.name === 'CPvI') live.preview = input
            if (c.name === 'DCut' || c.name === 'DAut') {
              ;[live.program, live.preview] = [live.preview, live.program]
            }
            if (c.name === 'FtbA') live.black = !live.black
          }
          inbox.push(makePacket(FLAG.ackReply, SESSION, { ackId: p.packetId }))
          sendState([
            [
              ...makeCommand('PrgI', [0, 0, ...two(live.program)]),
              ...makeCommand('PrvI', [0, 0, ...two(live.preview)]),
              ...makeCommand('FtbS', [0, live.black ? 1 : 0, 0, 0]),
            ],
          ])
        }
        return true
      },
      receive: async (timeoutMs) => {
        const next = quiet ? undefined : inbox.shift()
        if (next) return next
        now += timeoutMs
        return null
      },
      close: () => {
        closed++
      },
    }
    return session
  }

  return {
    open,
    clock: () => now,
    /** Someone switches on the panel: the switcher says so to whoever is connected. */
    fromPanel: (program: number) => {
      live.program = program
      pushState?.([Array.from(makeCommand('PrgI', [0, 0, ...two(program)]))])
    },
    /** It stops answering (unplugged, or the phone left its network). */
    goQuiet: () => {
      quiet = true
    },
    live,
    /** The commands it took, by name, in order. */
    commands,
    sessions: () => ({ opened, closed }),
  }
}
