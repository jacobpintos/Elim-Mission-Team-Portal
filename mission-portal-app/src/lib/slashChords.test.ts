import { describe, it, expect } from 'vitest'
import { nashvilleToChord, convertChordLine, NNS_KEYS } from './nashvilleNumbers'
import { formatToken } from '@/features/worship/chordSheetFormat'

/** Key of C is index 0, so a degree reads as the note it names. */
const C = NNS_KEYS.indexOf('C')
const G = NNS_KEYS.indexOf('G')

describe('slash chords', () => {
  it('transposes the bass, not just the root', () => {
    // The reported bug: "1/7" showed as C/7 — the 1 moved and the 7 did not.
    expect(nashvilleToChord('1/7', C, false)).toBe('C/B')
    expect(nashvilleToChord('4/1', C, false)).toBe('F/C')
    expect(nashvilleToChord('1/5', G, false)).toBe('G/D')
  })

  it('leaves the bass a note, not a chord', () => {
    // A bare 6 as a CHORD is Am in a major key. As a bass note it is an A —
    // "C/Am" is not a thing anybody plays.
    expect(nashvilleToChord('6', C, false)).toBe('Am')
    expect(nashvilleToChord('1/6', C, false)).toBe('C/A')
    expect(nashvilleToChord('1/3', C, false)).toBe('C/E')
    expect(nashvilleToChord('1/2', C, false)).toBe('C/D')
  })

  it('keeps the root chord fully itself', () => {
    expect(nashvilleToChord('2m/1', C, false)).toBe('Dm/C')
    expect(nashvilleToChord('5sus4/1', C, false)).toBe('G(sus4)/C')
    expect(nashvilleToChord('4maj7/6', C, false)).toBe('F(maj7)/A')
  })

  it('handles an accidental on either side', () => {
    // Sharp names in a sharp key: this app picks the spelling from the key's
    // root, not from the accidental that was typed, and the bass follows the
    // same rule the root always has — b7 in C is A# here, on both sides of
    // the slash.
    expect(nashvilleToChord('b7', C, false)).toBe('A#')
    expect(nashvilleToChord('1/b7', C, false)).toBe('C/A#')
    expect(nashvilleToChord('b7/4', C, false)).toBe('A#/F')
    expect(nashvilleToChord('1/#4', C, false)).toBe('C/F#')
  })

  it('follows the key, including a flat one', () => {
    const Eb = NNS_KEYS.indexOf('Eb')
    expect(nashvilleToChord('1/7', Eb, false)).toBe('Eb/D')
    expect(nashvilleToChord('1/b7', Eb, false)).toBe('Eb/Db')
  })

  it('follows a minor key', () => {
    // Natural minor puts the 7 a tone below the root, and C is a sharp key.
    expect(nashvilleToChord('1/7', C, true)).toBe('C/A#')
  })

  it('leaves a bass it does not understand exactly as written', () => {
    // Better a token somebody can read and correct than a guess.
    expect(nashvilleToChord('1/x', C, false)).toBe('C/x')
    expect(nashvilleToChord('1/9', C, false)).toBe('C/9')
  })

  it('is not confused by a leading slash', () => {
    expect(nashvilleToChord('/7', C, false)).toBe('/7')
  })
})

describe('formatToken with slash chords', () => {
  it('transposes a slash chord written after an arrow', () => {
    // Exactly what was on screen: "C → C/7", where the bass never moved.
    expect(formatToken('1>1/7', C, false)).toBe('C → C/B')
  })

  it('transposes a slash chord packed beside another', () => {
    expect(formatToken('1/7 4', C, false)).toBe('C/B  F')
  })

  it('still transposes a plain slash chord', () => {
    expect(formatToken('1/7', C, false)).toBe('C/B')
  })

  it('leaves everything alone in Nashville mode', () => {
    expect(formatToken('1>1/7', -1, false)).toBe('1 → 1/7')
    expect(formatToken('1/7', -1, false)).toBe('1/7')
  })

  it('keeps working through a trailing progression dot', () => {
    expect(formatToken('1/7.', C, false)).toBe('C/B')
  })
})

describe('convertChordLine', () => {
  it('transposes the bass of every slash chord on the line', () => {
    expect(convertChordLine('1   1/7  4', C, false)).toBe('C   C/B  F')
  })
})

describe('chords packed with spaces and arrows together', () => {
  it('transposes every chord on both sides of an arrow', () => {
    // Straight off the Interlude in the screenshot: this rendered as
    // "F 5 1 → C/B → Am", with only the first chord of the group transposed
    // and the rest printed as the numbers they were typed as.
    expect(formatToken('4 5 1>1/7>6', C, false)).toBe('F  G  C → C/B → Am')
    expect(formatToken('6>5>4 1', C, false)).toBe('Am → G → F  C')
  })

  it('still handles a group with no arrow in it', () => {
    expect(formatToken('4 5 1', C, false)).toBe('F  G  C')
  })

  it('still handles an arrow with no group in it', () => {
    expect(formatToken('4>5', C, false)).toBe('F → G')
  })

  it('copes with spaces around the arrow itself', () => {
    expect(formatToken('4 > 5', C, false)).toBe('F → G')
  })

  it('leaves Nashville mode reading as it was typed', () => {
    expect(formatToken('4 5 1>1/7>6', -1, false)).toBe('4 5 1 → 1/7 → 6')
  })
})
