import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { files } from '@/testing/expoFileSystemStub'
import { loadOffline, saveOffline, forgetOfflineData } from './offlineCache'

/** The native app's files of kept answers (expo-file-system is a Map here). */

beforeEach(async () => {
  vi.useFakeTimers()
  await forgetOfflineData()
  files.clear()
})
afterEach(() => vi.useRealTimers())

describe('offlineCache (native)', () => {
  it('keeps a value and reads it back after the write goes out', async () => {
    saveOffline('col:chordSheets', [{ title: 'Holy Forever' }])
    expect(await loadOffline('col:chordSheets')).toBeNull()
    vi.advanceTimersByTime(1000)
    expect(await loadOffline('col:chordSheets')).toEqual([{ title: 'Holy Forever' }])
  })

  it('writes only the last of a burst', () => {
    for (let i = 0; i < 5; i++) saveOffline('doc:users/u1', { n: i })
    vi.advanceTimersByTime(1000)
    expect(files.size).toBe(1)
    expect(JSON.parse([...files.values()][0]).value).toEqual({ n: 4 })
  })

  it('keeps each key in a file of its own', async () => {
    saveOffline('col:chordSheets', 1)
    saveOffline('col:setLists', 2)
    vi.advanceTimersByTime(1000)
    expect(files.size).toBe(2)
    expect(await loadOffline('col:setLists')).toBe(2)
  })

  it('reads nothing for a key it never kept', async () => {
    expect(await loadOffline('col:nothing')).toBeNull()
  })

  it('forgets everything on signing out, writes still waiting included', async () => {
    saveOffline('col:chordSheets', 1)
    vi.advanceTimersByTime(1000)
    saveOffline('col:setLists', 2)
    await forgetOfflineData()
    vi.advanceTimersByTime(1000)
    expect(files.size).toBe(0)
    expect(await loadOffline('col:chordSheets')).toBeNull()
  })
})
