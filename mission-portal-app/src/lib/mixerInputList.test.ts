import { describe, expect, it } from 'vitest'
import {
  deskNameOf,
  inputListAsked,
  namesDiffering,
  readStripNames,
  rowsPastTheDesk,
  rowsWithDeskNames,
  sendNamesToDesk,
  stripFor,
  stripsOf,
  type ListRow,
} from './mixer/inputListDesk'
import { X32 } from './mixer/x32'
import { fakeX32 } from './__fixtures__/fakeX32'

/** A list of `count` rows, with these names in it (row from 1). */
function listOf(count: number, names: Record<number, Partial<ListRow>>): ListRow[] {
  return Array.from({ length: count }, (_, i) => ({
    input: names[i + 1]?.input ?? '',
    output: names[i + 1]?.output ?? '',
  }))
}

describe('the input list lined up with the board', () => {
  it('runs inputs through channels, aux inputs and effects returns', () => {
    expect(stripFor('input', 1)).toEqual({ address: '/ch/01/config/name', label: 'Ch 1' })
    expect(stripFor('input', 32)?.address).toBe('/ch/32/config/name')
    expect(stripFor('input', 33)).toEqual({ address: '/auxin/01/config/name', label: 'Aux 1' })
    expect(stripFor('input', 41)).toEqual({ address: '/fxrtn/01/config/name', label: 'FX 1' })
    expect(stripFor('input', 48)?.address).toBe('/fxrtn/08/config/name')
    expect(stripFor('input', 49)).toBeNull()
  })

  it('runs outputs through the mix buses, then the matrices', () => {
    expect(stripFor('output', 1)).toEqual({ address: '/bus/01/config/name', label: 'Bus 1' })
    expect(stripFor('output', 16)?.address).toBe('/bus/16/config/name')
    expect(stripFor('output', 17)).toEqual({ address: '/mtx/01/config/name', label: 'Matrix 1' })
    expect(stripFor('output', 22)?.address).toBe('/mtx/06/config/name')
    expect(stripFor('output', 23)).toBeNull()
    expect(stripFor('output', 0)).toBeNull()
  })

  it('covers every row of the Sunday list it can: 44 inputs, 22 outputs', () => {
    const strips = stripsOf(listOf(44, {}))
    expect(strips.filter((s) => s.side === 'input')).toHaveLength(44)
    expect(strips.filter((s) => s.side === 'output')).toHaveLength(22)
  })

  it('names rows past the desk only when they have a name', () => {
    const list = listOf(44, { 23: { output: 'Lobby' }, 30: { output: '' }, 44: { input: 'FX 4' } })
    expect(rowsPastTheDesk(list)).toEqual([{ side: 'output', row: 23 }])
  })

  it('keeps names to what the desk shows', () => {
    expect(deskNameOf('  Kick In ')).toBe('Kick In')
    expect(deskNameOf('Worship Leader Vox')).toBe('Worship Lead')
  })
})

describe('the input list and the desk', () => {
  const setup = () => {
    const x32 = fakeX32({
      channels: { 1: 'Kick', 2: 'Snare', 5: 'Old Name' },
      buses: { 1: 'Mia', 2: 'Sunny' },
    })
    x32.set('/auxin/01/config/name', { t: 's', v: 'Laptop' })
    const list = listOf(44, {
      1: { input: 'Kick In', output: 'Mia' },
      2: { input: 'Snare', output: 'Sunny IEM' },
      3: { input: 'Hi Hat' },
      33: { input: 'Laptop' },
      41: { input: 'Reverb' },
      17: { output: 'Stream' },
    })
    return { x32, list }
  }
  const read = async (x32: ReturnType<typeof fakeX32>, list: ListRow[]) => {
    const names = await readStripNames(
      x32.link,
      stripsOf(list).map((s) => s.strip.address)
    )
    expect(names).not.toBeNull()
    return namesDiffering(list, names!)
  }

  it('finds where they differ, both sides, row by row', async () => {
    const { x32, list } = setup()
    const diffs = await read(x32, list)
    expect(diffs.map((d) => [d.strip.label, d.list, d.desk])).toEqual([
      ['Ch 1', 'Kick In', 'Kick'],
      ['Ch 3', 'Hi Hat', ''],
      ['Ch 5', '', 'Old Name'],
      ['FX 1', 'Reverb', ''],
      ['Bus 2', 'Sunny IEM', 'Sunny'],
      ['Matrix 1', 'Stream', ''],
    ])
  })

  it('sends the list’s names to the desk, leaving a strip the list has no name for', async () => {
    const { x32, list } = setup()
    const { sent, failed } = await sendNamesToDesk(x32.link, await read(x32, list))
    expect(failed).toEqual([])
    expect(sent.map((d) => d.strip.label)).toEqual(['Ch 1', 'Ch 3', 'FX 1', 'Bus 2', 'Matrix 1'])
    expect(x32.value(X32.channelName(1))).toBe('Kick In')
    expect(x32.value('/mtx/01/config/name')).toBe('Stream')
    // Its name stays: the list's row is empty.
    expect(x32.value(X32.channelName(5))).toBe('Old Name')
    // And now only that one differs.
    expect((await read(x32, list)).map((d) => d.strip.label)).toEqual(['Ch 5'])
  })

  it('puts the desk’s names into the list instead, when asked', async () => {
    const { x32, list } = setup()
    const next = rowsWithDeskNames(list, await read(x32, list))
    expect(next[0]).toEqual({ input: 'Kick', output: 'Mia' })
    expect(next[4].input).toBe('Old Name')
    expect(next[2].input).toBe('')
    expect(await read(x32, next)).toEqual([])
    // The list it was given is left as it was.
    expect(list[0].input).toBe('Kick In')
  })

  it('says when the desk isn’t there, and what it didn’t take', async () => {
    const { x32, list } = setup()
    const diffs = await read(x32, list)
    x32.unplug()
    expect(await readStripNames(x32.link, ['/ch/01/config/name'])).toBeNull()
    const { sent, failed } = await sendNamesToDesk(x32.link, diffs)
    expect(sent).toEqual([])
    expect(failed).toHaveLength(5)
  })
})

describe('Miriam asked to put an input list on the desk', () => {
  it('hears which list, or that none was said', () => {
    expect(inputListAsked('Send the Sunday input list to the desk')).toEqual({ loc: 'sunday' })
    expect(inputListAsked('load the event input list onto the board')).toEqual({ loc: 'event' })
    expect(inputListAsked('put the W H 2 input list on the mixer')).toEqual({ loc: 'wh2' })
    expect(inputListAsked('name the channels from the input list')).toEqual({ loc: null })
  })

  it('leaves everything else alone', () => {
    expect(inputListAsked('mute the bass in the house')).toBeNull()
    expect(inputListAsked('show me the input list')).toBeNull()
    expect(inputListAsked('update the input list from the desk')).toBeNull()
    expect(inputListAsked('send the set list to the band')).toBeNull()
  })
})
