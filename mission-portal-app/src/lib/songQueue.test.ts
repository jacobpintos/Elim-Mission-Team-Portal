import { describe, expect, it } from 'vitest'
import { makeSongQueue } from '../features/worship/useSongQueue'
import { parseSheetCommand } from './sheetCommands'
import { asksAQuestion } from './miriamSongs'

const song = (id: string, key: string | null = null) => ({
  sheet: { id, title: id } as never,
  key,
  minor: false,
})
const ids = (songs: { sheet: { id: string | number } }[]) => songs.map((s) => s.sheet.id)

describe('songs queued to come next', () => {
  it('keeps every song queued, in order, rather than the last one only', () => {
    const q = makeSongQueue(() => {})
    q.add(song('b'))
    q.add(song('c', 'D'))
    q.add(song('d'))
    expect(ids(q.upcoming)).toEqual(['b', 'c', 'd'])
    // The same song asked for twice in a row is queued once.
    q.add(song('d'))
    expect(ids(q.upcoming)).toEqual(['b', 'c', 'd'])
  })

  it('goes on through them, and back again to each song left, in the key it was in', () => {
    const q = makeSongQueue(() => {})
    q.add(song('b'))
    q.add(song('c'))
    expect(q.canGoBack).toBe(false)
    expect(q.advance(song('a', 'E'))?.sheet.id).toBe('b')
    expect(q.advance(song('b'))?.sheet.id).toBe('c')
    expect(q.upcoming).toEqual([])
    // Back: to b, with c put first in line again, then to a in E.
    expect(q.back(song('c'))?.sheet.id).toBe('b')
    expect(ids(q.upcoming)).toEqual(['c'])
    expect(q.back(song('b'))).toEqual(song('a', 'E'))
    expect(ids(q.upcoming)).toEqual(['b', 'c'])
    expect(q.canGoBack).toBe(false)
    expect(q.back(song('a'))).toBeNull()
  })

  it('remembers a song opened over, for "back"', () => {
    const q = makeSongQueue(() => {})
    q.leave(song('waymaker'))
    expect(q.back(song('aboveall'))?.sheet.id).toBe('waymaker')
  })

  it('takes off the next one, clears, and forgets everything when the sheet closes', () => {
    const q = makeSongQueue(() => {})
    q.add(song('b'))
    q.add(song('c'))
    q.dropNext()
    expect(ids(q.upcoming)).toEqual(['c'])
    q.advance(song('a'))
    q.clear()
    expect(q.upcoming).toEqual([])
    expect(q.canGoBack).toBe(true)
    q.reset()
    expect(q.canGoBack).toBe(false)
  })

  it('tells its holder each time it changes, and only then', () => {
    let renders = 0
    const q = makeSongQueue(() => renders++)
    q.add(song('b'))
    q.dropNext()
    q.dropNext()
    q.clear()
    expect(renders).toBe(2)
  })
})

describe('"queue" as it is misheard', () => {
  const library = [
    { id: 'a', title: 'Above All' },
    { id: 'r', title: '10,000 Reasons (Ten Thousand Reasons)' },
  ]
  it('takes "kill" and "cute" for it, before a title said plainly', () => {
    expect(parseSheetCommand('kill Above All', library)).toMatchObject({ type: 'queue' })
    expect(parseSheetCommand('cute above all in D', library)).toMatchObject({
      type: 'queue',
      request: { key: 'D' },
    })
    expect(parseSheetCommand('kill 1000 reasons', library)).toBeNull()
    expect(parseSheetCommand('kill the lights', library)).toBeNull()
  })
})

describe('songs asked for as they are said', () => {
  const library = [
    { id: 'f', title: 'Show Me Your Face / Alpha and Omega' },
    { id: 'j', title: 'I Have Decided to Follow Jesus' },
    { id: 'a', title: 'Above All' },
  ]
  it('opens a medley by either of its songs, or both', () => {
    for (const said of [
      'open show me your face',
      'open alpha and omega',
      'open show me your face alpha and omega',
    ]) {
      expect(parseSheetCommand(said, library), said).toMatchObject({
        type: 'open',
        request: { sheet: library[0] },
      })
    }
  })

  it('takes "opened", "opening", "oh pen" for "open", before a title said plainly', () => {
    for (const said of ['opened Above All', 'opening above all', 'oh pen above all']) {
      expect(parseSheetCommand(said, library), said).toMatchObject({ type: 'open' })
    }
    expect(parseSheetCommand('hope in the Lord', library)).toBeNull()
  })

  it('takes a sung line with "back" in it for nothing', () => {
    expect(parseSheetCommand('no turning back', library)).toBeNull()
  })
})

describe('a question, never taken for a song', () => {
  it('answers questions and things that are plainly not songs', () => {
    for (const said of [
      'What am I wearing today',
      'what’s the dress code for Revival',
      'When is Sunday service?',
      'show me the dress code',
      'who is in my car',
      'is it going to rain',
    ]) {
      expect(asksAQuestion(said), said).toBe(true)
    }
  })
  it('still takes songs asked for, even in a question’s words', () => {
    for (const said of [
      'Above All in E',
      'can you open Above All',
      'queue Way Maker',
      'Way Maker',
      'play 10,000 Reasons',
    ]) {
      expect(asksAQuestion(said), said).toBe(false)
    }
  })
})

describe('"you" and "knew", as "queue" is heard', () => {
  const library = [
    { id: 'a', title: 'Above All' },
    { id: 'w', title: 'Way Maker' },
    { id: 'k', title: 'You Are My King' },
  ]
  it('queue a song said plainly after them, as the first word', () => {
    expect(parseSheetCommand('you Above All', library)).toMatchObject({
      type: 'queue',
      request: { sheet: library[0] },
    })
    expect(parseSheetCommand('Knew Way Maker in D', library)).toMatchObject({
      type: 'queue',
      request: { sheet: library[1], key: 'D' },
    })
  })
  it('are nothing anywhere else, or when they begin a title', () => {
    expect(parseSheetCommand('thank you above all', library)).toBeNull()
    expect(parseSheetCommand('I knew Way Maker', library)).toBeNull()
    expect(parseSheetCommand('you are my king', library)?.type).not.toBe('queue')
    expect(parseSheetCommand('you are so good', library)).toBeNull()
  })
})

describe('"autoscroll" as it is misheard', () => {
  it('starts, speeds and stops autoscroll all the same', () => {
    expect(parseSheetCommand('auto troll', [])).toEqual({ type: 'scroll', action: 'start' })
    expect(parseSheetCommand('start auto troll on five', [])).toEqual({
      type: 'scroll',
      action: 'start',
      level: 5,
    })
    expect(parseSheetCommand('Otto scroll', [])).toEqual({ type: 'scroll', action: 'start' })
    expect(parseSheetCommand('stop auto troll', [])).toEqual({ type: 'scroll', action: 'pause' })
    expect(parseSheetCommand('the auto troll was here', [])).toBeNull()
  })
})
