import { describe, expect, it } from 'vitest'
import { registerSongHost, songHost } from './songHost'
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
