import type { Peek, Peeked } from './netScan'

/**
 * Asks an http address on the local network and lets go as soon as it can
 * tell what's there (./netScan: Peek): the status and kind of content once
 * they arrive, then, given bodyMs, whether the content ends within that time.
 * Through XMLHttpRequest, which says when the headers arrive; fetch here
 * waits for the whole body, and a motion-JPEG stream has no end.
 */
export const httpPeek: Peek = (url, { timeoutMs, bodyMs }) =>
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    let head: Omit<Peeked, 'ended'> | null = null
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (answer: Peeked | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      xhr.onreadystatechange = null
      xhr.onload = null
      xhr.onerror = null
      if (xhr.readyState === XMLHttpRequest.DONE) {
        // The picture, kept by the app's native side as a blob: let it go.
        ;(xhr.response as { close?: () => void } | null)?.close?.()
      } else {
        xhr.abort()
      }
      resolve(answer)
    }
    const headers = () => {
      head ??= {
        status: xhr.status,
        type: (xhr.getResponseHeader('content-type') ?? '').toLowerCase(),
      }
      return head
    }

    timer = setTimeout(() => finish(head && { ...head, ended: false }), timeoutMs)
    xhr.onreadystatechange = () => {
      if (head || xhr.readyState !== XMLHttpRequest.HEADERS_RECEIVED) return
      const h = headers()
      if (bodyMs <= 0) return finish({ ...h, ended: false })
      clearTimeout(timer)
      timer = setTimeout(() => finish({ ...h, ended: false }), bodyMs)
    }
    xhr.onload = () => finish({ ...headers(), ended: true })
    xhr.onerror = () => finish(null)
    try {
      xhr.open('GET', url)
      // Kept on the native side, not carried over to JavaScript as text.
      xhr.responseType = 'blob'
      xhr.send()
    } catch {
      finish(null)
    }
  })
