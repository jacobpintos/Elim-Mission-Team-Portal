import { CHURCH_SITE } from './site'

/**
 * Two names, and where they come from, as the church gave them to Miriam:
 *
 *  - Elim, the name The Well's missions carry: in the church's own words
 *    (thewellofiowa.com, "Where does the phrase 'THE ELIM ARRIVAL' come
 *    from?"), with the page to read it on.
 *  - Miriam, her own: Exodus 15:20–21, where Miriam leads Israel's women in
 *    worship for their deliverance from Egypt, a few verses before they come
 *    to Elim — tied to the heart of worship the website speaks of: an
 *    arrival at the rest found in Jesus.
 *
 * An answer an admin teaches her to the same question is said instead
 * (./index, ./faith: taught first).
 */

/** "Where does the name Elim come from?", in the website's words. */
export const ELIM_ANSWER =
  'Elim means “a place of rest.” It comes from Exodus 15:26–27: after God brought Israel through the Red Sea, they came to Elim, an oasis with 12 wells and 70 palm trees, and camped there by the waters. The Well pronounces it like “LM.” They believe that place of rest is still just around the corner — and that it has a name, Jesus, who said, “Come to me, all you who are weary and heavy laden, and I will give you rest” (Matthew 11:28).'

/** "Why are you called Miriam?", as the church asked her to tell it. */
export const MIRIAM_ANSWER =
  'I’m named after Miriam in Exodus 15:20–21. When God delivered Israel from Egypt and brought them through the Red Sea, Miriam the prophetess took up a tambourine and led the women of Israel in worship: “Sing to the Lord, for he has triumphed gloriously.” Just a few verses later, Israel came to Elim — the place of rest. That’s the heart of worship at The Well: they pray that everything they do would lead to an arrival at the rest found in the name and presence of Jesus. Like Miriam, I’m here to help point the way there.'

/** Said plainly, for matching: lowercase, plain apostrophes, no punctuation. */
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Where the name Elim comes from, what it means, how it is said — not where Elim's church is, or when. */
export function elimAsked(text: string): boolean {
  const s = plain(text)
  if (!/\belim\b/.test(s)) return false
  if (/\b(?:where is|where's|address|directions|what time|when is|when's|when does)\b/.test(s))
    return false
  return (
    /\b(?:mean|means|meaning|come from|comes from|came from|stand for|stands for|origin|pronounce|pronounced)\b/.test(
      s
    ) ||
    /\bwhy\b.*\b(?:called|named|name)\b/.test(s) ||
    /\b(?:what|who) (?:is|was|are) (?:an? |the )?elim(?: arrival)?$/.test(s) ||
    /\bwhat's (?:an? |the )?elim(?: arrival)?$/.test(s) ||
    /\b(?:name|word|phrase) (?:the )?elim\b/.test(s) ||
    /\b(?:tell me|explain) about (?:the )?(?:name )?elim\b/.test(s)
  )
}

/** Where her own name comes from: "why are you called Miriam?", "who was Miriam in the Bible?" */
export function miriamNameAsked(text: string): boolean {
  const s = plain(text)
  return (
    /\bwhy (?:are|were) you (?:called|named)\b/.test(s) ||
    /\bwho (?:are|were) you named (?:after|for)\b/.test(s) ||
    /\b(?:your|ur) name\b.*\b(?:mean|means|meaning|come from|comes from|came from|after|origin|why)\b/.test(
      s
    ) ||
    /\b(?:where|why|how) (?:does|did|do) (?:you get )?your name\b/.test(s) ||
    /\bwhy (?:is|was) your name\b/.test(s) ||
    /\bwho (?:is|was) miriam\b/.test(s) ||
    /\bmiriam in the bible\b/.test(s) ||
    /\b(?:what does|where does|what's|what is) (?:the name )?miriam (?:mean|come from|mean in the bible)\b/.test(
      s
    ) ||
    /\bwhy (?:is it |is she |are you )?(?:called |named )?miriam$/.test(s)
  )
}

/** A question about either name. */
export const nameAsked = (text: string) => miriamNameAsked(text) || elimAsked(text)

export interface NameAnswer {
  text: string
  link: { url: string; label: string }
  which: 'elim' | 'miriam'
}

/**
 * The answer to a question about either name, or null. `sitePassages`: the
 * church's site as she has read it (./site), for the page that tells of Elim
 * — its home page until she has.
 */
export function nameAnswer(
  text: string,
  sitePassages: readonly { text: string; url: string }[] = []
): NameAnswer | null {
  const asked = miriamNameAsked(text) ? 'miriam' : elimAsked(text) ? 'elim' : null
  if (!asked) return null
  const page =
    sitePassages.find((p) => /\belim\b/i.test(p.text) && /place of rest|exodus 15/i.test(p.text))
      ?.url ?? CHURCH_SITE
  const label = (() => {
    try {
      return new URL(page).hostname.replace(/^www\./, '')
    } catch {
      return 'thewellofiowa.com'
    }
  })()
  return {
    text: asked === 'elim' ? ELIM_ANSWER : MIRIAM_ANSWER,
    link: { url: page, label },
    which: asked,
  }
}
