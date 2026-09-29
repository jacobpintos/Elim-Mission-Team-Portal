import { describe, it, expect } from 'vitest'
import { getSectionLabel, getSectionShortLabel } from '@/features/worship/chordSheetFormat'
import type { ChordSheetSection, SectionType } from '@/types/chordSheet'

const section = (id: string, type: SectionType): ChordSheetSection => ({
  id,
  type,
  lyrics: '',
  chordTokens: [],
})

/** Intro, two verses, a chorus, a second verse-type, a bridge. */
const sheet: ChordSheetSection[] = [
  section('a', 'intro'),
  section('b', 'verse'),
  section('c', 'chorus'),
  section('d', 'verse'),
  section('e', 'bridge'),
]

describe('getSectionShortLabel', () => {
  it('numbers a repeated type the same way the heading does', () => {
    // The bar reading V1 V2 has to match the headings it scrolls to, or the
    // person taps V2 and lands somewhere that says Verse 1.
    expect(getSectionShortLabel(sheet, 'b')).toBe('V1')
    expect(getSectionLabel(sheet, 'b')).toBe('Verse 1')
    expect(getSectionShortLabel(sheet, 'd')).toBe('V2')
    expect(getSectionLabel(sheet, 'd')).toBe('Verse 2')
  })

  it('leaves a one-off type unnumbered, as the heading does', () => {
    expect(getSectionShortLabel(sheet, 'c')).toBe('C')
    expect(getSectionLabel(sheet, 'c')).toBe('Chorus')
    expect(getSectionShortLabel(sheet, 'e')).toBe('B')
  })

  it('abbreviates every section type to something a chip can hold', () => {
    const one = (type: SectionType) => getSectionShortLabel([section('x', type)], 'x')
    expect(one('intro')).toBe('In')
    expect(one('verse')).toBe('V')
    expect(one('pre-chorus')).toBe('PC')
    expect(one('chorus')).toBe('C')
    expect(one('bridge')).toBe('B')
    expect(one('tag')).toBe('T')
    expect(one('outro')).toBe('O')
    // Nothing longer than three characters, or the bar stops being a bar.
    const longest = (['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'tag', 'outro'] as const)
      .map((t) => one(t).length)
      .reduce((a, b) => Math.max(a, b), 0)
    expect(longest).toBeLessThanOrEqual(2)
  })

  it('returns nothing for a section that is not on the sheet', () => {
    expect(getSectionShortLabel(sheet, 'missing')).toBe('')
  })
})
