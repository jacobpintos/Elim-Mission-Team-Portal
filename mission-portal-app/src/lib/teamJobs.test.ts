import { describe, expect, it } from 'vitest'
import { holdsJob, jobHoldersOf, toggledJob } from './teamJobs'

describe('jobs several people hold (Sound Engineer, Video Operator)', () => {
  it('are read as uids, each once, whatever was stored', () => {
    expect(jobHoldersOf(undefined)).toEqual([])
    expect(jobHoldersOf('a')).toEqual([])
    expect(jobHoldersOf(['a', 'b', 'a', '', 3, null])).toEqual(['a', 'b'])
  })

  it('are held by several people at once', () => {
    const holders = toggledJob(toggledJob([], 'mitch'), 'sarah')
    expect(holders).toEqual(['mitch', 'sarah'])
    expect(holdsJob('mitch', holders)).toBe(true)
    expect(holdsJob('sarah', holders)).toBe(true)
  })

  it('are taken back from one without the others', () => {
    expect(toggledJob(['mitch', 'sarah'], 'mitch')).toEqual(['sarah'])
  })

  it('are nobody’s when nobody is signed in', () => {
    expect(holdsJob(undefined, ['mitch'])).toBe(false)
    expect(holdsJob('', [''])).toBe(false)
  })
})
