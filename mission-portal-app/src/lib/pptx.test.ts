import { describe, expect, it } from 'vitest'
import { deckFromLyrics } from './lyricSlides'
import { escapeXml, lyricPptx, pptxName } from './pptx'
import { base64, crc32, utf8, zip } from './zip'

/** A stored zip read back: each file's name and text, its CRC checked. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const files = new Map<string, string>()
  const text = (b: Uint8Array) => new TextDecoder().decode(b)
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50)
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const local = view.getUint32(at + 42, true)
    const name = text(bytes.subarray(at + 46, at + 46 + nameLength))
    expect(view.getUint32(local, true)).toBe(0x04034b50)
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const data = bytes.subarray(start, start + size)
    expect(crc32(data)).toBe(crc)
    files.set(name, text(data))
    at += 46 + nameLength
  }
  return files
}

describe('a zip, stored', () => {
  it('checks each file by its CRC-32', () => {
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926)
  })

  it('writes text as UTF-8', () => {
    expect([...utf8('A’é🎵')]).toEqual([...Buffer.from('A’é🎵', 'utf8')])
  })

  it('reads back what was put in', () => {
    const files = unzip(
      zip([
        { name: 'a.txt', data: utf8('hello') },
        { name: 'b/c.xml', data: utf8('<x/>') },
      ])
    )
    expect([...files]).toEqual([
      ['a.txt', 'hello'],
      ['b/c.xml', '<x/>'],
    ])
  })

  it('gives base64 a phone can write as a file', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'abcd', 'Holy, holy, holy! 🎵']) {
      expect(base64(utf8(s))).toBe(Buffer.from(s, 'utf8').toString('base64'))
    }
  })
})

describe('lyric slides as a PowerPoint file', () => {
  const deck = deckFromLyrics(
    'Verse 1\nPraise God from whom all blessings flow\nPraise Him all creatures here below\n\nChorus\nPraise Him above, ye heavenly host & <all>',
    'Doxology'
  )
  const files = unzip(lyricPptx(deck))

  it('holds a presentation, its master, layout and theme, and a slide each', () => {
    const slides = deck.slides.length
    expect(slides).toBe(3)
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/theme/theme1.xml',
      'ppt/slides/slide1.xml',
      'ppt/slides/slide3.xml',
      'ppt/slides/_rels/slide3.xml.rels',
    ]) {
      expect(files.has(part), part).toBe(true)
    }
    expect(files.has('ppt/slides/slide4.xml')).toBe(false)
    expect([...files.keys()][0]).toBe('[Content_Types].xml')
    expect(files.get('[Content_Types].xml')).toContain('/ppt/slides/slide3.xml')
    expect(files.get('ppt/presentation.xml')).toContain('<p:sldId id="258" r:id="rId4"/>')
    expect(files.get('ppt/_rels/presentation.xml.rels')).toContain(
      'Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"'
    )
  })

  it('is widescreen, white on black', () => {
    expect(files.get('ppt/presentation.xml')).toContain('<p:sldSz cx="12192000" cy="6858000"/>')
    expect(files.get('ppt/slideMasters/slideMaster1.xml')).toContain('<a:srgbClr val="000000"/>')
  })

  it('puts each row of a slide in its own paragraph, the title first', () => {
    const title = files.get('ppt/slides/slide1.xml')!
    expect(title).toContain('<a:t>DOXOLOGY</a:t>')
    const rows = deck.slides[1].kind === 'lyrics' ? deck.slides[1].lines : []
    expect(rows.length).toBeGreaterThan(2)
    const verse = files.get('ppt/slides/slide2.xml')!
    expect(verse.match(/<a:p>/g)).toHaveLength(rows.length)
    for (const row of rows) expect(verse).toContain(`<a:t>${row}</a:t>`)
  })

  it('escapes what XML can’t hold as it is', () => {
    expect(files.get('ppt/slides/slide3.xml')).toContain('HEAVENLY HOST &amp; &lt;ALL&gt;')
    expect(escapeXml('a\u0001b "c"')).toBe('ab &quot;c&quot;')
  })

  it('is named for the song', () => {
    expect(pptxName(deck)).toBe('Doxology - slides.pptx')
    expect(pptxName({ name: 'What? / Why: #1', slides: [] })).toBe('What Why 1 - slides.pptx')
    expect(pptxName({ name: '', slides: [] })).toBe('Lyrics - slides.pptx')
  })
})
