import { describe, it, expect } from 'vitest'
import { booksFromOurStory, defaultStore, moveItem, resolveStore } from './storeContent'
import type { PageBlock } from '@/types/pages'

const gallery = (images: string[], links: string[]): PageBlock =>
  ({ id: 1, type: 'gallery', data: { images, links, columns: 2 } }) as PageBlock

/** Our Story's covers gallery as seeded: the devotions, then three books. */
const ourStory: PageBlock[] = [
  { id: 0, type: 'text', data: { heading: 'Our Story' } } as PageBlock,
  gallery(
    [
      'https://cdn/devotions.png',
      'https://cdn/revive.jpg',
      'https://cdn/tent.png',
      'https://cdn/hand.png',
    ],
    [
      'https://www.facebook.com/pastorajai',
      'https://theelimstore.com/store/p/5x690q3j53y6iwsamiz4xtj7ds4w0m',
      'https://theelimstore.com/store/p/underground-tentmakers',
      'https://theelimstore.com/store/p/what-is-in-your-hand',
    ]
  ),
]

describe('booksFromOurStory', () => {
  it('takes the covers Our Story links into the store, as that page has them', () => {
    const books = booksFromOurStory(ourStory)
    expect(books.map((b) => b.image)).toEqual([
      'https://cdn/revive.jpg',
      'https://cdn/tent.png',
      'https://cdn/hand.png',
    ])
    expect(books.map((b) => b.title)).toEqual([
      'REVIVE ME',
      'The Underground Tentmakers',
      'What Is in Your Hand?',
    ])
  })

  it('leaves out a picture linked anywhere but the store', () => {
    expect(booksFromOurStory(ourStory).some((b) => b.url.includes('facebook'))).toBe(false)
  })

  it('names a book it does not know from its store address', () => {
    const books = booksFromOurStory([
      gallery(['https://cdn/new.jpg'], ['theelimstore.com/store/p/a-new-book']),
    ])
    expect(books[0].title).toBe('A New Book')
  })

  it('falls back to the seeded covers when Our Story has none', () => {
    expect(booksFromOurStory([]).map((b) => b.title)).toEqual([
      'REVIVE ME',
      'The Underground Tentmakers',
      'What Is in Your Hand?',
    ])
  })
})

describe('resolveStore', () => {
  it('shows the default, with Our Story’s covers, until something is saved', () => {
    const store = resolveStore(undefined, ourStory)
    expect(store.shelves.map((s) => s.id)).toEqual(['clothing', 'books'])
    expect(store.shelves[1].items[0].image).toBe('https://cdn/revive.jpg')
    expect(store.shelves[0].items).toHaveLength(6)
  })

  it('shows what an admin saved', () => {
    const saved = {
      ...defaultStore([]),
      tagline: 'New line',
      shelves: [{ id: 'clothing', title: 'Shirts', body: '', shape: 'square', items: [] }],
    }
    const store = resolveStore(saved, ourStory)
    expect(store.tagline).toBe('New line')
    expect(store.shelves.map((s) => s.title)).toEqual(['Shirts'])
  })

  it('fills a missing field rather than breaking, and drops an empty item', () => {
    const store = resolveStore(
      {
        shelves: [
          {
            id: 'c',
            items: [
              { id: 'a', title: 'Hat', image: '', url: '' },
              { id: 'b', title: ' ', image: '' },
              null,
            ],
          },
        ],
      },
      ourStory
    )
    expect(store.intro).toBe(defaultStore([]).intro)
    expect(store.shelves[0].shape).toBe('square')
    expect(store.shelves[0].items.map((i) => i.id)).toEqual(['a'])
  })
})

describe('moveItem', () => {
  it('swaps with a neighbour, and leaves the ends alone', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })
})
