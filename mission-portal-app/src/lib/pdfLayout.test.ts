import { describe, it, expect } from 'vitest'
import { pagesToChartText, type PdfRun, type Measure } from './pdfLayout'
import { parseChart, toSheetSections, keyFromName, rowsMatchSlots } from './chordImport'

/** A proportional font: i, l, t narrow; m, w wide — as in any real chart. */
const W: Record<string, number> = {
  i: 0.25,
  l: 0.25,
  t: 0.3,
  "'": 0.2,
  ' ': 0.28,
  m: 0.85,
  w: 0.75,
  M: 0.85,
  W: 0.95,
}
const measure: Measure = (s) => [...s].reduce((n, ch) => n + (W[ch] ?? 0.55), 0)
const SIZE = 12

/** A run of text as a PDF would have it. */
const run = (str: string, x: number, y: number): PdfRun => ({
  str,
  x,
  y,
  width: measure(str) * SIZE,
  height: SIZE,
})
/** The x where a character of a lyric run starts. */
const xOf = (lyric: string, at: number, x0: number) => x0 + measure(lyric.slice(0, at)) * SIZE

const read = (runs: PdfRun[], width = 612) => {
  const text = pagesToChartText([{ width, runs }], measure)
  const song = parseChart(text)
  return { text, song, ...toSheetSections(song, keyFromName(song.key ?? 'G')!.keyIdx) }
}

const VERSE = "I don't want to be governed by circumstances"
const X = 72

describe('pagesToChartText', () => {
  it('reads a one-column chart, chords set by position on their syllables', () => {
    const r = read([
      run('Take Control', X, 740),
      run('Elim', X, 724),
      run('Key - A | Tempo - 72 | Time - 4/4', X, 708),
      run('Verse 1', X, 680),
      run('F#m', xOf(VERSE, VERSE.indexOf('erned'), X), 664),
      run('D', X + measure(VERSE) * SIZE + 8, 664),
      run(VERSE, X, 650),
      run('CCLI Song # 1234567', X, 60),
    ])
    expect(r.song.title).toBe('Take Control')
    expect(r.song.key).toBe('A')
    expect(r.song.bpm).toBe(72)
    expect(r.sections.map((s) => s.type)).toEqual(['verse'])
    expect(r.sections[0].lyrics).toBe("I don't want to be gov-erned by circumstances _")
    expect(r.sections[0].chordTokens[0]).toEqual(['', '', '', '', '', '', '6m', '', '', '4'])
  })

  it('places by position, not by counting letters, under a proportional font', () => {
    // Narrow letters early in the line: counted as characters, "Am" over
    // "will" would land several letters early, on "illiterate".
    const lyric = 'illiterate little will'
    const r = read([
      run('G', X, 680),
      run('Am', xOf(lyric, lyric.indexOf('will'), X), 680),
      run(lyric, X, 666),
    ])
    const words = r.sections[0].lyrics.split(' ')
    const row = r.sections[0].chordTokens[0]
    expect(words[row.findIndex((t) => t === '2m')]).toBe('will')
  })

  it('reads a two-column page left column first, then the right', () => {
    const L = 72
    const R = 330
    const chorus = 'Take control have Your way'
    const r = read([
      run('Take Control', L, 760),
      run('Key - A', L, 744),
      run('Verse 1', L, 720),
      run('F#m', xOf(VERSE, VERSE.indexOf('erned'), L) * 0.5 + L * 0.5, 704),
      run('I want to be governed', L, 690),
      run('Verse 2', L, 660),
      run('Or led by feelings', L, 630),
      run('Bridge', L, 600),
      run('Here in Your presence', L, 570),
      run('Chorus', R, 720),
      run('D', R, 704),
      run('A', xOf(chorus, chorus.indexOf('control'), R), 704),
      run(chorus, R, 690),
      run('Chorus 2', R, 660),
      run('Take control again', R, 630),
      run('Tag', R, 600),
      run('Have Your way Lord', R, 570),
    ])
    expect(r.sections.map((s) => s.type)).toEqual([
      'verse',
      'verse',
      'bridge',
      'chorus',
      'chorus',
      'tag',
    ])
    const chorusSection = r.sections[3]
    expect(chorusSection.lyrics.split('\n')[0]).toBe(chorus)
    expect(chorusSection.chordTokens[0].slice(0, 2)).toEqual(['4', '1'])
    expect(r.sections.every(rowsMatchSlots)).toBe(true)
  })

  it('does not take chords right of the middle of a one-column chart for a second column', () => {
    const long = 'Here in Your presence we are made new again Lord'
    const runs: PdfRun[] = []
    let y = 720
    runs.push(run('Verse 1', X, y))
    for (let i = 0; i < 6; i++) {
      y -= 16
      runs.push(run('G', X, y))
      runs.push(run('D', xOf(long, long.indexOf('new'), X), y))
      runs.push(run('Em', xOf(long, long.indexOf('Lord'), X), y))
      y -= 14
      runs.push(run(long, X, y))
    }
    const r = read(runs)
    expect(r.sections).toHaveLength(1)
    expect(r.sections[0].lyrics.split('\n')).toHaveLength(6)
    const row = r.sections[0].chordTokens[0]
    const words = r.sections[0].lyrics.split('\n')[0].split(' ')
    expect(words[row.indexOf('5')]).toBe('new')
    expect(words[row.indexOf('6m')]).toBe('Lord')
  })

  it('keeps two chords a syllable apart on their own syllables, even where the runs touch', () => {
    const lyric = 'Revive me'
    const gX = xOf(lyric, 2, X)
    // A bold "Am" a little wider than its width says, so it runs into the "G".
    const am = { ...run('Am', X, 680), width: gX - X + 1.5 }
    const r = read([
      run('Verse 1', X, 700),
      am,
      run('G', gX, 680),
      run('D', xOf(lyric, lyric.indexOf('me'), X), 680),
      run(lyric, X, 666),
    ])
    expect(r.sections[0].lyrics).toBe('Re-vive me')
    expect(r.sections[0].chordTokens[0]).toEqual(['2m', '1', '5'])
  })

  it('a line of chords on its own is an instrumental, not lyrics', () => {
    const r = read([
      run('Song', X, 740),
      run('Intro', X, 720),
      run('G', X, 704),
      run('D', X + 40, 704),
      run('Em', X + 80, 704),
      run('Verse 1', X, 680),
      run('G', X, 664),
      run('Amazing grace', X, 650),
    ])
    expect(r.song.title).toBe('Song')
    expect(r.sections.map((s) => s.type)).toEqual(['intro', 'verse'])
    expect(r.sections[0].lyrics).toBe('')
    expect(r.sections[0].chordTokens[0]).toEqual(['1', '5', '6m'])
    expect(r.sections[1].chordTokens[0][0]).toBe('1')
  })

  it('a lyric sheet with no chords still comes through', () => {
    const r = read([
      run('Verse 1', X, 700),
      run('Amazing grace how sweet', X, 684),
      run('That saved a wretch', X, 668),
    ])
    expect(r.sections[0].lyrics).toBe('Amazing grace how sweet\nThat saved a wretch')
  })
})
