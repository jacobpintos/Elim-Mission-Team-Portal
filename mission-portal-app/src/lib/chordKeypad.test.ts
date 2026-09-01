import { describe, it, expect } from 'vitest'
import {
  appendChordKey,
  backspaceChordToken,
  pinExtension,
  MAX_TOKEN_LENGTH,
  MAX_PINNED,
} from './chordKeypad'

describe('appendChordKey', () => {
  it('builds the ordinary tokens', () => {
    expect(appendChordKey('', '1')).toBe('1')
    expect(appendChordKey('b', '7')).toBe('b7')
    expect(appendChordKey('5', 'm')).toBe('5m')
    expect(appendChordKey('4', 'maj7')).toBe('4maj7')
  })

  it('builds slash and passing chords', () => {
    expect(appendChordKey(appendChordKey('4', '/'), '1')).toBe('4/1')
    expect(appendChordKey(appendChordKey('4', '>'), '1')).toBe('4>1')
  })

  it('allows a second digit, which is a dominant 7 and not a typo', () => {
    // "17" is the 1 chord as a dominant 7 — a real token, so it stays legal.
    expect(appendChordKey('1', '7')).toBe('17')
  })

  it('keeps the progression dot last and single', () => {
    expect(appendChordKey('1', '.')).toBe('1.')
    expect(appendChordKey('1.', '.')).toBe('1.')
    // Nothing belongs after the mark for the end of a progression.
    expect(appendChordKey('1.', '5')).toBe('1.')
    expect(appendChordKey('1.', 'm')).toBe('1.')
  })

  it('will not start a token with a dot', () => {
    expect(appendChordKey('', '.')).toBe('')
  })

  it('stops at a length no chord reaches', () => {
    const long = '1'.repeat(MAX_TOKEN_LENGTH)
    expect(appendChordKey(long, '5')).toBe(long)
    // A multi-character key that would overrun is refused whole.
    expect(appendChordKey('1'.repeat(MAX_TOKEN_LENGTH - 2), 'maj7')).toBe(
      '1'.repeat(MAX_TOKEN_LENGTH - 2)
    )
  })
})

describe('backspaceChordToken', () => {
  it('takes back a whole quality rather than a letter of one', () => {
    // "4maj" is not a chord anyone meant to pass through.
    expect(backspaceChordToken('4maj7')).toBe('4')
    expect(backspaceChordToken('2sus4')).toBe('2')
    expect(backspaceChordToken('5add9')).toBe('5')
  })

  it('takes back single characters otherwise', () => {
    expect(backspaceChordToken('b7')).toBe('b')
    expect(backspaceChordToken('5m')).toBe('5')
    expect(backspaceChordToken('1.')).toBe('1')
    expect(backspaceChordToken('1')).toBe('')
  })

  it('leaves a token that is only a quality alone until it is the last thing', () => {
    // "7" is both a degree and an extension; removing it must empty the box
    // rather than match itself as a unit and do nothing.
    expect(backspaceChordToken('7')).toBe('')
  })

  it('does nothing to an empty box', () => {
    expect(backspaceChordToken('')).toBe('')
  })
})

describe('pinExtension', () => {
  it('puts the most recent first', () => {
    expect(pinExtension([], 'sus4')).toEqual(['sus4'])
    expect(pinExtension(['sus4'], 'add9')).toEqual(['add9', 'sus4'])
  })

  it('moves a repeat to the front rather than duplicating it', () => {
    expect(pinExtension(['add9', 'sus4'], 'sus4')).toEqual(['sus4', 'add9'])
  })

  it('keeps the row short enough to stay tappable', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].reduce((acc, k) => pinExtension(acc, k), [] as string[])
    expect(many).toHaveLength(MAX_PINNED)
    expect(many[0]).toBe('e')
  })
})
