import { describe, expect, it } from 'vitest'
import type { ChordSheetSection } from '@/types/chordSheet'
import {
  MAX_EM,
  MAX_ROWS,
  ROW_EM,
  deckFromLyrics,
  deckFromSheet,
  deckText,
  pastedSections,
  rowsOf,
  sheetForSlides,
  slidesAsked,
  slidesAsking,
  slidesOf,
  sungLine,
  width,
  type LyricDeck,
} from './lyricSlides'

const section = (
  id: string,
  type: ChordSheetSection['type'],
  lyrics: string,
  sameAsPrevious?: boolean
): ChordSheetSection => ({ id, type, lyrics, chordTokens: [], sameAsPrevious })

const lyricSlides = (deck: LyricDeck) =>
  deck.slides.flatMap((s) => (s.kind === 'lyrics' ? [s.lines] : []))

describe('asking Miriam for lyric slides', () => {
  it('takes a song by name, however the asking is put', () => {
    for (const said of [
      'make slides for Waymaker',
      'Create slides for Waymaker',
      'Can you make lyric slides for Waymaker please?',
      'Miriam, create a PowerPoint for Waymaker',
      'make google slides for Waymaker',
      'I need slides for Waymaker',
      'slides for Waymaker',
      'put Waymaker on slides',
      'make slides for the song Waymaker',
      'put Waymaker on slides for Sunday',
      'turn Waymaker into slides please',
      'make slides for Waymaker for me',
    ]) {
      expect(slidesAsked(said), said).toEqual({ kind: 'song', name: 'Waymaker' })
    }
  })

  it('takes the lyrics pasted under the asking, their lines kept', () => {
    const ask = slidesAsked(
      'Make slides for this song\nAmazing grace! How sweet the sound\nThat saved a wretch like me!'
    )
    expect(ask).toEqual({
      kind: 'lyrics',
      title: '',
      lyrics: 'Amazing grace! How sweet the sound\nThat saved a wretch like me!',
    })
  })

  it('keeps the title, when the song is named above its lyrics', () => {
    expect(
      slidesAsked(
        'create slides for Amazing Grace:\nAmazing grace! How sweet the sound\nThat saved a wretch like me!'
      )
    ).toMatchObject({ kind: 'lyrics', title: 'Amazing Grace' })
    expect(
      slidesAsked(
        'make slides for this song called “Amazing Grace”\nAmazing grace! How sweet the sound\nThat saved a wretch like me!'
      )
    ).toMatchObject({ kind: 'lyrics', title: 'Amazing Grace' })
  })

  it('takes lyrics on the same line, after a colon, and the asking after the lyrics', () => {
    expect(
      slidesAsked(
        'make slides for this song: Amazing grace how sweet the sound / that saved a wretch like me'
      )
    ).toMatchObject({ kind: 'lyrics', title: '' })
    expect(
      slidesAsked(
        'Amazing grace! How sweet the sound\nThat saved a wretch like me!\n\nmake slides for this song'
      )
    ).toMatchObject({
      kind: 'lyrics',
      lyrics: 'Amazing grace! How sweet the sound\nThat saved a wretch like me!',
    })
  })

  it('takes "into slides" with a please or a Sunday after it', () => {
    const lyrics = 'Amazing grace! How sweet the sound\nThat saved a wretch like me!'
    for (const said of [
      'Can you turn these lyrics into slides please?',
      'Put these lyrics on slides for me',
      'Please turn this song into slides for Sunday',
    ]) {
      expect(slidesAsked(`${said}\n${lyrics}`), said).toEqual({ kind: 'lyrics', title: '', lyrics })
    }
  })

  it('takes Sunday, or who they’re for, as no song’s name', () => {
    const lyrics = 'Amazing grace! How sweet the sound\nThat saved a wretch like me!'
    expect(slidesAsked(`Can you make lyric slides for Sunday?\n${lyrics}`)).toEqual({
      kind: 'lyrics',
      title: '',
      lyrics,
    })
    expect(slidesAsked('make slides for Sunday')).toEqual({ kind: 'which' })
    expect(slidesAsked('make slides for this Sunday’s service')).toEqual({ kind: 'which' })
    expect(slidesAsked('make me slides for me')).toEqual({ kind: 'which' })
  })

  it('is remembered without the lyrics pasted', () => {
    expect(slidesAsking({ kind: 'lyrics', lyrics: 'Amazing grace…', title: '' })).toBe(
      'make slides for this song'
    )
    expect(slidesAsking({ kind: 'lyrics', lyrics: 'Amazing grace…', title: 'Amazing Grace' })).toBe(
      'make slides for Amazing Grace'
    )
    expect(slidesAsking({ kind: 'song', name: 'Waymaker' })).toBe('make slides for Waymaker')
  })

  it('asks which song, when none is named and nothing is pasted', () => {
    expect(slidesAsked('make slides for this song')).toEqual({ kind: 'which' })
    expect(slidesAsked('Can you create a PowerPoint for this song?')).toEqual({ kind: 'which' })
    expect(slidesAsked('make slides')).toEqual({ kind: 'which' })
  })

  it('leaves everything else alone', () => {
    for (const said of [
      'create an event called Slides Night',
      'remind me to make slides for Sunday',
      'open Way Maker',
      'what slides are we using Sunday?',
      'create a task for Bob to make slides for Way Maker',
    ]) {
      expect(slidesAsked(said), said).toBeNull()
    }
  })
})

describe('a chord sheet’s lyrics, as sung', () => {
  it('takes out the "_" a held chord leaves, and makes a split word whole', () => {
    expect(sungLine("I don't want to be gov-erned by circumstances _")).toBe(
      "I don't want to be governed by circumstances"
    )
    expect(sungLine('Way-mak-er, mir-a-cle work-er')).toBe('Waymaker, miracle worker')
    expect(sungLine('_ _')).toBe('')
    expect(sungLine('Lord - You are good _ ,')).toBe('Lord You are good,')
  })

  it('sings a section marked “same as” with the words it repeats, and gives instrumentals none', () => {
    const deck = deckFromSheet({
      title: 'Morning Song',
      artist: 'The Well',
      sections: [
        section('i', 'intro', ''),
        section('v1', 'verse', 'Morn-ing has bro-ken _\nLike the first morn-ing'),
        section('c1', 'chorus', 'Praise for the sing-ing\nPraise for the morn-ing _'),
        section('v2', 'verse', 'Sweet the rain’s new fall\nSun-lit from heav-en'),
        section('c2', 'chorus', '', true),
      ],
    })
    expect(deck.slides[0]).toEqual({ kind: 'title', title: 'MORNING SONG', artist: 'THE WELL' })
    expect(lyricSlides(deck)).toEqual([
      ['MORNING HAS BROKEN', 'LIKE THE FIRST MORNING'],
      ['PRAISE FOR THE SINGING', 'PRAISE FOR THE MORNING'],
      ['SWEET THE RAIN’S NEW FALL', 'SUNLIT FROM HEAVEN'],
      ['PRAISE FOR THE SINGING', 'PRAISE FOR THE MORNING'],
    ])
    expect(deck.slides.map((s) => s.kind === 'lyrics' && s.label)).toEqual([
      false,
      'Verse 1',
      'Chorus 1',
      'Verse 2',
      'Chorus 2',
    ])
  })

  it('starts a new slide at a blank line within a section', () => {
    const deck = deckFromSheet({
      title: '',
      sections: [section('v', 'verse', 'Holy holy\nHoly holy\n\nLord God\nAlmighty')],
    })
    expect(lyricSlides(deck)).toEqual([
      ['HOLY HOLY', 'HOLY HOLY'],
      ['LORD GOD', 'ALMIGHTY'],
    ])
  })
})

describe('lyrics pasted', () => {
  const PASTED = [
    'Amazing Grace',
    'John Newton',
    '',
    'Verse 1',
    'Amazing grace! How sweet the sound',
    'That saved a wretch like me!',
    'I once was lost, but now am found;',
    'Was blind, but now I see.',
    '',
    '[Chorus]',
    'G        C        G',
    'Praise His name forever (x2)',
    'Praise His name',
    '',
    'Verse 2',
    'Through many dangers, toils and snares,',
    'I have already come;',
    '',
    'Repeat Chorus',
    '',
    'CCLI Song # 1234567',
    '© 1779 Public Domain',
  ].join('\n')

  it('reads its title and sections, leaving out chords, repeat marks and the copyright', () => {
    const { title, artist, sections } = pastedSections(PASTED)
    expect(title).toBe('Amazing Grace')
    expect(artist).toBe('John Newton')
    expect(sections.map((s) => s.label)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus'])
    expect(sections[1].lines).toEqual(['Praise His name forever', 'Praise His name'])
    // "Repeat Chorus": the chorus again.
    expect(sections[3].lines).toEqual(sections[1].lines)
  })

  it('takes blank lines as the song’s breaks when it has no headings', () => {
    const { title, sections } = pastedSections(
      'One line here\nTwo lines here\n\nThree lines\nFour lines'
    )
    expect(title).toBe('')
    expect(sections.map((s) => s.lines.length)).toEqual([2, 2])
  })

  it('reads a ChordPro file', () => {
    const { title, sections } = pastedSections(
      '{title: Doxology}\n{soc}\n[G]Praise God from [D]whom all blessings flow\n{eoc}'
    )
    expect(title).toBe('Doxology')
    expect(sections).toEqual([
      { label: 'Chorus', lines: ['Praise God from whom all blessings flow'] },
    ])
  })

  it('doesn’t take the first verse for a title when the title was given', () => {
    const deck = deckFromLyrics('Praise God\nfrom whom\n\nChorus\nAll blessings flow', 'Doxology')
    expect(deck.slides[0]).toMatchObject({ kind: 'title', title: 'DOXOLOGY' })
    expect(lyricSlides(deck)[0]).toEqual(['PRAISE GOD', 'FROM WHOM'])
  })

  it('doesn’t sing the title given, when the paste starts with it', () => {
    const deck = deckFromLyrics('Doxology\nPraise God from whom\nall blessings flow', 'Doxology')
    expect(lyricSlides(deck)).toEqual([['PRAISE GOD FROM WHOM', 'ALL BLESSINGS FLOW']])
  })

  it('breaks lyrics pasted as one line where the song breaks', () => {
    const deck = deckFromLyrics(
      'Amazing grace how sweet the sound / that saved a wretch like me / I once was lost but now am found / was blind but now I see'
    )
    expect(lyricSlides(deck).flat()).toContain('THAT SAVED A WRETCH LIKE ME')
    expect(deck.name).toBe('Amazing grace how sweet the sound')
  })
})

describe('the slides', () => {
  it('are all capitals', () => {
    const text = deckText(
      deckFromLyrics(
        'Praise God from whom all blessings flow\nPraise Him all creatures here below',
        'Doxology'
      )
    )
    expect(text).toBe(text.toUpperCase())
  })

  it('keep a line whole when it fits a row, and break a long one after a comma', () => {
    expect(rowsOf('I ONCE WAS LOST, BUT NOW AM FOUND;')).toEqual([
      'I ONCE WAS LOST, BUT NOW AM FOUND;',
    ])
    expect(rowsOf('LIGHT IN THE DARKNESS, MY GOD, THAT IS WHO WE ARE')).toEqual([
      'LIGHT IN THE DARKNESS,',
      'MY GOD, THAT IS WHO WE ARE',
    ])
  })

  it('don’t end a row on a word that leads into the next', () => {
    expect(rowsOf('EARLY IN THE MORNING OUR SONG SHALL RISE TO THEE')).toEqual([
      'EARLY IN THE MORNING',
      'OUR SONG SHALL RISE TO THEE',
    ])
  })

  it('show long lines two at a time, in their pairs', () => {
    const verse = [
      'AMAZING GRACE! HOW SWEET THE SOUND',
      'THAT SAVED A WRETCH LIKE ME!',
      'I ONCE WAS LOST, BUT NOW AM FOUND;',
      'WAS BLIND, BUT NOW I SEE.',
    ]
    expect(slidesOf(verse).map((s) => s.length)).toEqual([3, 2])
    expect(slidesOf(verse)[1]).toEqual([
      'I ONCE WAS LOST, BUT NOW AM FOUND;',
      'WAS BLIND, BUT NOW I SEE.',
    ])
  })

  it('put four short lines on one slide', () => {
    expect(
      slidesOf([
        'HOLY, HOLY, HOLY!',
        'LORD GOD ALMIGHTY!',
        'ALL THY WORKS',
        'SHALL PRAISE THY NAME',
      ])
    ).toHaveLength(1)
  })

  it('leave no slide with a line the others could have taken', () => {
    const five = [
      'ONE LINE HERE NOW',
      'TWO LINES HERE NOW',
      'THREE LINES HERE NOW',
      'FOUR LINES HERE',
      'FIVE LINES HERE',
    ]
    expect(slidesOf(five).map((s) => s.length)).toEqual([2, 3])
  })

  it('never hold more than a congregation can read at a glance', () => {
    const { sections } = pastedSections(
      Array.from(
        { length: 12 },
        (_, i) => `Line number ${i + 1} of a long, long verse that runs on`
      ).join('\n')
    )
    for (const lines of slidesOf(sections[0].lines.map((l) => l.toUpperCase()))) {
      expect(lines.length).toBeLessThanOrEqual(MAX_ROWS)
      for (const row of lines) expect(width(row)).toBeLessThanOrEqual(ROW_EM)
      expect(lines.reduce((sum, row) => sum + width(row), 0)).toBeLessThanOrEqual(MAX_EM)
    }
  })
})

describe('finding the song named', () => {
  const sheets = [
    { id: 1, title: 'Way Maker' },
    { id: 2, title: 'Goodness of God' },
    { id: 3, title: '10,000 Reasons (Bless the Lord)' },
    { id: 4, title: 'Build My Life' },
  ]
  const none = new Map<string, string>()

  it('finds it run together or apart, with a key or the artist after it', () => {
    for (const name of ['Waymaker', 'way maker', 'Way Maker in G', 'Way Maker by Sinach']) {
      expect(sheetForSlides(sheets, none, name), name).toEqual({ kind: 'one', sheet: sheets[0] })
    }
    expect(sheetForSlides(sheets, none, 'Bless the Lord')).toEqual({
      kind: 'one',
      sheet: sheets[2],
    })
  })

  it('finds it by words learned for it', () => {
    expect(sheetForSlides(sheets, new Map([['wake maker', '1']]), 'wake maker')).toEqual({
      kind: 'one',
      sheet: sheets[0],
    })
  })

  it('offers the nearest when it isn’t plain, and nothing when nothing is near', () => {
    expect(sheetForSlides(sheets, none, 'Goodness God')).toMatchObject({ kind: 'guess' })
    expect(sheetForSlides(sheets, none, 'Amazing Grace')).toBeNull()
  })
})
