import { describe, expect, it } from 'vitest'
import { joinDictation } from './dictation'

describe('joinDictation', () => {
  it('fills an empty field, starting with a capital', () => {
    expect(joinDictation('', 'the speaker by the door is out', false)).toBe(
      'The speaker by the door is out'
    )
  })

  it('carries on after what is there, with one space', () => {
    expect(joinDictation('Capo 2', 'count in four', false)).toBe('Capo 2 count in four')
    expect(joinDictation('Capo 2 ', 'count in four', false)).toBe('Capo 2 count in four')
  })

  it('starts a new sentence with a capital', () => {
    expect(joinDictation('Door was open.', 'nobody saw who', false)).toBe(
      'Door was open. Nobody saw who'
    )
  })

  it('turns "new line" and "new paragraph" into breaks where lines are allowed', () => {
    expect(joinDictation('', 'amazing grace new line how sweet the sound', true)).toBe(
      'Amazing grace\nhow sweet the sound'
    )
    expect(joinDictation('Verse one', 'new paragraph chorus', true)).toBe('Verse one\n\nchorus')
  })

  it('leaves them as words in a one-line field', () => {
    expect(joinDictation('', 'new line', false)).toBe('New line')
  })

  it('changes nothing for nothing heard', () => {
    expect(joinDictation('Kept', '   ', true)).toBe('Kept')
  })
})
