import { describe, expect, it } from 'vitest'
import { NOT_MEANT_TAP, notMeantSaid } from './miriamNotMeant'
import { meantInstead } from '../../functions/src/miriam/notMeant'

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
    "that wasn't what I asked",
    'that is not right',
    'not that one',
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
    'no I mean when does it start',
    "that wasn't what I asked — I was asking about parking",
    'Not that one, I meant the Sunday one',
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
    'actually I wanted to set a reminder at 5',
    'no I wanted to ask about Sunday service',
    'no, I meant to say thanks',
    'when is youth night',
  ])('not at all: %s', (said) => {
    expect(notMeantSaid(said)).toBeNull()
  })
})

describe('what they said they did mean', () => {
  it('is what follows “I meant”, for the server to search by', () => {
    expect(meantInstead('No, I meant the one on Ingersoll')).toBe('the one on Ingersoll')
    expect(meantInstead("that's wrong — I was asking about the time")).toBe('the time')
    expect(meantInstead(NOT_MEANT_TAP)).toBe('')
  })
})
