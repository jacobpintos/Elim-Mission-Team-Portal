import { describe, expect, it } from 'vitest'
import { NOT_MEANT_TAP, notMeantSaid } from './miriamNotMeant'

/** "That's not what I meant", after one of Miriam's own answers (lib/miriamNotMeant). */

describe('saying her answer wasn’t what was meant', () => {
  it.each([
    "That's not what I meant",
    'that’s not what I meant.',
    'No, that is not what I asked',
    'not what I was asking for',
    'Sorry, that’s not what I was looking for!',
    'wrong',
    "that's the wrong event",
    'Nope, wrong one',
    'that’s not right',
    'incorrect',
    'you misunderstood me',
    'You misheard',
    'you got it wrong',
    "I didn't mean that",
    NOT_MEANT_TAP,
  ])('plainly: %s', (said) => {
    expect(notMeantSaid(said)).toBe('bare')
  })

  it.each([
    'No, I meant the dress code',
    "that's not what I meant, I meant when it starts",
    'Wrong — I was asking about the time',
    'actually I wanted the address',
    'nope, I was asking for the weather',
  ])('with what was meant: %s', (said) => {
    expect(notMeantSaid(said)).toBe('restated')
  })

  it.each([
    'no',
    'nope',
    'no thanks',
    'not now',
    'not yet',
    'never mind',
    'No Longer Slaves',
    "what's wrong with the sound",
    'is that right?',
    "that's right",
    'not what I meant to ask but when is youth night',
    'I meant to ask about Sunday',
    'when is youth night',
  ])('not at all: %s', (said) => {
    expect(notMeantSaid(said)).toBeNull()
  })
})
