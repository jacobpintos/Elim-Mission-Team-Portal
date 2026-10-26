import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CHECK_WAIT_MS, hurryOpeningCheck } from './openingCheck'

const LOOKUP = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=k'
const TOKEN = 'https://securetoken.googleapis.com/v1/token?key=k'

describe('the sign-in check while the app opens', () => {
  const realFetch = globalThis.fetch
  let calls: { url: string; signal?: AbortSignal }[]

  beforeEach(() => {
    vi.useFakeTimers()
    calls = []
    // A connection that has gone quiet: nothing answers until it is stopped.
    globalThis.fetch = ((input: string, init?: RequestInit) => {
      calls.push({ url: input, signal: init?.signal ?? undefined })
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    vi.useRealTimers()
  })

  it('stops a stalled check after a few seconds, which Firebase takes as no signal', async () => {
    const cut = vi.fn()
    const stop = hurryOpeningCheck(cut)
    for (const url of [LOOKUP, TOKEN]) {
      const answer = globalThis.fetch(url, { method: 'POST' })
      const settled = vi.fn()
      answer.catch(settled)
      await vi.advanceTimersByTimeAsync(CHECK_WAIT_MS - 1)
      expect(settled).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(settled).toHaveBeenCalled()
    }
    expect(cut).toHaveBeenCalledTimes(2)
    stop()
  })

  it('leaves every other request alone', async () => {
    const stop = hurryOpeningCheck()
    const answer = globalThis.fetch('https://firestore.googleapis.com/x')
    const settled = vi.fn()
    answer.catch(settled)
    await vi.advanceTimersByTimeAsync(CHECK_WAIT_MS * 3)
    expect(settled).not.toHaveBeenCalled()
    expect(calls[0].signal).toBeUndefined()
    stop()
  })

  it('leaves a request its sender can stop alone', async () => {
    const stop = hurryOpeningCheck()
    const own = new AbortController()
    globalThis.fetch(LOOKUP, { signal: own.signal }).catch(() => {})
    expect(calls[0].signal).toBe(own.signal)
    stop()
  })

  it('has no limit once the app has opened', async () => {
    const quiet = globalThis.fetch
    const stop = hurryOpeningCheck()
    stop()
    expect(globalThis.fetch).toBe(quiet)
    const settled = vi.fn()
    globalThis.fetch(TOKEN).catch(settled)
    await vi.advanceTimersByTimeAsync(CHECK_WAIT_MS * 3)
    expect(settled).not.toHaveBeenCalled()
  })

  it('lets an answer in time through', async () => {
    globalThis.fetch = (() => Promise.resolve('ok')) as unknown as typeof fetch
    const stop = hurryOpeningCheck()
    await expect(globalThis.fetch(LOOKUP)).resolves.toBe('ok')
    stop()
  })
})
