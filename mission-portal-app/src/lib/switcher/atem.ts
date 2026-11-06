/**
 * The Blackmagic ATEM video switcher, over the network (UDP 9910), as the
 * open-source atem-connection library speaks to it (github.com/
 * Sofie-Automation/sofie-atem-connection, MIT; Blackmagic doesn't publish
 * the protocol). Miriam connects, gives a command, and leaves:
 *
 *   1. hello, and the switcher answers with a session;
 *   2. it sends everything about itself (its inputs and their names, what's
 *      live, what's on preview), each packet acknowledged, until "init
 *      complete" (InCm): commands are sent only after that, as the library
 *      waits for it too;
 *   3. the command, resent until the switcher acknowledges it;
 *   4. a moment to see the switcher's new state, and the socket is closed.
 *      (The library sends no goodbye either.)
 */

export const ATEM_PORT = 9910

/** Packet flags: the top five bits of the first two bytes. */
const ACK_REQUEST = 0x01
const NEW_SESSION = 0x02
const RETRANSMIT_REQUEST = 0x08
const ACK_REPLY = 0x10
/** Packet ids are 15 bits. */
const MAX_PACKET_ID = 1 << 15

/** The client's hello, byte for byte as the library sends it. */
export const HELLO = Uint8Array.from([
  0x10, 0x14, 0x53, 0xab, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3a, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
])

export interface AtemPacket {
  flags: number
  session: number
  /** Bytes 4–5: the last of our packets the switcher has, in an ack. */
  ackId: number
  /** Bytes 6–7: where to resend from, in a retransmit request. */
  fromId: number
  /** Bytes 10–11. */
  packetId: number
  payload: Uint8Array
}

const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1]
const put16 = (b: Uint8Array, at: number, v: number) => {
  b[at] = (v >> 8) & 0xff
  b[at + 1] = v & 0xff
}

/** A packet received, or null when it isn't one (its length must be its size). */
export function readPacket(bytes: Uint8Array): AtemPacket | null {
  if (bytes.length < 12) return null
  const first = u16(bytes, 0)
  if ((first & 0x07ff) !== bytes.length) return null
  return {
    flags: first >> 11,
    session: u16(bytes, 2),
    ackId: u16(bytes, 4),
    fromId: u16(bytes, 6),
    packetId: u16(bytes, 10),
    payload: bytes.subarray(12),
  }
}

/** A packet to send: its flags, the session, and the ids it carries. */
export function makePacket(
  flags: number,
  session: number,
  ids: { ackId?: number; packetId?: number },
  payload: Uint8Array = new Uint8Array(0)
): Uint8Array {
  const out = new Uint8Array(12 + payload.length)
  put16(out, 0, (flags << 11) | out.length)
  put16(out, 2, session)
  put16(out, 4, ids.ackId ?? 0)
  put16(out, 10, ids.packetId ?? 0)
  out.set(payload, 12)
  return out
}

/** Acknowledges the switcher's packets up to this id. */
export const ackPacket = (session: number, ackId: number) =>
  makePacket(ACK_REPLY, session, { ackId })

/** One command in a packet: its length (with this 8-byte header), two zero bytes, four letters, its data. */
export function makeCommand(name: string, data: readonly number[]): Uint8Array {
  const out = new Uint8Array(8 + data.length)
  put16(out, 0, out.length)
  for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i)
  out.set(data, 8)
  return out
}

/** The commands in a packet's payload. */
export function readCommands(payload: Uint8Array): { name: string; data: Uint8Array }[] {
  const out: { name: string; data: Uint8Array }[] = []
  let at = 0
  while (at + 8 <= payload.length) {
    const length = u16(payload, at)
    if (length < 8 || at + length > payload.length) break
    const name = String.fromCharCode(...payload.subarray(at + 4, at + 8))
    out.push({ name, data: payload.subarray(at + 8, at + length) })
    at += length
  }
  return out
}

/** The commands Miriam gives, on the first mix effect (the Television Studio has one). */
export const ATEM = {
  /** Straight to program: a cut to this input. */
  program: (input: number) => makeCommand('CPgI', [0, 0, (input >> 8) & 0xff, input & 0xff]),
  preview: (input: number) => makeCommand('CPvI', [0, 0, (input >> 8) & 0xff, input & 0xff]),
  /** Preview to program, at once. */
  cut: () => makeCommand('DCut', [0, 0, 0, 0]),
  /** Preview to program, with the transition set on the switcher. */
  auto: () => makeCommand('DAut', [0, 0, 0, 0]),
  /** Fade to black, or back from it: the same button. */
  fadeToBlack: () => makeCommand('FtbA', [0, 0, 0, 0]),
}

export interface AtemInput {
  id: number
  long: string
  short: string
  /** A camera or other input plugged in (not black, bars, a media player). */
  external: boolean
}

export interface AtemState {
  product: string
  inputs: Map<number, AtemInput>
  program: number | null
  preview: number | null
  /** Faded to black, or fading. */
  black: boolean
  ready: boolean
}

export const emptyAtemState = (): AtemState => ({
  product: '',
  inputs: new Map(),
  program: null,
  preview: null,
  black: false,
  ready: false,
})

const text = (data: Uint8Array, at: number, length: number) => {
  const field = data.subarray(at, at + length)
  const end = field.indexOf(0)
  return new TextDecoder().decode(end < 0 ? field : field.subarray(0, end)).trim()
}

/** What a command from the switcher says about it. Only the first mix effect is read. */
export function applyAtemCommand(state: AtemState, name: string, data: Uint8Array): void {
  switch (name) {
    case '_pin':
      if (data.length >= 40) state.product = text(data, 0, 40)
      break
    case 'InPr':
      if (data.length >= 33) {
        const id = u16(data, 0)
        state.inputs.set(id, {
          id,
          long: text(data, 2, 20),
          short: text(data, 22, 4),
          // Internal port type 0: an input plugged in from outside.
          external: data[32] === 0,
        })
      }
      break
    case 'PrgI':
      if (data.length >= 4 && data[0] === 0) state.program = u16(data, 2)
      break
    case 'PrvI':
      if (data.length >= 4 && data[0] === 0) state.preview = u16(data, 2)
      break
    case 'FtbS':
      if (data.length >= 3 && data[0] === 0) state.black = data[1] === 1 || data[2] === 1
      break
    case 'InCm':
      state.ready = true
      break
  }
}

/** A conversation with something on the local network, one UDP datagram at a time. */
export interface UdpSession {
  send(bytes: Uint8Array): Promise<boolean>
  /** The next datagram received, or null if none came in time. */
  receive(timeoutMs: number): Promise<Uint8Array | null>
  close(): void
}

export type AtemVisit =
  | { kind: 'done'; before: AtemState; after: AtemState }
  /** Nothing answered, or the switcher didn't finish saying what it is. */
  | { kind: 'unreachable' }
  /** The command was sent, but the switcher never said it had it. */
  | { kind: 'not taken'; before: AtemState }

const isNext = (last: number, id: number) => id === (last + 1) % MAX_PACKET_ID

/** How long a visit may take: hello, the state, the command and its ack. */
const HELLO_MS = 1500
const STATE_MS = 5000
const ACK_MS = 1500
const RESEND_MS = 100
/** After the ack, how long to listen for the switcher's new state. */
const SETTLE_MS = 400

/**
 * Connects, reads the switcher, gives the commands `act` returns for what it
 * found (none: nothing to do), and leaves.
 */
export async function visitAtem(
  open: () => Promise<UdpSession | null>,
  act: (state: AtemState) => Uint8Array[],
  clock: () => number = Date.now
): Promise<AtemVisit> {
  const session = await open()
  if (!session) return { kind: 'unreachable' }
  try {
    return await visit(session, act, clock)
  } finally {
    session.close()
  }
}

async function visit(
  s: UdpSession,
  act: (state: AtemState) => Uint8Array[],
  clock: () => number
): Promise<AtemVisit> {
  const state = emptyAtemState()
  let sessionId = 0
  let last = -1
  let established = false

  /** Takes in one packet: acks it, and reads what it says when it's the next in order. */
  const take = async (p: AtemPacket) => {
    sessionId = p.session
    if (p.flags & NEW_SESSION) {
      established = true
      last = p.packetId
      await s.send(ackPacket(sessionId, last))
      return
    }
    if (!(p.flags & ACK_REQUEST) || last < 0) return
    if (isNext(last, p.packetId)) {
      last = p.packetId
      for (const c of readCommands(p.payload)) applyAtemCommand(state, c.name, c.data)
    }
    // Out of order: not read, and the switcher resends it. Either way, acked up to the last in order.
    await s.send(ackPacket(sessionId, last))
  }

  // Hello, said again until the switcher answers.
  let until = clock() + HELLO_MS
  let helloAt = -Infinity
  while (!established) {
    if (clock() >= until) return { kind: 'unreachable' }
    if (clock() - helloAt >= 500) {
      await s.send(HELLO)
      helloAt = clock()
    }
    const bytes = await s.receive(100)
    const p = bytes ? readPacket(bytes) : null
    if (p) await take(p)
  }

  // Everything about the switcher, until it says it's done.
  until = clock() + STATE_MS
  while (!state.ready) {
    if (clock() >= until) return { kind: 'unreachable' }
    const bytes = await s.receive(200)
    const p = bytes ? readPacket(bytes) : null
    if (p) await take(p)
  }
  const before = cloneState(state)

  const commands = act(before)
  if (!commands.length) return { kind: 'done', before, after: before }

  // The command, as our packet 1, resent until the switcher acks it.
  const payload = new Uint8Array(commands.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of commands) {
    payload.set(c, at)
    at += c.length
  }
  const ours = makePacket(ACK_REQUEST, sessionId, { packetId: 1 }, payload)
  let acked = false
  let sentAt = -Infinity
  until = clock() + ACK_MS
  while (!acked) {
    if (clock() >= until) return { kind: 'not taken', before }
    if (clock() - sentAt >= RESEND_MS) {
      // With the session as the switcher has it now.
      put16(ours, 2, sessionId)
      await s.send(ours)
      sentAt = clock()
    }
    const bytes = await s.receive(RESEND_MS)
    const p = bytes ? readPacket(bytes) : null
    if (!p) continue
    if (p.flags & ACK_REPLY && p.ackId >= 1) acked = true
    if (p.flags & RETRANSMIT_REQUEST) sentAt = -Infinity
    await take(p)
  }

  // A moment to hear what changed.
  const settleUntil = clock() + SETTLE_MS
  while (clock() < settleUntil) {
    const bytes = await s.receive(Math.max(1, settleUntil - clock()))
    const p = bytes ? readPacket(bytes) : null
    if (p) await take(p)
  }
  return { kind: 'done', before, after: cloneState(state) }
}

const cloneState = (s: AtemState): AtemState => ({ ...s, inputs: new Map(s.inputs) })
