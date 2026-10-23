import { describe, it, expect } from 'vitest'
import { composeStory, paragraphs } from './storyLayout'
import type { PageBlock } from '@/types/pages'

const block = (id: number, type: string, data: Record<string, unknown> = {}): PageBlock =>
  ({ id, type, data }) as PageBlock

/** Our Story as functions/scripts/seedOurStory.js lays it out. */
const live: PageBlock[] = [
  block(1, 'hero', {
    heading: 'A missionary journey from the Middle East to the Midwest.',
    bgImage: 'https://example.com/couple.png',
  }),
  block(2, 'text', { heading: 'Our Story', content: 'Born in North India.\n\nIn 2004 they came.' }),
  block(3, 'quote', {
    text: 'Their greatest hope and desire is to see America come alive for Jesus.',
  }),
  block(4, 'text', { content: 'Both have given up their lives.' }),
  block(5, 'text', { heading: 'Pastor Ajai', content: 'Pastor Ajai holds an MDIV.' }),
  block(6, 'text', { heading: 'Maureena', content: 'Maureena has been a nurse.' }),
  block(7, 'image', { src: 'https://example.com/couple-colour.png', align: 'center' }),
  block(8, 'button', {
    label: 'Read excerpt from REVIVE ME',
    url: 'https://dropbox.com/excerpt.pdf',
  }),
  block(9, 'gallery', {
    images: ['https://example.com/devotions.png', 'https://example.com/revive-me.jpg'],
    links: ['https://www.facebook.com/pastorajai', 'https://theelimstore.com/store/p/revive-me'],
    columns: 2,
  }),
  block(10, 'text', { heading: 'Sunny Singh', content: 'Sunny Singh was also born in India.' }),
  block(11, 'image', { src: 'https://example.com/revived.png' }),
]

describe('composeStory', () => {
  it('lays the live page out in its own order', () => {
    const d = composeStory(live)
    expect(d.hero?.heading).toBe('A missionary journey from the Middle East to the Midwest.')
    expect(d.sections.map((s) => s.kind)).toEqual([
      'text',
      'quote',
      'text',
      'group',
      'shelf',
      'feature',
    ])
  })

  it('opens with the first passage set larger, and only that one', () => {
    const d = composeStory(live)
    const texts = d.sections.filter((s) => s.kind === 'text')
    expect(texts.map((s) => s.lede)).toEqual([true, false])
  })

  it('sets the people side by side, with their photo', () => {
    const group = composeStory(live).sections.find((s) => s.kind === 'group')
    expect(group?.kind === 'group' && group.texts.map((t) => t.heading)).toEqual([
      'Pastor Ajai',
      'Maureena',
    ])
    expect(group?.kind === 'group' && group.image?.src).toBe(
      'https://example.com/couple-colour.png'
    )
  })

  it('puts the excerpt with the covers, and says where each cover goes', () => {
    const shelf = composeStory(live).sections.find((s) => s.kind === 'shelf')
    if (shelf?.kind !== 'shelf') throw new Error('no shelf')
    expect(shelf.actions.map((a) => a.label)).toEqual(['Read excerpt from REVIVE ME'])
    expect(shelf.covers.map((c) => c.handle)).toEqual(['facebook.com', 'theelimstore.com'])
  })

  it('pairs a single passage with the picture after it', () => {
    const feature = composeStory(live).sections.at(-1)
    expect(feature?.kind === 'feature' && [feature.text.heading, feature.image.src]).toEqual([
      'Sunny Singh',
      'https://example.com/revived.png',
    ])
  })

  it('leaves a passage alone when no picture follows, and a picture alone when no passage leads', () => {
    const d = composeStory([
      block(1, 'text', { heading: 'Alone' }),
      block(2, 'quote', { text: 'Between' }),
      block(3, 'image', { src: 'https://example.com/a.png' }),
    ])
    expect(d.sections.map((s) => s.kind)).toEqual(['text', 'quote', 'image'])
  })

  it('takes buttons after a gallery too, and keeps a button away from one as its own', () => {
    const d = composeStory([
      block(1, 'button', { label: 'Alone', url: 'https://example.com/alone' }),
      block(2, 'quote', { text: 'Between' }),
      block(3, 'gallery', { images: ['https://example.com/a.png'] }),
      block(4, 'button', { label: 'After', url: 'https://example.com/after' }),
    ])
    expect(d.sections.map((s) => s.kind)).toEqual(['action', 'quote', 'shelf'])
    const shelf = d.sections[2]
    expect(shelf.kind === 'shelf' && shelf.actions.map((a) => a.label)).toEqual(['After'])
    expect(shelf.kind === 'shelf' && shelf.covers[0]).toEqual({
      image: 'https://example.com/a.png',
      url: null,
      handle: null,
    })
  })

  it('drops what has nothing to show, and keeps what it has no setting for', () => {
    const d = composeStory([
      block(1, 'divider'),
      block(2, 'image', { src: '  ' }),
      block(3, 'gallery', { images: [] }),
      block(4, 'quote', { text: '' }),
      block(5, 'button', { label: 'No link' }),
      block(6, 'timeline', { entries: [] }),
      block(7, 'hero', { heading: 'Second hero' }),
    ])
    expect(d.hero?.heading).toBe('Second hero')
    expect(d.sections.map((s) => s.kind === 'block' && s.block.id)).toEqual([6])
  })

  it('draws a second hero as a block rather than replacing the first', () => {
    const d = composeStory([
      block(1, 'hero', { heading: 'First' }),
      block(2, 'hero', { heading: 'Second' }),
    ])
    expect(d.hero?.heading).toBe('First')
    expect(d.sections.map((s) => s.kind)).toEqual(['block'])
  })
})

describe('paragraphs', () => {
  it('splits on lines and drops the blank ones, as the text block does', () => {
    expect(paragraphs('One.\n\nTwo.\n  \nThree.')).toEqual(['One.', 'Two.', 'Three.'])
    expect(paragraphs(undefined)).toEqual([])
  })
})
