import { describe, it, expect } from 'vitest'
import { youTubeAppUrl } from './youTubeAppUrl'

describe('youTubeAppUrl', () => {
  it("is the YouTube app's own address for the video", () => {
    expect(youTubeAppUrl('dQw4w9WgXcQ')).toBe('youtube://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  it('keeps the start time from the link it came from', () => {
    expect(youTubeAppUrl('abc123', 'https://youtu.be/abc123?t=95')).toBe(
      'youtube://www.youtube.com/watch?v=abc123&t=95'
    )
    expect(youTubeAppUrl('abc123', 'https://www.youtube.com/watch?v=abc123&t=1m35s')).toBe(
      'youtube://www.youtube.com/watch?v=abc123&t=1m35s'
    )
    expect(youTubeAppUrl('abc123', 'https://www.youtube.com/embed/abc123?start=95')).toBe(
      'youtube://www.youtube.com/watch?v=abc123&t=95'
    )
  })

  it('ignores other parameters that are not a start time', () => {
    expect(youTubeAppUrl('abc123', 'https://www.youtube.com/watch?v=abc123&list=PL1&si=xyz')).toBe(
      'youtube://www.youtube.com/watch?v=abc123'
    )
  })
})
