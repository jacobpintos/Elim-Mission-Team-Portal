import { describe, it, expect } from 'vitest'
import {
  chordToNashville,
  keyFromName,
  guessKey,
  sectionHeading,
  chordLine,
  placeChords,
  parseChart,
  parseChordText,
  parseChordPro,
  toSheetSections,
  allChords,
  rowsMatchSlots,
  detectFormat,
} from './chordImport'
import { nashvilleToChord, getWordSlots } from './nashvilleNumbers'

describe('chordToNashville', () => {
  it('writes chords as numbers in the key', () => {
    expect(chordToNashville('G', 7)).toBe('1')
    expect(chordToNashville('C', 7)).toBe('4')
    expect(chordToNashville('D', 7)).toBe('5')
    expect(chordToNashville('Em', 7)).toBe('6m')
    expect(chordToNashville('Am7', 7)).toBe('2m7')
  })
  it('keeps slash chords, with the bass as a plain degree', () => {
    expect(chordToNashville('G/B', 7)).toBe('1/3')
    expect(chordToNashville('D/F#', 7)).toBe('5/7')
    expect(chordToNashville('C/E', 0)).toBe('1/3')
  })
  it('writes chords outside the key with flats and sharps', () => {
    expect(chordToNashville('Bb', 0)).toBe('b7')
    expect(chordToNashville('F#m7b5', 0)).toBe('#4m7b5')
  })
  it('marks a major 2, 3 or 6 so it is not read as the usual minor', () => {
    expect(chordToNashville('E', 0)).toBe('3M')
    expect(chordToNashville('A', 0)).toBe('6M')
    expect(chordToNashville('D', 0)).toBe('2M')
    expect(chordToNashville('Ab', 0)).toBe('b6M')
    expect(chordToNashville('Eb', 0)).toBe('b3M')
  })
  it('reads the usual chart spellings of a quality', () => {
    expect(chordToNashville('CM7', 0)).toBe('1maj7')
    expect(chordToNashville('Cmaj7', 0)).toBe('1maj7')
    expect(chordToNashville('Dmin', 0)).toBe('2m')
    expect(chordToNashville('B°', 0)).toBe('7dim')
    expect(chordToNashville('Gsus4', 7)).toBe('1sus4')
    expect(chordToNashville('G2', 7)).toBe('12')
    expect(chordToNashville('(G)', 7)).toBe('1')
  })
  it('is null for something that is not a chord', () => {
    expect(chordToNashville('N.C.', 0)).toBeNull()
    expect(chordToNashville('Hello', 0)).toBeNull()
  })

  it('comes back as the same chord through the viewer, in every key', () => {
    // Converting a chord to a number and the number back must land on the
    // same chord — the same root, quality and bass, however it is spelled.
    const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
    const sem = (n: string) => (SEMI[n[0]] + (n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0) + 12) % 12
    const read = (c: string) => {
      const m = c.replace(/[()]/g, '').match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/)!
      return { root: sem(m[1]), quality: m[2], bass: m[3] ? sem(m[3]) : null }
    }
    const chords = [
      'C',
      'Dm',
      'Em7',
      'F',
      'G7',
      'Am',
      'Bdim',
      'Eb',
      'Ab',
      'Bb',
      'E',
      'A',
      'D',
      'C/E',
      'F/A',
      'Gsus4',
      'Fmaj7',
      'Dm7/C',
      'F#m7b5',
    ]
    for (let key = 0; key < 12; key++) {
      for (const chord of chords) {
        const back = nashvilleToChord(chordToNashville(chord, key)!, key)
        expect(read(back), `${chord} in key ${key} came back as ${back}`).toEqual(read(chord))
      }
    }
  })
})

describe('keyFromName', () => {
  it('reads major keys as their root', () => {
    expect(keyFromName('G')).toEqual({ keyIdx: 7, minor: false })
    expect(keyFromName('Bb')).toEqual({ keyIdx: 10, minor: false })
    expect(keyFromName('C#')).toEqual({ keyIdx: 1, minor: false })
    expect(keyFromName('G major')).toEqual({ keyIdx: 7, minor: false })
  })
  it('numbers a minor key from its relative major', () => {
    expect(keyFromName('Em')).toEqual({ keyIdx: 7, minor: true })
    expect(keyFromName('F#m')).toEqual({ keyIdx: 9, minor: true })
    expect(keyFromName('A minor')).toEqual({ keyIdx: 0, minor: true })
  })
  it('is null for something that is not a key', () => {
    expect(keyFromName('H')).toBeNull()
    expect(keyFromName('')).toBeNull()
  })
})

describe('guessKey', () => {
  it('finds the key from the chords', () => {
    expect(guessKey(['G', 'D', 'Em', 'C'])).toBe(7)
    expect(guessKey(['C', 'G', 'Am', 'F'])).toBe(0)
    expect(guessKey(['D', 'A', 'Bm', 'G', 'D'])).toBe(2)
    expect(guessKey(['E', 'B', 'C#m', 'A'])).toBe(4)
  })
  it('a song that opens on the relative minor is still in the major key', () => {
    expect(guessKey(['Em', 'C', 'G', 'D', 'G'])).toBe(7)
  })
})

describe('sectionHeading', () => {
  it.each([
    ['Verse 1', 'verse'],
    ['[Chorus]', 'chorus'],
    ['Bridge:', 'bridge'],
    ['Chorus 2 (x2)', 'chorus'],
    ['PRE-CHORUS', 'pre-chorus'],
    ['Pre Chorus 2', 'pre-chorus'],
    ['Instrumental', 'interlude'],
    ['Ending', 'outro'],
    ['Tag', 'tag'],
    ['Intro', 'intro'],
  ])('%s is a %s heading', (line, type) => {
    expect(sectionHeading(line)?.type).toBe(type)
  })
  it('is not fooled by a lyric that starts with a heading word', () => {
    expect(sectionHeading('Bridge over troubled water')).toBeNull()
    expect(sectionHeading('Verses of the song')).toBeNull()
  })
})

describe('chordLine', () => {
  it('reads a line of chords with their columns', () => {
    expect(chordLine('G    D/F#   Em7')).toEqual([
      { at: 0, chord: 'G' },
      { at: 5, chord: 'D/F#' },
      { at: 12, chord: 'Em7' },
    ])
  })
  it('allows bars and repeat marks around the chords', () => {
    expect(chordLine('| G / / / | D / / / | x2')?.map((c) => c.chord)).toEqual(['G', 'D'])
  })
  it('is null for a line of words', () => {
    expect(chordLine('A mighty fortress is our God')).toBeNull()
    expect(chordLine('Am I the only one')).toBeNull()
  })
})

describe('placeChords', () => {
  const c = (at: number, token: string) => ({ at, token })
  it('puts a chord on the word it is over', () => {
    const r = placeChords('Amazing grace how sweet', [c(0, '1'), c(8, '4')])
    expect(r.lyrics).toBe('Amazing grace how sweet')
    expect(r.row).toEqual(['1', '4', '', ''])
  })
  it('splits a word at a chord on a later syllable', () => {
    //                    0         1         2
    //                    012345678901234567890123
    const lyric = 'I want to be governed by'
    const r = placeChords(lyric, [c(lyric.indexOf('erned'), '6m')])
    expect(r.lyrics).toBe('I want to be gov-erned by')
    expect(getWordSlots(r.lyrics).map((s) => s.text)).toEqual([
      'I',
      'want',
      'to',
      'be',
      'gov',
      'erned',
      'by',
    ])
    expect(r.row).toEqual(['', '', '', '', '', '6m', ''])
  })
  it('does not split a word for a chord one letter off its start', () => {
    const r = placeChords('Amazing grace', [c(1, '1')])
    expect(r.lyrics).toBe('Amazing grace')
    expect(r.row).toEqual(['1', ''])
  })
  it('gives a chord past the last word a "_" of its own', () => {
    const r = placeChords('circumstances', [c(15, '4')])
    expect(r.lyrics).toBe('circumstances _')
    expect(r.row).toEqual(['', '4'])
  })
  it('puts a chord in the gap on the word after', () => {
    const r = placeChords('led by   feelings', [c(7, '5')])
    expect(r.row).toEqual(['', '', '5'])
  })
  it('packs two chords over one word', () => {
    const r = placeChords('Lord', [c(0, '1'), c(2, '4')])
    expect(r.lyrics).toBe('Lord')
    expect(r.row).toEqual(['1 4'])
  })
  it('a chord over a line of no words is a placeholder', () => {
    expect(placeChords('', [c(0, '1')])).toEqual({ lyrics: '_', row: ['1'] })
  })
})

const VERSE_1 = "I don't want to be governed by circumstances"
const VERSE_2 = 'Or led by feelings'
/** A chord line with each chord at an exact column. */
const over = (...chords: [number, string][]) =>
  chords.reduce((line, [at, chord]) => line.padEnd(at) + chord, '')

const SONGSELECT_TEXT = [
  'Take Control',
  'Elim',
  '',
  'Key - A',
  'Tempo - 72',
  '',
  'Verse 1',
  over([VERSE_1.indexOf('erned'), 'F#m'], [VERSE_1.length + 1, 'D']),
  VERSE_1,
  over([VERSE_2.indexOf('led'), 'A'], [VERSE_2.length + 2, 'E']),
  VERSE_2,
  '',
  'Chorus',
  over([0, 'D'], ['Take '.length, 'A']),
  'Take control',
  over([0, 'E'], ['Have Your '.length, 'F#m']),
  'Have Your way',
  '',
  'Instrumental',
  '| A / / / | E / / / |',
  '| F#m / / / | D / / / |',
  '',
  'CCLI Song # 1234567',
  '© 2023 Elim Sound',
  'For use solely with the SongSelect® Terms of Use. All rights reserved. www.ccli.com',
  'CCLI License # 12345',
].join('\n')

describe('parseChordText', () => {
  const song = parseChordText(SONGSELECT_TEXT)
  it('reads the title, artist, key and tempo', () => {
    expect(song.title).toBe('Take Control')
    expect(song.artist).toBe('Elim')
    expect(song.key).toBe('A')
    expect(song.bpm).toBe(72)
  })
  it('reads the sections and drops the licence footer', () => {
    expect(song.sections.map((s) => s.type)).toEqual(['verse', 'chorus', 'interlude'])
    expect(JSON.stringify(song)).not.toMatch(/CCLI|SongSelect|©/)
  })
  it('pairs each chord line with the words under it', () => {
    expect(song.sections[0].lines[0].lyrics).toBe("I don't want to be governed by circumstances")
    expect(song.sections[0].lines[0].chords.map((c) => c.chord)).toEqual(['F#m', 'D'])
  })
  it('a lyric sheet with no chords is still read', () => {
    const s = parseChordText('Amazing grace how sweet the sound\nThat saved a wretch like me')
    expect(s.sections).toHaveLength(1)
    expect(s.sections[0].lines.map((l) => l.lyrics)).toEqual([
      'Amazing grace how sweet the sound',
      'That saved a wretch like me',
    ])
  })
})

const CHORDPRO = `{title: Take Control}
{artist: Elim}
{key: A}
{tempo: 72}
# a comment
{comment: Verse 1}
I don't want to be gov[F#m]erned by circum[D]stances
Or [A]led by feelings[E]

{soc}
[D]Take control, [A]take control
{eoc}

{c: Interlude}
[A] / / / | [E] / / / | [N.C.]
`

describe('parseChordPro', () => {
  const song = parseChordPro(CHORDPRO)
  it('reads the directives', () => {
    expect(song).toMatchObject({
      format: 'chordpro',
      title: 'Take Control',
      artist: 'Elim',
      key: 'A',
      bpm: 72,
    })
  })
  it('reads sections from comments and chorus markers', () => {
    expect(song.sections.map((s) => s.type)).toEqual(['verse', 'chorus', 'interlude'])
  })
  it('lifts the chords out of the words, at the right place', () => {
    const line = song.sections[0].lines[0]
    expect(line.lyrics).toBe("I don't want to be governed by circumstances")
    expect(line.chords).toEqual([
      { at: line.lyrics.indexOf('erned'), chord: 'F#m' },
      { at: line.lyrics.indexOf('stances'), chord: 'D' },
    ])
  })
  it('notes what was bracketed but was not a chord', () => {
    expect(song.skipped).toEqual(['N.C.'])
  })
})

describe('detectFormat', () => {
  it('tells the two apart', () => {
    expect(detectFormat(CHORDPRO)).toBe('chordpro')
    expect(detectFormat(SONGSELECT_TEXT)).toBe('text')
    expect(detectFormat('Am[G]azing grace')).toBe('chordpro')
  })
})

describe('toSheetSections', () => {
  it('turns a chart into sections the builder can open, in the key', () => {
    const song = parseChart(SONGSELECT_TEXT)
    const { sections, chordCount, unreadable } = toSheetSections(
      song,
      keyFromName(song.key!)!.keyIdx
    )
    expect(unreadable).toEqual([])
    expect(chordCount).toBe(12)
    expect(sections.every(rowsMatchSlots)).toBe(true)
    const [verse, chorus, inst] = sections
    // F#m was written over "erned": the word is split there, so it stays on
    // that syllable. D sat past the last word, so it has a "_" of its own.
    expect(verse.lyrics.split('\n')[0]).toBe("I don't want to be gov-erned by circumstances _")
    expect(verse.chordTokens[0]).toEqual(['', '', '', '', '', '', '6m', '', '', '4'])
    expect(verse.lyrics.split('\n')[1]).toBe('Or led by feelings _')
    expect(verse.chordTokens[1]).toEqual(['', '1', '', '', '5'])
    expect(chorus.chordTokens[0]).toEqual(['4', '1'])
    // No words: an instrumental, one row, a "||" between the chart's lines.
    expect(inst.lyrics).toBe('')
    expect(inst.chordTokens).toEqual([['1', '5', '||', '6m', '4']])
  })
  it('gives the same chords from the ChordPro version of the same chart', () => {
    const fromPro = toSheetSections(parseChart(CHORDPRO), 9).sections
    expect(fromPro[0].lyrics.split('\n')[0]).toBe("I don't want to be gov-erned by circum-stances")
    expect(fromPro[0].chordTokens[0]).toEqual(['', '', '', '', '', '', '6m', '', '', '4'])
    expect(fromPro.every(rowsMatchSlots)).toBe(true)
  })
  it('keeps a line of chords inside a verse as placeholders, in place', () => {
    const song = parseChordText('Verse\nG       C\nAmazing grace\nD     G\n\nG\nhow sweet')
    const verse = toSheetSections(song, 7).sections[0]
    expect(verse.lyrics.split('\n')).toEqual(['Amazing grace', '_ _', 'how sweet'])
    expect(verse.chordTokens).toEqual([
      ['1', '4'],
      ['5', '1'],
      ['1', ''],
    ])
    expect(rowsMatchSlots(verse)).toBe(true)
  })
  it('lists every chord for guessing the key', () => {
    expect(allChords(parseChart(SONGSELECT_TEXT)).slice(0, 4)).toEqual(['F#m', 'D', 'A', 'E'])
    expect(guessKey(allChords(parseChart(SONGSELECT_TEXT)))).toBe(9)
  })
})
