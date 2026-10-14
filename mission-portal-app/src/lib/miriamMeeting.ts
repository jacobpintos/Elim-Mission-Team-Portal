/**
 * Asking Miriam to meet with someone from the church's leadership — "I'd
 * like to meet with Pastor Sam next Tuesday about baptism", "can I talk to a
 * pastor?" — read here into the Connect page's meeting form (page-builder
 * MeetingBlock), filled in for them to check and send themselves: who, when
 * they are free, and what about. Nothing is sent for them.
 */

export interface MeetingAsk {
  /** Leaders named, as said ("Sam", "Jacob Pintos"); none for "a pastor". */
  names: string[]
  /** When they said they are free: "next Tuesday afternoon, Thursday after 5". */
  availability: string
  /** What about: "Baptism". */
  message: string
}

/** Asked plainly for the form itself: "fill out the meeting form", "request a meeting". */
const THE_FORM =
  /\b(?:fill\s+(?:out|in)|open|start|do|get)\s+(?:the|a)\s+meeting(?:\s+request)?\s+form\b|\brequest\s+a\s+meeting\b|\bmeeting\s+request\b/

/** Wanting to: "I'd like to", "can I", "how do I", "set up", "schedule". */
const WANT =
  /\b(?:i'?d\s+(?:like|love)|i\s+would\s+(?:like|love)|i\s+want|i\s+need|can\s+i|could\s+i|may\s+i|how\s+(?:do|can)\s+i|help\s+me|i'?m\s+hoping|set\s+up|schedule|book|arrange)\b/

/** Meeting, as opposed to talking about something else. */
const MEET = /\b(?:meet|meeting|sit\s+down|appointment|get\s+(?:coffee|together))\b/
const TALK = /\b(?:talk|speak|chat)\b/

/** The church's leadership, said without a name. */
const LEADERSHIP =
  /^(?:(?:a|an|the|our|one\s+of\s+(?:the|your|our))\s+|some(?:one|body)\s+(?:from|on|in)\s+(?:the\s+)?)?(?:pastors?|leaders?|leadership(?:\s+team)?|elders?|staff|someone|somebody|church\s+leadership|the\s+church)$/

/** Words that say where the leader's name ends and something else begins. */
const AFTER_NAME =
  /\s+(?:about|regarding|re|because|since|to\s+(?:discuss|talk|chat|pray)|for|on|this|next|tomorrow|today|tonight|at|after|before|sometime|some\s+time|whenever|when|during|in|any|i'?m|i\s+am|if|please)\b.*$/

const TITLES =
  /\b(?:pastors?|ps|elders?|brother|sister|mr|mrs|ms|miss|dr|deacon|rev|reverend)\b\.?/g

/** When they are free, as said: days, parts of days, times. */
const FREE = new RegExp(
  [
    '(?:(?:next|this|any)\\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day(?:s)?(?:\\s+(?:morning|afternoon|evening|night)s?)?',
    'tomorrow(?:\\s+(?:morning|afternoon|evening|night))?',
    'today|tonight',
    '(?:this|next)\\s+(?:week(?:end)?|month)',
    'weekends?|weekdays?(?:\\s+(?:morning|afternoon|evening)s?)?',
    '(?:in\\s+the\\s+)?(?:mornings?|afternoons?|evenings?)',
    '(?:after|before|around|at|by)\\s+(?:noon|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?)',
    'any\\s*time|anytime',
  ].join('|'),
  'g'
)

/** What it's about, said after "about", "regarding", "to discuss", "because". */
const ABOUT =
  /\b(?:about|regarding|re|to\s+discuss|to\s+talk\s+about|to\s+chat\s+about|because|since|to\s+pray\s+(?:about|for))\s+(.+)$/

const plain = (text: string) =>
  text.toLowerCase().replace(/[’‘]/g, "'").replace(/[?!]+/g, ' ').replace(/\s+/g, ' ').trim()

const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const titled = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase())

/** A meeting asked for — the form, filled in as far as was said — or null for anything else. */
export function meetingAsked(text: string): MeetingAsk | null {
  const s = plain(text)
  // A message to someone is a message.
  if (/\b(?:message|text|email|e-mail|dm|tell)\b/.test(s)) return null
  const form = THE_FORM.test(s)
  if (!form && !(WANT.test(s) && (MEET.test(s) || TALK.test(s)))) return null

  // Who: after "with" or "to", up to where something else begins.
  let names: string[] = []
  // Someone of the leadership: said so, or by a title ("Pastor Sam").
  let leaders = false
  const who =
    /\b(?:meet(?:ing)?|sit\s+down|talk|speak|chat|appointment|coffee|together)\s+(?:up\s+)?(?:with|to)\s+(.+)$/.exec(
      s
    )
  if (who) {
    const said = who[1]
      .replace(AFTER_NAME, '')
      .replace(/[,.;:]+$/, '')
      .trim()
    if (LEADERSHIP.test(said)) leaders = true
    else {
      leaders = /\b(?:pastors?|ps|elders?|leaders?|deacon|rev|reverend)\b/.test(said)
      names = said
        .split(/\s*(?:,|\band\b|\bor\b|&)\s*/)
        .map((n) =>
          n
            .replace(TITLES, ' ')
            .replace(/\b(?:the|a|an|our)\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        )
        .filter((n) => n && !LEADERSHIP.test(n))
        .map(titled)
    }
  }
  // Talking to someone not of the leadership, without a meeting: not this.
  if (!form && !MEET.test(s) && !leaders) return null

  const free = [...s.matchAll(FREE)].map((m) => m[0].trim())
  const about = ABOUT.exec(s)?.[1] ?? ''
  // What it's about, without when they're free said after it.
  const message = capital(
    about
      .replace(FREE, ' ')
      .replace(/\s+(?:on|at|or|and)\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
  // Days as days are written: "Next Tuesday afternoon, Saturday morning".
  const days = (t: string) =>
    t.replace(/\b(?:mon|tues|wednes|thurs|fri|satur|sun)day/g, (d) => capital(d))
  return { names, availability: capital(days([...new Set(free)].join(', '))), message }
}

/** The leaders a name said is: by any of their names, first or last ("Sam" — "Sam Hart"). */
export function leadersNamed<L extends { uid: string; displayName?: string }>(
  names: readonly string[],
  leaders: readonly L[]
): L[] {
  const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean)
  return leaders.filter((l) => {
    const theirs = words(l.displayName ?? '')
    return names.some((n) => {
      const said = words(n)
      return said.length > 0 && said.every((w) => theirs.includes(w))
    })
  })
}
