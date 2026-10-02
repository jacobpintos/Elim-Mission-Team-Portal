import { describe, it, expect } from 'vitest'
import {
  buildLyricIndex,
  confidentMatch,
  hintPhrases,
  lyricWords,
  rankSongs,
  type LyricSource,
} from './lyricMatch'

/**
 * Public-domain hymns, stored the way chord sheets store lyrics — split
 * syllables, "_" placeholders — and heard the way a phone hears singing:
 * no punctuation, a misheard word or two, starting mid-line.
 */
const song = (id: string, title: string, ...sections: string[]): LyricSource => ({
  id,
  title,
  sections: sections.map((lyrics, i) => ({ id: `${id}-${i}`, lyrics })),
})

const LIBRARY = buildLyricIndex([
  song(
    'grace',
    'Amazing Grace',
    'A-maz-ing grace how sweet the sound _\nThat saved a wretch like me\nI once was lost but now am found\nWas blind but now I see',
    "'Twas grace that taught my heart to fear\nAnd grace my fears re-lieved\nHow pre-cious did that grace ap-pear\nThe hour I first be-lieved _"
  ),
  song(
    'holy',
    'Holy, Holy, Holy',
    'Ho-ly ho-ly ho-ly Lord God Al-might-y\nEar-ly in the morn-ing our song shall rise to Thee',
    'Ho-ly ho-ly ho-ly mer-ci-ful and might-y\nGod in three per-sons bless-ed Trin-i-ty'
  ),
  song(
    'vision',
    'Be Thou My Vision',
    'Be Thou my vi-sion O Lord of my heart\nNaught be all else to me save that Thou art',
    'Thou my best thought by day or by night\nWak-ing or sleep-ing Thy pres-ence my light'
  ),
  song(
    'well',
    'It Is Well',
    'When peace like a riv-er at-tend-eth my way\nWhen sor-rows like sea bil-lows roll',
    'It is well _ with my soul _\nIt is well it is well with my soul'
  ),
  song(
    'fount',
    'Come Thou Fount',
    'Come Thou Fount of ev-ery bless-ing\nTune my heart to sing Thy grace',
    "Prone to wan-der Lord I feel it\nProne to leave the God I love\nHere's my heart O take and seal it"
  ),
  song(
    'blood',
    'Nothing But the Blood',
    'What can wash a-way my sin\nNoth-ing but the blood of Je-sus',
    'Oh pre-cious is the flow\nThat makes me white as snow'
  ),
  song(
    'assurance',
    'Blessed Assurance',
    'Bless-ed as-sur-ance Je-sus is mine\nOh what a fore-taste of glo-ry di-vine',
    'This is my sto-ry this is my song\nPrais-ing my Sav-ior all the day long'
  ),
])

const top = (heard: string) => rankSongs(LIBRARY, heard)[0]?.id ?? null
const opens = (heard: string) => confidentMatch(rankSongs(LIBRARY, heard))?.id ?? null

describe('lyricWords', () => {
  it('joins split syllables and drops placeholders, punctuation and case', () => {
    expect(lyricWords('A-maz-ing grace, how sweet the sound _')).toEqual([
      'amazing',
      'grace',
      'how',
      'sweet',
      'the',
      'sound',
    ])
    expect(lyricWords("'Twas grace that taught — my heart")).toEqual([
      'twas',
      'grace',
      'that',
      'taught',
      'my',
      'heart',
    ])
    expect(lyricWords("Here's my heart _ O take")).toEqual(['heres', 'my', 'heart', 'o', 'take'])
  })
})

describe('rankSongs', () => {
  it('finds a song from a line sung as heard', () => {
    expect(opens('amazing grace how sweet the sound that saved a wretch like me')).toBe('grace')
    expect(opens('prone to wander lord i feel it prone to leave the god i love')).toBe('fount')
  })

  it('matches words the sheet splits into syllables', () => {
    expect(opens('when peace like a river attendeth my way')).toBe('well')
    expect(opens('blessed assurance jesus is mine oh what a foretaste of glory divine')).toBe(
      'assurance'
    )
  })

  it('copes with a misheard word', () => {
    expect(opens('amazing grays how sweet the sound that saved a rich like me')).toBe('grace')
    expect(opens('be thou my vishion oh lord of my heart')).toBe('vision')
  })

  it('starts anywhere in the song, mid-line, from a later verse', () => {
    expect(opens('the hour i first believed')).toBe('grace')
    expect(opens('waking or sleeping thy presence my light')).toBe('vision')
  })

  it('says which section it was sung from', () => {
    const [best] = rankSongs(LIBRARY, 'it is well it is well with my soul')
    expect(best.id).toBe('well')
    expect(best.sectionId).toBe('well-1')
  })

  it('says which line the singing had got to, by the latest words heard', () => {
    const [best] = rankSongs(
      LIBRARY,
      'amazing grace how sweet the sound that saved a wretch like me i once was lost but now am found'
    )
    expect(best.sectionId).toBe('grace-0')
    expect(best.line).toBe(2)
    const [later] = rankSongs(
      LIBRARY,
      'twas grace that taught my heart to fear and grace my fears relieved'
    )
    expect([later.sectionId, later.line]).toEqual(['grace-1', 1])
  })

  it('places by a phrase sung once in the song, not one sung on several lines', () => {
    // "holy holy" is on the first line of both verses; "merciful and" only
    // on the second verse's.
    const [best] = rankSongs(LIBRARY, 'holy holy holy merciful and mighty')
    expect([best.sectionId, best.line]).toEqual(['holy-1', 0])
  })

  it('does not open a song on words every song has', () => {
    expect(opens('my heart')).toBeNull()
    expect(opens('and the lord is my')).toBeNull()
    expect(opens('this is my')).toBeNull()
  })

  it('does not open a song for something that is not in the library', () => {
    expect(opens('row row row your boat gently down the stream')).toBeNull()
    expect(opens('')).toBeNull()
  })

  it('waits while two songs are still in it, then picks', () => {
    // "holy holy holy" is the start of both verses of one song only, but
    // "my soul" is in more than one; a few more words settle it.
    expect(top('holy holy holy lord god almighty')).toBe('holy')
    expect(opens('holy holy holy lord god almighty early in the morning')).toBe('holy')
  })
})

describe('hintPhrases', () => {
  it('starts with the titles and stays within the limit', () => {
    const hints = hintPhrases(LIBRARY, 20)
    expect(hints.slice(0, 3)).toEqual(['Amazing Grace', 'Holy, Holy, Holy', 'Be Thou My Vision'])
    expect(hints).toHaveLength(20)
    expect(new Set(hints).size).toBe(20)
  })
})
