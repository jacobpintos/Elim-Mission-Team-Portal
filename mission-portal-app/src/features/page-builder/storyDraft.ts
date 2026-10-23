import type {
  ButtonData,
  GalleryData,
  HeroData,
  ImageData,
  PageBlock,
  QuoteData,
  TextData,
} from '@/types/pages'
import { giveHandle } from './draftGiving'

/** A picture from a gallery, and where tapping it goes, if anywhere. */
export interface Cover {
  image: string
  url: string | null
  /** Where the link goes, as people know it: "theelimstore.com". */
  handle: string | null
}

/**
 * One section of the draft. Our Story is a story, so unlike Giving and Connect
 * the draft keeps the page's order and sets each part in the new design,
 * pairing only what plainly belongs together.
 */
export type StorySection =
  /** Paragraphs, with or without a heading. The first opens the story larger. */
  | { kind: 'text'; key: string; text: TextData; lede: boolean }
  /** A line pulled out of the story and set large. */
  | { kind: 'quote'; key: string; quote: QuoteData }
  /** A headed passage and the picture that follows it, side by side. */
  | { kind: 'feature'; key: string; text: TextData; image: ImageData }
  /** Headed passages in a row — people, on the live page — and a picture after them. */
  | { kind: 'group'; key: string; texts: TextData[]; image: ImageData | null }
  | { kind: 'image'; key: string; image: ImageData }
  /** A gallery, with the buttons either side of it. */
  | { kind: 'shelf'; key: string; heading: string | null; covers: Cover[]; actions: ButtonData[] }
  | { kind: 'action'; key: string; action: ButtonData }
  /** A kind the draft has no setting for, drawn as the page builder draws it. */
  | { kind: 'block'; key: string; block: PageBlock }

export interface StoryDraft {
  hero: HeroData | null
  sections: StorySection[]
}

const headed = (b: PageBlock | undefined): boolean =>
  b?.type === 'text' && !!(b.data as TextData).heading?.trim()

const picture = (b: PageBlock | undefined): ImageData | null =>
  b?.type === 'image' && (b.data as ImageData).src?.trim() ? (b.data as ImageData) : null

function covers(data: GalleryData): Cover[] {
  const links = data.links ?? []
  return (data.images ?? [])
    .map((image, i) => ({ image: (image ?? '').trim(), link: (links[i] ?? '').trim() }))
    .filter((c) => c.image)
    .map(({ image, link }) => ({
      image,
      url: link || null,
      handle: (link && giveHandle(link)) || null,
    }))
}

/**
 * The live Our Story page's blocks, as the draft's sections.
 *
 * Read-only and invented nowhere, as with Giving and Connect: every word,
 * photo and link is the page's own, and what the draft decides is the setting.
 *
 * In page order, with three pairings:
 * - Two or more headed passages in a row become one group, set side by side —
 *   on the live page, Pastor Ajai and Maureena — and a picture straight after
 *   them goes with them, since it is of them.
 * - A single headed passage with a picture straight after it becomes a
 *   feature, the two side by side: Sunny Singh and the album.
 * - Buttons straight before or after a gallery join it, so the excerpt from
 *   REVIVE ME sits with the book's cover.
 *
 * The first passage opens the story in a larger size. Dividers are dropped;
 * the draft's sections mark their own edges. A second hero, and any kind the
 * draft has no setting for, is drawn as the page builder draws it.
 */
export function composeStoryDraft(blocks: PageBlock[]): StoryDraft {
  const draft: StoryDraft = { hero: null, sections: [] }
  const out = draft.sections
  const key = (b: PageBlock) => String(b.id)

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    switch (block.type) {
      case 'hero':
        if (draft.hero) out.push({ kind: 'block', key: key(block), block })
        else draft.hero = block.data as HeroData
        break

      case 'text': {
        if (!headed(block)) {
          out.push({ kind: 'text', key: key(block), text: block.data as TextData, lede: false })
          break
        }
        let end = i
        while (headed(blocks[end + 1])) end++
        const run = blocks.slice(i, end + 1)
        const image = picture(blocks[end + 1])
        if (run.length > 1) {
          out.push({
            kind: 'group',
            key: key(block),
            texts: run.map((b) => b.data as TextData),
            image,
          })
        } else if (image) {
          out.push({ kind: 'feature', key: key(block), text: block.data as TextData, image })
        } else {
          out.push({ kind: 'text', key: key(block), text: block.data as TextData, lede: false })
        }
        i = image ? end + 1 : end
        break
      }

      case 'quote':
        if ((block.data as QuoteData).text?.trim()) {
          out.push({ kind: 'quote', key: key(block), quote: block.data as QuoteData })
        }
        break

      case 'image': {
        const image = picture(block)
        if (image) out.push({ kind: 'image', key: key(block), image })
        break
      }

      case 'gallery': {
        const data = block.data as GalleryData
        const shelf: Extract<StorySection, { kind: 'shelf' }> = {
          kind: 'shelf',
          key: key(block),
          heading: data.heading?.trim() || null,
          covers: covers(data),
          actions: [],
        }
        if (!shelf.covers.length) break
        // The buttons just before it, then the ones just after.
        while (out[out.length - 1]?.kind === 'action') {
          const before = out.pop() as Extract<StorySection, { kind: 'action' }>
          shelf.actions.unshift(before.action)
        }
        while (blocks[i + 1]?.type === 'button') {
          i++
          shelf.actions.push(blocks[i].data as ButtonData)
        }
        out.push(shelf)
        break
      }

      case 'button':
        if ((block.data as ButtonData).url?.trim()) {
          out.push({ kind: 'action', key: key(block), action: block.data as ButtonData })
        }
        break

      case 'divider':
        break

      default:
        out.push({ kind: 'block', key: key(block), block })
    }
  }

  const first = out[0]
  if (first?.kind === 'text') first.lede = true
  return draft
}

/** A passage's paragraphs, one to a line, as the page builder's text block splits them. */
export function paragraphs(content: string | undefined): string[] {
  return (content ?? '')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
}
