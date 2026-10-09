import { describe, expect, it } from 'vitest'
import { findWake } from './wakeWord'

describe('findWake', () => {
  it('hears her name after a greeting, and what follows', () => {
    expect(findWake('Hey Miriam')).toEqual({ after: '' })
    expect(findWake('hey Miriam, create an event on 9/25')).toEqual({
      after: 'create an event on 9/25',
    })
    expect(findWake('Okay. Hey, Miriam! What’s next')).toEqual({ after: 'What’s next' })
  })

  it('takes the ways a recogniser spells it', () => {
    for (const heard of ['hey Mariam', 'hey Merriam', 'Hey Myriam', 'hi miriam', 'a Miriam']) {
      expect(findWake(`${heard} add an event`)).toEqual({ after: 'add an event' })
    }
  })

  it('ignores her name used in passing, and names that only sound close', () => {
    for (const heard of [
      'Miriam is leading worship on Sunday',
      'hey Mary Ann can you turn the monitor up',
      'hey there how are you',
      'the ministry team meets on Friday',
      'hey Miriamne',
    ]) {
      expect(findWake(heard)).toBeNull()
    }
  })

  it('starts from the last time it was said', () => {
    expect(findWake('hey Miriam create — no wait — hey Miriam add an event')).toEqual({
      after: 'add an event',
    })
  })
})
