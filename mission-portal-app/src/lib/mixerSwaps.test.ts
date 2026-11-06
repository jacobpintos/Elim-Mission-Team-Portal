import { describe, expect, it } from 'vitest'
import {
  liveSwaps,
  resetSwaps,
  swapsListed,
  swapsSaid,
  whoseFor,
  withSwaps,
  type Swap,
} from './mixer/swaps'

const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 8, 15)

describe('who is using whose pack or mic, as said', () => {
  it('reads a swap both ways', () => {
    expect(swapsSaid('Mia is using Sunny’s pack, and Sunny is using Mia’s pack')).toEqual({
      kind: 'using',
      pairs: [
        { item: 'pack', user: 'Mia', owner: 'Sunny' },
        { item: 'pack', user: 'Sunny', owner: 'Mia' },
      ],
    })
    expect(swapsSaid('Mia and Sunny swapped packs')).toEqual({
      kind: 'using',
      pairs: [
        { item: 'pack', user: 'Mia', owner: 'Sunny' },
        { item: 'pack', user: 'Sunny', owner: 'Mia' },
      ],
    })
  })

  it('reads someone with no mix of their own', () => {
    expect(swapsSaid('Joel is using Jacob’s pack')).toEqual({
      kind: 'using',
      pairs: [{ item: 'pack', user: 'Joel', owner: 'Jacob' }],
    })
    expect(swapsSaid('Joel’s on Jacob’s in-ears today')).toMatchObject({
      pairs: [{ item: 'pack', user: 'Joel', owner: 'Jacob' }],
    })
  })

  it('reads mics, and both at once', () => {
    expect(swapsSaid('Mia is using Jacob’s mic')).toEqual({
      kind: 'using',
      pairs: [{ item: 'mic', user: 'Mia', owner: 'Jacob' }],
    })
    expect(swapsSaid('Mia has Jacob’s vocal mic and Sunny’s pack')).toEqual({
      kind: 'using',
      pairs: [
        { item: 'mic', user: 'Mia', owner: 'Jacob' },
        { item: 'pack', user: 'Mia', owner: 'Sunny' },
      ],
    })
  })

  it('reads someone back on their own', () => {
    expect(swapsSaid('Mia is back on her own pack')).toEqual({
      kind: 'using',
      pairs: [{ item: 'pack', user: 'Mia', owner: 'Mia' }],
    })
  })

  it('reads a reset, and a question', () => {
    expect(swapsSaid('reset the packs')).toEqual({ kind: 'reset', items: ['pack'] })
    expect(swapsSaid('reset pack names')).toEqual({ kind: 'reset', items: ['pack'] })
    expect(swapsSaid('reset the mics')).toEqual({ kind: 'reset', items: ['mic'] })
    expect(swapsSaid('clear the swaps')).toEqual({ kind: 'reset', items: ['pack', 'mic'] })
    expect(swapsSaid('everyone’s back on their own packs')).toEqual({
      kind: 'reset',
      items: ['pack'],
    })
    expect(swapsSaid('who’s using whose pack?')).toEqual({ kind: 'which' })
  })

  it('isn’t a desk request or anything else', () => {
    expect(swapsSaid('mute the bass in Mia’s ears')).toBeNull()
    expect(swapsSaid('Mia is coming on Sunday')).toBeNull()
    expect(swapsSaid('reset my password')).toBeNull()
  })
})

describe('swaps, kept', () => {
  const said = (s: string) =>
    (swapsSaid(s) as Extract<ReturnType<typeof swapsSaid>, { kind: 'using' }>).pairs

  it('goes by the pack someone has on', () => {
    const { swaps } = withSwaps(
      [],
      said('Mia is using Sunny’s pack and Sunny is using Mia’s pack'),
      NOW
    )
    expect(whoseFor('pack', 'Mia', swaps, NOW).owner).toBe('Sunny')
    expect(whoseFor('pack', 'sunny', swaps, NOW).owner).toBe('Mia')
    expect(whoseFor('pack', 'Jacob', swaps, NOW)).toEqual({
      owner: 'Jacob',
      swap: null,
      lentTo: null,
    })
  })

  it('says who has a pack whose owner isn’t using another', () => {
    const { swaps } = withSwaps([], said('Joel is using Jacob’s pack'), NOW)
    expect(whoseFor('pack', 'Joel', swaps, NOW).owner).toBe('Jacob')
    expect(whoseFor('pack', 'Jacob', swaps, NOW)).toEqual({
      owner: 'Jacob',
      swap: null,
      lentTo: 'Joel',
    })
  })

  it('keeps a pack with one person: given to another, it moves', () => {
    const first = withSwaps([], said('Joel is using Jacob’s pack'), NOW)
    const next = withSwaps(first.swaps, said('Mia is using Jacob’s pack'), NOW + HOUR)
    expect(next.moved).toEqual([{ item: 'pack', owner: 'Jacob', from: 'Joel', to: 'Mia' }])
    expect(whoseFor('pack', 'Joel', next.swaps, NOW + HOUR).owner).toBe('Joel')
    expect(whoseFor('pack', 'Mia', next.swaps, NOW + HOUR).owner).toBe('Jacob')
  })

  it('keeps packs and mics apart', () => {
    const { swaps } = withSwaps([], said('Mia is using Jacob’s mic'), NOW)
    expect(whoseFor('mic', 'Mia', swaps, NOW).owner).toBe('Jacob')
    expect(whoseFor('pack', 'Mia', swaps, NOW).owner).toBe('Mia')
  })

  it('lasts 12 hours', () => {
    const { swaps } = withSwaps([], said('Joel is using Jacob’s pack'), NOW)
    expect(whoseFor('pack', 'Joel', swaps, NOW + 11.9 * HOUR).owner).toBe('Jacob')
    expect(whoseFor('pack', 'Joel', swaps, NOW + 12 * HOUR).owner).toBe('Joel')
    expect(liveSwaps(swaps, NOW + 13 * HOUR)).toEqual([])
  })

  it('is forgotten on a reset, or back on their own', () => {
    const both: Swap[] = withSwaps(
      [],
      said('Mia is using Sunny’s pack and Sunny is using Mia’s pack'),
      NOW
    ).swaps.concat({ item: 'mic', user: 'Mia', owner: 'Jacob', at: NOW })
    expect(resetSwaps(both, ['pack'], NOW)).toEqual([
      { item: 'mic', user: 'Mia', owner: 'Jacob', at: NOW },
    ])
    // Back on her own pack, Mia's pack is no longer Sunny's: told so.
    const back = withSwaps(both, said('Mia is back on her own pack'), NOW)
    expect(whoseFor('pack', 'Mia', back.swaps, NOW).owner).toBe('Mia')
    expect(back.moved).toEqual([{ item: 'pack', owner: 'Mia', from: 'Sunny', to: 'Mia' }])
    expect(swapsListed(back.swaps, NOW)).toBe('Mia has Jacob’s mic.')
    expect(swapsListed([], NOW)).toBe('Everyone is on their own packs and mics.')
  })
})
