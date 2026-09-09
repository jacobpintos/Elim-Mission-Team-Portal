import { describe, it, expect, vi } from 'vitest'

/**
 * Adding a sermon failed on the iOS app: pasting the link YouTube gives for a
 * live stream was rejected as an invalid URL. Every share surface for a
 * broadcast hands out a `/live/` link, and that was the one form the parser did
 * not know.
 *
 * The second case here is the quieter half of the same bug. A link pasted from
 * Mail or Messages often carries a trailing space or newline, and the patterns
 * swallowed it into the id — so the item saved, and then the embed and the
 * thumbnail both pointed at an id that does not exist.
 */

vi.mock('@/lib/firebase', () => ({ db: {} }))

const { extractYouTubeId, youtubeThumbnail } = await import('./musicStore')

const ID = 'dQw4w9WgXcQ'

describe('extractYouTubeId', () => {
  it('reads the id from a live stream URL', () => {
    expect(extractYouTubeId(`https://www.youtube.com/live/${ID}`)).toBe(ID)
  })

  it('reads the id from a live stream URL carrying a share parameter', () => {
    expect(extractYouTubeId(`https://www.youtube.com/live/${ID}?si=Ab1_c2`)).toBe(ID)
  })

  it('reads the id from a YouTube Studio URL', () => {
    expect(extractYouTubeId(`https://studio.youtube.com/video/${ID}/livestreaming`)).toBe(ID)
  })

  it.each([
    ['short', `https://youtu.be/${ID}`],
    ['short with share parameter', `https://youtu.be/${ID}?si=Ab1_c2`],
    ['watch', `https://www.youtube.com/watch?v=${ID}`],
    ['watch with trailing parameter', `https://www.youtube.com/watch?v=${ID}&ab_channel=Elim`],
    ['embed', `https://www.youtube.com/embed/${ID}`],
    ['shorts', `https://www.youtube.com/shorts/${ID}`],
  ])('still reads the id from a %s URL', (_label, url) => {
    expect(extractYouTubeId(url)).toBe(ID)
  })

  it.each([
    ['a trailing space', ` https://youtu.be/${ID} `],
    ['a trailing newline', `https://youtu.be/${ID}\n`],
    ['surrounding whitespace on a watch URL', `  https://www.youtube.com/watch?v=${ID}\n`],
    ['whitespace on a live URL', `  https://www.youtube.com/live/${ID}  `],
  ])('drops %s from the id', (_label, url) => {
    expect(extractYouTubeId(url)).toBe(ID)
  })

  it('returns null for a URL that is not YouTube', () => {
    expect(extractYouTubeId('https://vimeo.com/123456')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(extractYouTubeId('')).toBeNull()
  })
})

describe('youtubeThumbnail', () => {
  it('builds a thumbnail URL for a live stream link', () => {
    expect(youtubeThumbnail(`https://www.youtube.com/live/${ID}`)).toBe(
      `https://img.youtube.com/vi/${ID}/hqdefault.jpg`
    )
  })

  it('builds no thumbnail URL when there is no id', () => {
    expect(youtubeThumbnail('https://vimeo.com/123456')).toBe('')
  })
})
