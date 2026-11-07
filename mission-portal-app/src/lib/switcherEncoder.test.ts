import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Peek, Peeked } from './netScan'
import { feedOf, findEncoders, PREVIEW_PATHS } from './switcher/findEncoder'
import { httpPeek } from './httpPeek'

const page = (status = 200): Peeked => ({ status, type: 'text/html', ended: true })
const still: Peeked = { status: 200, type: 'image/jpeg', ended: true }

describe('what a preview address gave', () => {
  it('is a still picture when a picture arrives and ends', () => {
    expect(feedOf('http://a/snapshot.jpg', still)).toEqual({
      url: 'http://a/snapshot.jpg',
      kind: 'still',
    })
  })

  it('is a motion-JPEG stream when it says so, or when its pictures keep coming', () => {
    const multipart = { status: 200, type: 'multipart/x-mixed-replace; boundary=x', ended: false }
    expect(feedOf('http://a/mjpeg', multipart)?.kind).toBe('mjpeg')
    // How an iPhone hands over a stream: a picture at a time, never ending.
    expect(feedOf('http://a/video.mjpg', { ...still, ended: false })?.kind).toBe('mjpeg')
  })

  it('is nothing when it isn’t a picture, or asks for a password, or isn’t there', () => {
    expect(feedOf('http://a/snapshot', page())).toBeNull()
    expect(feedOf('http://a/snapshot.jpg', { ...still, status: 401 })).toBeNull()
    expect(feedOf('http://a/snapshot.jpg', { ...still, status: 404 })).toBeNull()
    expect(feedOf('http://a/snapshot.jpg', null)).toBeNull()
  })
})

describe('finding the encoder on the phone’s network', () => {
  /** The devices on 192.168.10.x, by address, and what each serves where. */
  const devices: Record<string, Record<string, Peeked>> = {
    // The router: a web page, no picture.
    '192.168.10.1': { '/': page() },
    // An encoder with a still picture.
    '192.168.10.50': { '/': page(), '/snapshot.jpg': still, '/mjpeg': still },
    // One whose settings page asks for a password, with an open stream.
    '192.168.10.60': {
      '/': page(401),
      '/mjpeg': { status: 200, type: 'multipart/x-mixed-replace; boundary=x', ended: false },
    },
    // A stream, as an iPhone sees it.
    '192.168.10.70': { '/': page(), '/video.mjpg': { ...still, ended: false } },
    // A web app that answers every address with its page.
    '192.168.10.80': { '/': page(), '/snapshot': page(), '/snapshot.jpg': page() },
  }
  const asked: { url: string; bodyMs: number }[] = []
  const peek: Peek = async (url, { bodyMs }) => {
    asked.push({ url, bodyMs })
    const { host, pathname } = new URL(url)
    const device = devices[host]
    if (!device) return null
    return device[pathname] ?? { status: 404, type: 'text/html', ended: true }
  }

  it('keeps each picture it finds, and names the other devices with a web page', async () => {
    const found = await findEncoders(peek, { address: '192.168.10.37', prefix: 24 })
    expect(found.feeds).toEqual([
      { host: '192.168.10.50', feed: { url: 'http://192.168.10.50/snapshot.jpg', kind: 'still' } },
      { host: '192.168.10.60', feed: { url: 'http://192.168.10.60/mjpeg', kind: 'mjpeg' } },
      { host: '192.168.10.70', feed: { url: 'http://192.168.10.70/video.mjpg', kind: 'mjpeg' } },
    ])
    expect(found.pages).toEqual(['192.168.10.1', '192.168.10.80'])
  })

  it('asks each address only for a page, and each device only until it gives a picture', async () => {
    asked.length = 0
    await findEncoders(peek, { address: '192.168.10.37', prefix: 24 })
    const roots = asked.filter((a) => a.url.endsWith('/'))
    expect(roots).toHaveLength(253)
    expect(roots.every((a) => a.bodyMs === 0)).toBe(true)
    // Pictures are waited for, to tell a still one from a stream.
    const pictures = asked.filter((a) => !a.url.endsWith('/'))
    expect(pictures.every((a) => a.bodyMs > 0)).toBe(true)
    expect(pictures.filter((a) => a.url.includes('.10.50/')).map((a) => a.url)).toEqual([
      'http://192.168.10.50/snapshot.jpg',
    ])
    // Nothing is asked of an address that didn't answer.
    expect(pictures.some((a) => a.url.includes('.10.2/'))).toBe(false)
    // A device with no picture is asked at every preview address.
    expect(pictures.filter((a) => a.url.includes('.10.1/'))).toHaveLength(PREVIEW_PATHS.length)
  })

  it('finds nothing on a network with no web pages', async () => {
    const none: Peek = async () => null
    expect(await findEncoders(none, { address: '10.0.0.5', prefix: 24 })).toEqual({
      feeds: [],
      pages: [],
    })
  })
})

describe('peeking at an address (httpPeek)', () => {
  /** XMLHttpRequest as React Native's, with the answer given by the test. */
  class FakeXhr {
    static HEADERS_RECEIVED = 2
    static DONE = 4
    static last: FakeXhr
    readyState = 0
    status = 0
    responseType = ''
    response: { close: () => void } | null = null
    url = ''
    type = ''
    aborted = false
    onreadystatechange: (() => void) | null = null
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor() {
      FakeXhr.last = this
    }
    open(_method: string, url: string) {
      this.url = url
      this.readyState = 1
    }
    send() {}
    abort() {
      this.aborted = true
      this.readyState = 4
    }
    getResponseHeader(name: string) {
      return name.toLowerCase() === 'content-type' ? this.type : null
    }
    // What the device does:
    answer(status: number, type: string) {
      this.status = status
      this.type = type
      this.readyState = 2
      this.onreadystatechange?.()
    }
    end() {
      this.response = { close: vi.fn() }
      this.readyState = 4
      this.onreadystatechange?.()
      this.onload?.()
    }
    fail() {
      this.readyState = 4
      this.onreadystatechange?.()
      this.onerror?.()
    }
  }

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  const start = (bodyMs = 2000) => {
    vi.useFakeTimers()
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    const answer = httpPeek('http://192.168.10.50/snapshot.jpg', { timeoutMs: 1000, bodyMs })
    return { answer, xhr: FakeXhr.last }
  }

  it('gives a picture that ends, and lets go of it', async () => {
    const { answer, xhr } = start()
    xhr.answer(200, 'image/JPEG')
    xhr.end()
    expect(await answer).toEqual({ status: 200, type: 'image/jpeg', ended: true })
    expect(xhr.response?.close).toHaveBeenCalled()
    expect(xhr.aborted).toBe(false)
  })

  it('stops a stream once it has kept coming for bodyMs', async () => {
    const { answer, xhr } = start(2000)
    xhr.answer(200, 'image/jpeg')
    // A second part, as an iPhone hands a stream over: the first answer stands.
    xhr.answer(200, 'image/jpeg')
    await vi.advanceTimersByTimeAsync(1999)
    expect(xhr.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await answer).toEqual({ status: 200, type: 'image/jpeg', ended: false })
    expect(xhr.aborted).toBe(true)
  })

  it('with no bodyMs, lets go as soon as it answers', async () => {
    const { answer, xhr } = start(0)
    xhr.answer(401, 'text/html')
    expect(await answer).toEqual({ status: 401, type: 'text/html', ended: false })
    expect(xhr.aborted).toBe(true)
  })

  it('gives up on an address that doesn’t answer, or fails', async () => {
    const quiet = start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(await quiet.answer).toBeNull()
    expect(quiet.xhr.aborted).toBe(true)

    const failing = start()
    failing.xhr.fail()
    expect(await failing.answer).toBeNull()
  })
})
