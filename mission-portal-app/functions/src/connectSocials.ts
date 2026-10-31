import * as admin from 'firebase-admin'

/**
 * The church's accounts elsewhere, put on the Connect page once — as two of
 * its social blocks (config/main → publicPages.connect), which the page
 * draws as groups of cards with photos (src/features/page-builder
 * ConnectDesign) and admins change from then on in its page builder, as any
 * of its blocks. Run by the deploy (scripts/settleAll); done once, so links
 * an admin later takes away are not put back.
 */

/** Done, once: kept where no app reads or writes (firestore.rules: no match). */
const DONE = 'migrations/connectSocials'

/** Photos the church's own site gives, as Our Story uses them (functions/scripts/seedOurStory.js). */
const REVIVED =
  'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/2660fa02-2b4d-42fa-bd34-b5ed1133f954/albumidea%3F%3F.png'
const PASTOR_AJAI =
  'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/edd67c51-5829-44e7-b5a1-7deb5d2afc6e/43DF14B3-F2C7-45B2-828E-D736E6FE41C5_1_102_o.png'

interface Link {
  /** The photo, in the icon field the page builder keeps it in. */
  icon: string
  label: string
  url: string
}

/** The two groups: The Elim Arrival's, Elim Worship among them; and The Well's. */
export function socialGroups(wellPhoto: string): { heading: string; links: Link[] }[] {
  return [
    {
      heading: 'The Elim Arrival',
      links: [
        {
          icon: REVIVED,
          label: 'The Elim Arrival',
          url: 'https://www.facebook.com/share/1EE9JBSnjC/',
        },
        { icon: REVIVED, label: 'The Elim Arrival', url: 'https://instagram.com/theelimarrival' },
        { icon: REVIVED, label: 'Elim Worship', url: 'https://youtube.com/theelimarrival' },
        { icon: REVIVED, label: 'The Elim Arrival', url: 'https://www.tiktok.com/@theelimarrival' },
        {
          icon: REVIVED,
          label: 'The Elim Arrival',
          url: 'https://open.spotify.com/artist/74NwZtFiGepA1K5JEjZQKl',
        },
        {
          icon: REVIVED,
          label: 'The Elim Arrival',
          url: 'https://music.apple.com/us/artist/the-elim-arrival/882846091',
        },
      ],
    },
    {
      heading: 'The Well of Iowa',
      links: [
        {
          icon: PASTOR_AJAI,
          label: 'Pastor Ajai',
          url: 'https://www.facebook.com/share/1eJyALWLRV/',
        },
        {
          icon: wellPhoto,
          label: 'The Well of Iowa',
          url: 'https://www.facebook.com/share/19vFDEktyU/',
        },
      ],
    },
  ]
}

/** A link as compared: "instagram.com/theelimarrival", whatever its scheme, www or query. */
export const sameLink = (url: string) =>
  url
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')

type Block = { id: number; type: string; data?: Record<string, unknown> }

/**
 * The groups added to the Connect page, after its other blocks — but none of
 * a link it has already. Nothing, once done. What was added, for the log.
 */
export async function addConnectSocials(db: admin.firestore.Firestore): Promise<string> {
  const done = db.doc(DONE)
  const ref = db.doc('config/main')
  return db.runTransaction(async (tx) => {
    const [mark, config] = await Promise.all([tx.get(done), tx.get(ref)])
    if (mark.exists) return 'already on the Connect page'
    if (!config.exists) return 'no config/main: nothing added'
    const page = (config.data()?.publicPages?.connect ?? null) as { blocks?: Block[] } | null
    const blocks = Array.isArray(page?.blocks) ? page.blocks : []
    const have = new Set(
      blocks
        .filter((b) => b.type === 'social')
        .flatMap((b) =>
          ((b.data?.links as Link[] | undefined) ?? []).map((l) => sameLink(l.url ?? ''))
        )
    )
    // The Well's own photo: where the page shows where it meets, or its header's.
    const visit = blocks.find((b) => b.type === 'twocol')?.data?.rightImage
    const hero = blocks.find((b) => b.type === 'hero')?.data?.bgImage
    const wellPhoto =
      typeof visit === 'string' && visit ? visit : typeof hero === 'string' ? hero : ''
    const at = Date.now()
    const added = socialGroups(wellPhoto)
      .map((g) => ({ ...g, links: g.links.filter((l) => !have.has(sameLink(l.url))) }))
      .filter((g) => g.links.length)
      .map((g, i) => ({ id: at + i, type: 'social', data: { heading: g.heading, links: g.links } }))
    if (page) {
      tx.update(ref, { 'publicPages.connect.blocks': [...blocks, ...added] })
    } else {
      tx.update(ref, {
        'publicPages.connect': { blocks: added, bgImage: null, bgParallax: false },
      })
    }
    tx.set(done, { at, added: added.map((b) => b.data.heading) })
    const links = added.reduce((n, b) => n + b.data.links.length, 0)
    return `added ${links} links in ${added.length} groups`
  })
}
