import { describe, expect, it } from 'vitest'
import { songAsked, songThen } from './miriamSongs'
import { onceOpen, takeOnceOpen } from './sheetAfterOpen'

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

describe('a song asked for with what to do once it is open', () => {
  const sheets = [
    { id: 'r', title: 'Revive Me' },
    { id: 'a', title: 'Above All' },
    { id: 's', title: 'Show Me Your Glory' },
  ]

  it('is the song, then the commands for its sheet', () => {
    expect(songThen('Open revive me in C. Start autoscroll 5.', sheets)).toEqual({
      song: 'Open revive me in C',
      then: [{ type: 'scroll', action: 'start', level: 5 }],
    })
    expect(songThen('open above all and start scrolling at four', sheets)).toEqual({
      song: 'open above all',
      then: [{ type: 'scroll', action: 'start', level: 4 }],
    })
    expect(songThen('open Above All in E, chords only and start autoscroll', sheets)?.then).toEqual(
      [
        { type: 'chordsOnly', on: true },
        { type: 'scroll', action: 'start' },
      ]
    )
    // And the song itself, found as it would be alone.
    const asked = songAsked(
      sheets,
      new Map(),
      songThen('Open revive me in C. Start autoscroll 5.', sheets)!.song
    )
    expect(asked).toEqual({ kind: 'open', sheet: sheets[0], key: { key: 'C', minor: false } })
  })

  it('is nothing more than a song when nothing after it is a command', () => {
    expect(songThen('open Show Me Your Glory in D', sheets)).toBeNull()
    expect(songThen('open revive me in C', sheets)).toBeNull()
    expect(songThen('open above all and start a fire', sheets)).toBeNull()
  })
})

describe('what is done to a sheet once it opens', () => {
  it('is done to that song’s sheet, once, and soon', () => {
    const scroll = { type: 'scroll', action: 'start', level: 5 } as const
    onceOpen('r', [scroll], 1000)
    expect(takeOnceOpen('a', 1100)).toEqual([])
    expect(takeOnceOpen('r', 1200)).toEqual([scroll])
    expect(takeOnceOpen('r', 1300)).toEqual([])
    onceOpen('r', [scroll], 1000)
    expect(takeOnceOpen('r', 60_000)).toEqual([])
  })
})
