import { describe, expect, it } from 'vitest'
import { scriptureForSpeech as spoken } from './scriptureSpoken'

describe('Bible references, said aloud', () => {
  it('as the church’s page writes them', () => {
    expect(
      spoken(
        'the physical and spiritual needs of our fellow humans (Psalm 139:13; Isaiah 49:1; Jer. 1:5, Matt 22:37-39; Romans 12:20-21; Gal. 6:10).'
      )
    ).toBe(
      'the physical and spiritual needs of our fellow humans (Psalm 139, verse 13; Isaiah 49, verse 1; Jeremiah 1, verse 5, Matthew 22, verses 37 to 39; Romans 12, verses 20 to 21; Galatians 6, verse 10).'
    )
  })

  it('numbered books, however they are numbered', () => {
    expect(spoken('1 Cor. 13:4-7')).toBe('First Corinthians 13, verses 4 to 7')
    expect(spoken('2 Tim 3:16')).toBe('Second Timothy 3, verse 16')
    expect(spoken('II Kgs. 2:11')).toBe('Second Kings 2, verse 11')
    expect(spoken('1 John 4:8')).toBe('First John 4, verse 8')
    expect(spoken('3 Jn 1:4')).toBe('Third John 1, verse 4')
    expect(spoken('read 1 Corinthians 13')).toBe('read First Corinthians 13')
  })

  it('the gospel, the psalms, and a passage over two chapters', () => {
    expect(spoken('John 3:16')).toBe('John 3, verse 16')
    expect(spoken('Ps. 23')).toBe('Psalm 23')
    expect(spoken('Pss 119:105')).toBe('Psalm 119, verse 105')
    expect(spoken('Song of Sol. 2:4')).toBe('Song of Solomon 2, verse 4')
    expect(spoken('Rev. 21:4a')).toBe('Revelation 21, verse 4')
    expect(spoken('Jer. 1:5-2:3')).toBe('Jeremiah 1, verse 5, to chapter 2, verse 3')
    expect(spoken('(vv. 5-7)')).toBe('(verses 5 to 7)')
    expect(spoken('see v. 9')).toBe('see verse 9')
  })

  it('leaves everything else as it was', () => {
    for (const text of [
      'Doors open at 5:30 pm.',
      'Call time is 5:00.',
      'Mark 5 tasks as done',
      'Dan 3 seats left',
      'Gen. 5 was there',
      'Mar. 5 is the date',
      'Cor 13:4',
      'Is 5:30 okay?',
      'Isaiah',
    ]) {
      expect(spoken(text), text).toBe(text)
    }
  })
})
