import type { GalleryData, PageBlock } from '@/types/pages'

/**
 * The Elim Store tab's content, as admins edit it.
 *
 * Kept in config/main under `elimStore`, beside the public pages it sits with:
 * readable by every signed-in account, writable by admins, which is already
 * what that document's rules say. Until an admin first saves it, the tab shows
 * DEFAULT_STORE — the featured clothing and Pastor Ajai's books.
 */
export interface StoreContent {
  /** The store's own line about itself. */
  tagline: string
  /** Why it is here: buying from it supports the mission. */
  intro: string
  shelves: StoreShelf[]
}

export interface StoreShelf {
  id: string
  title: string
  body: string
  /** How a photo is cropped: square for clothing, a book's proportions for covers. */
  shape: 'square' | 'portrait'
  items: StoreItem[]
}

export interface StoreItem {
  id: string
  title: string
  /**
   * The photo: an address, or `bundled:<name>` for one of the photos shipped
   * in assets/store — the featured clothing, before anyone has replaced it.
   */
  image: string
  /** Where tapping it goes, normally the item's page in the store. */
  url: string
}

export const ELIM_STORE_URL = 'https://theelimstore.com'
/** The store's listing, where an item whose own page is not known goes. */
export const ELIM_STORE_LISTING = `${ELIM_STORE_URL}/store`

/**
 * The books as the Our Story seed gave them (functions/scripts/seedOurStory.js).
 *
 * Only used when the live Our Story page has no store covers to take: the
 * books shelf follows that page, so whatever covers it shows, this one does.
 */
const SEED_BOOKS: StoreItem[] = [
  {
    id: 'book-revive-me',
    title: 'REVIVE ME',
    image:
      'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/8fcc0deb-e899-4a67-99fb-081b41b4eda7/REVIVEME-Bookcover-FRONT.jpg',
    url: `${ELIM_STORE_URL}/store/p/5x690q3j53y6iwsamiz4xtj7ds4w0m`,
  },
  {
    id: 'book-underground-tentmakers',
    title: 'The Underground Tentmakers',
    image:
      'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/e91c1abb-6e36-4994-a7a4-1be69faea869/Screenshot+2025-06-29+at+1.05.10%E2%80%AFAM.png',
    url: `${ELIM_STORE_URL}/store/p/underground-tentmakers`,
  },
  {
    id: 'book-what-is-in-your-hand',
    title: 'What Is in Your Hand?',
    image:
      'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/5c4190bb-1d1b-44a2-a3e8-ef0df0f770c7/Screenshot+2025-06-29+at+1.06.34%E2%80%AFAM.png?format=500w',
    url: `${ELIM_STORE_URL}/store/p/what-is-in-your-hand`,
  },
]

/** A book's name by its page in the store; the cover alone does not carry it. */
const BOOK_TITLES: Record<string, string> = Object.fromEntries(
  SEED_BOOKS.map((b) => [productSlug(b.url) ?? '', b.title])
)

/** The featured clothing, with the store's own product photos (assets/store). */
const DEFAULT_CLOTHING: StoreItem[] = [
  ['god-is-able-tee', 'God Is Able T-Shirt'],
  ['john-1-5-lightbulb-tee', 'John 1:5 Lightbulb T-Shirt'],
  ['i-belong-to-jesus-longsleeve', 'I Belong to Jesus Long-Sleeve T-Shirt'],
  ['god-is-able-hat', '“God Is Able” Tan Hat'],
  ['yeshua-tee', 'Yeshua T-Shirt'],
  ['i-am-gods-idea-tee', 'I Am God’s Idea T-Shirt'],
].map(([name, title]) => ({
  id: `clothing-${name}`,
  title,
  image: `bundled:${name}`,
  url: ELIM_STORE_LISTING,
}))

export const DEFAULT_TEXT = {
  tagline: 'Handmade products pointing our generation to Jesus.',
  intro: 'Purchasing clothing and books from the Elim merch store supports the mission.',
  clothingTitle: 'Handmade clothing',
  clothingBody:
    'Made by hand by members of the Elim team. Each piece is a great way to carry the spirit of revival with you into any room.',
  booksTitle: 'Books by Pastor Ajai',
  booksBody: 'The books Pastor Ajai has written, the same ones featured on Our Story.',
}

/** The store as it stands before an admin has saved anything, with the given books. */
export function defaultStore(books: StoreItem[]): StoreContent {
  return {
    tagline: DEFAULT_TEXT.tagline,
    intro: DEFAULT_TEXT.intro,
    shelves: [
      {
        id: 'clothing',
        title: DEFAULT_TEXT.clothingTitle,
        body: DEFAULT_TEXT.clothingBody,
        shape: 'square',
        items: DEFAULT_CLOTHING,
      },
      {
        id: 'books',
        title: DEFAULT_TEXT.booksTitle,
        body: DEFAULT_TEXT.booksBody,
        shape: 'portrait',
        items: books,
      },
    ],
  }
}

/** The last part of a store product address — `/store/p/<slug>` — or null. */
function productSlug(url: string): string | null {
  return url.match(/\/p\/([^/?#]+)/)?.[1] ?? null
}

function isStoreLink(url: string): boolean {
  try {
    const host = new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname
    return host === 'theelimstore.com' || host.endsWith('.theelimstore.com')
  } catch {
    return false
  }
}

/** "what-is-in-your-hand" → "What Is In Your Hand", for a book this file has no title for. */
function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * The book covers on the live Our Story page.
 *
 * That page's galleries show Pastor Ajai's books as covers linked to their
 * pages in the store; any picture there linked into theelimstore.com is taken,
 * with its cover and link exactly as Our Story has them. A picture linked
 * anywhere else — the devotions, which go to Facebook — is not a book in the
 * store and is left out.
 *
 * Falls back to the covers the page was seeded with when it has none.
 */
export function booksFromOurStory(blocks: PageBlock[] | undefined): StoreItem[] {
  const found: StoreItem[] = []
  for (const block of blocks ?? []) {
    if (block.type !== 'gallery') continue
    const data = block.data as GalleryData
    const images = data.images ?? []
    const links = data.links ?? []
    images.forEach((image, i) => {
      const url = (links[i] ?? '').trim()
      if (!image || !url || !isStoreLink(url)) return
      const slug = productSlug(url)
      found.push({
        id: `book-${slug ?? i}`,
        title: (slug && BOOK_TITLES[slug]) || (slug ? titleFromSlug(slug) : 'Book'),
        image,
        url,
      })
    })
  }
  return found.length ? found : SEED_BOOKS
}

const text = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback)

/**
 * What the tab shows: the saved store, made safe to draw, or the default.
 *
 * Saved content is read defensively — it is a map in a document anyone with
 * the admin role can write to from any version of the app — so a missing
 * field takes its default rather than breaking the page, and an item with no
 * photo and no title is dropped rather than drawn as an empty tile.
 */
export function resolveStore(saved: unknown, ourStory: PageBlock[] | undefined): StoreContent {
  const books = booksFromOurStory(ourStory)
  const fallback = defaultStore(books)
  if (!saved || typeof saved !== 'object') return fallback
  const s = saved as Record<string, unknown>
  if (!Array.isArray(s.shelves)) return fallback

  return {
    tagline: text(s.tagline, fallback.tagline),
    intro: text(s.intro, fallback.intro),
    shelves: s.shelves
      .filter((sh): sh is Record<string, unknown> => !!sh && typeof sh === 'object')
      .map((sh, i) => ({
        id: text(sh.id, `shelf-${i}`),
        title: text(sh.title, ''),
        body: text(sh.body, ''),
        shape: sh.shape === 'portrait' ? 'portrait' : 'square',
        items: (Array.isArray(sh.items) ? sh.items : [])
          .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
          .map((it, j) => ({
            id: text(it.id, `item-${i}-${j}`),
            title: text(it.title, '').trim(),
            image: text(it.image, '').trim(),
            url: text(it.url, '').trim(),
          }))
          .filter((it) => it.title || it.image),
      })),
  }
}

/** A fresh id for an item an admin adds; stable keys for the editor's rows. */
export function newItemId(now: number = Date.now()): string {
  return `item-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** Move an item one place up or down within its shelf, leaving the rest in order. */
export function moveItem<T>(items: T[], index: number, by: -1 | 1): T[] {
  const to = index + by
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items
  const next = [...items]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}
