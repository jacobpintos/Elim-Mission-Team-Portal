import { embed, similarity } from './encoder'
import { passagesOf, decodeEntities } from './web'
import { packVector, unpackVector } from './vectors'
import type { OwnDb } from './learn'

/**
 * The church's own website, read by Miriam: what The Well says it believes,
 * for her to answer questions of faith with (./faith) — in its own words,
 * saying where. Read every night and whenever an admin asks (../ownAdmin),
 * kept on the server (miriamOwn/site) with each passage's meaning.
 *
 * Only the church's own site is read — any page of it, by its own links and
 * its sitemap, the ones about what it believes first; text that is on every
 * page (menus, footers) is left out.
 */

export const CHURCH_SITE = 'https://thewellofiowa.com'
export const SITE_DOC = 'miriamOwn/site'

const MAX_PAGES = 150
const MAX_PASSAGES = 600
/** What is kept must fit in one document (Firestore's limit is 1 MiB). */
const MAX_KEPT_BYTES = 900_000
const PAGE_MS = 8000
const AGENT = 'MissionPortalMiriam/1.0 (+https://mission-team-portal.web.app)'

/** Pages likeliest to say what the church believes, read first. */
const LIKELY =
  /belie|faith|statement|doctrin|theolog|about|who-we|what-we|values|mission|vision|gospel|jesus|god|baptis|communion|salvation|faq|next-steps|new-here|im-new|membership|story|creed|core/i
/** Not pages: files, and the parts of a site that aren't its words. */
const NOT_PAGES =
  /\.(?:pdf|jpe?g|png|gif|webp|svg|mp3|mp4|mov|zip|docx?|xlsx?|pptx?|ics|css|js|json|xml)(?:$|\?)|\/(?:wp-admin|wp-login|wp-json|cart|checkout|account|login|signin|sign-in|feed|tag|category|author|search)(?:\/|$)/i

export interface SitePassage {
  /** The words. */
  t: string
  /** The page they are on. */
  u: string
  /** Their meaning (./vectors). */
  v: string
}

export interface SiteRead {
  site: string
  readAt: number
  pages: { url: string; title: string }[]
  passages: SitePassage[]
}

type Fetch = typeof fetch

/** A page's address as one: no fragment or query, no trailing slash. */
export function pageKey(url: string): string | null {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return null
    return `${u.protocol}//${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '') || ''}`
  } catch {
    return null
  }
}

/** The church's site, or a part of it: "thewellofiowa.com", "www.…", "media.thewellofiowa.com". */
const sameSite = (url: string, base: string) => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const home = new URL(base).hostname.replace(/^www\./, '')
    return host === home || host.endsWith(`.${home}`)
  } catch {
    return false
  }
}

/** The pages of the same site a page links to. */
export function linksOf(html: string, pageUrl: string, base: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)/gi)) {
    let url: string
    try {
      url = new URL(decodeEntities(m[1]), pageUrl).toString()
    } catch {
      continue
    }
    if (!/^https?:/i.test(url) || !sameSite(url, base) || NOT_PAGES.test(url)) continue
    out.push(url.split('#')[0])
  }
  return out
}

/** The addresses a sitemap lists. */
export const sitemapUrls = (xml: string) =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]))

export function titleOf(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim().slice(0, 120) : ''
}

async function fetchText(url: string, fetchFn: Fetch, want: RegExp): Promise<string | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), PAGE_MS)
  try {
    const res = await fetchFn(url, {
      headers: { 'User-Agent': AGENT, Accept: 'text/html,application/xml' },
      signal: ctl.signal,
      redirect: 'follow',
    })
    if (!res.ok || !want.test(res.headers.get('content-type') ?? '')) return null
    const text = await res.text()
    return text.slice(0, 2_000_000)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** A passage as kept: at most about 60 words. */
const kept = (s: string) => {
  const words = s.split(' ')
  return words.length > 60 ? `${words.slice(0, 60).join(' ')}…` : s
}

/**
 * The site read: its pages (those about what it believes first), their
 * passages without what every page repeats, and each passage's meaning.
 */
export async function readSite(
  fetchFn: Fetch = fetch,
  meaning: (s: string) => Float32Array = embed,
  base: string = CHURCH_SITE,
  now = Date.now()
): Promise<SiteRead> {
  const seen = new Set<string>()
  const queue: string[] = []
  const add = (url: string) => {
    const key = pageKey(url)
    if (!key || seen.has(key) || NOT_PAGES.test(url) || !sameSite(url, base)) return
    seen.add(key)
    queue.push(url)
  }
  add(base)
  // The sitemap, and a sitemap of sitemaps, a level down.
  const map = await fetchText(new URL('/sitemap.xml', base).toString(), fetchFn, /xml|text/i)
  if (map) {
    const urls = sitemapUrls(map)
    const nested = urls.filter((u) => /sitemap[^/]*\.xml$/i.test(u)).slice(0, 5)
    for (const u of urls.filter((u) => !nested.includes(u))) add(u)
    for (const n of nested) {
      const sub = await fetchText(n, fetchFn, /xml|text/i)
      if (sub) for (const u of sitemapUrls(sub)) add(u)
    }
  }

  const pages: { url: string; title: string; likely: boolean; passages: string[] }[] = []
  while (queue.length && pages.length < MAX_PAGES) {
    // The likeliest first, a few at a time.
    queue.sort((a, b) => Number(LIKELY.test(b)) - Number(LIKELY.test(a)))
    const batch = queue.splice(0, Math.min(4, MAX_PAGES - pages.length))
    const htmls = await Promise.all(batch.map((u) => fetchText(u, fetchFn, /text\/html/i)))
    htmls.forEach((html, i) => {
      if (!html) return
      const url = batch[i]
      const title = titleOf(html)
      pages.push({
        url,
        title,
        likely: LIKELY.test(url) || LIKELY.test(title),
        passages: passagesOf(html).filter((p) => p.split(' ').length >= 6),
      })
      for (const link of linksOf(html, url, base)) add(link)
    })
  }

  // What three or more pages say alike is the site's frame, not its words.
  const count = new Map<string, number>()
  for (const p of pages) for (const t of new Set(p.passages)) count.set(t, (count.get(t) ?? 0) + 1)
  const chosen: { t: string; u: string }[] = []
  const taken = new Set<string>()
  for (const p of [...pages.filter((p) => p.likely), ...pages.filter((p) => !p.likely)]) {
    for (const t of p.passages) {
      if ((count.get(t) ?? 0) >= 3 || taken.has(t) || chosen.length >= MAX_PASSAGES) continue
      taken.add(t)
      chosen.push({ t: kept(t), u: p.url })
    }
  }
  return {
    site: base,
    readAt: now,
    pages: pages.map(({ url, title }) => ({ url, title })),
    passages: chosen.map((c) => ({ ...c, v: packVector(meaning(c.t)) })),
  }
}

/** Kept, unless nothing was read: then what was read before stays. */
export async function storeSite(db: OwnDb, read: SiteRead): Promise<boolean> {
  if (read.passages.length === 0) return false
  // As much as fits, the pages about what it believes being first.
  const passages = [...read.passages]
  const size = () => Buffer.byteLength(JSON.stringify({ ...read, passages }), 'utf8')
  while (passages.length > 1 && size() > MAX_KEPT_BYTES) {
    passages.splice(passages.length - Math.min(25, passages.length - 1))
  }
  await db.doc(SITE_DOC).set({ ...read, passages })
  siteCache = null
  return true
}

let siteCache: {
  at: number
  passages: { text: string; url: string; vec: Float32Array }[]
} | null = null

/** What she has read of the site, ready to compare questions with. */
export async function siteKnowledge(
  db: OwnDb,
  now = Date.now()
): Promise<{ text: string; url: string; vec: Float32Array }[]> {
  if (siteCache && now - siteCache.at < 30 * 60 * 1000) return siteCache.passages
  const data = (await db.doc(SITE_DOC).get()).data() as Partial<SiteRead> | undefined
  const passages: { text: string; url: string; vec: Float32Array }[] = []
  for (const p of Array.isArray(data?.passages) ? data!.passages : []) {
    const vec = typeof p?.v === 'string' ? unpackVector(p.v) : null
    if (vec && typeof p.t === 'string' && typeof p.u === 'string') {
      passages.push({ text: p.t, url: p.u, vec })
    }
  }
  siteCache = { at: now, passages }
  return passages
}

/** Only for tests: as a new server instance. */
export function forgetSite(): void {
  siteCache = null
}

/** How near a passage must be to the question to answer it: its meaning and its words. */
export const SITE_NEAR = 0.5

const STOP = new Set(
  'a an the is are was were be been of to in on at for by with what whats when where who whom whose which why how do does did can could will would should i me my you your we our us it its this that there their from as and or but about tell please believe believes church well have has had having get got go goes going need needs must take make any all some more much very just also so if then than too not no yes they them he she him her his hers one ones here out up down over into onto off only own same such other each every both few many most being am become really actually okay ok anyone everyone someone people person thing things way say says said know think want let'.split(
    ' '
  )
)

/** Words of faith said more than one way, made one: "baptize" and "baptism", "saved" and "salvation". */
const SAME: [RegExp, string][] = [
  [/^baptiz|^baptis/, 'baptism'],
  [/^saved?$|^saves$|^saving$|^salvation/, 'salvation'],
  [/^communion$|^eucharist|^supper$/, 'communion'],
  [/^scriptur|^bible|^biblical/, 'bible'],
  [/^forgiv/, 'forgive'],
  [/^pray/, 'prayer'],
  [/^resurrect|^ris(?:e|es|en|ing)$|^rose$/, 'resurrection'],
  [/^trinit|^triune/, 'trinity'],
  [/^marri|^marry|^wedding/, 'marriage'],
  [/^christ$|^jesus$/, 'jesus'],
  [/^spirit/, 'spirit'],
  [/^inspir/, 'inspir'],
  [/^infallib|^inerran|^errors?$|^errant$/, 'error'],
  [/^authorit/, 'authority'],
  [/^trust/, 'trust'],
  [/^relevan/, 'relevant'],
  [/^die[ds]?$|^dying$|^death|^dead$/, 'death'],
  [/^heaven/, 'heaven'],
  [/^sins?$|^sinful|^sinn/, 'sin'],
  [/^pastor/, 'pastor'],
  [/^wom[ae]n$/, 'women'],
  [/^worship/, 'worship'],
  [/^child|^kids?$/, 'child'],
]

/** A text's words, as compared: the plain ones dropped, endings off, faith's words made one. */
export function faithWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => SAME.find(([re]) => re.test(w))?.[1] ?? w.replace(/(?:ing|ed|es|s)$/, ''))
}

/** How rare each word is among the site's passages: a word on every one says little. */
export function rarity(passages: { text: string }[]): (word: string) => number {
  const df = new Map<string, number>()
  for (const p of passages)
    for (const w of new Set(faithWords(p.text))) df.set(w, (df.get(w) ?? 0) + 1)
  const n = passages.length || 1
  return (w) => Math.log(1 + n / ((df.get(w) ?? 0) + 0.5))
}

/** The share of the question's words a passage has, each counting as much as it is rare. */
export function sharedWords(
  question: string,
  passage: string,
  rare: (w: string) => number
): number {
  const q = [...new Set(faithWords(question))]
  if (q.length === 0) return 0
  const p = new Set(faithWords(passage))
  const total = q.reduce((a, w) => a + rare(w), 0)
  return q.filter((w) => p.has(w)).reduce((a, w) => a + rare(w), 0) / total
}

/**
 * The passage on the site that answers a question, if one plainly does: near
 * it in meaning, and sharing its telling words — "What do we believe about
 * baptism?" and "We practice baptism by immersion…".
 */
export function siteAnswer(
  question: string,
  v: Float32Array,
  passages: { text: string; url: string; vec: Float32Array }[]
): { text: string; url: string; score: number } | null {
  const rare = rarity(passages)
  let best: { text: string; url: string; score: number } | null = null
  for (const p of passages) {
    const words = sharedWords(question, p.text, rare)
    // It must speak to most of what is asked: "lose your salvation" isn't
    // answered by a passage on salvation that says nothing of losing it.
    if (words < 0.6) continue
    const score = similarity(v, p.vec) * 0.6 + words * 0.4
    if (!best || score > best.score) best = { text: p.text, url: p.url, score }
  }
  return best && best.score >= SITE_NEAR ? best : null
}
