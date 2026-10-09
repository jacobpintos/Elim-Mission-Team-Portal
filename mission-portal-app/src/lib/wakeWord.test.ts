import { describe, expect, it } from 'vitest'
import { withoutHerName } from './wakeWord'

describe('withoutHerName', () => {
  it('takes her name off the start of a request', () => {
    expect(withoutHerName('Miriam, create an event on 9/25')).toBe('create an event on 9/25')
    expect(withoutHerName('hey Mariam create an event')).toBe('create an event')
    expect(withoutHerName('Hey, Merriam! add an event')).toBe('add an event')
  })

  it('leaves a request without it as it is', () => {
    expect(withoutHerName('create an event called Revival')).toBe('create an event called Revival')
    expect(withoutHerName('Amy is leading worship')).toBe('Amy is leading worship')
    expect(withoutHerName('Am I free on Friday')).toBe('Am I free on Friday')
  })

  it('takes it from the start only', () => {
    expect(withoutHerName('assign Miriam to the event')).toBe('assign Miriam to the event')
  })
})
