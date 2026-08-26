import { describe, it, expect } from 'vitest'
import {
  normalizePhone,
  isValidPhone,
  formatPhone,
  signupLine,
  signupDigestMessage,
} from './textingList'

describe('normalizePhone', () => {
  it('accepts a plain ten-digit number', () => {
    expect(normalizePhone('3195551234')).toBe('+13195551234')
  })

  it('accepts however a person actually types it', () => {
    for (const written of [
      '(319) 555-1234',
      '319-555-1234',
      '319.555.1234',
      '319 555 1234',
      '  3195551234  ',
      '+1 319 555 1234',
      '1-319-555-1234',
    ]) {
      expect(normalizePhone(written)).toBe('+13195551234')
    }
  })

  it('rejects a number with the wrong number of digits', () => {
    // A mistyped number means the coordinator texts a stranger, so this
    // guesses at nothing.
    expect(normalizePhone('319555123')).toBeNull()
    expect(normalizePhone('31955512345')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })

  it('rejects an area code or exchange that cannot exist', () => {
    // No North American area code or exchange begins with 0 or 1.
    expect(normalizePhone('0195551234')).toBeNull()
    expect(normalizePhone('1195551234')).toBeNull()
    expect(normalizePhone('3190551234')).toBeNull()
    expect(normalizePhone('3191551234')).toBeNull()
  })

  it('rejects an eleven-digit number that is not a US one', () => {
    expect(normalizePhone('443195551234')).toBeNull()
    expect(normalizePhone('23195551234')).toBeNull()
  })

  it('rejects text that merely contains digits', () => {
    expect(normalizePhone('call me maybe')).toBeNull()
    expect(normalizePhone('ext 1234')).toBeNull()
  })

  it('agrees with isValidPhone', () => {
    expect(isValidPhone('(319) 555-1234')).toBe(true)
    expect(isValidPhone('nope')).toBe(false)
  })
})

describe('formatPhone', () => {
  it('writes a stored number the way a person reads it', () => {
    expect(formatPhone('+13195551234')).toBe('(319) 555-1234')
  })

  it('passes through anything not in that shape', () => {
    // A number stored before this module existed should still be legible.
    expect(formatPhone('319-555-1234')).toBe('319-555-1234')
    expect(formatPhone('')).toBe('')
  })
})

describe('the coordinator’s message', () => {
  it('names one person and their number', () => {
    expect(signupLine('Mitch Moylan', '+13195551234')).toBe('Mitch Moylan — (319) 555-1234')
  })

  it('does not leave a blank where a name belongs', () => {
    expect(signupLine('   ', '+13195551234')).toBe('Someone — (319) 555-1234')
  })

  it('counts one person singularly', () => {
    const msg = signupDigestMessage([{ displayName: 'Mitch Moylan', phone: '+13195551234' }])
    expect(msg).toContain('1 person wants')
    expect(msg).toContain('Mitch Moylan — (319) 555-1234')
  })

  it('lists everyone, so it can be acted on without opening the app', () => {
    const msg = signupDigestMessage([
      { displayName: 'Mitch Moylan', phone: '+13195551234' },
      { displayName: 'Sunny Singh', phone: '+13195559876' },
    ])
    expect(msg).toContain('2 people want')
    expect(msg).toContain('Mitch Moylan — (319) 555-1234')
    expect(msg).toContain('Sunny Singh — (319) 555-9876')
  })
})
