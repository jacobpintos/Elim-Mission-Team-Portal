import { describe, expect, it } from 'vitest'
import {
  CHANNEL_SETTINGS,
  channelMoveAsked,
  linkAddress,
  moveChannels,
  movePlan,
  prepareMove,
  putChannelsBack,
  settingsOf,
} from './mixer/channelMove'
import { snapFader, X32 } from './mixer/x32'
import { fakeX32 } from './__fixtures__/fakeX32'

describe('asked to move channels', () => {
  it('hears ranges, said in digits or words', () => {
    const move = { kind: 'move', ask: { from: 15, to: 25, count: 6 } }
    expect(channelMoveAsked('Move channels 15 through 20 to 25 through 30')).toEqual(move)
    expect(channelMoveAsked('move channels 15-20 to 25-30')).toEqual(move)
    expect(channelMoveAsked('move channels 15 to 20 to 25 to 30')).toEqual(move)
    expect(channelMoveAsked('move channels 15 through 20 to 25')).toEqual(move)
    expect(
      channelMoveAsked('move channels fifteen through twenty to twenty five through thirty')
    ).toEqual(move)
  })

  it('hears one channel switched with another', () => {
    const swap = { kind: 'move', ask: { from: 3, to: 7, count: 1 } }
    expect(channelMoveAsked('switch channel 3 with channel 7')).toEqual(swap)
    expect(channelMoveAsked('swap channels 3 and 7')).toEqual(swap)
    expect(channelMoveAsked('move channel three to channel seven')).toEqual(swap)
  })

  it('says why, when the numbers don’t fit the desk', () => {
    expect(channelMoveAsked('move channels 15 through 20 to 25 through 29')).toEqual({
      kind: 'unclear',
      why: '15 through 20 is 6 channels, but 25 through 29 is 5. They need to be the same number.',
    })
    expect(channelMoveAsked('move channels 30 through 32 to 31')?.kind).toBe('unclear')
    expect(channelMoveAsked('move channels 20 through 15 to 25')?.kind).toBe('unclear')
    expect(channelMoveAsked('swap channel 4 with channel 4')?.kind).toBe('unclear')
  })

  it('leaves levels, mutes and cameras alone', () => {
    expect(channelMoveAsked('move channel 5 up 3 dB')).toBeNull()
    expect(channelMoveAsked('mute channel 5')).toBeNull()
    expect(channelMoveAsked('switch to camera 2')).toBeNull()
    expect(channelMoveAsked('move the bass down in the house')).toBeNull()
  })
})

describe('where each channel goes', () => {
  it('switches two ranges apart', () => {
    expect([...movePlan({ from: 15, to: 25, count: 3 })]).toEqual([
      [15, 25],
      [16, 26],
      [17, 27],
      [25, 15],
      [26, 16],
      [27, 17],
    ])
  })

  it('turns overlapping ranges round, either way', () => {
    // 15–20 onto 18–23: 21–23 into 15–17.
    expect(Object.fromEntries(movePlan({ from: 15, to: 18, count: 6 }))).toEqual({
      15: 18,
      16: 19,
      17: 20,
      18: 21,
      19: 22,
      20: 23,
      21: 15,
      22: 16,
      23: 17,
    })
    expect(Object.fromEntries(movePlan({ from: 18, to: 15, count: 6 }))).toEqual({
      18: 15,
      19: 16,
      20: 17,
      21: 18,
      22: 19,
      23: 20,
      15: 21,
      16: 22,
      17: 23,
    })
  })
})

describe('moving channels on the desk', () => {
  const ch = (n: number, path: string) => `/ch/${String(n).padStart(2, '0')}/${path}`

  /** A desk with two channels set up differently in every way that shows (values on the desk's own steps, as it holds them). */
  const setup = () => {
    const desk = fakeX32({ channels: { 15: 'Kick', 21: 'Spare', 25: 'Laptop' } })
    desk.set(ch(15, 'mix/fader'), { t: 'f', v: snapFader(0.5) })
    desk.set(ch(15, 'eq/1/g'), { t: 'f', v: snapFader(0.75) })
    desk.set(ch(15, 'mix/02/level'), { t: 'f', v: snapFader(0.25) })
    desk.set(ch(15, 'grp/dca'), { t: 'i', v: 5 })
    desk.set(ch(15, 'config/color'), { t: 'i', v: 3 })
    desk.set(ch(25, 'mix/on'), { t: 'i', v: 0 })
    desk.set(ch(25, 'dyn/on'), { t: 'i', v: 1 })
    return desk
  }

  it('moves every setting with each channel, its input too, and switches the others back', async () => {
    const desk = setup()
    const plan = movePlan({ from: 15, to: 25, count: 1 })
    const ready = await prepareMove(desk.link, plan)
    expect(ready.kind).toBe('ready')
    if (ready.kind !== 'ready') return
    expect(await moveChannels(desk.link, plan, ready.before, 0)).toEqual([])

    // Channel 25 is what 15 was: listening to input 15, with all it had.
    expect(desk.value(X32.channelName(25))).toBe('Kick')
    expect(desk.value(ch(25, 'config/source'))).toBe(15)
    expect(desk.value(ch(25, 'mix/fader'))).toBeCloseTo(0.5, 2)
    expect(desk.value(ch(25, 'eq/1/g'))).toBeCloseTo(0.75, 2)
    expect(desk.value(ch(25, 'mix/02/level'))).toBeCloseTo(0.25, 2)
    expect(desk.value(ch(25, 'grp/dca'))).toBe(5)
    expect(desk.value(ch(25, 'config/color'))).toBe(3)
    expect(desk.value(ch(25, 'mix/on'))).toBe(1)
    // And 15 is what 25 was.
    expect(desk.value(X32.channelName(15))).toBe('Laptop')
    expect(desk.value(ch(15, 'config/source'))).toBe(25)
    expect(desk.value(ch(15, 'mix/on'))).toBe(0)
    expect(desk.value(ch(15, 'dyn/on'))).toBe(1)
    // Nothing else changed.
    expect(desk.value(X32.channelName(21))).toBe('Spare')
    expect(desk.changed.every((a) => /^\/ch\/(15|25)\/|^\/config\/chlink\//.test(a))).toBe(true)
  })

  it('covers every setting a channel strip has, and puts them all back on Undo', async () => {
    const desk = setup()
    expect(settingsOf(15)).toHaveLength(CHANNEL_SETTINGS.length)
    const plan = movePlan({ from: 15, to: 25, count: 1 })
    const ready = await prepareMove(desk.link, plan)
    if (ready.kind !== 'ready') throw new Error(ready.kind)
    // Everything there was to read, read.
    expect(ready.before.values.size).toBe(CHANNEL_SETTINGS.length * 2)
    await moveChannels(desk.link, plan, ready.before, 0)
    expect(await putChannelsBack(desk.link, ready.before, 0)).toEqual([])
    expect(desk.value(X32.channelName(15))).toBe('Kick')
    expect(desk.value(ch(15, 'config/source'))).toBe(15)
    expect(desk.value(ch(15, 'mix/fader'))).toBeCloseTo(0.5, 2)
    expect(desk.value(X32.channelName(25))).toBe('Laptop')
    expect(desk.value(ch(25, 'mix/on'))).toBe(0)
  })

  it('moves a linked pair as a pair, and won’t split one', async () => {
    const desk = setup()
    desk.set(linkAddress(8), { t: 'i', v: 1 }) // 15–16
    const plan = movePlan({ from: 15, to: 25, count: 2 })
    const ready = await prepareMove(desk.link, plan)
    if (ready.kind !== 'ready') throw new Error(ready.kind)
    await moveChannels(desk.link, plan, ready.before, 0)
    expect(desk.value(linkAddress(13))).toBe(1) // 25–26
    expect(desk.value(linkAddress(8))).toBe(0)

    // 25–26 onto 26–27 would split them.
    expect(await prepareMove(desk.link, movePlan({ from: 25, to: 26, count: 2 }))).toEqual({
      kind: 'splits',
      channels: [25, 26],
    })
  })

  it('turns overlapping ranges round on the desk', async () => {
    const desk = fakeX32({ channels: { 1: 'A', 2: 'B', 3: 'C', 4: 'D' } })
    const plan = movePlan({ from: 1, to: 2, count: 2 })
    const ready = await prepareMove(desk.link, plan)
    if (ready.kind !== 'ready') throw new Error(ready.kind)
    await moveChannels(desk.link, plan, ready.before, 0)
    expect([1, 2, 3, 4].map((n) => desk.value(X32.channelName(n)))).toEqual(['C', 'A', 'B', 'D'])
  })

  it('says when the desk isn’t there', async () => {
    const desk = setup()
    desk.unplug()
    expect(await prepareMove(desk.link, movePlan({ from: 15, to: 25, count: 6 }))).toEqual({
      kind: 'unreachable',
    })
  })
})

describe('asked to swap channels by name', () => {
  it('hears the two names', () => {
    expect(channelMoveAsked('swap the kick and the snare')).toEqual({
      kind: 'names',
      a: 'kick',
      b: 'snare',
    })
    expect(channelMoveAsked('Switch Mia Vox with Jacob Vox.')).toEqual({
      kind: 'names',
      a: 'mia vox',
      b: 'jacob vox',
    })
    expect(channelMoveAsked('can you swap channels pastor and choir please')).toEqual({
      kind: 'names',
      a: 'pastor',
      b: 'choir',
    })
  })

  it('leaves packs, cameras and other swaps alone', () => {
    expect(channelMoveAsked('Mia and Sunny swapped packs')).toBeNull()
    expect(channelMoveAsked('swap packs with Sunny')).toBeNull()
    expect(channelMoveAsked('switch to camera 2')).toBeNull()
    expect(channelMoveAsked('switch the wide camera with the pulpit camera')).toBeNull()
    expect(channelMoveAsked('swap the bass up in the house')).toBeNull()
    expect(channelMoveAsked('switch to dark mode')).toBeNull()
  })
})
