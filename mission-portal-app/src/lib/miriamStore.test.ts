import { describe, it, expect } from 'vitest'
import { saleEndSaid, storeAsked, storeReply } from './miriamStore'
import { defaultStore } from '@/features/store/storeContent'
import type { StoreSale } from '@/features/store/storeSale'

const store = defaultStore([
  {
    id: 'book-revive-me',
    title: 'REVIVE ME',
    image: 'https://example.com/r.jpg',
    url: 'https://theelimstore.com/store/p/r',
  },
])
// Friday, October 23rd 2026, at noon.
const now = new Date(2026, 9, 23, 12)
const sale: StoreSale = {
  id: 's1',
  message: 'Half off every hat.',
  endsOn: '2026-11-01',
  endsAt: new Date(2026, 10, 1, 23, 59).getTime(),
  createdAt: now.getTime(),
}

describe('storeAsked', () => {
  it('reads the questions as they were asked', () => {
    expect(storeAsked('what’s for sale at the elim store')).toBe('browse')
    expect(storeAsked('what is the elim store')).toBe('about')
    expect(storeAsked('is anything on sale for the elim store')).toBe('sale')
  })

  it('tells a sale from things for sale', () => {
    expect(storeAsked('Is there a sale at the Elim Store?')).toBe('sale')
    expect(storeAsked('Are there any deals on merch right now?')).toBe('sale')
    expect(storeAsked('What’s on sale at theelimstore.com?')).toBe('sale')
    expect(storeAsked('What can I buy from the Elim Store?')).toBe('browse')
    expect(storeAsked('What does the merch store sell?')).toBe('browse')
    expect(storeAsked('Does the Elim Store have hoodies?')).toBe('browse')
    expect(storeAsked('Hey Miriam, can you tell me what’s in the Elim Store?')).toBe('browse')
    expect(storeAsked('Show me what’s for sale at the Elim Store')).toBe('browse')
  })

  it('reads what it is, however it is put', () => {
    expect(storeAsked('What’s the Elim Store?')).toBe('about')
    expect(storeAsked('Tell me about the Elim Store')).toBe('about')
    expect(storeAsked('Could you tell me what the Elim Store is?')).toBe('about')
  })

  it('leaves opening it to the screens, and anything not about it alone', () => {
    expect(storeAsked('Open the Elim Store')).toBeNull()
    expect(storeAsked('Show me the merch')).toBeNull()
    expect(storeAsked('What’s on sale at Costco?')).toBeNull()
    expect(storeAsked('Is the store open on Sunday?')).toBeNull()
    expect(storeAsked('What is Revive Me about?')).toBeNull()
  })
})

describe('storeReply', () => {
  it('says plainly when nothing is on sale, and stays put', () => {
    expect(storeReply('sale', store, null, now)).toEqual({
      text: 'There’s no sale at the Elim Store right now.',
      open: false,
    })
  })

  it('gives the sale and its last day, and opens the store to see it', () => {
    expect(storeReply('sale', store, sale, now)).toEqual({
      text: 'Yes — Half off every hat, until Sunday, November 1st. Here’s the store.',
      open: true,
    })
  })

  it('opens the store with what it carries, and the sale or none', () => {
    expect(storeReply('browse', store, null, now)).toEqual({
      text: 'Here’s the Elim Store, with handmade clothing and books by Pastor Ajai. There’s no sale on right now.',
      open: true,
    })
    expect(storeReply('browse', store, sale, now).text).toBe(
      'Here’s the Elim Store, with handmade clothing and books by Pastor Ajai. There’s a sale on: Half off every hat, until Sunday, November 1st.'
    )
  })

  it('leaves out a shelf with nothing on it', () => {
    const books = {
      ...store,
      shelves: store.shelves.map((s) => (s.id === 'books' ? { ...s, items: [] } : s)),
    }
    expect(storeReply('browse', books, null, now).text).toMatch(
      /^Here’s the Elim Store, with handmade clothing\./
    )
  })

  it('says what it is in its own words', () => {
    expect(storeReply('about', store, null, now)).toEqual({
      text:
        'The Elim Store is the mission’s merch store. Handmade products pointing our generation to Jesus. ' +
        'Purchasing clothing and books from the Elim merch store supports the mission. Here it is.',
      open: true,
    })
  })
})

describe('saleEndSaid', () => {
  it('says the day as it is heard', () => {
    expect(saleEndSaid('2026-10-23', now)).toBe('today')
    expect(saleEndSaid('2026-10-24', now)).toBe('tomorrow')
    expect(saleEndSaid('2026-11-02', now)).toBe('Monday, November 2nd')
    expect(saleEndSaid('2026-11-13', now)).toBe('Friday, November 13th')
    expect(saleEndSaid('2027-01-03', now)).toBe('Sunday, January 3rd, 2027')
  })
})
