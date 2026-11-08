import { beforeEach, describe, expect, it } from 'vitest'
import type { UserProfile } from '@/types/user'
import { X32 } from '@/lib/mixer/x32'
import { forgetHouseMutes } from '@/lib/mixer/desk'
import type { Swap } from '@/lib/mixer/swaps'
import { fakeX32 } from '@/lib/__fixtures__/fakeX32'
import type { Here, Reply, Talk } from './localTalk'
import { forgetDeskNames, mixerHere, type DeskAccess } from './mixerTalk'

const NOW = Date.UTC(2026, 10, 8, 15)
const HOUR = 60 * 60 * 1000

const CHANNELS = {
  1: 'Pastor',
  3: 'Jacob Vox',
  4: 'Mia Vox',
  5: 'Mia Keys',
  7: 'Mitch EG',
  8: 'Bass',
}
const BUSES = { 1: 'Mia IEM', 2: 'Sunny IEM', 3: 'Jacob IEM', 4: 'Mitch Ears' }

/** The input lists, as Worship → Input List has them: rows line up with the desk's strips. */
const row = (input = '', output = '') => ({ input, output })
const INPUT_LISTS: Record<string, { input: string; output: string }[]> = {
  // Matches the desk but for channel 2, channel 8's name, and the fifth in-ear mix.
  sunday: [
    row('Pastor', 'Mia IEM'),
    row('Kick'),
    row('Jacob Vox', 'Jacob IEM'),
    row('Mia Vox', 'Mitch Ears'),
    row('Mia Keys', 'Joel IEM'),
    row(),
    row('Mitch EG'),
    row('Bass DI'),
  ],
  event: [row('Pastor'), row(), row('Jacob Vox'), row('Mia Vox'), row('Mia Keys')],
}

/** A Sound Engineer talking to her, by the desk: each line said, and what came of it. */
function atTheDesk(access?: DeskAccess['kind']) {
  const desk = fakeX32({ channels: CHANNELS, buses: BUSES })
  const log: string[] = []
  let waiting: Reply | null = null
  let undo: (() => Promise<string>) | null = null
  let now = NOW
  let kept: Swap[] = []
  const talk = {
    say: (text: string) => log.push(`say: ${text}`),
    ask: (text: string, onReply: Reply) => {
      log.push(`ask: ${text}`)
      waiting = onReply
    },
    thinking: () => {},
    done: (text: string, u: () => Promise<string>) => {
      log.push(`done: ${text} [Undo]`)
      undo = u
    },
  } as unknown as Talk
  const here = {
    profile: { uid: 'mitch', displayName: 'Mitch Allen' } as UserProfile,
    now: () => now,
    desk: async (): Promise<DeskAccess> =>
      !access || access === 'ready'
        ? { kind: 'ready', link: desk.link }
        : ({ kind: access } as DeskAccess),
    inputList: async (loc: string) => INPUT_LISTS[loc] ?? null,
    swaps: {
      load: async () => kept,
      save: async (s: Swap[]) => {
        kept = s
      },
    },
  } as unknown as Here
  const say = async (said: string): Promise<string[]> => {
    log.length = 0
    if (waiting) {
      const onReply: Reply = waiting
      waiting = null
      if (await onReply(said, talk)) return [...log]
      log.push('(not an answer)')
    }
    if (!(await mixerHere(said, here, talk))) log.push('(not the desk)')
    return [...log]
  }
  return Object.assign(say, {
    desk,
    undo: async () => (undo ? undo() : 'nothing to undo'),
    later: (ms: number) => {
      now += ms
    },
  })
}

beforeEach(() => {
  forgetDeskNames()
  forgetHouseMutes()
})

describe('Miriam at the sound desk', () => {
  it('mutes a channel at once, with Undo', async () => {
    const say = atTheDesk()
    expect(await say('mute Mitch EG')).toEqual(['done: Muted Mitch EG. [Undo]'])
    expect(say.desk.value(X32.on(7))).toBe(0)
    expect(await say.undo()).toBe('Mitch EG is back on.')
    expect(say.desk.value(X32.on(7))).toBe(1)
  })

  it('asks before unmuting, and leaves it on a no', async () => {
    const say = atTheDesk()
    say.desk.set(X32.on(7), { t: 'i', v: 0 })
    expect(await say('unmute Mitch EG')).toEqual(['ask: Unmute Mitch EG?'])
    expect(await say('no')).toEqual(['say: Okay — left as it is.'])
    expect(say.desk.value(X32.on(7))).toBe(0)
    await say('unmute Mitch EG')
    expect(await say('yes')).toEqual(['done: Mitch EG is unmuted. [Undo]'])
    expect(say.desk.value(X32.on(7))).toBe(1)
  })

  it('turns down 10% in the house', async () => {
    const say = atTheDesk()
    expect(await say('decrease Mitch EG channel in the house by 10%')).toEqual([
      'done: Mitch EG down 4 dB in the house, to -4 dB. [Undo]',
    ])
  })

  it('asks which, when a name fits several', async () => {
    const say = atTheDesk()
    expect(await say('mute Mia in the house')).toEqual(['ask: Which one: Mia Vox or Mia Keys?'])
    expect(await say('keys')).toEqual(['done: Muted Mia Keys in the house. [Undo]'])
    expect(say.desk.value(X32.mainLR(5))).toBe(0)
  })

  it('changes the asker’s own in-ears', async () => {
    const say = atTheDesk()
    expect(await say('less bass in my ears')).toEqual([
      'done: Bass down 3 dB in Mitch’s ears, to -3 dB. [Undo]',
    ])
  })

  it('goes by who is using whose pack, both ways, for 12 hours', async () => {
    const say = atTheDesk()
    expect(await say('Mia is using Sunny’s pack, and Sunny is using Mia’s pack')).toEqual([
      'say: Okay — Mia has Sunny’s pack and Sunny has Mia’s pack for the next 12 hours, or until you reset the packs.',
    ])
    expect(await say('mute the bass in Mia’s ears')).toEqual([
      'done: Muted Bass in Mia’s ears (Sunny’s pack). [Undo]',
    ])
    expect(say.desk.value(X32.sendOn(8, 2))).toBe(0)
    expect(say.desk.value(X32.sendOn(8, 1))).toBe(1)
    expect(await say('mute the bass in Sunny’s ears')).toEqual([
      'done: Muted Bass in Sunny’s ears (Mia’s pack). [Undo]',
    ])
    expect(say.desk.value(X32.sendOn(8, 1))).toBe(0)
    // Twelve hours on, everyone is on their own again.
    say.later(12 * HOUR)
    say.desk.set(X32.sendOn(8, 1), { t: 'i', v: 1 })
    expect(await say('mute the bass in Mia’s ears')).toEqual([
      'done: Muted Bass in Mia’s ears. [Undo]',
    ])
    expect(say.desk.value(X32.sendOn(8, 1))).toBe(0)
  })

  it('goes by the pack of someone with no mix of their own, until the packs are reset', async () => {
    const say = atTheDesk()
    expect(await say('Joel is using Jacob’s pack')).toEqual([
      'say: Okay — Joel has Jacob’s pack for the next 12 hours, or until you reset the packs.',
    ])
    expect(await say('more bass in Joel’s ears')).toEqual([
      'ask: Turn Bass up 3 dB in Joel’s ears (Jacob’s pack), to +3 dB?',
    ])
    expect(await say('yes')).toEqual([
      'done: Bass up 3 dB in Joel’s ears (Jacob’s pack), to +3 dB. [Undo]',
    ])
    expect(await say('who’s using whose pack?')).toEqual(['say: Joel has Jacob’s pack.'])
    expect(await say('reset the packs')).toEqual([
      'say: Okay — everyone is on their own packs again.',
    ])
    expect(await say('mute the bass in Joel’s ears')).toEqual([
      'say: There’s no in-ear mix named after Joel on the desk.',
    ])
  })

  it('goes by who is using whose mic, even with a channel of their own', async () => {
    const say = atTheDesk()
    expect(await say('Mia is using Jacob’s mic')).toEqual([
      'say: Okay — Mia has Jacob’s mic for the next 12 hours, or until you reset the mics.',
    ])
    expect(await say('mute mia vox')).toEqual(['done: Muted Jacob Vox (Mia’s mic). [Undo]'])
    expect(say.desk.value(X32.on(3))).toBe(0)
    expect(say.desk.value(X32.on(4))).toBe(1)
    expect(await say('mute mia keys')).toEqual(['done: Muted Mia Keys. [Undo]'])
  })

  it('won’t use a pack or mic with nothing on the desk named after its owner', async () => {
    const say = atTheDesk()
    expect(await say('Mia is using Zoe’s pack')).toEqual([
      'say: There’s no in-ear mix named after Zoe on the desk, so I can’t use their pack.',
    ])
  })

  it('knows the livestream is mixed in Pro Tools', async () => {
    const say = atTheDesk()
    expect(await say('turn the pastor up on the stream')).toEqual([
      'say: The livestream is mixed in Pro Tools, so I can’t change it from here.',
    ])
  })

  it('leaves a plain “mute X” that isn’t on the desk to the rest of her', async () => {
    const say = atTheDesk()
    expect(await say('mute the youth group')).toEqual(['(not the desk)'])
    expect(await say('mute notifications')).toEqual(['(not the desk)'])
  })

  it('says when the desk can’t be reached', async () => {
    const say = atTheDesk()
    expect(await say('mute Mitch EG')).toEqual(['done: Muted Mitch EG. [Undo]'])
    say.desk.unplug()
    forgetDeskNames()
    expect(await say('mute Mitch EG in the house')).toEqual([
      'say: I can’t reach the sound desk. Is this phone on its Wi-Fi?',
    ])
  })

  it('is for Sound Engineers, on the phone app, once it knows where the desk is', async () => {
    expect(await atTheDesk('not engineer')('mute Mitch EG in the house')).toEqual([
      'say: Only Sound Engineers can change the sound desk. An admin can make you one on the Leadership Team screen.',
    ])
    // Plain "mute X" from someone else may be about a chat: left alone.
    expect(await atTheDesk('not engineer')('mute Mitch EG')).toEqual(['(not the desk)'])
    expect(await atTheDesk('no app')('Mitch EG down 10%')).toEqual([
      'say: I can change the sound desk only from the phone app, on the desk’s Wi-Fi.',
    ])
    expect(await atTheDesk('no address')('Mitch EG down 10%')).toEqual([
      'say: I don’t know where the sound desk is yet. Put its address in Settings, under Sound desk.',
    ])
  })
})

describe('Miriam and the input list', () => {
  it('asks first, then puts the list’s names on the desk, with Undo', async () => {
    const say = atTheDesk()
    expect(await say('send the Sunday input list to the desk')).toEqual([
      'ask: Send 3 names from the Sunday input list to the desk? Its other names stay as they are.',
    ])
    expect(await say('yes')).toEqual([
      'done: Done — 3 names from the Sunday list are on the desk. [Undo]',
    ])
    expect(say.desk.value(X32.channelName(2))).toBe('Kick')
    expect(say.desk.value(X32.channelName(8))).toBe('Bass DI')
    expect(say.desk.value(X32.busName(5))).toBe('Joel IEM')
    // The list leaves the second in-ear mix empty: left as the desk had it.
    expect(say.desk.value(X32.busName(2))).toBe('Sunny IEM')
    expect(await say.undo()).toBe('Put back: the desk has its own names again.')
    expect(say.desk.value(X32.channelName(8))).toBe('Bass')
    expect(say.desk.value(X32.channelName(2))).toBe('')
  })

  it('asks which list when none is said, and leaves it on a no', async () => {
    const say = atTheDesk()
    expect(await say('load the input list onto the board')).toEqual([
      'ask: Which input list: Sunday, Event or WH2?',
    ])
    expect(await say('the event one')).toEqual([
      'say: The desk already has the Event input list’s names.',
    ])
    await say('put the Sunday input list on the desk')
    expect(await say('no')).toEqual(['say: Okay — left as it is.'])
    expect(say.desk.value(X32.channelName(2))).toBe('')
  })

  it('says what’s in the way', async () => {
    expect(await atTheDesk('not engineer')('send the sunday input list to the desk')).toEqual([
      expect.stringMatching(/^say: Only Sound Engineers/),
    ])
    expect(await atTheDesk()('send the WH2 input list to the desk')).toEqual([
      'say: I couldn’t read the WH2 input list.',
    ])
    const unplugged = atTheDesk()
    unplugged.desk.unplug()
    expect(await unplugged('send the sunday input list to the desk')).toEqual([
      'say: I can’t reach the sound desk. Is this phone on its Wi-Fi?',
    ])
  })
})

describe('Miriam moving channels', () => {
  it('asks first, switches the channels with everything they have, and has Undo', async () => {
    const say = atTheDesk()
    say.desk.set('/ch/01/mix/02/on', { t: 'i', v: 0 })
    expect(await say('swap channels 1 and 7')).toEqual([
      'ask: Switch channel 1 (Pastor) with 7 (Mitch EG)? Each takes its input, name and every setting with it. The sound on them drops out for a moment while they move.',
    ])
    expect(await say('yes')).toEqual(['done: Done — channel 1 is on 7 now, and 7 on 1. [Undo]'])
    expect(say.desk.value(X32.channelName(7))).toBe('Pastor')
    expect(say.desk.value('/ch/07/config/source')).toBe(1)
    expect(say.desk.value('/ch/07/mix/02/on')).toBe(0)
    expect(say.desk.value(X32.channelName(1))).toBe('Mitch EG')
    // Asked for by name, it's found where it went.
    expect(await say('mute Mitch EG')).toEqual(['done: Muted Mitch EG. [Undo]'])
    expect(say.desk.value(X32.on(1))).toBe(0)
  })

  it('puts them all back on Undo, and leaves them on a no', async () => {
    const say = atTheDesk()
    await say('move channels 3 through 4 to 7 through 8')
    expect(await say('yes')).toEqual([
      'done: Done — channels 3–4 are on 7–8 now, and 7–8 on 3–4. [Undo]',
    ])
    expect(say.desk.value(X32.channelName(8))).toBe('Mia Vox')
    expect(await say.undo()).toBe('Put back: those channels are as they were.')
    expect(say.desk.value(X32.channelName(3))).toBe('Jacob Vox')
    expect(say.desk.value(X32.channelName(8))).toBe('Bass')

    await say('switch channel 1 with channel 2')
    expect(await say('no')).toEqual(['say: Okay — left as it is.'])
    expect(say.desk.value(X32.channelName(1))).toBe('Pastor')
  })

  it('says what’s in the way', async () => {
    expect(await atTheDesk()('move channels 15 through 20 to 25 through 29')).toEqual([
      'say: 15 through 20 is 6 channels, but 25 through 29 is 5. They need to be the same number.',
    ])
    const linked = atTheDesk()
    linked.desk.set('/config/chlink/3-4', { t: 'i', v: 1 })
    expect(await linked('move channels 3 through 4 to 6 through 7')).toEqual([
      'say: Channels 3 and 4 are linked as a stereo pair, and this would split them. Move them onto an odd channel and the one after it, or unlink them first.',
    ])
    expect(await atTheDesk('not engineer')('swap channels 1 and 7')).toEqual([
      expect.stringMatching(/^say: Only Sound Engineers/),
    ])
  })
})
