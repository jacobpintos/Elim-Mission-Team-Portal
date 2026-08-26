import { describe, it, expect } from 'vitest'
import { resolveSocialIcon } from './socialIcon'

describe('resolveSocialIcon', () => {
  it('never echoes the label', () => {
    // The bug this exists to prevent: the icon field was printed beside the
    // label, so "Tithely" in both produced a button reading it twice.
    expect(resolveSocialIcon('Tithely', 'Tithely')).toEqual({ kind: 'initial', text: 'T' })
    expect(resolveSocialIcon('Venmo', 'Venmo')).toEqual({ kind: 'initial', text: 'V' })
  })

  it('falls back to the label when the icon field is blank', () => {
    // "Cash App" was added with no icon at all, and still needs a mark.
    expect(resolveSocialIcon('', 'Cash App')).toEqual({ kind: 'initial', text: 'C' })
    expect(resolveSocialIcon(undefined, 'instagram')).toEqual({ kind: 'initial', text: 'I' })
  })

  it('takes a pasted logo as an image', () => {
    expect(resolveSocialIcon('https://cdn.test/venmo.png', 'Venmo')).toEqual({
      kind: 'image',
      uri: 'https://cdn.test/venmo.png',
    })
    expect(resolveSocialIcon('//cdn.test/logo.svg', 'Venmo').kind).toBe('image')
    expect(resolveSocialIcon('data:image/png;base64,AAA', 'Venmo').kind).toBe('image')
  })

  it('does not mistake a word for an address', () => {
    // The app's link handling assumes https:// when none is given, which
    // here would turn a name into a broken image.
    expect(resolveSocialIcon('Venmo', 'Venmo').kind).toBe('initial')
    expect(resolveSocialIcon('facebook.com', 'Facebook').kind).toBe('initial')
  })

  it('keeps an emoji as typed', () => {
    expect(resolveSocialIcon('💜', 'Venmo')).toEqual({ kind: 'glyph', text: '💜' })
    expect(resolveSocialIcon('❤️', 'Give')).toEqual({ kind: 'glyph', text: '❤️' })
  })

  it('has something to show for a link with nothing filled in', () => {
    expect(resolveSocialIcon('', '')).toEqual({ kind: 'initial', text: '?' })
  })
})
