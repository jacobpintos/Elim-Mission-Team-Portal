import { describe, expect, it } from 'vitest'
import { decodeOsc, encodeOsc } from './mixer/osc'
import {
  dbToFader,
  deskInfo,
  deskValue,
  faderToDb,
  readDeskNames,
  setDeskValue,
  snapFader,
  X32,
} from './mixer/x32'
import { fakeX32 } from './__fixtures__/fakeX32'

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

describe('OSC, as the X32 takes it', () => {
  it('asks with the address alone, padded to four bytes', () => {
    const q = encodeOsc('/ch/01/mix/fader')
    expect(q.length).toBe(20)
    expect(new TextDecoder().decode(q.subarray(0, 16))).toBe('/ch/01/mix/fader')
    expect(Array.from(q.subarray(16))).toEqual([0, 0, 0, 0])
  })

  it('sends a value with its type, big-endian', () => {
    // "/ch/01/mix/fader" + 4 zeros, ",f" + 2 zeros, 0.75 as a float.
    expect(hex(encodeOsc('/ch/01/mix/fader', [{ t: 'f', v: 0.75 }]))).toBe(
      `${hex(new TextEncoder().encode('/ch/01/mix/fader'))}00000000` + '2c660000' + '3f400000'
    )
    expect(hex(encodeOsc('/ch/01/mix/on', [{ t: 'i', v: 1 }])).endsWith('2c69000000000001')).toBe(
      true
    )
  })

  it('reads back what it sends: numbers, and names', () => {
    expect(decodeOsc(encodeOsc('/ch/07/config/name', [{ t: 's', v: 'Mitch EG' }]))).toEqual({
      address: '/ch/07/config/name',
      args: [{ t: 's', v: 'Mitch EG' }],
    })
    expect(decodeOsc(encodeOsc('/ch/01/mix/on', [{ t: 'i', v: 0 }]))?.args).toEqual([
      { t: 'i', v: 0 },
    ])
    expect(decodeOsc(encodeOsc('/xinfo'))).toEqual({ address: '/xinfo', args: [] })
  })

  it('skips the desk’s meter blobs, and refuses what isn’t OSC', () => {
    const blob = new Uint8Array([
      ...encodeOsc('/meters/1').subarray(0, 12),
      ...new TextEncoder().encode(',b'),
      0,
      0,
      0,
      0,
      0,
      3,
      1,
      2,
      3,
      0,
    ])
    expect(decodeOsc(blob)).toEqual({ address: '/meters/1', args: [] })
    expect(decodeOsc(new TextEncoder().encode('hello'))).toBeNull()
  })
})

describe('the X32 fader scale', () => {
  it('reads as the desk shows it', () => {
    expect(faderToDb(1)).toBe(10)
    expect(faderToDb(0.75)).toBe(0)
    expect(faderToDb(0.5)).toBe(-10)
    expect(faderToDb(0.25)).toBe(-30)
    expect(faderToDb(0.0625)).toBe(-60)
    expect(faderToDb(0)).toBe(-Infinity)
  })

  it('lands on the desk’s own 1024 positions, either way', () => {
    expect(dbToFader(0)).toBe(snapFader(0.75))
    expect(dbToFader(-10)).toBe(snapFader(0.5))
    expect(dbToFader(-100)).toBe(0)
    expect(dbToFader(20)).toBe(1)
    for (const db of [-55, -40, -20, -6, -3, 4, 9]) {
      expect(Math.abs(faderToDb(dbToFader(db)) - db)).toBeLessThan(0.5)
    }
  })
})

describe('talking to the desk', () => {
  it('reads a value, and changes one, checking the desk took it', async () => {
    const desk = fakeX32()
    expect((await deskValue(desk.link, X32.fader(3)))?.v).toBeCloseTo(snapFader(0.75), 5)
    expect(await setDeskValue(desk.link, X32.on(3), { t: 'i', v: 0 })).toBe(true)
    expect(desk.value(X32.on(3))).toBe(0)
    expect(await setDeskValue(desk.link, X32.fader(3), { t: 'f', v: dbToFader(-6) })).toBe(true)
  })

  it('reads every channel’s and in-ear mix’s name', async () => {
    const desk = fakeX32({ channels: { 1: 'Pastor', 7: 'Mitch EG' }, buses: { 3: 'Sunny IEM' } })
    const names = await readDeskNames(desk.link)
    expect(names?.channels).toHaveLength(32)
    expect(names?.buses).toHaveLength(16)
    expect(names?.channels[0]).toBe('Pastor')
    expect(names?.channels[6]).toBe('Mitch EG')
    expect(names?.buses[2]).toBe('Sunny IEM')
  })

  it('reads the desk’s own name and model', async () => {
    expect(await deskInfo(fakeX32().link)).toEqual({ name: 'Sanctuary', model: 'X32' })
  })

  it('knows when the desk isn’t there', async () => {
    const desk = fakeX32()
    desk.unplug()
    expect(await deskInfo(desk.link)).toBeNull()
    expect(await readDeskNames(desk.link)).toBeNull()
    expect(await deskValue(desk.link, X32.fader(1))).toBeNull()
    expect(await setDeskValue(desk.link, X32.on(1), { t: 'i', v: 0 })).toBe(false)
  })
})
