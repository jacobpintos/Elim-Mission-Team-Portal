import { describe, it, expect } from 'vitest'
import { clearChordTokens, hasAnyChord } from './chordSheetEdit'

describe('clearChordTokens', () => {
  it('empties the chords over a lyric line but keeps a box per word', () => {
    // The rows line up with the words underneath them, so a shorter row would
    // put every remaining chord over the wrong syllable.
    expect(clearChordTokens([['1', '', '5m', '4']])).toEqual([['', '', '', '']])
  })

  it('keeps break rows, which are arrangement rather than chords', () => {
    expect(clearChordTokens([['1', '4'], ['||'], ['5', '6m']])).toEqual([
      ['', ''],
      ['||'],
      ['', ''],
    ])
  })

  it('keeps the breaks inside an instrumental row', () => {
    // An instrumental is one row of boxes with break markers among them;
    // losing those would merge two progressions into one.
    expect(clearChordTokens([['1', '4', '||', '5', '1']])).toEqual([['', '', '||', '', '']])
  })

  it('takes the progression dot with the chord it was typed on', () => {
    expect(clearChordTokens([['1.', '4']])).toEqual([['', '']])
  })

  it('leaves an empty sheet as it found it', () => {
    expect(clearChordTokens([[]])).toEqual([[]])
    expect(clearChordTokens([])).toEqual([])
  })
})

describe('hasAnyChord', () => {
  it('finds a chord anywhere in the song', () => {
    expect(hasAnyChord([[['', '']], [['', '5m']]])).toBe(true)
  })

  it('does not count structure as a chord', () => {
    // A sheet with only breaks has nothing to clear.
    expect(hasAnyChord([[['||']], [['', '||', '']]])).toBe(false)
  })

  it('is false for a sheet with empty boxes', () => {
    expect(hasAnyChord([[['', '', '']]])).toBe(false)
    expect(hasAnyChord([])).toBe(false)
  })
})
