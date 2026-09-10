import { describe, it, expect } from 'vitest'
import { composeDraftConnect } from './draftConnect'
import type { PageBlock } from '@/types/pages'

const block = (id: number, type: string, data: Record<string, unknown> = {}): PageBlock =>
  ({ id, type, data }) as PageBlock

/** The Connect page as it stands: hero, service details, tagline, meeting. */
const live: PageBlock[] = [
  block(1, 'hero', {
    heading: 'Come As You Are!',
    subheading: "We'd Love To Meet You!",
    bgImage: 'https://example.com/room.jpg',
    textColor: '#f5a623',
  }),
  block(2, 'twocol', {
    leftHead: 'Sunday Service',
    leftContent: '10 AM at The Midnight Gem\n2613 Ders Drive Northwest\nSwisher, IA 52338',
    rightImage: 'https://example.com/gem.jpg',
  }),
  block(3, 'quote', { text: 'Bringing a Generation to the Rest Found in Jesus' }),
  block(4, 'meeting', { heading: 'Request a Meeting' }),
]

describe('composeDraftConnect', () => {
  it('leads with the hero, then who they are, then where to go', () => {
    const out = composeDraftConnect(live, 1000)
    expect(out.map((b) => b.type)).toEqual(['hero', 'quote', 'twocol', 'divider', 'meeting'])
  })

  it('keeps every photograph and every word that was entered', () => {
    // The whole point: nothing is retyped here, so the addresses and image
    // links survive exactly as the page had them.
    const out = composeDraftConnect(live, 1000)
    const twocol = out.find((b) => b.type === 'twocol')!
    expect(twocol.data.rightImage).toBe('https://example.com/gem.jpg')
    expect(twocol.data.leftContent).toContain('Swisher, IA 52338')
    expect(out.find((b) => b.type === 'hero')!.data.bgImage).toBe('https://example.com/room.jpg')
    expect(out.find((b) => b.type === 'quote')!.data.text).toBe(
      'Bringing a Generation to the Rest Found in Jesus'
    )
  })

  it('puts the hero back to white on a dark scrim', () => {
    const hero = composeDraftConnect(live, 1000).find((b) => b.type === 'hero')!
    expect(hero.data.textColor).toBe('#ffffff')
    expect(hero.data.overlayColor).toBe('rgba(0,0,0,0.55)')
    // Everything else about the hero is left alone.
    expect(hero.data.heading).toBe('Come As You Are!')
  })

  it('offers an opening line for the meeting form when it has none', () => {
    const intro = composeDraftConnect(live, 1000).find((b) => b.type === 'meeting')!.data.intro
    expect(typeof intro).toBe('string')
    expect((intro as string).length).toBeGreaterThan(0)
  })

  it('never overwrites an intro somebody already wrote', () => {
    const withIntro = live.map((b) =>
      b.type === 'meeting' ? block(4, 'meeting', { intro: 'Come say hello after the service.' }) : b
    )
    const out = composeDraftConnect(withIntro, 1000)
    expect(out.find((b) => b.type === 'meeting')!.data.intro).toBe(
      'Come say hello after the service.'
    )
  })

  it('carries through a block it has no opinion about', () => {
    const withGallery = [...live, block(5, 'gallery', { images: ['a.jpg'] })]
    const out = composeDraftConnect(withGallery, 1000)
    expect(out.map((b) => b.type)).toContain('gallery')
    expect(out.find((b) => b.type === 'gallery')!.data.images).toEqual(['a.jpg'])
  })

  it('keeps a second block of a type it arranges, rather than losing it', () => {
    // A page with two text-ish blocks of the same kind must come back whole.
    const twoQuotes = [...live, block(6, 'quote', { text: 'A second line' })]
    const out = composeDraftConnect(twoQuotes, 1000)
    expect(out.filter((b) => b.type === 'quote')).toHaveLength(2)
  })

  it('gives every block its own id', () => {
    const out = composeDraftConnect(live, 1000)
    expect(new Set(out.map((b) => b.id)).size).toBe(out.length)
  })

  it('has nothing to arrange when the page is empty', () => {
    expect(composeDraftConnect([], 1000)).toEqual([])
  })

  it('copes with a page missing the blocks it expects', () => {
    const out = composeDraftConnect([block(1, 'text', { content: 'Hello' })], 1000)
    expect(out.map((b) => b.type)).toEqual(['text'])
  })
})
