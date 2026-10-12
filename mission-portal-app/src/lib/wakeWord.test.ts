import { describe, expect, it } from 'vitest'
import { namesHer, stopListeningAsked, withoutHerName } from './wakeWord'

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

describe('"Hey Miriam, stop listening"', () => {
  it('hears it, and how it is misheard', () => {
    for (const said of [
      'stop listening',
      'Stop listening.',
      'stop lessening',
      'top listening',
      'stop glistening',
      'stop listen',
      'please stop listening for now',
      'turn off hey miriam',
      'turn Hey Mariam off',
      'switch off the wake word',
      'stop listening for hey miriam',
      'disable hey miriam',
    ]) {
      expect(stopListeningAsked(withoutHerName(`Hey Miriam, ${said}`)), said).toBe(true)
    }
  })
  it('leaves everything else alone', () => {
    for (const said of [
      'stop',
      'stop the music',
      'listening to Above All',
      'when do I stop listening to the sermon',
      'turn off autoscroll',
    ]) {
      expect(stopListeningAsked(said), said).toBe(false)
    }
  })
  it('knows when her name was said', () => {
    expect(namesHer('Hey Miriam stop listening')).toBe(true)
    expect(namesHer('Hey Mariam, stop listening')).toBe(true)
    expect(namesHer('stop listening')).toBe(false)
  })
})
