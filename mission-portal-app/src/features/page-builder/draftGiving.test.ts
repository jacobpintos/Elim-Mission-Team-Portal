import { describe, it, expect } from 'vitest'
import { composeGivingDraft, giveHandle } from './draftGiving'
import type { PageBlock } from '@/types/pages'

const block = (id: number, type: string, data: Record<string, unknown> = {}): PageBlock =>
  ({ id, type, data }) as PageBlock

const giving: PageBlock[] = [
  block(1, 'hero', { heading: 'Giving', subheading: 'Partner with us' }),
  block(2, 'text', { heading: 'Why we give', content: 'Because He gave first.' }),
  block(3, 'divider'),
  block(4, 'social', {
    heading: 'Give online',
    links: [
      { icon: 'Tithely', label: 'Tithe.ly', url: 'https://tithe.ly/give?c=123' },
      { icon: '', label: 'Venmo', url: 'venmo.com/u/Some-Church' },
      { icon: '', label: 'Cash App', url: 'https://cash.app/$SomeChurch' },
      { icon: '', label: 'Blank', url: '  ' },
    ],
  }),
  block(5, 'image', { src: 'https://example.com/a.jpg' }),
]

describe('composeGivingDraft', () => {
  it('sorts the page into its sections', () => {
    const d = composeGivingDraft(giving)
    expect(d.hero?.heading).toBe('Giving')
    expect(d.story.map((t) => t.heading)).toEqual(['Why we give'])
    expect(d.waysHeading).toBe('Give online')
    expect(d.rest.map((b) => b.id)).toEqual([5])
  })

  it('makes a way to give of each link, with the account people know it by', () => {
    const d = composeGivingDraft(giving)
    expect(d.ways.map((w) => [w.label, w.handle])).toEqual([
      ['Tithe.ly', 'tithe.ly'],
      ['Venmo', '@Some-Church'],
      ['Cash App', '$SomeChurch'],
    ])
  })

  it('drops dividers and nothing else', () => {
    const d = composeGivingDraft(giving)
    const kept = [d.hero, ...d.story, ...d.rest].length + (d.ways.length ? 1 : 0)
    expect(kept).toBe(giving.length - 1)
  })

  it('keeps a second hero or quote rather than losing it', () => {
    const d = composeGivingDraft([
      block(1, 'hero', { heading: 'One' }),
      block(2, 'hero', { heading: 'Two' }),
      block(3, 'quote', { text: 'A' }),
      block(4, 'quote', { text: 'B' }),
    ])
    expect(d.hero?.heading).toBe('One')
    expect(d.quote?.text).toBe('A')
    expect(d.rest.map((b) => b.id)).toEqual([2, 4])
  })

  it('turns buttons into ways to give on a page with no giving links', () => {
    const d = composeGivingDraft([
      block(1, 'button', { label: 'Give with Tithe.ly', url: 'https://tithe.ly/give' }),
      block(2, 'button', { label: 'Nowhere' }),
    ])
    expect(d.ways.map((w) => w.label)).toEqual(['Give with Tithe.ly'])
    expect(d.actions.map((a) => a.label)).toEqual(['Nowhere'])
  })

  it('leaves buttons as buttons beside giving links', () => {
    const d = composeGivingDraft([
      ...giving,
      block(9, 'button', { label: 'Mail a check', url: 'x.com' }),
    ])
    expect(d.actions.map((a) => a.label)).toEqual(['Mail a check'])
    expect(d.ways).toHaveLength(3)
  })
})

describe('giveHandle', () => {
  it('reads Venmo, Cash App and PayPal accounts', () => {
    expect(giveHandle('https://venmo.com/u/church')).toBe('@church')
    expect(giveHandle('https://account.venmo.com/u/church')).toBe('@church')
    expect(giveHandle('venmo.com/church')).toBe('@church')
    expect(giveHandle('https://cash.app/$church')).toBe('$church')
    expect(giveHandle('https://paypal.me/church')).toBe('paypal.me/church')
    expect(giveHandle('https://www.paypal.com/paypalme/church')).toBe('paypal.me/church')
  })

  it("falls back to the site's name", () => {
    expect(giveHandle('https://tithe.ly/give?c=1')).toBe('tithe.ly')
    expect(giveHandle('https://www.givebutter.com/x')).toBe('givebutter.com')
    expect(giveHandle('https://venmo.com/code')).toBe('venmo.com')
  })

  it('is blank for what is not an address', () => {
    expect(giveHandle('')).toBe('')
    expect(giveHandle('https://')).toBe('')
  })
})
