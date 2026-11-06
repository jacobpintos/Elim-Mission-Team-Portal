import { describe, expect, it } from 'vitest'
import { isSoundEngineer, soundEngineersOf, toggledSoundEngineer } from './soundEngineer'

describe('the Sound Engineer job', () => {
  it('is read as uids, each once, whatever was stored', () => {
    expect(soundEngineersOf(undefined)).toEqual([])
    expect(soundEngineersOf('a')).toEqual([])
    expect(soundEngineersOf(['a', 'b', 'a', '', 3, null])).toEqual(['a', 'b'])
  })

  it('is held by several people at once', () => {
    const holders = toggledSoundEngineer(toggledSoundEngineer([], 'mitch'), 'sarah')
    expect(holders).toEqual(['mitch', 'sarah'])
    expect(isSoundEngineer('mitch', holders)).toBe(true)
    expect(isSoundEngineer('sarah', holders)).toBe(true)
  })

  it('is taken back from one without the others', () => {
    expect(toggledSoundEngineer(['mitch', 'sarah'], 'mitch')).toEqual(['sarah'])
  })

  it('is nobody’s when nobody is signed in', () => {
    expect(isSoundEngineer(undefined, ['mitch'])).toBe(false)
    expect(isSoundEngineer('', [''])).toBe(false)
  })
})
