import { describe, it, expect } from 'vitest'
import { parseEmphasis, hasEmphasis } from './textEmphasis'

describe('parseEmphasis', () => {
  it('leaves plain text as one run', () => {
    expect(parseEmphasis('Bringing a Generation to the Rest')).toEqual([
      { text: 'Bringing a Generation to the Rest' },
    ])
  })

  it('marks a single word without touching its neighbours', () => {
    expect(parseEmphasis('the *Rest* found')).toEqual([
      { text: 'the ' },
      { text: 'Rest', bold: true },
      { text: ' found' },
    ])
  })

  it('reads each of the four marks', () => {
    expect(parseEmphasis('*a*')).toEqual([{ text: 'a', bold: true }])
    expect(parseEmphasis('_b_')).toEqual([{ text: 'b', underline: true }])
    expect(parseEmphasis('^c^')).toEqual([{ text: 'c', caps: true }])
    expect(parseEmphasis('~d~')).toEqual([{ text: 'd', accent: true }])
  })

  it('picks one word out in the accent colour', () => {
    expect(parseEmphasis('Found in ~*JESUS*~')).toEqual([
      { text: 'Found in ' },
      { text: 'JESUS', bold: true, accent: true },
    ])
  })

  it('nests marks in any order', () => {
    expect(parseEmphasis('*^Rest^*')).toEqual([{ text: 'Rest', bold: true, caps: true }])
    expect(parseEmphasis('^*Rest*^')).toEqual([{ text: 'Rest', bold: true, caps: true }])
    expect(parseEmphasis('*_^x^_*')).toEqual([
      { text: 'x', bold: true, underline: true, caps: true },
    ])
  })

  it('handles marks that overlap rather than nest', () => {
    // `*a_b*c_` — bold opens, underline opens inside it, bold closes first.
    expect(parseEmphasis('*a_b*c_')).toEqual([
      { text: 'a', bold: true },
      { text: 'b', bold: true, underline: true },
      { text: 'c', underline: true },
    ])
  })

  it('carries an unclosed mark to the end of the line, visibly', () => {
    // Left running on purpose: a run of bold text is how the editor notices
    // the missing mark. Swallowing it would look like the mark did nothing.
    expect(parseEmphasis('a *b c')).toEqual([{ text: 'a ' }, { text: 'b c', bold: true }])
  })

  it('prints a mark that was escaped', () => {
    expect(parseEmphasis('2 \\* 3')).toEqual([{ text: '2 * 3' }])
    expect(parseEmphasis('\\_not underlined\\_')).toEqual([{ text: '_not underlined_' }])
  })

  it('keeps a backslash that is not shielding a mark', () => {
    expect(parseEmphasis('a \\ b')).toEqual([{ text: 'a \\ b' }])
  })

  it('drops nothing when a mark is empty', () => {
    expect(parseEmphasis('a **b')).toEqual([{ text: 'a ' }, { text: 'b' }])
  })

  it('has nothing to say about an empty string', () => {
    expect(parseEmphasis('')).toEqual([])
  })

  it('keeps line breaks inside a run', () => {
    expect(parseEmphasis('one\ntwo')).toEqual([{ text: 'one\ntwo' }])
  })
})

describe('hasEmphasis', () => {
  it('is false for ordinary prose', () => {
    expect(hasEmphasis('Bringing a Generation to the Rest Found in Jesus')).toBe(false)
  })

  it('is true when a mark is present', () => {
    expect(hasEmphasis('the *Rest*')).toBe(true)
  })

  it('is false when every mark is escaped', () => {
    expect(hasEmphasis('2 \\* 3')).toBe(false)
  })
})
