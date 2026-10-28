import { shiftDate } from '../data'

/**
 * The days and times said in a request, as Miriam's own skills read them:
 * the day an event is asked about ("Friday", "the 20th"), the days a "what
 * do I have" covers ("this weekend"), and when a reminder is for ("at 3:50",
 * "in 20 minutes", "tomorrow at 9"). As the app reads them on the device
 * (src/lib/miriamQuick, src/lib/reminders), so the same words mean the same.
 */

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
const MONTH_RE =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

const pad = (n: number) => String(n).padStart(2, '0')
const dayOfWeek = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay()
const monthOf = (word: string) => MONTHS.findIndex((m) => m.startsWith(word.slice(0, 3)))

/** Lowercase, plain apostrophes, punctuation that ends words gone. */
export const plainText = (text: string) => keptCase(text).toLowerCase()

/** The same, its letters as they were: for words kept, as a reminder's. */
const keptCase = (text: string) =>
  text
    .replace(/[’‘]/g, "'")
    .replace(/[?!,;]+/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** A month and day, this year — or next, if it is long past. */
function dated(today: string, month: number, day: number, year?: number): string | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  const y0 = year ?? Number(today.slice(0, 4))
  let d = `${y0}-${pad(month + 1)}-${pad(day)}`
  if (new Date(`${d}T12:00:00Z`).getUTCMonth() !== month) return null
  if (!year && d < shiftDate(today, -30)) d = `${y0 + 1}-${pad(month + 1)}-${pad(day)}`
  return d
}

/**
 * The day said: "today", "tonight", "tomorrow", "Friday" (the next one,
 * today if it is that day; "next Friday" the same, but a week on if today
 * is Friday), "October 20th", "10/20", "the 20th". Null if none is.
 */
export function dayIn(text: string, today: string): string | null {
  const s = plainText(text)
  if (/\bday after tomorrow\b/.test(s)) return shiftDate(today, 2)
  if (/\b(?:today|tonight|this (?:morning|afternoon|evening))\b/.test(s)) return today
  if (/\b(?:tomorrow|tmrw|tmr)\b/.test(s)) return shiftDate(today, 1)
  let m = new RegExp(`\\b${MONTH_RE}\\.? (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?\\b`).exec(s)
  if (m) return dated(today, monthOf(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined)
  m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? of ${MONTH_RE}\\b`).exec(s)
  if (m) return dated(today, monthOf(m[2]), Number(m[1]))
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(s)
  if (m) {
    const y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : undefined
    return dated(today, Number(m[1]) - 1, Number(m[2]), y)
  }
  m = /\b(?:on )?the (\d{1,2})(?:st|nd|rd|th)\b/.exec(s)
  if (m) {
    const day = Number(m[1])
    const [y, mo, d] = today.split('-').map(Number)
    return day >= d
      ? dated(today, mo - 1, day, y)
      : dated(today, mo % 12, day, mo === 12 ? y + 1 : y)
  }
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}'?s?\\b`).test(s))
  if (wd >= 0) {
    let ahead = (wd - dayOfWeek(today) + 7) % 7
    if (new RegExp(`\\bnext ${WEEKDAYS[wd]}\\b`).test(s) && ahead === 0) ahead = 7
    return shiftDate(today, ahead)
  }
  return null
}

/** The days a "what do I have" covers, or just the next event. */
export interface Span {
  from: string
  to: string
  /** As said back: "today", "this weekend", "on Friday", "in the next 30 days". */
  said: string
  next: boolean
}

/** A list's opening, from what the span is said as: "On this week", "On Friday", "In the next 30 days". */
export function spanLead(said: string): string {
  return /^(?:in|on|over)\b/.test(said)
    ? `${said.charAt(0).toUpperCase()}${said.slice(1)}`
    : `On ${said}`
}

const COUNT: Record<string, number> = {
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
  twelve: 12,
  fourteen: 14,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  sixty: 60,
  ninety: 90,
  couple: 2,
  'couple of': 2,
  few: 4,
}
const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30 }
/** How far "coming up" looks, with no stretch of days said. */
export const COMING_UP_DAYS = 30

/**
 * A stretch from today, said as one: "the next 30 days", "the next two
 * weeks", "the coming month", "my upcoming week", "the week ahead" — not
 * "next week" or "next month", which are the calendar's (spanIn).
 */
function aheadIn(s: string, today: string): Span | null {
  const counted =
    /\b(?:next|coming|following|upcoming)\s+(\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fourteen|fifteen|twenty|thirty|sixty|ninety|couple(?: of)?|few)\s+(day|week|month)s?\b/.exec(
      s
    )
  if (counted) {
    const n = /^\d/.test(counted[1]) ? Number(counted[1]) : COUNT[counted[1]]
    const unit = counted[2]
    const days = Math.min(365, Math.max(1, n * UNIT_DAYS[unit]))
    const single = ['a', 'an', 'one'].includes(counted[1])
    const said = single ? `in the next ${unit}` : `in the next ${counted[1]} ${unit}s`
    return { from: today, to: shiftDate(today, days - 1), said, next: false }
  }
  const ahead =
    /\b(?:upcoming|coming)\s+(week|month)\b/.exec(s) ?? /\b(week|month)\s+ahead\b/.exec(s)
  if (ahead) {
    const days = UNIT_DAYS[ahead[1]]
    return {
      from: today,
      to: shiftDate(today, days - 1),
      said: `in the ${ahead[1]} ahead`,
      next: false,
    }
  }
  return null
}

/** As the app has them (src/lib/miriamQuick: listAsked): a week runs Sunday to Saturday. */
export function spanIn(text: string, today: string): Span {
  const s = plainText(text)
  const said = spanSaid(text, today)
  if (said) return said
  // "What's next?", "my next event": the one soonest.
  if (/\b(?:next|soonest)\b/.test(s)) {
    return { from: today, to: shiftDate(today, 365), said: '', next: true }
  }
  // "What's coming up?": a list, of the next month or so.
  if (/\b(?:coming up|upcoming)\b/.test(s)) {
    return {
      from: today,
      to: shiftDate(today, COMING_UP_DAYS - 1),
      said: `in the next ${COMING_UP_DAYS} days`,
      next: false,
    }
  }
  const day = dayOfWeek(today)
  return { from: today, to: shiftDate(today, 6 - day), said: 'this week', next: false }
}

/**
 * The stretch of days asked about, when one was said — "today", "this
 * weekend", "next month", "the next 30 days", "on Friday" — or null.
 */
export function spanSaid(text: string, today: string): Span | null {
  const s = plainText(text)
  const day = dayOfWeek(today)
  const one = (d: string, said: string): Span => ({ from: d, to: d, said, next: false })
  const ahead = aheadIn(s, today)
  if (ahead) return ahead
  if (/\b(?:today|tonight|this (?:morning|afternoon|evening))\b/.test(s)) return one(today, 'today')
  if (/\b(?:tomorrow|tmrw|tmr)\b/.test(s)) return one(shiftDate(today, 1), 'tomorrow')
  if (/\bnext weekend\b/.test(s)) {
    // On a Sunday this weekend is today, and next weekend the coming Saturday.
    const coming = (6 - day + 7) % 7
    const sat = shiftDate(today, day === 0 ? coming : coming + 7)
    return { from: sat, to: shiftDate(sat, 1), said: 'next weekend', next: false }
  }
  if (/\b(?:this )?weekend\b/.test(s)) {
    const sat = shiftDate(today, (6 - day + 7) % 7)
    return day === 0
      ? one(today, 'this weekend')
      : { from: sat, to: shiftDate(sat, 1), said: 'this weekend', next: false }
  }
  if (/\bnext week\b/.test(s)) {
    const sun = shiftDate(today, 7 - day)
    return { from: sun, to: shiftDate(sun, 6), said: 'next week', next: false }
  }
  if (/\bnext month\b/.test(s)) {
    const [y, m] = today.split('-').map(Number)
    const first = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`
    const last = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 0))
    return { from: first, to: last.toISOString().slice(0, 10), said: 'next month', next: false }
  }
  if (/\b(?:this|my|the) month\b/.test(s)) {
    const [y, m] = today.split('-').map(Number)
    const last = new Date(Date.UTC(y, m, 0))
    return { from: today, to: last.toISOString().slice(0, 10), said: 'this month', next: false }
  }
  if (/\b(?:this|my|the) week\b/.test(s)) {
    return { from: today, to: shiftDate(today, 6 - day), said: 'this week', next: false }
  }
  const named = dayIn(s, today)
  if (named) {
    const label = new Date(`${named}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
      ...(named > shiftDate(today, 6) ? { month: 'long', day: 'numeric' } : {}),
    })
    return one(named, `on ${label}`)
  }
  return null
}

export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface ReminderAsk {
  /** What to remind them of, as a short task: "Call Sam". */
  text: string
  /** Their local date and time, YYYY-MM-DDTHH:MM. */
  when: string
  repeat: Repeat
}

/** The words that ask for a reminder, before what it is for. */
const ASKING = [
  /^(?:(?:hey|ok|okay) )?(?:miriam )?(?:please )?(?:(?:can|could|would|will) you )?(?:please )?/i,
  /^(?:i need you to |i want you to |i'd like you to )/i,
  /^(?:set|make|add|create|put|schedule) (?:up )?(?:me )?(?:a |an )?(?:new )?(?:alarm )?reminder(?: on my phone)?(?: for me)?:? ?/i,
  /^(?:i need|give me|i want) (?:a )?reminder:? ?/i,
  /^(?:remind|ping|nudge|alert|text|buzz) me(?: to\b)?:? ?/i,
  /^(?:don't|do not) let me forget(?: to\b)? ?/i,
  /^(?:make sure|help me) (?:i )?remember(?: to\b)? ?/i,
]

/** "3", "3:50", "3:50pm", "3 p.m.", "noon": hour and minute, and whether am or pm was said. */
function clockIn(
  s: string
): { h: number; min: number; meridiem: boolean; at: RegExpExecArray } | null {
  const named = /\b(?:at |by |around )?(noon|midday|midnight)\b/i.exec(s)
  if (named) {
    return { h: named[1].toLowerCase() === 'midnight' ? 0 : 12, min: 0, meridiem: true, at: named }
  }
  const m =
    /\b(?:at|by|around|for|@) (\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm|o'?clock)?(?=\s|$)/i.exec(
      s
    ) ??
    /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)(?=\s|$)/i.exec(s) ??
    /\b(\d{1,2}):(\d{2})()(?=\s|$)/.exec(s)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  if (h > 23 || min > 59) return null
  const mer = (m[3] ?? '').toLowerCase().replace(/\./g, '')
  if (mer === 'pm' && h < 12) h += 12
  if (mer === 'am' && h === 12) h = 0
  return { h, min, meridiem: mer === 'am' || mer === 'pm' || h > 12, at: m }
}

/**
 * A reminder asked for: its time, from `now` (their clock, "HH:MM", sent by
 * the app), and what it is for. Null when it can't be told — no time, no
 * task, a time already gone, before an event ("an hour before Revival"), or
 * for every event: Claude has those.
 */
export function reminderIn(text: string, today: string, now: string | null): ReminderAsk | null {
  // Its letters kept as they were said, for the task: "Call Sam".
  let s = keptCase(text)
  if (/\bbefore (?:every|each|all|my|the|our)\b|\bevery event\b|\beach event\b/i.test(s))
    return null
  for (const re of ASKING) s = s.replace(re, '')
  const clockNow = now && /^\d{2}:\d{2}$/.test(now) ? now.split(':').map(Number) : null
  let date: string | null = null
  let h: number | null = null
  let min = 0
  const cut: RegExp[] = []

  const rel =
    /\bin (an?|one|two|three|four|five|ten|fifteen|twenty|thirty|forty five|\d{1,3}) (minutes?|mins?|hours?|hrs?)\b|\bin (?:a )?half (?:an )?hour\b/i.exec(
      s
    )
  const words: Record<string, number> = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    ten: 10,
    fifteen: 15,
    twenty: 20,
    thirty: 30,
    'forty five': 45,
  }
  if (rel) {
    // From their clock now: without it, a time from now can't be worked out here.
    if (!clockNow) return null
    const n = rel[1] ? (words[rel[1].toLowerCase()] ?? Number(rel[1])) : 30
    const minutes = rel[2] && /^h/i.test(rel[2]) ? n * 60 : n
    const total = clockNow[0] * 60 + clockNow[1] + minutes
    date = shiftDate(today, Math.floor(total / 1440))
    h = Math.floor((total % 1440) / 60)
    min = total % 60
    cut.push(new RegExp(rel[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  } else {
    const clock = clockIn(s)
    const day = dayIn(s, today)
    const part = /\b(?:tomorrow |this |tonight)?(morning|afternoon|evening|night|tonight)\b/i
      .exec(s)?.[1]
      ?.toLowerCase()
    if (clock) {
      h = clock.h
      min = clock.min
      cut.push(new RegExp(clock.at[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
      if (!clock.meridiem && h >= 1 && h <= 11) {
        // No am or pm: as a day is planned — 7 to 11 the morning, 1 to 6 the
        // afternoon — unless the part of the day was said.
        const evening = part && /afternoon|evening|night|tonight/.test(part)
        const morning = part === 'morning'
        if (evening || (!morning && h <= 6)) h += 12
      }
    } else if (part) {
      h = { morning: 9, afternoon: 14, evening: 18, night: 20, tonight: 20 }[part] ?? null
    } else if (day && day !== today) {
      // A day without a time: 9 in the morning, as Claude's reminders have it.
      h = 9
    }
    if (h === null) return null
    date = day ?? today
    // Today, at a time gone already, and no day said: the same time tomorrow.
    if (!day && clockNow && h * 60 + min <= clockNow[0] * 60 + clockNow[1]) {
      date = shiftDate(today, 1)
    }
  }
  if (date === today && clockNow && (h as number) * 60 + min <= clockNow[0] * 60 + clockNow[1]) {
    return null
  }
  // Without their clock, today's times can't be checked: only another day's.
  if (!clockNow && date === today) return null

  let repeat: Repeat = 'none'
  const said = s.toLowerCase()
  if (/\b(?:every ?day|daily|each day|every (?:morning|night|evening))\b/.test(said))
    repeat = 'daily'
  else if (/\bevery weekday\b|\bweekdays\b/.test(said)) repeat = 'weekdays'
  else if (
    /\b(?:every (?:week|sunday|monday|tuesday|wednesday|thursday|friday|saturday)|weekly)\b/.test(
      said
    )
  )
    repeat = 'weekly'
  else if (/\b(?:every month|monthly)\b/.test(said)) repeat = 'monthly'

  // What is left, once the asking and the time are taken off, is the task.
  let task = s
  for (const re of cut) task = task.replace(re, ' ')
  task = task
    .replace(
      /\b(?:on |this |next )?(?:day after tomorrow|today|tonight|tomorrow|tmrw|tmr)(?: (?:morning|afternoon|evening|night))?\b/gi,
      ' '
    )
    .replace(
      new RegExp(`\\b(?:every |on |this |next )?(?:${WEEKDAYS.join('|')})'?s?\\b`, 'gi'),
      ' '
    )
    .replace(
      new RegExp(`\\b(?:on )?${MONTH_RE}\\.? \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?\\b`, 'gi'),
      ' '
    )
    .replace(/\b(?:on )?the \d{1,2}(?:st|nd|rd|th)\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, ' ')
    .replace(/\b(?:this |in the )(?:morning|afternoon|evening)\b|\bat night\b/gi, ' ')
    .replace(
      /\b(?:every ?day|daily|each day|every weekday|weekdays|every week|weekly|every month|monthly)\b/gi,
      ' '
    )
    .replace(/\b(?:later|please|thanks|thank you)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:to|that|about|for|of|i need to|i have to|i've got to)\s+/i, '')
    .replace(/^(?:to|i need to|i have to)\s+/i, '')
    .replace(/\s+(?:to|at|on|for|by)$/i, '')
    .replace(/^[:\-–—\s]+|[:\-–—\s]+$/g, '')
    .trim()
  if (!task || task.split(' ').length > 15) return null
  task = task.charAt(0).toUpperCase() + task.slice(1)
  return { text: task, when: `${date}T${pad(h as number)}:${pad(min)}`, repeat }
}

/** How someone answered for an event, in their words: yes, no, part of it, or not sure yet. */
export function statusIn(text: string): 'yes' | 'no' | 'partial' | 'tbd' {
  const s = plainText(text)
  if (
    /\b(?:maybe|might|not sure|unsure|possibly|probably|tentative(?:ly)?|tbd|don't know(?: yet)?|undecided|hoping to|i'll (?:try|see))\b/.test(
      s
    )
  ) {
    return 'tbd'
  }
  if (
    /\b(?:part of|only (?:for|come|stay|be|make)|be late|running late|a (?:little|bit) late|late to|leave early|leaving early|first half|second half|some of|for a bit|for part|the first (?:hour|day|night)|the last (?:hour|day|night)|(?:can't|cannot|won't) (?:stay|be there) (?:the )?(?:whole|entire|all))\b/.test(
      s
    )
  ) {
    return 'partial'
  }
  if (
    /\b(?:can't|cannot|can not|won't|will not|wont|cant|not (?:going|coming|gonna|able|available|make|be)|unable|miss|missing|out of town|out for|busy|unavailable|count me out|skip|skipping)\b|^no\b/.test(
      s
    )
  ) {
    return 'no'
  }
  return 'yes'
}
