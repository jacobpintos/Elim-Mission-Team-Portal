import { embed, similarity } from './encoder'
import { FORECAST_DAYS, forecastFor } from '../weather'
import { dayIn } from './when'

/**
 * Miriam's own look on the web, for what isn't in the app: a business's
 * hours, a fact, a place's weather. She searches — with Brave, once an admin
 * has given her a key (Admin → Miriam), or Wikipedia, which needs none —
 * reads the pages it finds herself, and answers with the passage that
 * answers the question best (her own model: ./encoder), saying where it is
 * from. A place's weather comes from the forecasts the app already uses.
 *
 * What a page says is only ever read out — never followed as instructions,
 * never run.
 */

export interface WebHit {
  title: string
  url: string
  text: string
}

export interface WebAnswer {
  text: string
  url: string | null
  /** Where it came from, as said: "costco.com", "Wikipedia". */
  source: string
}

type Fetch = typeof fetch

/** Who is asking, as Wikipedia asks to be told. */
const AGENT = 'MissionPortalMiriam/1.0 (+https://mission-team-portal.web.app)'
const SEARCH_MS = 4000
const PAGE_MS = 3500
const MAX_PAGE_BYTES = 1_500_000

/** The words that ask her to look, before what is looked for. */
const ASKING =
  /^(?:(?:hey|ok|okay)\s+)?(?:miriam[,\s]+)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:(?:look\s+up|search(?:\s+(?:the\s+)?(?:web|internet|online))?(?:\s+for)?|google|find(?:\s+me)?(?:\s+online)?|check(?:\s+(?:the\s+)?(?:internet|web|online))?(?:\s+for)?|look\s+online\s+for|search\s+online\s+for)\s+)?/i

/** What to search for: the question, without the asking. */
export function queryOf(text: string): string {
  return text
    .replace(ASKING, '')
    .replace(/\s+(?:please|for me|online|on the internet|on the web)$/i, '')
    .replace(/[?!.]+$/, '')
    .trim()
}

async function getJson(url: string, fetchFn: Fetch, headers: Record<string, string>, ms: number) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetchFn(url, { headers, signal: ctl.signal })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const unhtml = (s: string) =>
  decodeEntities(s.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

/** Brave's web results: each result's own summary, and its extra snippets. */
export async function braveSearch(
  query: string,
  key: string,
  fetchFn: Fetch = fetch
): Promise<WebHit[]> {
  const url =
    'https://api.search.brave.com/res/v1/web/search?' +
    new URLSearchParams({
      q: query,
      count: '5',
      country: 'us',
      search_lang: 'en',
      extra_snippets: 'true',
      // Read out in a church's app: nothing a search's strictest filter would hide.
      safesearch: 'strict',
    })
  const data = (await getJson(
    url,
    fetchFn,
    { Accept: 'application/json', 'X-Subscription-Token': key },
    SEARCH_MS
  )) as {
    web?: {
      results?: { title?: string; url?: string; description?: string; extra_snippets?: string[] }[]
    }
  } | null
  return (data?.web?.results ?? [])
    .filter((r) => typeof r.url === 'string' && /^https?:\/\//.test(r.url))
    .slice(0, 5)
    .map((r) => ({
      title: unhtml(String(r.title ?? '')),
      url: String(r.url),
      text: [r.description, ...(r.extra_snippets ?? [])]
        .filter(Boolean)
        .map((t) => unhtml(String(t)))
        .join(' '),
    }))
}

/** Wikipedia: the articles that fit, each with its own summary. */
export async function wikipediaSearch(query: string, fetchFn: Fetch = fetch): Promise<WebHit[]> {
  const headers = { 'User-Agent': AGENT, 'Api-User-Agent': AGENT, Accept: 'application/json' }
  const found = (await getJson(
    'https://en.wikipedia.org/w/api.php?' +
      new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: query,
        srlimit: '2',
        format: 'json',
        utf8: '1',
      }),
    fetchFn,
    headers,
    SEARCH_MS
  )) as { query?: { search?: { title?: string }[] } } | null
  const titles = (found?.query?.search ?? []).map((s) => String(s.title ?? '')).filter(Boolean)
  const hits = await Promise.all(
    titles.map(async (title) => {
      const page = (await getJson(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        fetchFn,
        headers,
        SEARCH_MS
      )) as { extract?: string; content_urls?: { desktop?: { page?: string } } } | null
      return page?.extract
        ? {
            title,
            url:
              page.content_urls?.desktop?.page ??
              `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
            text: page.extract,
          }
        : null
    })
  )
  return hits.filter((h): h is WebHit => !!h)
}

/** A page, fetched as text: only a web page, only so much of it. */
async function pageText(url: string, fetchFn: Fetch): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), PAGE_MS)
  try {
    const res = await fetchFn(url, {
      headers: { 'User-Agent': AGENT, Accept: 'text/html' },
      signal: ctl.signal,
      redirect: 'follow',
    })
    if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') ?? '')) return null
    // Said to be more than she reads of a page: not fetched at all.
    if (Number(res.headers.get('content-length') ?? 0) > MAX_PAGE_BYTES * 2) return null
    const html = await res.text()
    return html.length > MAX_PAGE_BYTES ? html.slice(0, MAX_PAGE_BYTES) : html
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A page's readable text, in passages of a few sentences: no scripts, menus
 * or markup. `footers`: kept too — on the church's own site, where a section
 * like "What we believe" can sit at the foot of every page (./site).
 */
export function passagesOf(
  html: string,
  { footers = false }: { footers?: boolean } = {}
): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      footers
        ? /<(script|style|noscript|svg|head|nav|form|iframe|template)\b[\s\S]*?<\/\1>/gi
        : /<(script|style|noscript|svg|head|nav|footer|form|iframe|template)\b[\s\S]*?<\/\1>/gi,
      ' '
    )
    .replace(
      /<\/?(?:p|div|li|ul|ol|tr|td|th|h[1-6]|br|dd|dt|section|article|table|blockquote)\b[^>]*>/gi,
      '\n'
    )
    .replace(/<[^>]*>/g, ' ')
  const out: string[] = []
  for (const block of decodeEntities(text).split(/\n+/)) {
    const line = block.replace(/\s+/g, ' ').trim()
    const words = line.split(' ').length
    if (words < 4) continue
    if (words <= 50) {
      out.push(line)
      continue
    }
    // A long paragraph: a few sentences at a time.
    let cur = ''
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      if ((cur + ' ' + sentence).split(' ').length > 45 && cur) {
        out.push(cur.trim())
        cur = ''
      }
      cur += ' ' + sentence
    }
    if (cur.trim().split(' ').length >= 4) out.push(cur.trim())
  }
  return [...new Set(out)].slice(0, 400)
}

const STOP = new Set(
  'a an the is are was were be been of to in on at for by with what whats when where who whom whose which why how do does did can could will would should i me my you your we our it its this that there their from as and or but about tell please'.split(
    ' '
  )
)
const contentWords = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => w.replace(/(?:ing|ed|es|s)$/, ''))

/** The share of the question's words a passage has. */
export function overlap(question: string, passage: string): number {
  const q = [...new Set(contentWords(question))]
  if (q.length === 0) return 0
  const p = new Set(contentWords(passage))
  return q.filter((w) => p.has(w)).length / q.length
}

/** A passage as it is said: at most about 60 words. */
const trimmed = (s: string) => {
  const words = s.split(' ')
  return words.length > 60 ? `${words.slice(0, 60).join(' ')}…` : s
}

const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'the web'
  }
}

/** Of what was found, the passage that answers best: by words first, then by meaning. */
export function bestPassage(
  question: string,
  candidates: { text: string; url: string; source: string }[],
  meaning: (s: string) => Float32Array = embed
): { text: string; url: string; source: string; score: number } | null {
  const scored = candidates
    .filter((c) => c.text.split(' ').length >= 4)
    .map((c, i) => ({ ...c, words: overlap(question, c.text), order: i }))
    .filter((c) => c.words > 0)
    .sort((a, b) => b.words - a.words || a.order - b.order)
    .slice(0, 3)
  if (scored.length === 0) return null
  const q = meaning(question)
  let best: (typeof scored)[number] & { score: number } = { ...scored[0], score: -1 }
  for (const c of scored) {
    // Its meaning near the question's, and its words: both count.
    const score = similarity(q, meaning(trimmed(c.text))) * 0.7 + c.words * 0.3
    if (score > best.score) best = { ...c, score }
  }
  return { text: trimmed(best.text), url: best.url, source: best.source, score: best.score }
}

/** "the weather in Chicago tomorrow": the place, if a forecast is asked for one. */
export function weatherPlace(text: string): string | null {
  const m =
    /\b(?:weather|forecast|temperature|rain(?:ing)?|snow(?:ing)?|hot|cold|warm)\b.*?\b(?:in|for|at)\s+([A-Za-z][\w .'-]{1,60}?)(?:\s+(?:today|tonight|tomorrow|this|next|on)\b.*)?[?.!]*$/i.exec(
      text
    )
  return m ? m[1].trim() : null
}

/** A place's forecast, for the day said: found by Open-Meteo's free place search. */
async function weatherFor(
  place: string,
  text: string,
  today: string,
  fetchFn: Fetch
): Promise<WebAnswer | null> {
  const found = (await getJson(
    'https://geocoding-api.open-meteo.com/v1/search?' +
      new URLSearchParams({ name: place, count: '1', language: 'en', format: 'json' }),
    fetchFn,
    { Accept: 'application/json' },
    SEARCH_MS
  )) as {
    results?: { name?: string; admin1?: string; latitude?: number; longitude?: number }[]
  } | null
  const hit = found?.results?.[0]
  if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return null
  const day = dayIn(text, today) ?? today
  const ahead = Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  )
  if (ahead < 0 || ahead > FORECAST_DAYS) return null
  const f = await forecastFor(hit.latitude, hit.longitude, day, ahead)
  if (!f) return null
  const where = [hit.name, hit.admin1].filter(Boolean).join(', ')
  const when =
    day === today
      ? 'today'
      : ahead === 1
        ? 'tomorrow'
        : `on ${new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}`
  const rain = f.chanceOfRain >= 20 ? `, ${f.chanceOfRain}% chance of rain` : ''
  return {
    text: `${where} ${when}: ${f.summary.toLowerCase()}, high ${Math.round(f.high)}°, low ${Math.round(f.low)}°${rain}.`,
    url: null,
    source: f.source,
  }
}

/**
 * Her answer from the web, or null when she found nothing she could stand
 * behind. `braveKey`: set by an admin; without it, Wikipedia only.
 */
export async function webAnswer(
  text: string,
  opts: {
    braveKey: string | null
    today: string
    fetchFn?: Fetch
    meaning?: (s: string) => Float32Array
  }
): Promise<WebAnswer | null> {
  const fetchFn = opts.fetchFn ?? fetch
  const meaning = opts.meaning ?? embed
  const place = weatherPlace(text)
  if (place) {
    const w = await weatherFor(place, text, opts.today, fetchFn).catch(() => null)
    if (w) return w
  }
  const query = queryOf(text)
  if (!query) return null
  const hits = opts.braveKey
    ? await braveSearch(query, opts.braveKey, fetchFn)
    : await wikipediaSearch(query, fetchFn)
  if (hits.length === 0) return null
  const candidates = hits.map((h) => ({
    text: h.text,
    url: h.url,
    source: opts.braveKey ? siteOf(h.url) : 'Wikipedia',
  }))
  // The top two pages read too, for what their summaries leave out (hours, prices).
  if (opts.braveKey) {
    const pages = await Promise.all(hits.slice(0, 2).map((h) => pageText(h.url, fetchFn)))
    pages.forEach((html, i) => {
      if (!html) return
      for (const p of passagesOf(html))
        candidates.push({ text: p, url: hits[i].url, source: siteOf(hits[i].url) })
    })
  } else {
    // A summary in sentences, so the one that answers is said.
    for (const h of hits) {
      for (const s of h.text.split(/(?<=[.!?])\s+/))
        candidates.push({ text: s, url: h.url, source: 'Wikipedia' })
    }
  }
  const best = bestPassage(query, candidates, meaning)
  if (!best || best.score < 0.35) return null
  return { text: best.text, url: best.url, source: best.source }
}
