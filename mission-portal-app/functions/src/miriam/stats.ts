/**
 * How Miriam is doing, for Admin → Miriam: where each request was handled —
 * on the phone, by her own model, or by Claude — how it ended, whether the
 * changes she offered were confirmed, how her readings compare with what
 * Claude said each was, and her food sign-ups beside Claude's.
 *
 * One small record for each, in miriamEvents: never the words said, never
 * who said them. The app writes its own (src/features/miriam/recordTurn:
 * turns the phone handled, cards confirmed or cancelled); the server writes
 * the rest (./askMiriam). No device reads them: the server sums them up for
 * admins (./ownAdmin: stats). Kept a little over a year (../cleanup).
 *
 * Pure, and free of Firebase, so the app's tests can import it.
 */

export const EVENTS = 'miriamEvents'
/** Read for one look at the panel, at most: the latest. */
export const MAX_EVENTS = 20_000
/** Her food sign-ups read, since counting began, at most. */
export const MAX_FOOD_EVENTS = 10_000
/** Kept this long, then cleared (../cleanup). */
export const EVENTS_KEEP_DAYS = 400

/** Where a request was handled; "none" when it was turned away first (too many at once, too long). */
export type Tier = 'phone' | 'own' | 'public' | 'claude' | 'none'
/** How a request that reached the server ended. */
export type Outcome = 'answered' | 'askedBack' | 'change' | 'couldnt' | 'error' | 'limited'

export type MiriamEvent =
  /** One request, or reply, said or typed to her. The phone's say only that it handled one. */
  | { kind: 'turn'; tier: Tier; outcome?: Outcome | 'handled'; skill?: string }
  /** A change she showed to confirm (src/features/miriam/useMiriamActions). */
  | { kind: 'card'; outcome: 'confirmed' | 'cancelled' }
  /** What Claude said a request she handed on was, beside how she read it. */
  | { kind: 'label'; label: string; read: string; sure: boolean }
  /** A food sign-up she worked out, not acted on, beside what Claude did (./own: FOOD_LIVE). */
  | {
      kind: 'food'
      would: 'confirm' | 'theirs' | 'taken'
      rule: string
      /** Claude's change ("sign_up_food"), "asked back", or "answer: <skill>". */
      claude: string
      /** The same event and item as Claude's sign-up; null when Claude didn't sign them up. */
      same: boolean | null
    }

/** How a result the server sends back ended. */
export function outcomeOf(result: { kind?: unknown; followUp?: unknown }): Outcome {
  if (result.kind === 'answer') return result.followUp === true ? 'askedBack' : 'answered'
  if (result.kind === 'confirm' || result.kind === 'eventForm' || result.kind === 'taskForm') {
    return 'change'
  }
  // A plain reply: refused, not understood, or nothing she can do.
  return 'couldnt'
}

/**
 * What her own answer was, in a word or two, from why she gave it
 * (./own: Own.why): "event_time", "taught", "names", "food_signup". Only
 * her own fixed words — never anything said.
 */
export function ownTag(why: string, skill: string | undefined): string {
  const head = why.split(/[:(,]/)[0].trim()
  if (OWN_TAGS[head]) return OWN_TAGS[head]
  if (/^[a-z_]+$/.test(head)) return head
  // Hers, whatever she read it as: never "other".
  return skill && skill !== 'other' && /^[a-z_]+$/.test(skill) ? skill : 'her_own'
}

/** Her answers whose reasons are more than a word (./own: ownAnswer). */
const OWN_TAGS: Record<string, string> = {
  // From the event itself, however she read the request.
  'schedule item': 'event_page',
  'theirs at it': 'event_page',
  'someone’s travel': 'event_page',
  'what it is': 'event_page',
  // Her offer of maps, answered.
  'maps declined': 'maps',
}

export interface Summary {
  days: number
  /** Only the latest MAX_EVENTS were read: said so, rather than taken for all of them. */
  capped: boolean
  turns: Record<Tier, number> & { total: number }
  /** How the requests that reached the server ended. */
  outcomes: Record<Outcome, number>
  /** What she answered herself, by kind, most first. */
  ownBy: { skill: string; n: number }[]
  cards: { confirmed: number; cancelled: number }
  /** Her readings beside what Claude said each was. */
  labels: {
    agreed: number
    differed: number
    differences: { read: string; label: string; n: number }[]
  }
  food: {
    /** Food sign-ups she worked out, of any kind. */
    worked: number
    /** Sign-ups she would offer, beside what Claude did. */
    offered: Beside
    /** Those told only by the dish ("I'll bring chips"): not offered even once she is on. */
    dishOnly: Beside
    /** Enough agreement on what she would offer, and none against her, to switch her on. */
    ready: boolean
    /** Counted since counting began, not only over the days asked. */
    allTime: boolean
  }
}

/** Her sign-up beside Claude's: the same event and item, another, asked back first, or something else. */
export interface Beside {
  same: number
  different: number
  askedBack: number
  otherwise: number
}

/** Agreeing with Claude this many times, and never not, is enough to switch her on. */
export const FOOD_READY_AT = 20

const count = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>

const TIERS: readonly Tier[] = ['phone', 'own', 'public', 'claude', 'none']
const OUTCOMES: readonly Outcome[] = [
  'answered',
  'askedBack',
  'change',
  'couldnt',
  'error',
  'limited',
]

/**
 * The events of a stretch of days, summed up. Anything malformed is passed
 * over. `foodEvents`: her food sign-ups since counting began — whether she
 * is ready to be switched on is never decided from a stretch of days alone,
 * where an older disagreement would be left out. Without it, those of the
 * stretch.
 */
export function summarize(
  events: unknown[],
  days: number,
  capped = false,
  foodEvents?: unknown[]
): Summary {
  const turns = { ...count(TIERS), total: 0 }
  const outcomes = count(OUTCOMES)
  const own = new Map<string, number>()
  const cards = { confirmed: 0, cancelled: 0 }
  const labels = { agreed: 0, differed: 0 }
  const differences = new Map<string, number>()
  const beside = (): Beside => ({ same: 0, different: 0, askedBack: 0, otherwise: 0 })
  const food = {
    worked: 0,
    offered: beside(),
    dishOnly: beside(),
    ready: false,
    allTime: !!foodEvents,
  }

  for (const raw of events) {
    const e = raw as Record<string, unknown>
    if (!e || typeof e !== 'object') continue
    // Her food sign-ups, from all of them, below — when they were read apart.
    if (foodEvents && e.kind === 'food') continue
    if (e.kind === 'turn' && TIERS.includes(e.tier as Tier)) {
      turns.total++
      turns[e.tier as Tier]++
      if (OUTCOMES.includes(e.outcome as Outcome)) outcomes[e.outcome as Outcome]++
      if ((e.tier === 'own' || e.tier === 'public') && typeof e.skill === 'string') {
        own.set(e.skill, (own.get(e.skill) ?? 0) + 1)
      }
    } else if (e.kind === 'card' && (e.outcome === 'confirmed' || e.outcome === 'cancelled')) {
      cards[e.outcome]++
    } else if (e.kind === 'label' && typeof e.label === 'string' && typeof e.read === 'string') {
      if (e.label === e.read) labels.agreed++
      else {
        labels.differed++
        const k = `${e.read}\u0000${e.label}`
        differences.set(k, (differences.get(k) ?? 0) + 1)
      }
    }
  }
  for (const raw of foodEvents ?? events) {
    const e = raw as Record<string, unknown>
    if (!e || typeof e !== 'object') continue
    if (e.kind === 'food' && typeof e.claude === 'string') {
      food.worked++
      // A sign-up she would offer; "already yours" or "taken" are answers, not offers.
      if (e.would !== 'confirm') continue
      const b = e.rule === 'uniqueDish' ? food.dishOnly : food.offered
      if (e.claude === 'sign_up_food') {
        if (e.same === true) b.same++
        else b.different++
      } else if (e.claude === 'asked back') b.askedBack++
      else b.otherwise++
    }
  }

  food.ready =
    food.offered.same >= FOOD_READY_AT &&
    food.offered.different === 0 &&
    food.offered.otherwise === 0
  const byCount = <T extends { n: number }>(a: T, b: T) => b.n - a.n
  return {
    days,
    capped,
    turns,
    outcomes,
    ownBy: [...own].map(([skill, n]) => ({ skill, n })).sort(byCount),
    cards,
    labels: {
      ...labels,
      differences: [...differences]
        .map(([k, n]) => {
          const [read, label] = k.split('\u0000')
          return { read, label, n }
        })
        .sort(byCount)
        .slice(0, 8),
    },
    food,
  }
}
