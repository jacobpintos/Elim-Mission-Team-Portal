import { embed } from './encoder'
import { taughtAnswers, type OwnDb } from './learn'
import { CHURCH_SITE, siteAnswer, siteKnowledge } from './site'
import { ELIM_ANSWER, MIRIAM_ANSWER, nameAnswer } from './names'
import { taughtFound } from './taught'

/**
 * Questions of faith, as the church asked Miriam to answer them — only in
 * the church's own words:
 *
 *  1. An answer an admin has taught her (Admin → Miriam), if the question
 *     means the same, however it is worded (./taught).
 *  2. Where the names Elim and Miriam come from, as the church gave them
 *     (./names).
 *  3. What the church's website says (./site: any page of
 *     thewellofiowa.com), in its words, saying where.
 *  4. If none says enough to answer with confidence: the church's
 *     leadership, and the website.
 *
 * Never from anywhere else — not the web, not Claude, not anything she was
 * built knowing. Scripture is the church's to interpret, not hers.
 */

export interface FaithAnswer {
  text: string
  /** A page to read it on: the church's site. */
  link: { url: string; label: string } | null
  /** Where it came from, for the logs. */
  from: 'taught' | 'names' | 'site' | 'leadership'
}

/**
 * Said to anything more asked after an answer about faith — "why?", "what
 * about…?": she doesn't discuss beliefs; the church's leadership does.
 */
export const LEADERSHIP =
  'For more on that, please reach out to our church leadership directly — they’d be glad to talk with you.'

/** Said when neither the church's site nor an answer she was taught says enough to answer with confidence. */
export const DEFER =
  'I don’t have enough from The Well to answer that confidently — please reach out to our church leadership directly; they’d be glad to talk with you. You can also read what The Well believes at thewellofiowa.com.'

const siteLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'thewellofiowa.com'
  }
}

/** Her answer to a question of faith: the church's own, or its leadership's to give. */
export async function faithAnswer(
  text: string,
  db: OwnDb,
  v: Float32Array = embed(text)
): Promise<FaithAnswer> {
  // 1. Taught.
  const taught = taughtFound(text, v, await taughtAnswers(db).catch(() => []), { faith: true })
  if (taught) return { text: taught.a, link: null, from: 'taught' }

  // 2. The names Elim and Miriam, as the church gave them.
  const passages = await siteKnowledge(db).catch(() => [])
  const named = nameAnswer(text, passages)
  if (named) return { text: named.text, link: named.link, from: 'names' }

  // 3. The church's website.
  const site = siteAnswer(text, v, passages)
  if (site) {
    return {
      text: `${site.text} (from ${siteLabel(site.url)})`,
      link: { url: site.url, label: siteLabel(site.url) },
      from: 'site',
    }
  }

  // 4. Not enough to answer with confidence: the church's leadership.
  return {
    text: DEFER,
    link: { url: CHURCH_SITE, label: 'thewellofiowa.com' },
    from: 'leadership',
  }
}

/** Whether something she said was one of her answers about faith (as kept in the conversation). */
export function isFaithReply(reply: string): boolean {
  const r = reply.trim()
  if (r === DEFER || r === LEADERSHIP || r === ELIM_ANSWER || r === MIRIAM_ANSWER) return true
  // From the church's site: "(from thewellofiowa.com)", or a part of it.
  const host = new URL(CHURCH_SITE).hostname.replace(/^www\./, '').replace(/\./g, '\\.')
  return new RegExp(`\\(from (?:[a-z0-9-]+\\.)*${host}\\)$`, 'i').test(r)
}

/** The Bible's books, as a verse is named: "John 3:16", "1 Corinthians 13:4". */
const BOOKS =
  'genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|song of (?:songs|solomon)|isaiah|jeremiah|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation'

const SCRIPTURE = new RegExp(
  [
    // God, the Bible, and what Christians believe, by name.
    "\\b(?:god|god(?:'|’)s|jesus|christ|the lord|holy spirit|holy ghost|bibles?|biblical|scriptures?|scriptural|gospels?|psalms?|apostles?|apostle(?:'|’)s|(?:old|new) testament|salvation|baptisms?|baptiz(?:e|ed|ing)|theology|theological|doctrines?|sins?|sinful|sinners?|repent(?:ance)?|resurrection|crucifixion|crucified|trinity|eternal life|the devil|satan|rapture|end times)\\b",
    // A book of it: "the book of Romans", "John 3:16", "Psalm 23".
    `\\bbook of (?:${BOOKS})\\b`,
    `\\b(?:[1-3]\\s?)?(?:${BOOKS})\\s+\\d{1,3}:\\d{1,3}\\b`,
    '\\bpsalm\\s+\\d{1,3}\\b',
  ].join('|'),
  'i'
)

/**
 * About God, the Bible or what the church believes, by its words: never
 * looked up on the web (./index: fromWeb), however it is asked — "look up
 * John 3:16", "who wrote the book of Romans".
 */
export const aboutScripture = (text: string) => SCRIPTURE.test(text)
