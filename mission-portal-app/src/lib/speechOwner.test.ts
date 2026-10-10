import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  claimSpeech,
  claimSpeechInBackground,
  ownsSpeech,
  releaseSpeech,
  speechFree,
  speechTakeable,
  withSpeech,
  withSpeechInBackground,
} from './speechOwner'

afterEach(() => {
  for (const id of ['wake', 'dictate', 'finder', 'sheet', 'voice']) releaseSpeech(id)
  vi.useRealTimers()
})

describe('handing the microphone over from the wake word', () => {
  it('stops it, and starts the next only once it has ended — on the next turn', () => {
    vi.useFakeTimers()
    const stop = vi.fn()
    const start = vi.fn()
    claimSpeechInBackground('wake', stop)
    expect(speechFree()).toBe(false)
    expect(speechTakeable()).toBe(true)

    withSpeech('dictate', start)
    expect(stop).toHaveBeenCalledOnce()
    expect(start).not.toHaveBeenCalled()
    expect(ownsSpeech('wake')).toBe(true)

    // Its end arrives: listeners to that same end must not see the new owner.
    releaseSpeech('wake')
    expect(ownsSpeech('dictate')).toBe(false)
    vi.advanceTimersByTime(0)
    expect(ownsSpeech('dictate')).toBe(true)
    expect(start).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(2000)
    expect(start).toHaveBeenCalledOnce()
  })

  it('goes ahead anyway if the end never comes', () => {
    vi.useFakeTimers()
    const start = vi.fn()
    claimSpeechInBackground('wake', () => {})
    withSpeech('finder', start)
    vi.advanceTimersByTime(800)
    expect(start).toHaveBeenCalledOnce()
    expect(ownsSpeech('finder')).toBe(true)
  })

  it('never takes it from a listener that was asked for', () => {
    claimSpeech('dictate')
    expect(speechTakeable()).toBe(false)
    const start = vi.fn()
    withSpeech('dictate', start)
    expect(start).toHaveBeenCalledOnce()
  })
})

describe('an open sheet listening for "Hey Miriam"', () => {
  it('takes over from the wake word, and still gives way to anyone asking', () => {
    vi.useFakeTimers()
    const stopWake = vi.fn()
    const stopSheet = vi.fn()
    const listen = vi.fn()
    claimSpeechInBackground('wake', stopWake)

    withSpeechInBackground('sheet', stopSheet, listen)
    expect(stopWake).toHaveBeenCalledOnce()
    releaseSpeech('wake')
    vi.advanceTimersByTime(0)
    expect(listen).toHaveBeenCalledOnce()
    expect(ownsSpeech('sheet')).toBe(true)
    // In the background: anyone can still have it, and the wake word waits.
    expect(speechTakeable()).toBe(true)
    expect(speechFree()).toBe(false)

    // Miriam speaking: the sheet stops, and she has it once it has ended.
    const say = vi.fn()
    withSpeech('voice', say)
    expect(stopSheet).toHaveBeenCalledOnce()
    releaseSpeech('sheet')
    vi.advanceTimersByTime(0)
    expect(say).toHaveBeenCalledOnce()
    expect(ownsSpeech('voice')).toBe(true)
    expect(speechTakeable()).toBe(false)
  })
})
