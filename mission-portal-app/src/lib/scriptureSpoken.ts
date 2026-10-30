/**
 * Bible references, as Miriam's voice should say them (features/miriam/speak).
 *
 * The church's pages write them short — "Jer. 1:5", "Matt 22:37-39",
 * "1 Cor. 13:4" — and a phone's voice reads those letter by letter, or as
 * the end of a sentence ("Jer." is a full stop to a browser). Said here as
 * a reader would: "Jeremiah 1, verse 5", "Matthew 22, verses 37 to 39",
 * "First Corinthians 13, verse 4". What is shown on screen is left as it was.
 *
 * Only a reference is changed: a book's name, or its short form, followed by
 * a chapter and verse ("Mark 5:30"), a numbered book's chapter ("1 Cor 13"),
 * or a psalm's ("Ps. 23"). "Mark 5 tasks", "Gen. 5" and "5:30 pm" are left alone.
 */

/** Each book: what it is said as, the ways it is written, and whether it comes numbered ("1 Corinthians"). */
const BOOKS: { name: string; forms: string[]; numbered?: true; alone?: false }[] = [
  { name: 'Genesis', forms: ['Genesis', 'Gen', 'Gn'] },
  { name: 'Exodus', forms: ['Exodus', 'Exod', 'Exo', 'Ex'] },
  { name: 'Leviticus', forms: ['Leviticus', 'Lev', 'Lv'] },
  { name: 'Numbers', forms: ['Numbers', 'Numb', 'Num', 'Nm'] },
  { name: 'Deuteronomy', forms: ['Deuteronomy', 'Deut', 'Deu', 'Dt'] },
  { name: 'Joshua', forms: ['Joshua', 'Josh', 'Jos'] },
  { name: 'Judges', forms: ['Judges', 'Judg', 'Jdg'] },
  { name: 'Ruth', forms: ['Ruth', 'Rth'] },
  { name: 'Samuel', forms: ['Samuel', 'Sam', 'Sm', 'Sa'], numbered: true, alone: false },
  { name: 'Kings', forms: ['Kings', 'Kgs', 'Kin', 'Ki'], numbered: true, alone: false },
  {
    name: 'Chronicles',
    forms: ['Chronicles', 'Chron', 'Chr', 'Ch'],
    numbered: true,
    alone: false,
  },
  { name: 'Ezra', forms: ['Ezra', 'Ezr'] },
  { name: 'Nehemiah', forms: ['Nehemiah', 'Neh'] },
  { name: 'Esther', forms: ['Esther', 'Esth', 'Est'] },
  { name: 'Job', forms: ['Job'] },
  { name: 'Psalm', forms: ['Psalms', 'Psalm', 'Psa', 'Pss', 'Psm', 'Ps'] },
  { name: 'Proverbs', forms: ['Proverbs', 'Prov', 'Prv', 'Pr'] },
  { name: 'Ecclesiastes', forms: ['Ecclesiastes', 'Eccles', 'Eccl', 'Ecc', 'Qoh'] },
  {
    name: 'Song of Solomon',
    forms: ['Song of Solomon', 'Song of Songs', 'Song of Sol', 'Song', 'SOS'],
  },
  { name: 'Isaiah', forms: ['Isaiah', 'Isa'] },
  { name: 'Jeremiah', forms: ['Jeremiah', 'Jer', 'Jr'] },
  { name: 'Lamentations', forms: ['Lamentations', 'Lam'] },
  { name: 'Ezekiel', forms: ['Ezekiel', 'Ezek', 'Eze', 'Ezk'] },
  { name: 'Daniel', forms: ['Daniel', 'Dan', 'Dn'] },
  { name: 'Hosea', forms: ['Hosea', 'Hos'] },
  { name: 'Joel', forms: ['Joel'] },
  { name: 'Amos', forms: ['Amos'] },
  { name: 'Obadiah', forms: ['Obadiah', 'Obad', 'Ob'] },
  { name: 'Jonah', forms: ['Jonah', 'Jon'] },
  { name: 'Micah', forms: ['Micah', 'Mic'] },
  { name: 'Nahum', forms: ['Nahum', 'Nah'] },
  { name: 'Habakkuk', forms: ['Habakkuk', 'Hab'] },
  { name: 'Zephaniah', forms: ['Zephaniah', 'Zeph', 'Zep'] },
  { name: 'Haggai', forms: ['Haggai', 'Hag'] },
  { name: 'Zechariah', forms: ['Zechariah', 'Zech', 'Zec'] },
  { name: 'Malachi', forms: ['Malachi', 'Mal'] },
  { name: 'Matthew', forms: ['Matthew', 'Matt', 'Mat', 'Mt'] },
  // Not "Mar": that is March.
  { name: 'Mark', forms: ['Mark', 'Mrk', 'Mk'] },
  { name: 'Luke', forms: ['Luke', 'Luk', 'Lk'] },
  // The gospel, and — numbered — the letters.
  { name: 'John', forms: ['John', 'Joh', 'Jhn', 'Jn'], numbered: true },
  { name: 'Acts', forms: ['Acts', 'Ac'] },
  { name: 'Romans', forms: ['Romans', 'Rom', 'Rm', 'Ro'] },
  {
    name: 'Corinthians',
    forms: ['Corinthians', 'Cor', 'Co'],
    numbered: true,
    alone: false,
  },
  { name: 'Galatians', forms: ['Galatians', 'Gal'] },
  { name: 'Ephesians', forms: ['Ephesians', 'Ephes', 'Eph'] },
  { name: 'Philippians', forms: ['Philippians', 'Phil', 'Php', 'Pp'] },
  { name: 'Colossians', forms: ['Colossians', 'Col'] },
  {
    name: 'Thessalonians',
    forms: ['Thessalonians', 'Thess', 'Thes', 'Th'],
    numbered: true,
    alone: false,
  },
  { name: 'Timothy', forms: ['Timothy', 'Tim', 'Ti'], numbered: true, alone: false },
  { name: 'Titus', forms: ['Titus', 'Tit'] },
  { name: 'Philemon', forms: ['Philemon', 'Philem', 'Phlm', 'Phm'] },
  { name: 'Hebrews', forms: ['Hebrews', 'Heb'] },
  { name: 'James', forms: ['James', 'Jas', 'Jm'] },
  { name: 'Peter', forms: ['Peter', 'Pet', 'Pt', 'Pe'], numbered: true, alone: false },
  { name: 'Jude', forms: ['Jude', 'Jud'] },
  { name: 'Revelation', forms: ['Revelations', 'Revelation', 'Rev', 'Rv'] },
]

const BY_FORM = new Map(BOOKS.flatMap((b) => b.forms.map((f) => [f, b] as const)))

const ORDINAL: Record<string, string> = {
  '1': 'First',
  I: 'First',
  '1st': 'First',
  First: 'First',
  '2': 'Second',
  II: 'Second',
  '2nd': 'Second',
  Second: 'Second',
  '3': 'Third',
  III: 'Third',
  '3rd': 'Third',
  Third: 'Third',
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Longest first, so "Song of Solomon" is not read as "Song".
const FORMS = [...BY_FORM.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escape)
  .join('|')

/**
 * A reference: what came before it, a number for the book ("1", "II",
 * "First"), the book, a full stop, the chapter — and its verse, and where
 * its verses run to ("37-39", or to another chapter's: "1:5-2:3").
 */
const REFERENCE = new RegExp(
  `(^|[^\\w.])(?:(1st|2nd|3rd|First|Second|Third|III|II|I|1|2|3)\\s?)?(${FORMS})(\\.)?\\s?` +
    `(\\d{1,3})(?::(\\d{1,3})[a-c]?(?:\\s?[-–—]\\s?(\\d{1,3})(?::(\\d{1,3}))?[a-c]?)?)?(?![\\d:])`,
  'g'
)

/** "5:30 pm": a time, not a verse. */
const A_TIME = /^\s*(?:am|pm|a\.m\.|p\.m\.)\b/i

/** "v. 5", "vv. 5-7": verses of the one just named. */
const VERSES = /(^|[^\w])(vv?)\.\s?(\d{1,3})(?:\s?[-–—]\s?(\d{1,3}))?(?![\d:])/g

export function scriptureForSpeech(text: string): string {
  return text
    .replace(
      REFERENCE,
      (whole, before: string, num, form: string, dot, chapter, verse, to, toVerse, at, all) => {
        const book = BY_FORM.get(form)!
        const rest = (all as string).slice(at + whole.length)
        // A time ("5:30 pm"), or "5:00" — not a verse.
        if (verse && (A_TIME.test(rest) || verse.startsWith('0'))) return whole
        const numbered = !!num && !!book.numbered
        // "Cor 13:4", with no number: not a book on its own.
        if (!num && book.alone === false) return whole
        // A chapter alone is a reference only for a numbered book, or a
        // psalm written short ("Ps. 23"): "Gen. 5" may be a general.
        if (!verse && !numbered && !(dot && book.name === 'Psalm')) return whole
        const lead = num && !numbered ? `${num} ` : ''
        const name = numbered ? `${ORDINAL[num]} ${book.name}` : book.name
        const said = !verse
          ? `${name} ${chapter}`
          : !to
            ? `${name} ${chapter}, verse ${verse}`
            : toVerse
              ? `${name} ${chapter}, verse ${verse}, to chapter ${to}, verse ${toVerse}`
              : `${name} ${chapter}, verses ${verse} to ${to}`
        return `${before}${lead}${said}`
      }
    )
    .replace(VERSES, (_w, before: string, v: string, from: string, to?: string) =>
      to
        ? `${before}verses ${from} to ${to}`
        : `${before}${v === 'vv' ? 'verses' : 'verse'} ${from}`
    )
}
