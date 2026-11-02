import { describe, it, expect } from 'vitest'
import { isFacebookUrl, tidyFacebookUrl } from './eventLinks'

describe('a public event’s Facebook event link', () => {
  it('takes Facebook’s addresses, however pasted', () => {
    expect(isFacebookUrl('https://www.facebook.com/events/123456/')).toBe(true)
    expect(isFacebookUrl('facebook.com/events/123456')).toBe(true)
    expect(isFacebookUrl('https://m.facebook.com/events/1')).toBe(true)
    expect(isFacebookUrl('https://fb.me/e/abcDEF')).toBe(true)
    expect(tidyFacebookUrl('  facebook.com/events/123456 ')).toBe(
      'https://facebook.com/events/123456'
    )
  })

  it('turns away anything else', () => {
    expect(isFacebookUrl('https://www.eventbrite.com/e/1')).toBe(false)
    expect(isFacebookUrl('https://facebook.com.evil.test/events/1')).toBe(false)
    expect(tidyFacebookUrl('')).toBe('')
    expect(tidyFacebookUrl('not a link')).toBe('')
  })
})
