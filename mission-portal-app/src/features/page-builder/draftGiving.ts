import { toExternalUrl } from '@/lib/externalUrl'
import type {
  ButtonData,
  HeroData,
  PageBlock,
  QuoteData,
  SocialData,
  TextData,
} from '@/types/pages'

/** One place to give: a Tithe.ly page, a Venmo account, a Cash App tag. */
export interface GiveWay {
  label: string
  url: string
  /** What the admin typed in the icon field, resolved later by resolveSocialIcon. */
  icon: string
  /** The account as people know it — `@name`, `$name` — or the site's own name. */
  handle: string
}

/** The Giving page, sorted into the parts the draft lays out. */
export interface GivingDraft {
  hero: HeroData | null
  waysHeading: string | null
  ways: GiveWay[]
  quote: QuoteData | null
  story: TextData[]
  actions: ButtonData[]
  /** Everything else, in page order, drawn by the ordinary block renderers. */
  rest: PageBlock[]
}

/**
 * The live Giving page's blocks, sorted into the draft's sections.
 *
 * Nothing is written and nothing is invented: every heading, line and link
 * comes from the page as an admin entered it, so the draft always shows the
 * real Giving page in the new design. What the draft changes is where things
 * sit and how they are set.
 *
 * The ways to give lead, straight under the hero. They are what someone opened
 * the page to find, and a reason to give reads better once you can see how.
 * They come from the page's social block — the row of Tithe.ly, Venmo and Cash
 * App marks — and, on a page with no such block, from its buttons instead, so
 * that a page built from buttons still gets cards.
 *
 * A block of a kind the draft has no section for is carried to the end and
 * drawn as it is today, and so is a second hero or quote: a draft that quietly
 * loses a block is worse than one that sets it plainly. Only dividers are
 * dropped, because the draft's sections already mark their own edges.
 */
export function composeGivingDraft(blocks: PageBlock[]): GivingDraft {
  const draft: GivingDraft = {
    hero: null,
    waysHeading: null,
    ways: [],
    quote: null,
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
      case 'social': {
        const data = block.data as SocialData
        draft.waysHeading ??= data.heading?.trim() || null
        for (const link of data.links ?? []) {
          if (!link.url?.trim()) continue
          draft.ways.push({
            label: link.label?.trim() || giveHandle(link.url),
            url: link.url.trim(),
            icon: link.icon ?? '',
            handle: giveHandle(link.url),
          })
        }
        break
      }
      case 'quote':
        if (draft.quote) draft.rest.push(block)
        else draft.quote = block.data as QuoteData
        break
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

  if (!draft.ways.length) {
    draft.ways = draft.actions
      .filter((b) => b.url?.trim())
      .map((b) => ({
        label: b.label?.trim() || giveHandle(b.url!),
        url: b.url!.trim(),
        icon: '',
        handle: giveHandle(b.url!),
      }))
    draft.actions = draft.actions.filter((b) => !b.url?.trim())
  }

  return draft
}

/**
 * How a giving link is known to the person giving: `@name` on Venmo, `$name`
 * on Cash App, `paypal.me/name`, and otherwise the site's name — `tithe.ly` —
 * so a card always says where it goes. Blank when the link is not an address.
 */
export function giveHandle(raw: string): string {
  const href = toExternalUrl(raw)
  if (!href) return ''
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return ''
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (host === 'venmo.com' || host === 'account.venmo.com') {
    const name = parts[0] === 'u' ? parts[1] : parts[0]
    if (name && !['code', 'pay', 'account'].includes(name)) return `@${name.replace(/^@/, '')}`
  }
  if ((host === 'cash.app' || host === 'cash.me') && parts[0]?.startsWith('$')) return parts[0]
  if (host === 'paypal.me' && parts[0]) return `paypal.me/${parts[0]}`
  if (host === 'paypal.com' && parts[0]?.toLowerCase() === 'paypalme' && parts[1]) {
    return `paypal.me/${parts[1]}`
  }
  return host
}
