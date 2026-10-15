import type { OwnDb } from './learn'

/**
 * Who leads the church — the pastor, the elders, who started it, or someone
 * by name — answered from the app's own Our Story page, in its words.
 *
 * The page is built in the app (Admin's page builder, saved under
 * config/main → publicPages.ourstory), so whoever keeps it up to date keeps
 * her answers up to date. Nothing is made up: if the page says nothing about
 * what was asked, she leaves the question to the rest of her (./index).
 *
 * An answer an admin teaches her to the same question is said instead
 * (./index: taught first).
 */

export const STORY_PAGE = 'ourstory'

export interface StoryPassage {
  /** The block's heading, when it has one: "Our Pastor", "Meet the Elders". */
  heading: string
  text: string
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Emphasis marks the page builder keeps in its text (src/lib/textEmphasis): not words. */
const unmark = (s: string) => s.replace(/\\([*_^~])/g, '$1').replace(/(?<!\\)[*_^~]/g, '')

/**
 * The page's words, block by block: headings with what is under them, the
 * two columns, the timeline's entries, quotes with who said them, captions.
 */
export function storyPassages(blocks: unknown): StoryPassage[] {
  if (!Array.isArray(blocks)) return []
  const out: StoryPassage[] = []
  const add = (heading: string, text: string) => {
    const t = unmark(text).replace(/\s+/g, ' ').trim()
    if (t) out.push({ heading: unmark(heading).trim(), text: t })
  }
  for (const b of blocks) {
    const d = (b as { data?: Record<string, unknown> })?.data ?? {}
    switch ((b as { type?: string })?.type) {
      case 'hero':
        add('', [str(d.heading), str(d.subheading)].filter(Boolean).join('. '))
        break
      case 'text':
        add(str(d.heading), str(d.content))
        break
      case 'twocol':
        add(str(d.leftHead), str(d.leftContent))
        add(str(d.leftHead), str(d.rightContent))
        break
      case 'timeline':
        for (const e of Array.isArray(d.entries) ? d.entries : []) {
          const entry = e as { year?: unknown; title?: unknown; desc?: unknown }
          add(
            str(entry.title),
            [str(entry.year), str(entry.title), str(entry.desc)].filter(Boolean).join(': ')
          )
        }
        break
      case 'quote':
        add('', [str(d.text), str(d.attribution) && `— ${str(d.attribution)}`].join(' '))
        break
      case 'image':
        add('', str(d.caption))
        break
    }
  }
  return out
}

let storyCache: { at: number; passages: StoryPassage[] } | null = null

/** The Our Story page's words, read again every few minutes so an edit shows soon. */
export async function storyKnowledge(db: OwnDb, now = Date.now()): Promise<StoryPassage[]> {
  if (storyCache && now - storyCache.at < 5 * 60 * 1000) return storyCache.passages
  const config = (await db.doc('config/main').get()).data() as
    | { publicPages?: Record<string, { blocks?: unknown }> }
    | undefined
  const passages = storyPassages(config?.publicPages?.[STORY_PAGE]?.blocks)
  storyCache = { at: now, passages }
  return passages
}

export function forgetStory(): void {
  storyCache = null
}

// ─── What was asked ───────────────────────────────────────────────────────────

const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** A role in the church, and the words that name it on a page. */
const ROLES: { role: string; asked: RegExp; on: RegExp }[] = [
  {
    role: 'pastor',
    asked: /\b(?:lead |senior |head |associate |youth |worship |our |the |your )?pastors?\b/,
    on: /\bpastor(?:s|al|ed|ing)?\b/i,
  },
  { role: 'elders', asked: /\belders?\b/, on: /\belders?\b/i },
  { role: 'deacons', asked: /\bdeacons?\b/, on: /\bdeacons?\b/i },
  { role: 'staff', asked: /\bstaff\b/, on: /\bstaff\b/i },
  { role: 'minister', asked: /\bministers?\b/, on: /\bminist(?:er|ers|ry)\b/i },
  {
    role: 'founders',
    asked:
      /\b(?:found(?:ed|er|ers)|start(?:ed)?|plant(?:ed)?|began|begin) (?:the |this |our |your )?(?:church|the well|well)\b|\bfound(?:er|ers)\b|\bwho (?:started|founded|planted)\b/,
    on: /\b(?:found(?:ed|er|ers|ing)|start(?:ed)?|plant(?:ed|ing)?|began|launch(?:ed)?)\b/i,
  },
  {
    role: 'leaders',
    asked:
      /\bleadership\b|\b(?:church|our|your|the well's|the) leaders\b|\bwho (?:leads|runs|is in charge of|oversees) (?:the |this |our |your )?(?:church|the well|well)\b/,
    on: /\b(?:lead(?:s|er|ers|ership|ing)?|pastor(?:s)?|elders?|found(?:ed|er|ers))\b/i,
  },
]

/** What makes it a question about someone, rather than a request. */
const ASKING =
  /\b(?:who|whos|who's|tell me about|what about|what do you know about|what does|what is|what's|whats|name of|names of|introduce|know about)\b/

/** Someone the question names: "who is Amy Lee", "tell me about pastor amy". */
const NAMED = [
  /\bwho (?:is|was|are) (.+)$/,
  /\bwho's (.+)$/,
  /\btell me (?:more )?about (.+)$/,
  /\bwhat do you know about (.+)$/,
  /\bwhat (?:does|did) (.+?) do\b/,
  /\bwhat (?:is|was) (.+?)'s (?:role|job|position|story|background)\b/,
]

/** Words that are never part of a person's name in a question. */
const FILLER =
  /^(?:the|our|your|a|an|this|that|to|of|for|with|and|church|well|in|charge|leading|coming|going|driving|available|on|at|my|me|i|we|you|it|they|them|he|she|his|her|there|here|now|today|tomorrow|tonight|team|group|staff|people|members|member|family|everyone|everybody|kids|youth|night|event|events|retreat|trip|service|services|sunday|worship|music|band|class|meeting|picnic|car|cars|driver)$/

/** Asking how to reach someone, or when: not who they are. */
const NOT_WHO =
  /\b(?:number|phone|email|e mail|address|contact|reach|call|text|office hours|schedule|when|what time|where (?:is|are) (?:the )?(?:office|church))\b/

export interface LeaderAsk {
  /** The role asked about, if one was: "pastor", "elders", "founders", "leaders". */
  role: string | null
  /** The words naming someone, as said, if someone was: "amy lee". */
  name: string | null
}

/**
 * A question about the church's leaders or someone in its story, or null.
 *
 * Deliberately narrow on roles: "who is leading worship Sunday" or "who's
 * the leader of my team" are about the app's events and teams, not the
 * church's leadership, and are left to the rest of her.
 */
export function leaderAsked(text: string): LeaderAsk | null {
  const s = plain(text)
  if (!ASKING.test(s) || NOT_WHO.test(s)) return null
  for (const r of ROLES) {
    if (r.asked.test(s)) {
      const named = nameIn(s)
      return { role: r.role, name: named }
    }
  }
  const named = nameIn(s)
  return named ? { role: null, name: named } : null
}

function nameIn(s: string): string | null {
  for (const re of NAMED) {
    const m = re.exec(s)
    if (!m) continue
    const words = m[1]
      .replace(/\b(?:please|again|exactly|anyway)\b/g, ' ')
      .replace(/\b(?:lead |senior |head |associate |youth |worship )?pastor\b/g, ' ')
      .split(' ')
      .filter((w) => w && !FILLER.test(w))
    if (words.length === 0 || words.length > 4) continue
    return words.join(' ')
  }
  return null
}

// ─── What the page says ───────────────────────────────────────────────────────

/** Sentences, kept with the heading of the block they came from. */
function sentencesOf(p: StoryPassage): string[] {
  return (p.text.match(/[^.!?]+(?:[.!?]+["”’)]*|$)/g) ?? [p.text])
    .map((x) => x.trim())
    .filter(Boolean)
}

/**
 * Whether words name someone: every word of the name, written as a name is —
 * with a capital. "Team" in "our leadership team" is not someone called Team.
 */
function mentions(text: string, name: string): boolean {
  const names = new Set(
    (text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [])
      .filter((w) => /^[A-Z]/.test(w))
      .map((w) => w.toLowerCase().replace(/[’]/g, "'").replace(/'s$/, ''))
  )
  return name.split(' ').every((w) => names.has(w.replace(/'s$/, '')))
}

const MAX_SENTENCES = 3
const MAX_CHARS = 600

/**
 * The page's own sentences on what was asked, or null when it says nothing
 * about it.
 *
 * A block whose heading is about it ("Our Pastor") is read from its start;
 * otherwise the sentence that names it, and the next while they go on about
 * the same person ("He…", "She…", "They…").
 */
export function leaderAnswer(ask: LeaderAsk, passages: StoryPassage[]): string | null {
  const role = ask.role ? ROLES.find((r) => r.role === ask.role) : null
  const hits = (text: string) =>
    ask.name ? mentions(text, ask.name) : role ? role.on.test(text) : false

  // A heading that is about it: the block from its start.
  const headed = passages.find((p) => p.heading && hits(p.heading))
  if (headed) return clip(sentencesOf(headed))

  for (const p of passages) {
    const sentences = sentencesOf(p)
    const i = sentences.findIndex((x) => hits(x))
    if (i < 0) continue
    const taken = [sentences[i]]
    for (const next of sentences.slice(i + 1)) {
      if (taken.length >= MAX_SENTENCES) break
      if (!/^(?:he|she|they|his|her|their|together|today|now|since)\b/i.test(next) && !hits(next))
        break
      taken.push(next)
    }
    return clip(taken)
  }
  return null
}

function clip(sentences: string[]): string | null {
  let out = ''
  for (const x of sentences.slice(0, MAX_SENTENCES)) {
    const next = out ? `${out} ${x}` : x
    if (next.length > MAX_CHARS && out) break
    out = next
  }
  out = out.trim()
  if (!out) return null
  return /[.!?]["”’)]*$/.test(out) ? out : `${out}.`
}
