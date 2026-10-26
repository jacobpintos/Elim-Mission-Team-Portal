import { describe, it, expect } from 'vitest'
import { resolveSocialIcon } from './socialIcon'

describe('resolveSocialIcon', () => {
  it('never echoes the label', () => {
    // The bug this exists to prevent: the icon field was printed beside the
    // label, so "Tithely" in both produced a button reading it twice.
    expect(resolveSocialIcon('Tithely', 'Tithely')).toEqual({ kind: 'initial', text: 'T' })
    expect(resolveSocialIcon('PayPal', 'PayPal')).toEqual({ kind: 'initial', text: 'P' })
  })

  it('falls back to the label when the icon field is blank', () => {
    expect(resolveSocialIcon('', 'Tithe.ly')).toEqual({ kind: 'initial', text: 'T' })
    expect(resolveSocialIcon(undefined, 'instagram')).toEqual({ kind: 'initial', text: 'I' })
  })

  it('draws Venmo and Cash App with their own logos', () => {
    // By where the link goes, whatever it is called…
    expect(resolveSocialIcon('', 'Give', 'https://venmo.com/u/ElimMissionTeam')).toEqual({
      kind: 'brand',
      brand: 'venmo',
    })
    expect(resolveSocialIcon('', 'Give', 'account.venmo.com/u/elim').kind).toBe('brand')
    expect(resolveSocialIcon('', 'Give', 'https://cash.app/$ElimMission')).toEqual({
      kind: 'brand',
      brand: 'cashapp',
    })
    expect(resolveSocialIcon('', 'Give', 'cash.me/$elim')).toEqual({
      kind: 'brand',
      brand: 'cashapp',
    })
    // …or by its name, when the link says nothing.
    expect(resolveSocialIcon('Venmo', 'Venmo')).toEqual({ kind: 'brand', brand: 'venmo' })
    expect(resolveSocialIcon('', 'Cash App')).toEqual({ kind: 'brand', brand: 'cashapp' })
    expect(resolveSocialIcon('', 'Give with CashApp', '')).toEqual({
      kind: 'brand',
      brand: 'cashapp',
    })
  })

  it('goes by the link before the name', () => {
    expect(resolveSocialIcon('', 'Venmo', 'https://cash.app/$elim')).toEqual({
      kind: 'brand',
      brand: 'cashapp',
    })
  })

  it('is not fooled by a lookalike site', () => {
    expect(resolveSocialIcon('', 'Give', 'https://notvenmo.com/x').kind).toBe('initial')
    expect(resolveSocialIcon('', 'Give', 'https://tithe.ly/give?c=1').kind).toBe('initial')
  })

  it('keeps a logo or emoji the admin chose over the platform’s own', () => {
    expect(resolveSocialIcon('https://cdn.test/v.png', 'Venmo', 'https://venmo.com/u/x')).toEqual({
      kind: 'image',
      uri: 'https://cdn.test/v.png',
    })
    expect(resolveSocialIcon('💜', 'Venmo', 'https://venmo.com/u/x').kind).toBe('glyph')
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
    expect(resolveSocialIcon('Venmo', 'Venmo').kind).not.toBe('image')
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
