/**
 * A reminder asked of Miriam — "remind me to go to Costco at 5 pm tomorrow",
 * "remind me in 20 minutes to call Sam", "set a reminder for Friday to book
 * the van" — worked out here, on the device, in its own time zone.
 *
 * Null when it isn't a reminder plainly asked for, or no time was said: then
 * Claude works it out, and asks when if it has to.
 */
export interface ReminderAsk {
  /** What to be reminded of, as it will be shown: "Go to Costco". */
  text: string
  /** As it will be said back: "to go to Costco", "about the meeting". */
  spoken: string
  /** The first time; for a repeating one, the next of it. */
  at: Date
  repeat?: Repeat
}

/** How often a reminder comes round (functions/src/push/reminderTime). */
export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'monthly'

const ASKED =
  /^(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:remind\s+me|set\s+(?:a|me\s+a)\s+reminder|add\s+a\s+reminder|make\s+a\s+reminder|create\s+a\s+reminder)(?:\s+for\s+me)?\s*(.*)$/i

const NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  'forty-five': 45,
  fifty: 50,
}
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
/** A part of the day said without a time: when it is taken to mean. */
const PARTS: Record<string, number> = {
  morning: 9,
  afternoon: 14,
  evening: 18,
  tonight: 20,
  night: 20,
}

const atDay = (now: Date, days: number) => {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

export function reminderAsked(said: string, now: Date): ReminderAsk | null {
  // Case kept, for what is left ("Costco"); every pattern below ignores it.
  let s = said
    .replace(/[’]/g, "'")
    .replace(/\b(a)\.?\s?m\.?(?=\s|$)/gi, 'am')
    .replace(/\b(p)\.?\s?m\.?(?=\s|$)/gi, 'pm')
    .replace(/[,.!?]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:hey|ok|okay)\s+/i, '')
    .replace(/^miriam\s+/i, '')
  const m = s.match(ASKED)
  if (!m) return null
  s = ` ${m[1]} `
  // A part found, taken out of what is left — its words lowered, to read.
  const cut = (re: RegExp) => {
    const found = s.match(re)
    if (found) s = s.replace(re, ' ')
    return found && found.map((x) => (x ?? '').toLowerCase())
  }

  // "Every day at 8", "every Sunday", "every weekday morning", "every month", "daily".
  let repeat: Repeat | undefined
  let everyDay = -1
  let partDefault: number | null = null
  const every = cut(
    /\s(?:every|each)\s+(day|morning|afternoon|evening|night|weekday|week|month|sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?(?=\s)/i
  )
  if (every) {
    const w = every[1]
    if (w === 'weekday') repeat = 'weekdays'
    else if (w === 'week') repeat = 'weekly'
    else if (w === 'month') repeat = 'monthly'
    else if (WEEKDAYS.includes(w)) {
      repeat = 'weekly'
      everyDay = WEEKDAYS.indexOf(w)
    } else {
      repeat = 'daily'
      if (w !== 'day') partDefault = PARTS[w]
    }
  } else {
    const plain = cut(/\s(daily|weekly|monthly)(?=\s)/i)
    if (plain) repeat = plain[1] as Repeat
  }

  // "In 20 minutes", "in an hour", "in half an hour", "in 2 days".
  const rel = cut(
    /\s(?:in|after)\s+(half\s+an?\s+hour|\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|forty-five|fifty)\s*(minutes?|mins?|hours?|hrs?|days?)?(?=\s)/i
  )
  let at: Date | null = null
  if (rel) {
    if (rel[1].startsWith('half')) at = new Date(now.getTime() + 30 * 60_000)
    else if (rel[2]) {
      const n = /^\d+$/.test(rel[1]) ? Number(rel[1]) : NUMBERS[rel[1]]
      const unit = rel[2].startsWith('d') ? 1440 : rel[2].startsWith('h') ? 60 : 1
      if (n > 0) at = new Date(now.getTime() + n * unit * 60_000)
    }
  }

  if (!at) {
    // The day.
    let day: Date | null = null
    // "Every Sunday": the next one, today if its time is still to come.
    if (everyDay >= 0) day = atDay(now, (everyDay - now.getDay() + 7) % 7)
    else if (cut(/\s(?:the\s+)?day\s+after\s+tomorrow(?=\s)/i)) day = atDay(now, 2)
    else if (cut(/\stomorrow(?=\s)/i)) day = atDay(now, 1)
    else if (cut(/\stoday(?=\s)/i)) day = atDay(now, 0)
    else {
      const wd = cut(
        /\s(?:on\s+)?(?:(next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?=\s)/i
      )
      if (wd) {
        let ahead = (WEEKDAYS.indexOf(wd[2]) - now.getDay() + 7) % 7
        if (ahead === 0 || wd[1] === 'next') ahead = ahead === 0 ? 7 : ahead
        day = atDay(now, ahead)
      } else {
        const md =
          cut(
            new RegExp(
              `\\s(?:on\\s+)?(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`,
              'i'
            )
          ) ?? cut(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})(?=\s)/i)
        if (md) {
          const month = /^\d+$/.test(md[1]) ? Number(md[1]) - 1 : MONTHS.indexOf(md[1])
          const date = Number(md[2])
          if (month >= 0 && month < 12 && date >= 1 && date <= 31) {
            day = new Date(now.getFullYear(), month, date)
            if (day < atDay(now, 0)) day = new Date(now.getFullYear() + 1, month, date)
          }
        }
      }
    }

    // The time.
    let hour: number | null = null
    let minute = 0
    let meridiem: string | null = null
    const clock =
      cut(/\s(?:at|by|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?=\s)/i) ??
      cut(/\s(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s)/i)
    if (clock) {
      hour = Number(clock[1])
      minute = clock[2] ? Number(clock[2]) : 0
      meridiem = clock[3] || null
      if (hour > 23 || minute > 59 || (meridiem && (hour < 1 || hour > 12))) return null
    } else if (cut(/\s(?:at\s+)?noon(?=\s)/i)) hour = 12
    else if (cut(/\s(?:at\s+)?midnight(?=\s)/i)) {
      hour = 0
      if (!day) day = atDay(now, 1)
    }
    const part = cut(
      /\s(?:in\s+the\s+|this\s+|tomorrow\s+)?(morning|afternoon|evening|tonight|night)(?=\s)/i
    )
    if (part) {
      if (part[1] === 'tonight' && !day) day = atDay(now, 0)
      if (hour === null) hour = PARTS[part[1]]
      else if (!meridiem && part[1] !== 'morning' && hour < 12) meridiem = 'pm'
    }
    if (hour === null && partDefault !== null) hour = partDefault
    if (hour === null && !day && !repeat) return null
    if (hour === null) hour = 9

    const on = (base: Date, h: number) => {
      const d = new Date(base)
      d.setHours(h, minute, 0, 0)
      return d
    }
    const h24 = (h: number, mer: string) => (mer === 'pm' ? (h % 12) + 12 : h % 12)
    if (meridiem || hour > 12 || hour === 0) {
      const h = meridiem ? h24(hour, meridiem) : hour
      at = on(day ?? atDay(now, 0), h)
      if (!day && at <= now) at = on(atDay(now, 1), h)
    } else if (day || repeat) {
      // A day (or every day), and an hour said without am or pm: as it would be meant.
      at = on(day ?? atDay(now, 0), hour >= 7 && hour <= 11 ? hour : h24(hour, 'pm'))
    } else {
      // Today, the next time that hour comes round.
      const options = [on(atDay(now, 0), hour % 12), on(atDay(now, 0), (hour % 12) + 12)]
      at =
        options.find((d) => d > now) ??
        on(atDay(now, 1), hour >= 7 && hour <= 11 ? hour : h24(hour, 'pm'))
    }
  }
  if (at && repeat) {
    // The first of a repeating one still to come: the next of that weekday,
    // else the next day — and it repeats from there.
    const step = repeat === 'weekly' && everyDay >= 0 ? 7 : 1
    for (let i = 0; i < 14 && at <= now; i++) {
      at = new Date(at)
      at.setDate(at.getDate() + step)
    }
    while (repeat === 'weekdays' && (at.getDay() === 0 || at.getDay() === 6)) {
      at = new Date(at)
      at.setDate(at.getDate() + 1)
    }
  }
  if (!at || at <= now) return null

  // What is left names what to be reminded of: "to go to Costco", "about the meeting".
  const left = s.replace(/\s+/g, ' ').trim()
  const lead = left.match(/^(to|that|about|of|for)\s+(?:(?:to|that)\s+)?/i)
  const rest = (lead ? left.slice(lead[0].length) : left)
    .replace(/\s+(?:at|on|by|in|for)$/i, '')
    .trim()
  if (!rest) return null
  const text = rest.charAt(0).toUpperCase() + rest.slice(1)
  const yours = rest.replace(/\bmy\b/gi, 'your').replace(/\bme\b/gi, 'you')
  const about = /^(?:about|of)$/i.test(lead?.[1] ?? '')
  return { text, spoken: `${about ? 'about' : 'to'} ${yours}`, at, ...(repeat ? { repeat } : {}) }
}

/** When, as said back: "today at 5 PM", "tomorrow at 9 AM", "on Friday at 6:30 PM", "in 20 minutes". */
export function reminderWhen(at: Date, now: Date): string {
  const mins = Math.round((at.getTime() - now.getTime()) / 60_000)
  if (mins < 60) return `in ${mins} ${mins === 1 ? 'minute' : 'minutes'}`
  const time = at.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: at.getMinutes() ? '2-digit' : undefined,
  })
  const days = Math.round((atDay(at, 0).getTime() - atDay(now, 0).getTime()) / 86_400_000)
  if (days === 0) return `today at ${time}`
  if (days === 1) return `tomorrow at ${time}`
  if (days < 7) return `on ${at.toLocaleDateString('en-US', { weekday: 'long' })} at ${time}`
  return `on ${at.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${time}`
}

/** A repeating reminder's when, as said: "every Sunday at 8 AM", "every weekday at 7 AM". */
export function repeatWhen(at: Date, repeat: Repeat): string {
  const time = at.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: at.getMinutes() ? '2-digit' : undefined,
  })
  if (repeat === 'daily') return `every day at ${time}`
  if (repeat === 'weekdays') return `every weekday at ${time}`
  if (repeat === 'weekly')
    return `every ${at.toLocaleDateString('en-US', { weekday: 'long' })} at ${time}`
  const d = at.getDate()
  const th =
    d % 10 === 1 && d !== 11
      ? 'st'
      : d % 10 === 2 && d !== 12
        ? 'nd'
        : d % 10 === 3 && d !== 13
          ? 'rd'
          : 'th'
  return `on the ${d}${th} of every month at ${time}`
}
