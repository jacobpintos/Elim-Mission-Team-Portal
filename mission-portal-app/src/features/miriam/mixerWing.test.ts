import { beforeEach, describe, expect, it } from 'vitest'
import type { UserProfile } from '@/types/user'
import { forgetHouseMutes } from '@/lib/mixer/desk'
import { deskInfo, readDeskNames } from '@/lib/mixer/x32'
import { wingFromAnswer } from '@/lib/mixer/wing'
import { WING_CHANNEL_SETTINGS } from '@/lib/mixer/wingChannelMove'
import { fakeWing } from '@/lib/__fixtures__/fakeWing'
import type { Here, Reply, Talk } from './localTalk'
import { forgetDeskNames, mixerHere, type DeskAccess } from './mixerTalk'

const CHANNELS = {
  1: 'Pastor',
  3: 'Jacob Vox',
  4: 'Mia Vox',
  7: 'Mitch EG',
  8: 'Bass',
}
const BUSES = { 1: 'Mia IEM', 2: 'Sunny IEM' }
const MAINS = { 1: 'PA', 2: 'Subs', 3: 'Stream' }

const row = (input = '', output = '') => ({ input, output })
const INPUT_LISTS: Record<string, { input: string; output: string }[]> = {
  sunday: [
    ...Array.from({ length: 40 }, (_, i) => row(i === 8 ? 'Choir Mics' : '')),
    // Aux 1, and main 1's row on the output side (row 17).
    row('Laptop'),
  ].map((r, i) => (i === 16 ? { ...r, output: 'PA Main' } : r)),
}

/** A Sound Engineer talking to her, by a WING: each line said, and what came of it. */
function atTheWing(access?: DeskAccess['kind']) {
  const desk = fakeWing({ channels: CHANNELS, buses: BUSES, mains: MAINS })
  const log: string[] = []
  let waiting: Reply | null = null
  let undo: (() => Promise<string>) | null = null
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
    now: () => Date.UTC(2026, 10, 8, 15),
    desk: async (): Promise<DeskAccess> =>
      !access || access === 'ready'
        ? { kind: 'ready', link: desk.link }
        : ({ kind: access } as DeskAccess),
    inputList: async (loc: string) => INPUT_LISTS[loc] ?? null,
    swaps: { load: async () => [], save: async () => {} },
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
  })
}

beforeEach(() => {
  forgetDeskNames()
  forgetHouseMutes()
})

describe('a WING, asked the way the app asks a desk', () => {
  it('says who it is, and what its strips are called, all 40 channels and its mains', async () => {
    const desk = fakeWing({ channels: { 40: 'Click' }, mains: MAINS })
    expect(await deskInfo(desk.link)).toEqual({ name: 'Sanctuary', model: 'WING' })
    const names = await readDeskNames(desk.link)
    expect(names?.channels).toHaveLength(40)
    expect(names?.channels[39]).toBe('Click')
    expect(names?.mains).toEqual(['PA', 'Subs', 'Stream', ''])
  })

  it('is found by its answer to "WING?"', () => {
    const answer = new TextEncoder().encode('WING,192.168.1.62,Sanctuary,ngc-rack,S123,3.0.6')
    expect(wingFromAnswer(answer)).toEqual({ name: 'Sanctuary', model: 'WING Rack' })
    expect(wingFromAnswer(new TextEncoder().encode('/xinfo'))).toBeNull()
  })
})

describe('Miriam at a WING', () => {
  it('mutes a channel (the WING’s mute is 1 for muted), with Undo', async () => {
    const say = atTheWing()
    expect(await say('mute Mitch EG')).toEqual(['done: Muted Mitch EG. [Undo]'])
    expect(say.desk.value('/ch/7/mute')).toBe(1)
    expect(await say.undo()).toBe('Mitch EG is back on.')
    expect(say.desk.value('/ch/7/mute')).toBe(0)
  })

  it('turns a fader down in dB', async () => {
    const say = atTheWing()
    const [said] = await say('turn the bass down 3 dB')
    expect(said).toMatch(/^done: Bass down 3 dB in the house/)
    expect(Number(say.desk.value('/ch/8/fdr'))).toBeCloseTo(-3, 1)
  })

  it('works someone’s in-ears on the channel’s send to their bus', async () => {
    const say = atTheWing()
    expect(await say('mute the bass in Mia’s ears')).toEqual([
      'done: Muted Bass in Mia’s ears. [Undo]',
    ])
    expect(say.desk.value('/ch/8/send/1/on')).toBe(0)
    expect(say.desk.value('/ch/8/send/2/on')).toBe(1)
  })

  it('takes "the house" to be the mains that feed the room, never the stream’s', async () => {
    const say = atTheWing()
    say.desk.set('/ch/7/main/2/on', 1)
    say.desk.set('/ch/7/main/3/on', 1)
    expect(await say('mute Mitch EG in the house')).toEqual([
      'done: Muted Mitch EG in the house. [Undo]',
    ])
    expect(say.desk.value('/ch/7/main/1/on')).toBe(0)
    expect(say.desk.value('/ch/7/main/2/on')).toBe(0)
    // The stream still has it.
    expect(say.desk.value('/ch/7/main/3/on')).toBe(1)
    expect(say.desk.value('/ch/7/mute')).toBe(0)
    await say('unmute Mitch EG in the house')
    await say('yes')
    expect(say.desk.value('/ch/7/main/1/on')).toBe(1)
    expect(say.desk.value('/ch/7/main/2/on')).toBe(1)
  })

  it('knows a channel by the name it shows, its input’s when it takes its look from it', async () => {
    const say = atTheWing()
    say.desk.set('/ch/9/clink', 1)
    say.desk.set('/io/in/LCL/9/name', 'Choir')
    expect(await say('mute the choir')).toEqual(['done: Muted Choir. [Undo]'])
    expect(say.desk.value('/ch/9/mute')).toBe(1)
  })

  it('puts the input list’s names on the WING, on the strip or its input, aux and mains too', async () => {
    const say = atTheWing()
    say.desk.set('/ch/9/clink', 1)
    expect(await say('send the Sunday input list to the desk')).toEqual([
      'ask: Send 3 names from the Sunday input list to the desk? Its other names stay as they are.',
    ])
    expect(await say('yes')).toEqual([
      'done: Done — 3 names from the Sunday list are on the desk. [Undo]',
    ])
    // Channel 9 shows its input's name, so the input is named.
    expect(say.desk.value('/io/in/LCL/9/name')).toBe('Choir Mics')
    expect(say.desk.value('/ch/9/name')).toBe('')
    expect(say.desk.value('/aux/1/name')).toBe('Laptop')
    expect(say.desk.value('/main/1/name')).toBe('PA Main')
  })
})

describe('Miriam moving channels on a WING', () => {
  it('moves every setting, and what points at the channels follows them', async () => {
    const say = atTheWing()
    say.desk.set('/ch/15/name', 'Kick')
    say.desk.set('/ch/15/fdr', -5)
    say.desk.set('/ch/15/eq/1g', 3)
    say.desk.set('/ch/15/tags', '#D1,#M2')
    say.desk.set('/ch/15/gatesc/src', 'CH.16')
    say.desk.set('/ch/25/name', 'Spare')
    // A direct out from channel 15, and channel 2's compressor keyed from it.
    say.desk.set('/io/in/USR/3/user/grp', 'CH')
    say.desk.set('/io/in/USR/3/user/in', 15)
    say.desk.set('/ch/2/dynsc/src', 'CH.15')

    expect(await say('move channels 15 through 16 to 25 through 26')).toEqual([
      'ask: Switch channels 15–16 (Kick, unnamed) with 25–26 (Spare, unnamed)? Each takes its input, name and every setting with it. The sound on them drops out for a moment while they move.',
    ])
    expect(await say('yes')).toEqual([
      'done: Done — channels 15–16 are on 25–26 now, and 25–26 on 15–16. 3 direct outs and side-chains pointing at them followed. Save the snapshot on the WING to keep it. [Undo]',
    ])
    const v = say.desk.value
    expect(v('/ch/25/name')).toBe('Kick')
    expect(v('/ch/25/in/conn/in')).toBe(15)
    expect(v('/ch/25/fdr')).toBe(-5)
    expect(v('/ch/25/eq/1g')).toBe(3)
    expect(v('/ch/25/tags')).toBe('#D1,#M2')
    expect(v('/ch/25/gatesc/src')).toBe('CH.26')
    expect(v('/ch/15/name')).toBe('Spare')
    expect(v('/ch/15/in/conn/in')).toBe(25)
    expect(v('/io/in/USR/3/user/in')).toBe(25)
    expect(v('/ch/2/dynsc/src')).toBe('CH.25')

    expect(await say.undo()).toBe('Put back: those channels are as they were.')
    expect(v('/ch/15/name')).toBe('Kick')
    expect(v('/ch/15/in/conn/in')).toBe(15)
    expect(v('/io/in/USR/3/user/in')).toBe(15)
    expect(v('/ch/2/dynsc/src')).toBe('CH.15')
  })

  it('moves all of a strip’s settings', () => {
    expect(WING_CHANNEL_SETTINGS).toHaveLength(266)
    expect(WING_CHANNEL_SETTINGS.some((s) => s.path.includes('$'))).toBe(false)
  })

  it('knows the WING has 40 channels', async () => {
    expect(await atTheWing()('move channels 39 through 40 to 41 through 42')).toEqual([
      'say: The desk’s channels are 1 to 40.',
    ])
  })
})

describe('Miriam swapping channels by name on a WING', () => {
  it('switches the two, every setting with them', async () => {
    const say = atTheWing()
    say.desk.set('/ch/8/fdr', -7)
    expect(await say('swap the bass and Mitch EG')).toEqual([
      'ask: Switch channel 8 (Bass) with 7 (Mitch EG)? Each takes its input, name and every setting with it. The sound on them drops out for a moment while they move.',
    ])
    expect(await say('yes')).toEqual([
      'done: Done — channel 8 is on 7 now, and 7 on 8. Save the snapshot on the WING to keep it. [Undo]',
    ])
    expect(say.desk.value('/ch/7/name')).toBe('Bass')
    expect(say.desk.value('/ch/7/fdr')).toBe(-7)
    expect(say.desk.value('/ch/7/in/conn/in')).toBe(8)
    expect(say.desk.value('/ch/8/name')).toBe('Mitch EG')
  })
})
