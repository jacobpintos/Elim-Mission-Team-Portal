import { describe, it, expect } from 'vitest'
import {
  clearChordTokens,
  hasAnyChord,
  moveItem,
  neighbourIndex,
  normalizeSameAsPrevious,
} from './chordSheetEdit'

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

describe('moveItem', () => {
  const song = ['V', 'C', 'V', 'C', 'B', 'C']

  it('brings a section added last up to the front', () => {
    // The case this exists for: the intro remembered after the song is built.
    const withIntro = [...song, 'I']
    let ordered = withIntro
    for (let i = withIntro.length - 1; i > 0; i--) {
      ordered = moveItem(ordered, i, i - 1)
    }
    expect(ordered).toEqual(['I', 'V', 'C', 'V', 'C', 'B', 'C'])
  })

  it('moves one place either way', () => {
    expect(moveItem(song, 4, 3)).toEqual(['V', 'C', 'V', 'B', 'C', 'C'])
    expect(moveItem(song, 0, 1)).toEqual(['C', 'V', 'V', 'C', 'B', 'C'])
  })

  it('moves across the list in one go', () => {
    expect(moveItem(song, 5, 0)).toEqual(['C', 'V', 'C', 'V', 'C', 'B'])
  })

  it('does nothing at the ends rather than wrapping around', () => {
    expect(moveItem(song, 0, -1)).toBe(song)
    expect(moveItem(song, 5, 6)).toBe(song)
  })

  it('does nothing when asked to move somewhere it already is', () => {
    expect(moveItem(song, 2, 2)).toBe(song)
  })

  it('leaves the original list alone', () => {
    const before = [...song]
    moveItem(song, 0, 3)
    expect(song).toEqual(before)
  })

  it('copes with an empty or single-item list', () => {
    expect(moveItem([], 0, 0)).toEqual([])
    expect(moveItem(['only'], 0, 1)).toEqual(['only'])
  })
})

describe('neighbourIndex', () => {
  it('is the place one step in that direction', () => {
    expect(neighbourIndex(3, 'up')).toBe(2)
    expect(neighbourIndex(3, 'down')).toBe(4)
    // Out of range at the ends, which moveItem then refuses.
    expect(neighbourIndex(0, 'up')).toBe(-1)
  })
})

describe('normalizeSameAsPrevious', () => {
  it('clears the flag on a section moved above the one it copied', () => {
    // Chorus 2 said "same as the chorus above"; now it is the first chorus.
    const moved = [{ type: 'chorus', sameAsPrevious: true }, { type: 'verse' }, { type: 'chorus' }]
    expect(normalizeSameAsPrevious(moved)).toEqual([
      { type: 'chorus', sameAsPrevious: false },
      { type: 'verse' },
      { type: 'chorus' },
    ])
  })

  it('leaves the flag alone when an earlier section of that type remains', () => {
    const fine = [{ type: 'chorus' }, { type: 'verse' }, { type: 'chorus', sameAsPrevious: true }]
    expect(normalizeSameAsPrevious(fine)).toEqual(fine)
  })

  it('does not care about sections of other types in between', () => {
    const spread = [
      { type: 'verse' },
      { type: 'chorus' },
      { type: 'bridge' },
      { type: 'verse', sameAsPrevious: true },
    ]
    expect(normalizeSameAsPrevious(spread)).toEqual(spread)
  })

  it('leaves a song with no flags untouched', () => {
    const plain = [{ type: 'verse' }, { type: 'chorus' }]
    expect(normalizeSameAsPrevious(plain)).toEqual(plain)
    expect(normalizeSameAsPrevious([])).toEqual([])
  })
})
