import { describe, it, expect } from 'vitest'
import { checkImageAddress } from './imageAddress'

describe('checkImageAddress', () => {
  it('says nothing about a blank field', () => {
    expect(checkImageAddress('')).toBeNull()
    expect(checkImageAddress(undefined)).toBeNull()
  })

  it('accepts an ordinary image address', () => {
    expect(
      checkImageAddress('https://images.squarespace-cdn.com/content/v1/abc/photo.png')
    ).toBeNull()
    expect(checkImageAddress('https://cdn.test/a/b/c.JPG')).toBeNull()
  })

  it('accepts an image address carrying a query', () => {
    // Squarespace sizes images this way, and the seeded Our Story page uses it.
    expect(
      checkImageAddress('https://images.squarespace-cdn.com/x/cover.png?format=500w')
    ).toBeNull()
  })

  it('names the site when given a link to a page', () => {
    // What actually happened: a Facebook share link pasted into the hero's
    // background field, which rendered nothing at all.
    const warning = checkImageAddress('https://www.facebook.com/share/1EmALUztgR/?mibextid=abc')
    expect(warning).toContain('facebook.com')
    expect(warning).toContain('not to an image file')
  })

  it('catches the other share links people paste', () => {
    expect(checkImageAddress('https://www.instagram.com/p/Cabc123/')).toContain('instagram.com')
    expect(checkImageAddress('https://drive.google.com/file/d/abc/view')).toContain(
      'drive.google.com'
    )
  })

  it('is unsure rather than wrong about an address with no extension', () => {
    // Firebase Storage and other CDNs serve images from paths like this.
    expect(checkImageAddress('https://cdn.test/photos/9f8a7b')).toContain('may not be an image')
  })

  it('rejects something that is not an address at all', () => {
    expect(checkImageAddress('my photo.jpg')).toContain('should start with https://')
    expect(checkImageAddress('ftp://host/pic.jpg')).toContain('should start with https://')
  })

  it('leaves an inline image alone', () => {
    expect(checkImageAddress('data:image/png;base64,AAAA')).toBeNull()
  })
})
