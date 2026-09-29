import { describe, it, expect } from 'vitest'

/**
 * Mirror of audioPathsFor() in functions/src/onSetListDeleted.ts.
 *
 * functions/ is a separate TypeScript project with its own build and the app
 * test runner does not compile it, so this copy exists to pin the rule that
 * decides whether a deleted set list takes its audio files with it. If the
 * function changes, this must change with it — same arrangement as
 * securityAlerts.test.ts.
 */
interface SongRaw {
  audioPath?: unknown
}

function audioPathsFor(data: { songs?: unknown } | undefined): string[] {
  const songs = Array.isArray(data?.songs) ? (data?.songs as SongRaw[]) : []
  return songs
    .map((song) => song?.audioPath)
    .filter((path): path is string => typeof path === 'string' && path.length > 0)
}

describe('audioPathsFor', () => {
  it('collects the path of every song carrying audio', () => {
    expect(
      audioPathsFor({
        songs: [
          { audioPath: 'setListAudio/s1/track.mp3' },
          { audioPath: 'setListAudio/s2/other.mp3' },
        ],
      })
    ).toEqual(['setListAudio/s1/track.mp3', 'setListAudio/s2/other.mp3'])
  })

  it('skips songs with no audio, which is most of them', () => {
    expect(
      audioPathsFor({
        songs: [{}, { audioPath: 'setListAudio/s2/other.mp3' }, { audioPath: '' }],
      })
    ).toEqual(['setListAudio/s2/other.mp3'])
  })

  it('ignores a path that is not a string', () => {
    // A set list written by an older build, or by hand in the console.
    expect(audioPathsFor({ songs: [{ audioPath: 42 }, { audioPath: null }] })).toEqual([])
  })

  it('copes with a set list that has no songs at all', () => {
    expect(audioPathsFor({ songs: [] })).toEqual([])
    expect(audioPathsFor({})).toEqual([])
    expect(audioPathsFor(undefined)).toEqual([])
  })

  it('copes with songs stored as something other than an array', () => {
    expect(audioPathsFor({ songs: 'nope' })).toEqual([])
  })
})
