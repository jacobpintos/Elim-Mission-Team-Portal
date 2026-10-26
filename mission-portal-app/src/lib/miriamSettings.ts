/**
 * Their own settings, asked of Miriam — "change to light mode", "change my
 * name to Sam Lee", "set my location to North Liberty, Iowa", "change my
 * password" — read here, on the device, for anyone: a public follower's
 * requests never go to Claude, and these are theirs to change as Settings
 * lets them.
 *
 * Pure, so it can be tested.
 */

export type ThemeMode = 'light' | 'dark'

const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Asking whether it is, not for it: "is dark mode on?", "what is light mode?". */
const ASKS_WHETHER = /^(?:is|are|does|do\s+you\s+have|what\s+(?:is|does))\b/

/**
 * "Change to light mode", "switch to dark mode", "dark theme please", "turn
 * off dark mode" (light), "make the app dark": the mode asked for, or null.
 */
export function themeAsked(text: string): ThemeMode | null {
  const t = plain(text)
  if (ASKS_WHETHER.test(t)) return null
  const named = /\b(light|dark)(?:\s+|-)?(?:mode|theme)\b/.exec(t)
  const made =
    named ??
    /\b(?:make|turn|switch|set|change|put)\b(?:\s+(?:it|the\s+app|the\s+screen|everything|this|back))*\s+(?:to\s+)?(light|dark)$/.exec(
      t
    )
  if (!made) return null
  const mode = made[1] as ThemeMode
  // "Turn off dark mode": the other one.
  const off =
    named &&
    /\b(?:turn|switch|shut)\s+(?:\w+\s+){0,2}off\b|\boff$|\bdisable\b|\bno\s+more\b/.test(t)
  return off ? (mode === 'light' ? 'dark' : 'light') : mode
}

/** A name as written, or capitalized when it was all lower case (as speech gives it). */
function asName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  return name === name.toLowerCase() ? name.replace(/\b\w/g, (c) => c.toUpperCase()) : name
}

/** "Change my name to Sam Lee", "set my display name to Sam": the name, or null. */
export function nameChangeAsked(text: string): string | null {
  const t = text
    .replace(/[’‘]/g, "'")
    .trim()
    .replace(/[.!?]+$/, '')
  const m =
    /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:change|set|update|make)\s+my\s+(?:display\s+|first\s+|full\s+)?name\s+(?:to|as|be)\s+(.+?)(?:\s+please)?$/i.exec(
      t
    )
  if (!m) return null
  const name = m[1].replace(/^["“]|["”]$/g, '')
  return name && name.length <= 80 ? asName(name) : null
}

const STATES: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
}
const ABBREVIATIONS = new Set(Object.values(STATES))

/** Where they are, and how far out "near" reaches: what Settings' Location holds. */
export interface LocationAsk {
  /** Empty when only the distance was asked about. */
  city: string
  state: string
  radius: number | null
}

/** "North Liberty, Iowa", "Iowa City IA", "Austin, TX": the city, and its state as two letters. */
export function placeIn(raw: string): { city: string; state: string } | null {
  const said = raw.trim().replace(/\s+/g, ' ')
  if (!said) return null
  const words = said.split(/,\s*|\s+/)
  // The state: the last word or two, by name or as two letters.
  for (const n of [2, 1]) {
    if (words.length <= n) continue
    const tail = words.slice(-n).join(' ')
    const state =
      STATES[tail.toLowerCase()] ??
      (ABBREVIATIONS.has(tail.toUpperCase()) && n === 1 ? tail.toUpperCase() : null)
    if (state) {
      const city = said.slice(0, said.length - tail.length).replace(/[,\s]+$/, '')
      return city ? { city: asName(city), state } : null
    }
  }
  const [city, state] = said.split(/\s*,\s*/)
  return { city: asName(city), state: (state ?? '').trim() }
}

const MILES = /\bwithin\s+(\d{1,3})\s*(?:miles?|mi)\b|\b(\d{1,3})\s*(?:miles?|mi)\b/

/**
 * "Set my location to North Liberty, Iowa", "I live in Austin, TX", "change
 * my location to Iowa City within 30 miles", "change my radius to 25 miles":
 * what to set, or null.
 */
export function locationAsked(text: string): LocationAsk | null {
  const t = text
    .replace(/[’‘]/g, "'")
    .trim()
    .replace(/[.!?]+$/, '')
  const milesIn = (s: string) => {
    const m = MILES.exec(s)
    const n = m ? Number(m[1] ?? m[2]) : NaN
    return n > 0 ? n : null
  }
  const radiusOnly =
    /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:change|set|update|make)\s+my\s+(?:search\s+)?(?:radius|distance|range)\b/i.test(
      t
    )
  if (radiusOnly) {
    const radius = milesIn(t) ?? (Number(/\b(\d{1,3})\b/.exec(t)?.[1]) || null)
    return radius ? { city: '', state: '', radius } : null
  }
  const m =
    /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:(?:change|set|update|move)\s+my\s+(?:home\s+)?location\s+to|my\s+location\s+is|i\s+live\s+in)\s+(.+)$/i.exec(
      t
    )
  if (!m) return null
  const radius = milesIn(m[1])
  const where = m[1].replace(/\s*(?:,\s*)?(?:within\s+)?\d{1,3}\s*(?:miles?|mi)\b.*$/i, '').trim()
  const place = placeIn(where)
  return place?.city ? { ...place, radius } : null
}

export type AccountAsk = 'email' | 'password' | 'photo'

/** "Change my email", "reset my password", "change my profile picture": what of their account, or null. */
export function accountAsked(text: string): AccountAsk | null {
  const t = plain(text)
  if (!/\b(?:change|update|reset|set|new|edit|replace|forgot|remove|add|upload|put)\b/.test(t))
    return null
  // Theirs: "my email", "my account's password" — not "a new email to Sam".
  const mine = /\b(?:my|account)\b/.test(t)
  if (mine && /\be-?mail(?:\s+address)?\b/.test(t) && !/\bnotifications?\b|\bdigest/.test(t))
    return 'email'
  if (/\bpass\s?word\b/.test(t) && (mine || /\b(?:a|the)\s+(?:new\s+)?pass\s?word\b/.test(t)))
    return 'password'
  // A picture of them: "my photo", "a profile picture", "how do I add a photo".
  const picture = /\b(?:photo|picture|pic|avatar)\b/
  // Not one put somewhere else: "add a photo to the event".
  const elsewhere = /\b(?:to|on|in|for)\s+(?:the|an?|this|that|our)\b/.test(t)
  if (
    picture.test(t) &&
    (mine || /\bprofile\b/.test(t) || (/\b(?:add|upload|put)\b/.test(t) && !elsewhere))
  )
    return 'photo'
  return null
}
