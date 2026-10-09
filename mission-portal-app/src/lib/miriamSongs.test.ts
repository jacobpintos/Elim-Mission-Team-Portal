import { describe, expect, it } from 'vitest'
import { songAsked } from './miriamSongs'

const sheets = [
  { id: 's1', title: 'Above All' },
  { id: 's2', title: 'All Hail King Jesus' },
  { id: 's3', title: 'Goodness of God' },
]
const none = new Map<string, string>()

describe('a chord sheet asked of Miriam', () => {
  it('opens the song asked for, in the key asked for — typed or said', () => {
    expect(songAsked(sheets, none, 'Open Above All in Eb')).toEqual({
      kind: 'open',
      sheet: sheets[0],
      key: { key: 'Eb', minor: false },
    })
    expect(songAsked(sheets, none, 'pull up above all in the key of e flat')).toMatchObject({
      kind: 'open',
      sheet: sheets[0],
      key: { key: 'Eb', minor: false },
    })
    expect(songAsked(sheets, none, 'open goodness of god')).toMatchObject({
      kind: 'open',
      sheet: sheets[2],
      key: null,
    })
  })

  it('opens a song by words it has been heard as before', () => {
    const learned = new Map([['ab of all', 's1']])
    expect(songAsked(sheets, learned, 'open ab of all in D')).toMatchObject({
      kind: 'open',
      sheet: sheets[0],
      key: { key: 'D', minor: false },
    })
  })

  it('offers the nearest titles when asked to open a song it cannot place', () => {
    const asked = songAsked(sheets, none, 'open the king jesus song in C')
    expect(asked).toMatchObject({ kind: 'guess', key: { key: 'C', minor: false } })
    expect(asked?.kind === 'guess' && asked.sheets.map((s) => s.title)).toContain(
      'All Hail King Jesus'
    )
  })

  it('leaves questions to the server, and does nothing without chord sheets', () => {
    expect(songAsked(sheets, none, 'what is the dress code for revival')).toBeNull()
    expect(songAsked(sheets, none, 'open the event above all night')).toBeNull()
    expect(songAsked([], none, 'Open Above All in Eb')).toBeNull()
  })
})
