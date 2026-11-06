import { describe, expect, it } from 'vitest'
import {
  ATEM,
  HELLO,
  makeCommand,
  makePacket,
  readCommands,
  readPacket,
  visitAtem,
} from './switcher/atem'
import { fakeAtem } from './__fixtures__/fakeAtem'

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ')

describe('ATEM packets, byte for byte', () => {
  it('says hello as the atem-connection library does', () => {
    expect(readPacket(HELLO)).toMatchObject({ flags: 0x02, session: 0x53ab, packetId: 0 })
  })

  it('acknowledges with a 12-byte packet', () => {
    expect(hex(makePacket(0x10, 0x8123, { ackId: 7 }))).toBe('80 0c 81 23 00 07 00 00 00 00 00 00')
  })

  it('writes commands with their 8-byte header', () => {
    expect(hex(ATEM.program(2))).toBe('00 0c 00 00 43 50 67 49 00 00 00 02')
    expect(hex(ATEM.preview(1000))).toBe('00 0c 00 00 43 50 76 49 00 00 03 e8')
    expect(hex(ATEM.cut())).toBe('00 0c 00 00 44 43 75 74 00 00 00 00')
    expect(hex(ATEM.auto())).toBe('00 0c 00 00 44 41 75 74 00 00 00 00')
    expect(hex(ATEM.fadeToBlack())).toBe('00 0c 00 00 46 74 62 41 00 00 00 00')
  })

  it('reads a packet’s commands, and refuses one whose length is wrong', () => {
    const payload = new Uint8Array([...ATEM.cut(), ...makeCommand('InCm', [1, 0, 0, 0])])
    const p = readPacket(makePacket(0x01, 1, { packetId: 3 }, payload))
    expect(p?.packetId).toBe(3)
    expect(readCommands(p!.payload).map((c) => c.name)).toEqual(['DCut', 'InCm'])
    expect(readPacket(makePacket(0x01, 1, {}).subarray(0, 11))).toBeNull()
  })
})

describe('a visit to the switcher', () => {
  it('reads what it is, its inputs, and what’s live, then leaves', async () => {
    const atem = fakeAtem()
    const v = await visitAtem(atem.open, () => [], atem.clock)
    if (v.kind !== 'done') throw new Error(v.kind)
    expect(v.before.product).toBe('ATEM Television Studio Pro HD')
    expect([...v.before.inputs.values()].map((i) => [i.id, i.long, i.short, i.external])).toEqual([
      [0, 'Black', 'Blk', false],
      [1, 'Camera 1', 'Cam1', true],
      [2, 'Camera 2', 'Cam2', true],
      [1000, 'Color Bars', 'Bars', false],
    ])
    expect(v.before).toMatchObject({ program: 1, preview: 2, black: false })
    expect(atem.commands).toEqual([])
    expect(atem.sessions()).toEqual({ opened: 1, closed: 1 })
  })

  it('cuts to an input, and sees it live', async () => {
    const atem = fakeAtem({ program: 1 })
    const v = await visitAtem(atem.open, () => [ATEM.program(2)], atem.clock)
    if (v.kind !== 'done') throw new Error(v.kind)
    expect(atem.commands).toEqual(['CPgI'])
    expect(v.before.program).toBe(1)
    expect(v.after.program).toBe(2)
  })

  it('sends several commands together: preview, then the transition', async () => {
    const atem = fakeAtem({ program: 1, preview: 2 })
    const v = await visitAtem(atem.open, () => [ATEM.preview(1000), ATEM.auto()], atem.clock)
    if (v.kind !== 'done') throw new Error(v.kind)
    expect(atem.commands).toEqual(['CPvI', 'DAut'])
    expect(v.after).toMatchObject({ program: 1000, preview: 1 })
  })

  it('gets back a state packet lost on the way', async () => {
    const atem = fakeAtem({ drop: [2] })
    const v = await visitAtem(atem.open, () => [], atem.clock)
    if (v.kind !== 'done') throw new Error(v.kind)
    expect(v.before.inputs.size).toBe(4)
    expect(v.before.program).toBe(1)
  })

  it('says when the switcher never takes the command', async () => {
    const atem = fakeAtem({ deaf: true })
    expect((await visitAtem(atem.open, () => [ATEM.cut()], atem.clock)).kind).toBe('not taken')
    expect(atem.sessions().closed).toBe(1)
  })

  it('says when nothing answers', async () => {
    const atem = fakeAtem({ silent: true })
    expect(await visitAtem(atem.open, () => [], atem.clock)).toEqual({ kind: 'unreachable' })
    expect(
      await visitAtem(
        async () => null,
        () => []
      )
    ).toEqual({ kind: 'unreachable' })
  })
})
