import type { PageBlock } from '@/types/pages'

/**
 * A rearrangement of the Connect page, built from the page itself.
 *
 * The content is not invented here and not copied out by hand: the blocks are
 * read from the live Connect page and re-emitted in a different order, so the
 * photographs, the address and the wording stay exactly as they were entered.
 * Anything this does not recognise is carried through to the end rather than
 * dropped, because a draft that quietly loses a block is worse than one that
 * orders it oddly.
 *
 * What changes is the order and two hero settings:
 *
 * The tagline moves up under the hero. It says who the church is, and that
 * belongs before the practicalities rather than buried between the venue photo
 * and a form.
 *
 * Service times and address follow, because that is what a visitor came for.
 *
 * Leadership and the meeting form go last, where someone has read enough to
 * want them. A form is a closing move.
 *
 * The hero is forced back to white text over a dark scrim. Those are already
 * the defaults in HeroBlock; the live page overrides them to orange over an
 * unshaded photograph of a bright room, which is why its heading is hard to
 * read at all.
 */

/** Blocks whose order this composer decides. Anything else is appended. */
const ARRANGED = ['hero', 'quote', 'twocol', 'meeting'] as const

const first = (blocks: PageBlock[], type: string) => blocks.find((b) => b.type === type)

export function composeDraftConnect(source: PageBlock[], now: number = Date.now()): PageBlock[] {
  const hero = first(source, 'hero')
  const quote = first(source, 'quote')
  const twocol = first(source, 'twocol')
  const meeting = first(source, 'meeting')

  // Everything the order above does not name, and any second copy of a type it
  // does, kept in the order it was found.
  const claimed = new Set([hero?.id, quote?.id, twocol?.id, meeting?.id].filter((id) => id != null))
  const rest = source.filter(
    (b) => !claimed.has(b.id) && (ARRANGED as readonly string[]).includes(b.type) === false
  )
  const extraOfArrangedTypes = source.filter(
    (b) => !claimed.has(b.id) && (ARRANGED as readonly string[]).includes(b.type)
  )

  const out: PageBlock[] = []
  // Ids must be unique and are Date.now() at creation elsewhere, so they are
  // spaced by index here rather than all sharing one millisecond.
  let n = 0
  const push = (block: PageBlock | undefined, data?: Record<string, unknown>) => {
    if (!block) return
    out.push({ id: now + n++, type: block.type, data: data ?? block.data })
  }

  push(
    hero,
    hero ? { ...hero.data, textColor: '#ffffff', overlayColor: 'rgba(0,0,0,0.55)' } : undefined
  )
  push(quote)
  push(twocol)
  if (meeting) {
    out.push({ id: now + n++, type: 'divider', data: {} })
    push(meeting, {
      ...meeting.data,
      // Only supplied when the page has none, so a wording already chosen is
      // never overwritten by this.
      intro:
        typeof meeting.data.intro === 'string' && meeting.data.intro.trim()
          ? meeting.data.intro
          : 'We would love to meet you. Reach out to any of us and we will find a time.',
    })
  }
  for (const b of [...extraOfArrangedTypes, ...rest]) push(b)

  return out
}
