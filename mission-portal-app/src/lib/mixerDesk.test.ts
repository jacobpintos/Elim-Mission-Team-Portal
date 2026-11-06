import { describe, expect, it } from 'vitest'
import { mixerAsked, type MixerAsk } from './mixer/asked'
import { aim, dbSaid, forgetHouseMutes, workOut, type Target } from './mixer/desk'
import { swapsSaid, withSwaps, type Swap } from './mixer/swaps'
import { dbToFader, faderToDb, readDeskNames, snapFader, X32, type DeskNames } from './mixer/x32'
import { fakeX32 } from './__fixtures__/fakeX32'

const NOW = Date.UTC(2026, 10, 8, 15)

const CHANNELS = {
  1: 'Pastor',
  3: 'Jacob Vox',
  4: 'Mia Vox',
  5: 'Mia Keys',
  6: 'Sunny Vox',
  7: 'Mitch EG',
  8: 'Bass',
  9: 'Vox 1',
  10: 'Vox 2',
}
const BUSES = { 1: 'Mia IEM', 2: 'Sunny IEM', 3: 'Jacob IEM', 4: 'Mitch Ears' }

async function setup() {
  const desk = fakeX32({ channels: CHANNELS, buses: BUSES })
  const names = (await readDeskNames(desk.link)) as DeskNames
  return { desk, names }
}

const ask = (s: string) => mixerAsked(s) as MixerAsk
const swapsOf = (s: string, before: Swap[] = []) => {
  const said = swapsSaid(s)
  if (said?.kind !== 'using') throw new Error(s)
  return withSwaps(before, said.pairs, NOW).swaps
}
const targetOf = (a: ReturnType<typeof aim>) => {
  if (a.kind !== 'target') throw new Error(a.kind)
  return a.target
}

describe('a request, aimed at the desk', () => {
  it('finds a channel by its name, however it’s said', async () => {
    const { names } = await setup()
    expect(targetOf(aim(ask('mute Mitch EG'), names, [], 'Jo', NOW)).ch).toBe(7)
    expect(targetOf(aim(ask('mute mitch’s EG'), names, [], 'Jo', NOW)).ch).toBe(7)
    expect(targetOf(aim(ask('mute the bass'), names, [], 'Jo', NOW)).ch).toBe(8)
    expect(targetOf(aim(ask('mute channel 9'), names, [], 'Jo', NOW)).chName).toBe('Vox 1')
  })

  it('asks which, when several fit', async () => {
    const { names } = await setup()
    expect(aim(ask('mute vox'), names, [], 'Jo', NOW)).toMatchObject({ kind: 'which channel' })
    expect(aim(ask('mute the drums'), names, [], 'Jo', NOW)).toEqual({ kind: 'no channel' })
  })

  it('finds someone’s in-ear mix by their name, or the asker’s', async () => {
    const { names } = await setup()
    expect(
      targetOf(aim(ask('mute the bass in Sunny’s ears'), names, [], 'Jo', NOW)).ears
    ).toMatchObject({
      bus: 2,
      person: 'Sunny',
      note: undefined,
    })
    expect(targetOf(aim(ask('more bass in my ears'), names, [], 'Mitch', NOW)).ears?.bus).toBe(4)
    expect(aim(ask('mute the bass in Joel’s ears'), names, [], 'Jo', NOW)).toEqual({
      kind: 'no mix',
      who: 'Joel',
    })
  })

  it('goes by who is using whose pack: Mia on Sunny’s, Sunny on Mia’s', async () => {
    const { names } = await setup()
    const swaps = swapsOf('Mia is using Sunny’s pack, and Sunny is using Mia’s pack')
    expect(targetOf(aim(ask('mute the bass in Mia’s ears'), names, swaps, 'Jo', NOW)).ears).toEqual(
      {
        bus: 2,
        busName: 'Sunny IEM',
        person: 'Mia',
        note: 'Sunny’s pack',
      }
    )
    expect(
      targetOf(aim(ask('mute the bass in Sunny’s ears'), names, swaps, 'Jo', NOW)).ears?.bus
    ).toBe(1)
  })

  it('goes by the pack for someone with no mix of their own: Joel on Jacob’s', async () => {
    const { names } = await setup()
    const swaps = swapsOf('Joel is using Jacob’s pack')
    expect(
      targetOf(aim(ask('more bass in Joel’s ears'), names, swaps, 'Jo', NOW)).ears
    ).toMatchObject({
      bus: 3,
      note: 'Jacob’s pack',
    })
    // Jacob's own mix, named, is still his mix: said who has it.
    expect(
      targetOf(aim(ask('more bass in Jacob’s ears'), names, swaps, 'Jo', NOW)).ears
    ).toMatchObject({
      bus: 3,
      note: 'Joel has that pack',
    })
  })

  it('forgets a pack swap after 12 hours', async () => {
    const { names } = await setup()
    const swaps = swapsOf('Mia is using Sunny’s pack')
    const later = NOW + 12 * 60 * 60 * 1000
    expect(
      targetOf(aim(ask('mute the bass in Mia’s ears'), names, swaps, 'Jo', later)).ears?.bus
    ).toBe(1)
  })

  it('goes by who is using whose mic, even with a channel of their own', async () => {
    const { names } = await setup()
    const swaps = swapsOf('Mia is using Jacob’s mic')
    // Mia Vox is on the desk, but Mia is singing on Jacob's mic.
    const t = targetOf(aim(ask('mute mia vox'), names, swaps, 'Jo', NOW))
    expect(t).toMatchObject({ ch: 3, chName: 'Jacob Vox', chNote: 'Mia’s mic' })
    expect(targetOf(aim(ask('turn down mia’s vocal'), names, swaps, 'Jo', NOW)).ch).toBe(3)
    // Her instruments are still hers.
    expect(targetOf(aim(ask('mute mia keys'), names, swaps, 'Jo', NOW)).ch).toBe(5)
    // Plain "Mia": her mic (Jacob's) or her keys.
    expect(aim(ask('mute mia'), names, swaps, 'Jo', NOW)).toMatchObject({
      kind: 'which channel',
      options: [
        { n: 3, name: 'Jacob Vox' },
        { n: 5, name: 'Mia Keys' },
      ],
    })
    // Jacob Vox, named, is still Jacob Vox: said who has it.
    expect(targetOf(aim(ask('mute jacob vox'), names, swaps, 'Jo', NOW))).toMatchObject({
      ch: 3,
      chNote: 'Mia has it',
    })
  })

  it('goes by a mic for someone with no channel of their own: Joel on Jacob’s', async () => {
    const { names } = await setup()
    const swaps = swapsOf('Joel is using Jacob’s mic')
    expect(targetOf(aim(ask('mute joel'), names, swaps, 'Jo', NOW))).toMatchObject({ ch: 3 })
    expect(targetOf(aim(ask('turn up joel vox'), names, swaps, 'Jo', NOW))).toMatchObject({ ch: 3 })
  })

  it('swaps a mic both ways', async () => {
    const { names } = await setup()
    const swaps = swapsOf('Mia and Jacob swapped mics')
    expect(targetOf(aim(ask('mute mia vox'), names, swaps, 'Jo', NOW)).ch).toBe(3)
    expect(targetOf(aim(ask('mute jacob vox'), names, swaps, 'Jo', NOW)).ch).toBe(4)
  })
})

describe('a change, made on the desk', () => {
  const target = (t: Partial<Target> = {}): Target => ({ ch: 7, chName: 'Mitch EG', ...t })

  it('mutes at once, and Undo unmutes', async () => {
    const { desk } = await setup()
    const w = await workOut(desk.link, ask('mute Mitch EG'), target())
    if (w.kind !== 'change') throw new Error(w.kind)
    expect(w.change.askFirst).toBe(false)
    expect(await w.change.make()).toBe('Muted Mitch EG.')
    expect(desk.value(X32.on(7))).toBe(0)
    expect(await w.change.undo()).toBe('Mitch EG is back on.')
    expect(desk.value(X32.on(7))).toBe(1)
  })

  it('says so when there is nothing to change', async () => {
    const { desk } = await setup()
    desk.set(X32.on(7), { t: 'i', v: 0 })
    expect(await workOut(desk.link, ask('mute Mitch EG'), target())).toEqual({
      kind: 'said',
      text: 'Mitch EG is already muted.',
    })
  })

  it('asks before unmuting', async () => {
    const { desk } = await setup()
    desk.set(X32.on(7), { t: 'i', v: 0 })
    const w = await workOut(desk.link, ask('unmute Mitch EG'), target())
    if (w.kind !== 'change') throw new Error(w.kind)
    expect(w.change).toMatchObject({ askFirst: true, question: 'Unmute Mitch EG?' })
    expect(await w.change.make()).toBe('Mitch EG is unmuted.')
    expect(desk.value(X32.on(7))).toBe(1)
  })

  describe('in the house: every speaker, subs too', () => {
    const SPEAKERS = { ...BUSES, 5: 'Subs', 6: 'Front Fill' }
    async function house() {
      forgetHouseMutes()
      const desk = fakeX32({ channels: CHANNELS, buses: SPEAKERS })
      const names = (await readDeskNames(desk.link)) as DeskNames
      // The bass: to the main left/right, the mono bus (for the subs) and the Subs bus;
      // not to the front fill (its send off, its level all the way down).
      desk.set(X32.mainMono(8), { t: 'i', v: 1 })
      desk.set(X32.monoLevel(8), { t: 'f', v: snapFader(0.75) })
      desk.set(X32.sendOn(8, 6), { t: 'i', v: 0 })
      desk.set(X32.sendLevel(8, 6), { t: 'f', v: 0 })
      return { desk, names }
    }
    const housed = (desk: ReturnType<typeof fakeX32>) => [
      desk.value(X32.mainLR(8)),
      desk.value(X32.mainMono(8)),
      desk.value(X32.sendOn(8, 5)),
      desk.value(X32.sendOn(8, 6)),
    ]

    it('knows the speaker buses by their names', async () => {
      const { names } = await house()
      expect(
        targetOf(aim(ask('mute the bass in the house'), names, [], 'Jo', NOW)).houseBuses
      ).toEqual([5, 6])
    })

    it('mutes every feed to the house that is on, and only those, with Undo', async () => {
      const { desk, names } = await house()
      const t = targetOf(aim(ask('mute the bass in the house'), names, [], 'Jo', NOW))
      const w = await workOut(desk.link, ask('mute the bass in the house'), t)
      if (w.kind !== 'change') throw new Error(w.kind)
      expect(w.change.askFirst).toBe(false)
      expect(await w.change.make()).toBe('Muted Bass in the house.')
      expect(housed(desk)).toEqual([0, 0, 0, 0])
      // The in-ears and the channel itself, untouched.
      expect(desk.value(X32.sendOn(8, 1))).toBe(1)
      expect(desk.value(X32.on(8))).toBe(1)
      expect(await w.change.undo()).toBe('Bass is back in the house.')
      expect(housed(desk)).toEqual([1, 1, 1, 0])
    })

    it('puts back what it took out, asked first', async () => {
      const { desk, names } = await house()
      const t = targetOf(aim(ask('mute the bass in the house'), names, [], 'Jo', NOW))
      const muted = await workOut(desk.link, ask('mute the bass in the house'), t)
      if (muted.kind !== 'change') throw new Error(muted.kind)
      await muted.change.make()
      const w = await workOut(desk.link, ask('unmute the bass in the house'), t)
      if (w.kind !== 'change') throw new Error(w.kind)
      expect(w.change).toMatchObject({ askFirst: true, question: 'Put Bass back in the house?' })
      expect(await w.change.make()).toBe('Bass is back in the house.')
      expect(housed(desk)).toEqual([1, 1, 1, 0])
    })

    it('with nothing remembered, puts back the feeds whose levels are up', async () => {
      const { desk, names } = await house()
      // Taken out of the house on another phone: every feed off.
      for (const a of [X32.mainLR(8), X32.mainMono(8), X32.sendOn(8, 5)])
        desk.set(a, { t: 'i', v: 0 })
      const t = targetOf(aim(ask('unmute the bass in the house'), names, [], 'Jo', NOW))
      const w = await workOut(desk.link, ask('unmute the bass in the house'), t)
      if (w.kind !== 'change') throw new Error(w.kind)
      await w.change.make()
      // The front fill's level is all the way down: left off.
      expect(housed(desk)).toEqual([1, 1, 1, 0])
    })

    it('says so when there is nothing to change', async () => {
      const { desk, names } = await house()
      const t = targetOf(aim(ask('unmute the bass in the house'), names, [], 'Jo', NOW))
      expect(await workOut(desk.link, ask('unmute the bass in the house'), t)).toEqual({
        kind: 'said',
        text: 'Bass isn’t muted in the house.',
      })
      for (const a of [X32.mainLR(8), X32.mainMono(8), X32.sendOn(8, 5)])
        desk.set(a, { t: 'i', v: 0 })
      expect(await workOut(desk.link, ask('mute the bass in the house'), t)).toEqual({
        kind: 'said',
        text: 'Bass is already muted in the house.',
      })
    })
  })

  it('mutes in someone’s ears with the send to their mix, as said with their pack', async () => {
    const { desk } = await setup()
    const ears = { bus: 2, busName: 'Sunny IEM', person: 'Mia', note: 'Sunny’s pack' }
    const w = await workOut(
      desk.link,
      ask('mute the bass in Mia’s ears'),
      target({ ch: 8, chName: 'Bass', ears })
    )
    if (w.kind !== 'change') throw new Error(w.kind)
    expect(await w.change.make()).toBe('Muted Bass in Mia’s ears (Sunny’s pack).')
    expect(desk.value(X32.sendOn(8, 2))).toBe(0)
    expect(desk.value(X32.sendOn(8, 1))).toBe(1)
    expect(desk.value(X32.on(8))).toBe(1)
  })

  it('turns down 10% of the fader’s travel at once', async () => {
    const { desk } = await setup()
    const w = await workOut(desk.link, ask('decrease Mitch EG in the house by 10%'), target())
    if (w.kind !== 'change') throw new Error(w.kind)
    expect(w.change.askFirst).toBe(false)
    expect(await w.change.make()).toBe('Mitch EG down 4 dB in the house, to -4 dB.')
    expect(desk.value(X32.fader(7))).toBeCloseTo(snapFader(snapFader(0.75) - 0.1), 5)
    expect(await w.change.undo()).toBe('Mitch EG is back to 0 dB in the house.')
    expect(desk.value(X32.fader(7))).toBeCloseTo(snapFader(0.75), 5)
  })

  it('asks before turning up, 6 dB at most at a time', async () => {
    const { desk } = await setup()
    const w = await workOut(desk.link, ask('turn up Mitch EG 10 dB'), target())
    if (w.kind !== 'change') throw new Error(w.kind)
    expect(w.change.askFirst).toBe(true)
    expect(w.change.question).toBe(
      'Turn Mitch EG up 6 dB in the house, to +6 dB? That’s as far as I’ll turn it up at once.'
    )
    await w.change.make()
    expect(faderToDb(Number(desk.value(X32.fader(7))))).toBeCloseTo(6, 0)
  })

  it('turns someone’s in-ears down, and says when the channel is muted', async () => {
    const { desk } = await setup()
    desk.set(X32.sendOn(8, 4), { t: 'i', v: 0 })
    const ears = { bus: 4, busName: 'Mitch Ears', person: 'Mitch' }
    const w = await workOut(
      desk.link,
      ask('bass down 3 dB in my ears'),
      target({ ch: 8, chName: 'Bass', ears })
    )
    if (w.kind !== 'change') throw new Error(w.kind)
    expect(await w.change.make()).toBe(
      'Bass down 3 dB in Mitch’s ears, to -3 dB. It’s muted, though.'
    )
    expect(desk.value(X32.sendLevel(8, 4))).toBeCloseTo(
      dbToFader(faderToDb(snapFader(0.75)) - 3),
      5
    )
  })

  it('says levels as the desk shows them', () => {
    expect(dbSaid(-Infinity)).toBe('all the way down')
    expect(dbSaid(0)).toBe('0 dB')
    expect(dbSaid(2.46)).toBe('+2.5 dB')
    expect(dbSaid(-6)).toBe('-6 dB')
  })

  it('knows when the desk can’t be reached', async () => {
    const { desk } = await setup()
    desk.unplug()
    expect(await workOut(desk.link, ask('mute Mitch EG'), target())).toEqual({
      kind: 'unreachable',
    })
  })
})

describe('channels, as people say them', () => {
  const STRIPS = {
    1: 'Pastor HH',
    2: 'Sunny Vox',
    3: 'Sunny EG',
    4: 'Sunny AG',
    5: 'Sunny TB',
    6: 'Mia Vox',
    7: 'HH',
    8: 'Kick',
    9: 'Keys',
  }
  async function strips() {
    const desk = fakeX32({ channels: STRIPS, buses: BUSES })
    return (await readDeskNames(desk.link)) as DeskNames
  }
  const chOf = (names: DeskNames, said: string) => {
    const a = aim(ask(said), names, [], 'Jo', NOW)
    return a.kind === 'target'
      ? a.target.chName
      : a.kind === 'which channel'
        ? a.options.map((o) => o.name)
        : a.kind
  }

  it('knows a vocal by any of its names', async () => {
    const names = await strips()
    expect(chOf(names, 'mute sunny vocal')).toBe('Sunny Vox')
    expect(chOf(names, 'mute sunny’s mic')).toBe('Sunny Vox')
    expect(chOf(names, 'turn down sunny’s voice')).toBe('Sunny Vox')
    expect(chOf(names, 'mute the pastor’s mic')).toBe('Pastor HH')
  })

  it('goes straight to someone’s only channel, and asks which of several', async () => {
    const names = await strips()
    expect(chOf(names, 'mute mia')).toBe('Mia Vox')
    expect(chOf(names, 'mute sunny')).toEqual(['Sunny Vox', 'Sunny EG', 'Sunny AG', 'Sunny TB'])
  })

  it('knows the strips’ short names', async () => {
    const names = await strips()
    expect(chOf(names, 'mute sunny’s electric guitar')).toBe('Sunny EG')
    expect(chOf(names, 'mute sunny’s acoustic')).toBe('Sunny AG')
    expect(chOf(names, 'mute sunny’s talkback')).toBe('Sunny TB')
    expect(chOf(names, 'turn down the hi hat')).toBe('HH')
    expect(chOf(names, 'turn down the kick drum')).toBe('Kick')
    expect(chOf(names, 'turn up the piano')).toBe('Keys')
  })

  it('asks which, when “guitar” could be either', async () => {
    const names = await strips()
    expect(chOf(names, 'mute sunny’s guitar')).toEqual(['Sunny EG', 'Sunny AG'])
  })

  it('knows a vocal by any of its names when someone is on another’s mic', async () => {
    const desk = fakeX32({
      channels: { 3: 'Jacob Vox', 4: 'Mia Vox', 5: 'Mia Keys' },
      buses: BUSES,
    })
    const names = (await readDeskNames(desk.link)) as DeskNames
    const swaps = swapsOf('Mia is using Jacob’s mic')
    expect(targetOf(aim(ask('mute mia’s mic'), names, swaps, 'Jo', NOW)).chName).toBe('Jacob Vox')
    expect(targetOf(aim(ask('mute mia vocal'), names, swaps, 'Jo', NOW)).chName).toBe('Jacob Vox')
  })
})
