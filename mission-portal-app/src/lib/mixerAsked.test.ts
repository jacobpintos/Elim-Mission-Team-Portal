import { describe, expect, it } from 'vitest'
import { mixerAsked, plainlyTheDesk } from './mixer/asked'

const house = { kind: 'house' }
const step = { unit: 'step', size: 'some' }

describe('what is asked of the sound desk', () => {
  it('reads a mute, everywhere or somewhere', () => {
    expect(mixerAsked('mute Mitch EG')).toEqual({
      kind: 'mute',
      mute: true,
      channel: 'mitch eg',
      place: null,
    })
    expect(mixerAsked('Unmute Mitch EG.')).toMatchObject({ mute: false, channel: 'mitch eg' })
    expect(mixerAsked('mute Mitch EG in the house')).toMatchObject({ place: house })
    expect(mixerAsked('mute the bass in Mia’s ears')).toMatchObject({
      channel: 'bass',
      place: { kind: 'ears', who: 'mia' },
    })
    expect(mixerAsked('take Mitch EG out of the house')).toMatchObject({ mute: true, place: house })
    expect(mixerAsked('put Mitch EG back in the house')).toMatchObject({
      mute: false,
      place: house,
    })
    expect(mixerAsked('turn Mitch EG back on')).toMatchObject({ mute: false, channel: 'mitch eg' })
  })

  it('reads a level, with how much and where', () => {
    expect(mixerAsked('decrease Mitch EG channel in the house by 10%')).toEqual({
      kind: 'level',
      up: false,
      channel: 'mitch eg',
      place: house,
      by: { unit: '%', amount: 10 },
    })
    expect(mixerAsked('Mitch EG down 10 percent in the house')).toMatchObject({
      up: false,
      by: { unit: '%', amount: 10 },
    })
    expect(mixerAsked('bring up the keys 3 dB in Sarah’s ears')).toMatchObject({
      up: true,
      channel: 'keys',
      place: { kind: 'ears', who: 'sarah' },
      by: { unit: 'dB', amount: 3 },
    })
    expect(mixerAsked('more bass in my ears')).toMatchObject({
      up: true,
      channel: 'bass',
      place: { kind: 'ears', who: 'me' },
      by: step,
    })
    expect(mixerAsked('turn the pastor down a little')).toMatchObject({
      up: false,
      channel: 'pastor',
      place: null,
      by: { unit: 'step', size: 'little' },
    })
    expect(mixerAsked('lower Mitch EG by 1.5 dB')).toMatchObject({
      by: { unit: 'dB', amount: 1.5 },
    })
    expect(mixerAsked('Mitch EG down ten percent')).toMatchObject({ by: { unit: '%', amount: 10 } })
    expect(mixerAsked('can you turn up channel 7 please')).toMatchObject({
      channel: 'channel 7',
      up: true,
    })
  })

  it('knows the livestream is somewhere else', () => {
    expect(mixerAsked('turn the pastor up on the stream')).toMatchObject({
      place: { kind: 'stream' },
    })
  })

  it('leaves alone what is about notifications and chats', () => {
    expect(mixerAsked('mute notifications')).toBeNull()
    expect(mixerAsked('mute the youth group chat')).toBeNull()
    expect(mixerAsked('turn off message notifications')).toBeNull()
    expect(mixerAsked('what time is youth night')).toBeNull()
  })

  it('tells a plain request to the desk from one that may be a chat', () => {
    expect(plainlyTheDesk(mixerAsked('mute Mitch EG')!)).toBe(false)
    expect(plainlyTheDesk(mixerAsked('mute Mitch EG in the house')!)).toBe(true)
    expect(plainlyTheDesk(mixerAsked('Mitch EG down 10%')!)).toBe(true)
    expect(plainlyTheDesk(mixerAsked('turn Mitch EG down')!)).toBe(false)
  })
})
