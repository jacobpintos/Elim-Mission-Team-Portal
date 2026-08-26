import { describe, it, expect } from 'vitest'
import { resolveSocialIcon } from './socialIcon'

describe('resolveSocialIcon', () => {
  it('never echoes a platform name that has no icon', () => {
    // The bug this exists to prevent: the icon field was printed beside the
    // label, so "Tithely" in both produced a button reading it twice.
    expect(resolveSocialIcon('Sometime Unknown Co', 'Sometime Unknown Co')).toEqual({
      kind: 'initial',
      text: 'S',
    })
  })

  it('recognises platforms however they are written', () => {
    expect(resolveSocialIcon('Tithe.ly', 'Tithely')).toEqual({ kind: 'named', name: 'HandCoins' })
    expect(resolveSocialIcon('Venmo', 'Venmo')).toEqual({ kind: 'named', name: 'DollarSign' })
    expect(resolveSocialIcon('  FACEBOOK ', 'Facebook')).toEqual({
      kind: 'named',
      name: 'Facebook',
    })
  })

  it('falls back to the label when the icon field is blank', () => {
    // "Cash App" was added with no icon at all, and still deserves one.
    expect(resolveSocialIcon('', 'Cash App')).toEqual({ kind: 'named', name: 'DollarSign' })
    expect(resolveSocialIcon(undefined, 'Instagram')).toEqual({
      kind: 'named',
      name: 'Instagram',
    })
  })

  it('takes a pasted logo as an image', () => {
    expect(resolveSocialIcon('https://cdn.test/venmo.png', 'Venmo')).toEqual({
      kind: 'image',
      uri: 'https://cdn.test/venmo.png',
    })
    expect(resolveSocialIcon('//cdn.test/logo.svg', 'Venmo').kind).toBe('image')
  })

  it('does not mistake a word for an address', () => {
    // The app's link handling assumes https:// when none is given, which
    // here would turn a name into a broken image.
    expect(resolveSocialIcon('Venmo', 'Venmo').kind).toBe('named')
    expect(resolveSocialIcon('Some Co', 'Some Co').kind).toBe('initial')
  })

  it('keeps an emoji as typed', () => {
    expect(resolveSocialIcon('💜', 'Venmo')).toEqual({ kind: 'glyph', text: '💜' })
  })

  it('has something to show for a link with nothing filled in', () => {
    expect(resolveSocialIcon('', '')).toEqual({ kind: 'initial', text: '?' })
  })
})
