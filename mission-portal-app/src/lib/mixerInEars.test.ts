import { describe, expect, it } from 'vitest'
import type { UserProfile } from '@/types/user'
import { aimInEar, inEarAsked, inEarChange, type InEarAsk, type Pack } from './mixer/inEars'
import { packStill } from './mixer/packStore'
import { canAdjustInEars } from './teamJobs'
import { readDeskNames, snapFader, X32 } from './mixer/x32'
import { fakeX32 } from './__fixtures__/fakeX32'
import { fakeWing } from './__fixtures__/fakeWing'

const CHANNELS = { 1: 'Pastor', 3: 'Jacob Vox', 4: 'Mia Vox', 5: 'Mia Keys', 8: 'Bass' }
const BUSES = { 1: 'Mia IEM', 2: 'Sunny IEM' }
const SUNNY: Pack = { bus: 2, name: 'Sunny IEM' }

describe('what someone asks of their own in-ears', () => {
  it('hears a channel up, down or muted, and the whole mix', () => {
    expect(inEarAsked('more vocals')).toMatchObject({
      kind: 'channel',
      ask: { kind: 'level', up: true, channel: 'vocals' },
    })
    expect(inEarAsked('less bass')).toMatchObject({ ask: { kind: 'level', up: false } })
    expect(inEarAsked('mute the click')).toMatchObject({ ask: { kind: 'mute', mute: true } })
    expect(inEarAsked('turn up the keys in my ears')).toMatchObject({ kind: 'channel' })
    expect(inEarAsked('my mix louder')).toMatchObject({ kind: 'mix', up: true })
    expect(inEarAsked('turn everything down')).toMatchObject({ kind: 'mix', up: false })
    expect(inEarAsked('Louder!')).toMatchObject({ kind: 'mix', up: true })
  })

  it('says when it’s the house or the stream: not theirs', () => {
    expect(inEarAsked('turn the bass down in the house')).toEqual({ kind: 'elsewhere' })
    expect(inEarAsked('hello there')).toBeNull()
  })
})

describe('the channels it’s for', () => {
  it('finds them by name, "me" by the person’s own, and asks which of several', async () => {
    const names = (await readDeskNames(fakeX32({ channels: CHANNELS }).link))!
    expect(aimInEar('bass', names, 'Sunny')).toEqual({
      kind: 'channels',
      channels: [{ n: 8, name: 'Bass' }],
    })
    expect(aimInEar('me', names, 'Mia')).toEqual({
      kind: 'channels',
      channels: [{ n: 4, name: 'Mia Vox' }],
    })
    expect(aimInEar('vox', names, 'Sunny')).toMatchObject({ kind: 'which', said: 'vox' })
    expect(aimInEar('drums', names, 'Sunny')).toEqual({ kind: 'none', said: 'drums' })
  })
})

describe('changing only their pack', () => {
  const ask = (said: string) => inEarAsked(said) as InEarAsk

  it('turns a channel down in their mix only, at once, with Undo', async () => {
    const desk = fakeX32({ channels: CHANNELS, buses: BUSES })
    const worked = await inEarChange(desk.link, SUNNY, ask('less bass'), [{ n: 8, name: 'Bass' }])
    if (worked.kind !== 'change') throw new Error(worked.kind)
    expect(worked.change.askFirst).toBe(false)
    expect(await worked.change.make()).toMatch(/^Bass down 3 dB in your ears/)
    expect(Number(desk.value(X32.sendLevel(8, 2)))).toBeLessThan(snapFader(0.75))
    // Mia's mix and the house are as they were.
    expect(desk.value(X32.sendLevel(8, 1))).toBe(snapFader(0.75))
    expect(desk.value(X32.fader(8))).toBe(snapFader(0.75))
    await worked.change.undo()
    expect(desk.value(X32.sendLevel(8, 2))).toBe(snapFader(0.75))
  })

  it('asks before turning up, and does all of several together', async () => {
    const desk = fakeX32({ channels: CHANNELS, buses: BUSES })
    const both = [
      { n: 3, name: 'Jacob Vox' },
      { n: 4, name: 'Mia Vox' },
    ]
    const worked = await inEarChange(desk.link, SUNNY, ask('more vocals'), both)
    if (worked.kind !== 'change') throw new Error(worked.kind)
    expect(worked.change.askFirst).toBe(true)
    expect(worked.change.question).toBe('Turn up Jacob Vox, Mia Vox in your ears?')
    await worked.change.make()
    expect(Number(desk.value(X32.sendLevel(3, 2)))).toBeGreaterThan(snapFader(0.75))
    expect(Number(desk.value(X32.sendLevel(4, 2)))).toBeGreaterThan(snapFader(0.75))
    expect(desk.value(X32.sendLevel(4, 1))).toBe(snapFader(0.75))
  })

  it('turns their whole mix down on its own bus, an X32’s or a WING’s', async () => {
    const x32 = fakeX32({ channels: CHANNELS, buses: BUSES })
    const quieter = await inEarChange(x32.link, SUNNY, ask('my mix quieter'), [])
    if (quieter.kind !== 'change') throw new Error(quieter.kind)
    await quieter.change.make()
    expect(Number(x32.value(X32.busFader(2)))).toBeLessThan(snapFader(0.75))
    expect(x32.value(X32.busFader(1))).toBe(snapFader(0.75))

    const wing = fakeWing({ channels: CHANNELS, buses: BUSES })
    const down = await inEarChange(wing.link, SUNNY, ask('turn everything down'), [])
    if (down.kind !== 'change') throw new Error(down.kind)
    await down.change.make()
    expect(Number(wing.value('/bus/2/fdr'))).toBeCloseTo(-3, 1)
    expect(wing.value('/bus/1/fdr')).toBe(0)
  })

  it('mutes a channel in their mix on a WING', async () => {
    const wing = fakeWing({ channels: CHANNELS, buses: BUSES })
    const worked = await inEarChange(wing.link, SUNNY, ask('mute the bass'), [
      { n: 8, name: 'Bass' },
    ])
    if (worked.kind !== 'change') throw new Error(worked.kind)
    expect(await worked.change.make()).toBe('Muted Bass in your ears.')
    expect(wing.value('/ch/8/send/2/on')).toBe(0)
    expect(wing.value('/ch/8/send/1/on')).toBe(1)
    expect(wing.value('/ch/8/mute')).toBe(0)
  })
})

describe('who changes their own in-ears', () => {
  const as = (roles: string[], uid = 'u1') => ({ uid, roles }) as unknown as UserProfile
  it('is the worship team, guests, Sound Engineers and admins', () => {
    expect(canAdjustInEars(as(['worship']), [])).toBe(true)
    expect(canAdjustInEars(as(['guest']), [])).toBe(true)
    expect(canAdjustInEars(as(['admin']), [])).toBe(true)
    expect(canAdjustInEars(as(['regular'], 'mitch'), ['mitch'])).toBe(true)
    expect(canAdjustInEars(as(['regular']), [])).toBe(false)
    expect(canAdjustInEars(null, [])).toBe(false)
  })

  it('keeps a pack chosen for a service: 12 hours', () => {
    const at = Date.UTC(2026, 10, 8, 14)
    expect(packStill({ bus: 2, name: 'Sunny IEM', at }, at + 60_000)).toEqual(SUNNY)
    expect(packStill({ bus: 2, name: 'Sunny IEM', at }, at + 13 * 3_600_000)).toBeNull()
    expect(packStill(null, at)).toBeNull()
  })
})
