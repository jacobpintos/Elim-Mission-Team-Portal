import { describe, it, expect } from 'vitest'
import { toExternalUrl } from './externalUrl'

describe('toExternalUrl', () => {
  it('assumes https for a bare domain', () => {
    // The case that made links look broken: nobody types the scheme.
    expect(toExternalUrl('google.com')).toBe('https://google.com')
    expect(toExternalUrl('www.google.com')).toBe('https://www.google.com')
  })

  it('keeps a path, query and fragment', () => {
    expect(toExternalUrl('amazon.com/dp/B01?ref=x#top')).toBe('https://amazon.com/dp/B01?ref=x#top')
  })

  it('leaves an address that already has a scheme alone', () => {
    expect(toExternalUrl('https://google.com')).toBe('https://google.com')
    expect(toExternalUrl('http://intranet.local')).toBe('http://intranet.local')
  })

  it('does not care how the scheme is capitalised', () => {
    expect(toExternalUrl('HTTPS://Google.com')).toBe('HTTPS://Google.com')
  })

  it('leaves non-web schemes alone', () => {
    // Prefixing these would break them outright.
    expect(toExternalUrl('mailto:someone@example.com')).toBe('mailto:someone@example.com')
    expect(toExternalUrl('tel:+15551234')).toBe('tel:+15551234')
    expect(toExternalUrl('zoomus://zoom.us/join?confno=1')).toBe('zoomus://zoom.us/join?confno=1')
  })

  it('gives a protocol-relative address a protocol', () => {
    expect(toExternalUrl('//example.com/x')).toBe('https://example.com/x')
  })

  it('trims what people paste', () => {
    expect(toExternalUrl('  google.com  ')).toBe('https://google.com')
    expect(toExternalUrl('\nhttps://google.com\n')).toBe('https://google.com')
  })

  it('returns null for nothing, so callers can skip opening', () => {
    expect(toExternalUrl('')).toBeNull()
    expect(toExternalUrl('   ')).toBeNull()
    expect(toExternalUrl(null)).toBeNull()
    expect(toExternalUrl(undefined)).toBeNull()
  })

  it('does not mistake a port for a scheme', () => {
    // "localhost:3000" looks like the scheme "localhost" until you notice
    // what follows is a number. Treated as a scheme it stays unopenable.
    expect(toExternalUrl('localhost:3000')).toBe('https://localhost:3000')
    expect(toExternalUrl('example.com:8080/path')).toBe('https://example.com:8080/path')
  })
})
