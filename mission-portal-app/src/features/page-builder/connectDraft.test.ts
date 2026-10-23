import { describe, it, expect } from 'vitest'
import { composeConnectDraft, directionsQuery, directionsUrl } from './connectDraft'
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

describe('composeConnectDraft', () => {
  it('sorts the page into its sections', () => {
    const d = composeConnectDraft(live)
    expect(d.hero?.heading).toBe('Come As You Are!')
    expect(d.tagline?.text).toBe('Bringing a Generation to the Rest Found in Jesus')
    expect(d.visit?.leftHead).toBe('Sunday Service')
    expect(d.meeting?.heading).toBe('Request a Meeting')
    expect(d.rest).toEqual([])
  })

  it('keeps a second block of a kind it places, rather than losing it', () => {
    const d = composeConnectDraft([
      ...live,
      block(5, 'twocol', { leftHead: 'Wednesday' }),
      block(6, 'quote', { text: 'Another line' }),
    ])
    expect(d.visit?.leftHead).toBe('Sunday Service')
    expect(d.rest.map((b) => b.id)).toEqual([5, 6])
  })

  it('makes cards of social links and keeps text, buttons and anything else', () => {
    const d = composeConnectDraft([
      block(1, 'social', {
        heading: 'Follow along',
        links: [{ icon: '', label: 'Facebook', url: 'https://www.facebook.com/elim' }],
      }),
      block(2, 'text', { heading: 'Our leaders' }),
      block(3, 'button', { label: 'Email us', url: 'mailto:hi@example.com' }),
      block(4, 'gallery', { images: [] }),
      block(5, 'divider'),
    ])
    expect(d.links.map((l) => [l.label, l.handle])).toEqual([['Facebook', 'facebook.com']])
    expect(d.linksHeading).toBe('Follow along')
    expect(d.story.map((t) => t.heading)).toEqual(['Our leaders'])
    expect(d.actions.map((a) => a.label)).toEqual(['Email us'])
    expect(d.rest.map((b) => b.id)).toEqual([4])
  })
})

describe('directionsQuery', () => {
  it('takes the venue and the address from the service lines', () => {
    expect(
      directionsQuery('10 AM at The Midnight Gem\n2613 Ders Drive Northwest\nSwisher, IA 52338')
    ).toBe('The Midnight Gem, 2613 Ders Drive Northwest, Swisher, IA 52338')
  })

  it('handles other ways of writing the time', () => {
    expect(directionsQuery('Sundays 10:30 a.m. at Elim Hall\n12 Main St\nCedar Rapids, IA')).toBe(
      'Elim Hall, 12 Main St, Cedar Rapids, IA'
    )
  })

  it('uses the address alone when no place is named', () => {
    expect(directionsQuery('2613 Ders Drive Northwest\nSwisher, IA 52338')).toBe(
      '2613 Ders Drive Northwest, Swisher, IA 52338'
    )
  })

  it('offers nothing when no line is an address', () => {
    expect(directionsQuery('Online only\nJoin us on YouTube')).toBeNull()
    expect(directionsQuery(undefined)).toBeNull()
  })
})

describe('directionsUrl', () => {
  it('is a maps search for the place', () => {
    expect(directionsUrl('The Midnight Gem, Swisher, IA')).toBe(
      'https://www.google.com/maps/search/?api=1&query=The%20Midnight%20Gem%2C%20Swisher%2C%20IA'
    )
  })
})
