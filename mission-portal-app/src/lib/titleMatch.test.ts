import { describe, expect, it } from 'vitest'
import { findByTitle, titleWords } from './titleMatch'

const sheets = [
  { id: 1, title: 'Goodness of God' },
  { id: 2, title: 'Build My Life' },
  { id: 3, title: 'What A Beautiful Name' },
  { id: 4, title: 'Holy Forever' },
  { id: 5, title: 'Holy' },
  { id: 6, title: "Jesus, I've Got To Have You" },
]

describe('titleWords', () => {
  it('drops case, punctuation and release tags', () => {
    expect(titleWords('Goodness of God (Live)')).toBe('goodness of god')
    expect(titleWords('Build My Life - Radio Version')).toBe('build my life')
    expect(titleWords('Firm Foundation (He Won’t) [feat. Chandler Moore]')).toBe('firm foundation')
    expect(titleWords('Jesus, I’ve Got To Have You')).toBe('jesus ive got to have you')
    expect(titleWords('Rock & Roll')).toBe('rock and roll')
  })
})

describe('findByTitle', () => {
  it('finds a sheet under the title a recording was released as', () => {
    expect(findByTitle(sheets, 'Goodness Of God (Live)')?.id).toBe(1)
    expect(findByTitle(sheets, 'Build My Life - Radio Version')?.id).toBe(2)
    expect(findByTitle(sheets, 'What a Beautiful Name')?.id).toBe(3)
    expect(findByTitle(sheets, "Jesus I've Got to Have You")?.id).toBe(6)
  })

  it('prefers the exact title over one that holds it', () => {
    expect(findByTitle(sheets, 'Holy')?.id).toBe(5)
    expect(findByTitle(sheets, 'Holy Forever (feat. Someone)')?.id).toBe(4)
  })

  it('finds a sheet whose title holds the recording’s, if only one does', () => {
    expect(findByTitle([{ id: 1, title: 'Goodness of God (Bethel)' }], 'Goodness of God')?.id).toBe(
      1
    )
  })

  it('gives up rather than guess between two', () => {
    expect(findByTitle([{ title: 'Holy Spirit' }, { title: 'Holy Holy Holy' }], 'Holy')).toBeNull()
  })

  it('finds nothing for a song the library does not have', () => {
    expect(findByTitle(sheets, 'Oceans (Where Feet May Fail)')).toBeNull()
    expect(findByTitle(sheets, '')).toBeNull()
  })
})
