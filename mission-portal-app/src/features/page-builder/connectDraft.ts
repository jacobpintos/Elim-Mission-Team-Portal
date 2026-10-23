import type {
  ButtonData,
  HeroData,
  MeetingData,
  PageBlock,
  QuoteData,
  SocialData,
  TextData,
  TwoColData,
} from '@/types/pages'
import { giveHandle, type GiveWay } from './draftGiving'

/** The Connect page, sorted into the parts the draft lays out. */
export interface ConnectDraft {
  hero: HeroData | null
  /** Who the church is, in a line: the page's first quote. */
  tagline: QuoteData | null
  /** When and where to come: the page's first two-column block. */
  visit: TwoColData | null
  /** The request-a-meeting form. */
  meeting: MeetingData | null
  /** The church's accounts elsewhere, from the page's social blocks. */
  links: GiveWay[]
  linksHeading: string | null
  story: TextData[]
  actions: ButtonData[]
  /** Everything else, in page order, drawn by the ordinary block renderers. */
  rest: PageBlock[]
}

/**
 * The live Connect page's blocks, sorted into the draft's sections.
 *
 * Read-only and invented nowhere, as composeGivingDraft is for Giving: every
 * word, photo and link is the page's own, and what the draft decides is the
 * order and the setting.
 *
 * The order is what someone opening Connect is there for. Who the church is
 * first, in its own line; then when and where to come, with a way to get
 * directions; then the people, and the form to ask to meet them, which is a
 * closing move rather than something to put in the middle.
 *
 * A second block of a kind the draft gives a section to is carried to the end
 * and drawn as it is today, as is a kind it has no section for. Only dividers
 * are dropped; the draft's sections mark their own edges.
 */
export function composeConnectDraft(blocks: PageBlock[]): ConnectDraft {
  const draft: ConnectDraft = {
    hero: null,
    tagline: null,
    visit: null,
    meeting: null,
    links: [],
    linksHeading: null,
    story: [],
    actions: [],
    rest: [],
  }

  for (const block of blocks) {
    switch (block.type) {
      case 'hero':
        if (draft.hero) draft.rest.push(block)
        else draft.hero = block.data as HeroData
        break
      case 'quote':
        if (draft.tagline) draft.rest.push(block)
        else draft.tagline = block.data as QuoteData
        break
      case 'twocol':
        if (draft.visit) draft.rest.push(block)
        else draft.visit = block.data as TwoColData
        break
      case 'meeting':
        if (draft.meeting) draft.rest.push(block)
        else draft.meeting = block.data as MeetingData
        break
      case 'social': {
        const data = block.data as SocialData
        draft.linksHeading ??= data.heading?.trim() || null
        for (const link of data.links ?? []) {
          if (!link.url?.trim()) continue
          draft.links.push({
            label: link.label?.trim() || giveHandle(link.url),
            url: link.url.trim(),
            icon: link.icon ?? '',
            handle: giveHandle(link.url),
          })
        }
        break
      }
      case 'text':
        draft.story.push(block.data as TextData)
        break
      case 'button':
        draft.actions.push(block.data as ButtonData)
        break
      case 'divider':
        break
      default:
        draft.rest.push(block)
    }
  }
  return draft
}

/** "10 AM at The Midnight Gem" → "The Midnight Gem"; anything else as it is. */
function placeIn(line: string): string {
  return line.replace(/^.*?\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\s+at\s+/i, '').trim()
}

/**
 * Where a map should take someone, from the visit block's own lines.
 *
 * The address is the first line that starts with a street number, with the
 * lines after it (town, state, zip); the place's name comes along when a line
 * before it says where — "10 AM at The Midnight Gem" — because a venue's name
 * finds the right door more often than a street number on its own. Null when
 * no line looks like an address, so no directions button promises a place it
 * cannot find.
 */
export function directionsQuery(content: string | undefined): string | null {
  const lines = (content ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  // A number that is a time — "10 AM at …" — is not a street number.
  const isTime = (l: string) => /^\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)(?=\s|$)/i.test(l)
  const street = lines.findIndex((l) => /^\d+\s+\S/.test(l) && !isTime(l))
  if (street === -1) return null
  const venue = lines
    .slice(0, street)
    .map(placeIn)
    .find((l) => l && !/^\d/.test(l))
  return [venue, ...lines.slice(street)].filter(Boolean).join(', ')
}

/** A maps address that opens the map app on a phone and Google Maps in a browser. */
export function directionsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
