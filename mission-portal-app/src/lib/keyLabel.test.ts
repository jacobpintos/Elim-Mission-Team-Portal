import { describe, expect, it } from 'vitest'
import { NNS_KEYS, keyLabel } from './nashvilleNumbers'

describe('keyLabel', () => {
  it('names the keys on the black notes both ways, flat first', () => {
    expect(NNS_KEYS.map((k) => keyLabel(k))).toEqual([
      'C',
      'Db / C#',
      'D',
      'Eb / D#',
      'E',
      'F',
      'Gb / F#',
      'G',
      'Ab / G#',
      'A',
      'Bb / A#',
      'B',
    ])
  })

  it('makes each name minor', () => {
    expect(keyLabel('F#', true)).toBe('Gbm / F#m')
    expect(keyLabel('A', true)).toBe('Am')
  })

  it('leaves a key it does not know as it is', () => {
    expect(keyLabel('G#')).toBe('G#')
  })
})
