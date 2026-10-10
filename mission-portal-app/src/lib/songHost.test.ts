import { describe, expect, it } from 'vitest'
import { registerSongHost, songHost, songQueue } from './songHost'
import { parseSheetCommand } from './sheetCommands'
import { songAsked } from './miriamSongs'
import { withoutHerName } from './wakeWord'

const sheets = [
  { id: 's1', title: 'Above All' },
  { id: 's2', title: 'Way Maker' },
]

describe('where a song asked for opens', () => {
  it('is the song screen in front, while one is up', () => {
    expect(songHost()).toBeNull()
    const opened: string[] = []
    const offPage = registerSongHost(() => opened.push('page'))
    const offSheet = registerSongHost(() => opened.push('sheet'))
    songHost()?.(sheets[0] as never, null)
    offSheet()
    songHost()?.(sheets[0] as never, null)
    offPage()
    expect(opened).toEqual(['sheet', 'page'])
    expect(songHost()).toBeNull()
  })

  it('queues only where a song is open to come after', () => {
    const queued: string[] = []
    const offPage = registerSongHost(() => {})
    expect(songQueue()).toBeNull()
    const offSheet = registerSongHost(
      () => {},
      (s) => queued.push(s.title)
    )
    songQueue()?.(sheets[1] as never, null)
    offSheet()
    expect(songQueue()).toBeNull()
    offPage()
    expect(queued).toEqual(['Way Maker'])
  })
})

describe('asking for a song to come next', () => {
  it('is queuing, however "queue" was written down, and before or after the name', () => {
    for (const said of [
      'queue Above All',
      'cue Above All',
      'Q Above All',
      'que Above All',
      'kew Above All',
      'queue up Above All',
      'up next Above All',
      'Above All next',
      'Hey Miriam queue Above All',
    ]) {
      expect(parseSheetCommand(withoutHerName(said), sheets), said).toMatchObject({
        type: 'queue',
        request: { sheet: sheets[0] },
      })
    }
  })

  it('never opens a song when the asking word is lost or unknown', () => {
    // A word before the title that is neither "open" nor "queue": not a song now.
    expect(parseSheetCommand('cute Above All', sheets)).toBeNull()
    expect(songAsked(sheets, new Map(), 'cute Above All', true)?.kind).not.toBe('open')
  })
})

describe('asking for another song with a sheet open', () => {
  it('opens one now: "open Above All in E", "switch to Way Maker"', () => {
    expect(parseSheetCommand('open Above All in E', sheets)).toMatchObject({
      type: 'open',
      request: { sheet: sheets[0], key: 'E' },
    })
    expect(parseSheetCommand('switch to way maker', sheets)).toMatchObject({
      type: 'open',
      request: { sheet: sheets[1] },
    })
    // Queuing is still queuing.
    expect(parseSheetCommand('queue Above All', sheets)).toMatchObject({ type: 'queue' })
  })

  it('hears a song asked of Miriam, her name aside', () => {
    expect(withoutHerName('Hey Miriam Above All key of E')).toBe('Above All key of E')
    expect(withoutHerName('hey miriam')).toBe('')
  })

  it('in song mode, takes any words as a song, and offers the nearest', () => {
    expect(songAsked(sheets, new Map(), 'Above All key of E', true)).toMatchObject({
      kind: 'open',
      key: { key: 'E', minor: false },
    })
    expect(songAsked(sheets, new Map(), 'way maker remix version', true)).toMatchObject({
      kind: 'guess',
    })
    // Elsewhere, the same words are left for her to answer.
    expect(songAsked(sheets, new Map(), 'way maker remix version')).toBeNull()
  })
})

describe('titles that begin with an asking word', () => {
  const songs = [
    { id: 'o1', title: 'Open The Eyes Of My Heart' },
    { id: 'o2', title: 'Open Heaven' },
    { id: 'o3', title: 'Way Maker' },
  ]
  it('opens "Open the Eyes of My Heart" from a sheet, said with or without "open"', () => {
    for (const said of ['open the eyes of my heart', 'open open the eyes of my heart in D']) {
      expect(parseSheetCommand(said, songs)).toMatchObject({
        type: 'open',
        request: { sheet: songs[0] },
      })
    }
    expect(parseSheetCommand('switch to open heaven in G', songs)).toMatchObject({
      type: 'open',
      request: { sheet: songs[1], key: 'G' },
    })
  })

  it('opens them when asked of Miriam, too', () => {
    for (const [said, title] of [
      ['open the eyes of my heart', 'Open The Eyes Of My Heart'],
      ['switch to open heaven in G', 'Open Heaven'],
      ['open heaven', 'Open Heaven'],
    ]) {
      const asked = songAsked(songs, new Map(), said)
      expect(asked?.kind === 'open' && asked.sheet.title).toBe(title)
    }
  })
})
