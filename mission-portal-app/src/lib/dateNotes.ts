import type { UserProfile } from '@/types/user'
import { shiftDate } from '../../functions/src/miriam/data'
import { dayIn, spanIn } from '../../functions/src/miriam/own/when'

/**
 * Notes people keep on days of their own calendar — "bring the projector" on
 * Friday: theirs alone, nobody else's to see, an admin's included
 * (stores/dateNotesStore, firestore.rules: dateNotes). Shown on the Events
 * calendar, said in the daily briefing and in what Miriam tells them they
 * have on, and made, read and taken away there or by asking her.
 */

export interface DateNote {
  id: string
  /** The day it is on: YYYY-MM-DD. */
  date: string
  text: string
  /** When it was written, in ms. */
  at: number
}

/** A note's longest — a note, not a diary. */
export const DATE_NOTE_MAX = 500
/** As many as one person keeps (all in one document). */
export const MAX_DATE_NOTES = 1000

/** Roles that may keep notes: any but a public account (firestore.rules: keepsNotes). */
const KEEPERS = ['admin', 'security', 'regular', 'intern', 'worship', 'guest']

export function canKeepDateNotes(profile: UserProfile | null): boolean {
  return (profile?.roles ?? []).some((r) => KEEPERS.includes(r))
}

/** A real day, as stored: "2026-10-16". */
export function isDay(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s
  )
}

/** A note's words as kept: trimmed, one space apart, at most DATE_NOTE_MAX. */
export const noteText = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, DATE_NOTE_MAX)

/** Their notes on a day, as written. */
export const notesOn = (notes: readonly DateNote[], date: string) =>
  notes.filter((n) => n.date === date).sort((a, b) => a.at - b.at)

/** Their notes between two days, both included: by day, then as written. */
export const notesBetween = (notes: readonly DateNote[], from: string, to: string) =>
  notes
    .filter((n) => n.date >= from && n.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at)

/** A day as said: "today", "tomorrow", "Friday", "Tuesday, Nov 3". */
export function daySaid(date: string, today: string): string {
  if (date === today) return 'today'
  if (date === shiftDate(today, 1)) return 'tomorrow'
  if (date === shiftDate(today, -1)) return 'yesterday'
  const d = new Date(`${date}T12:00:00`)
  const near = date > today && date <= shiftDate(today, 6)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    ...(near ? {} : { month: 'short', day: 'numeric' }),
  })
}

/** "On Friday", "today": with what it is on, for a sentence. */
const onDay = (date: string, today: string) => {
  const d = daySaid(date, today)
  return /^(?:today|tomorrow|yesterday)$/.test(d) ? d : `on ${d}`
}

/** Notes said: "Friday — bring the projector; Saturday — set up chairs." */
export function notesSaid(notes: readonly DateNote[], today: string): string {
  const days = [...new Set(notes.map((n) => n.date))]
  return days
    .map((date) => {
      const texts = notesOn(notes, date).map((n) => n.text.replace(/[.!?]+$/, ''))
      const day = daySaid(date, today)
      return `${day.charAt(0).toUpperCase()}${day.slice(1)} — ${texts.join('; ')}`
    })
    .join('. ')
}

// --- Asked of Miriam ------------------------------------------------------------------

const WEEKDAY = '(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?'
const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
/** A day as said, with what leads into it: "for Friday", "on October 20th", "to the 20th", "tomorrow". */
const DAY_SAID = new RegExp(
  `(?:\\b(?:on|for|to|at|by|from)\\s+)?(?:\\b(?:the\\s+)?day after tomorrow|\\b(?:today|tonight|tomorrow|tmrw|this (?:morning|afternoon|evening))|\\b(?:(?:next|this|coming)\\s+)?${WEEKDAY}(?:'s)?|\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\b(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+of\\s+${MONTH}|\\b\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?|\\bthe\\s+\\d{1,2}(?:st|nd|rd|th))\\b`,
  'i'
)

/** The first day said, and where: the day a note is on comes before what it says. */
function firstDay(text: string, today: string): { date: string; said: string } | null {
  const m = DAY_SAID.exec(text)
  if (!m) return null
  const date = dayIn(m[0], today)
  return date ? { date, said: m[0] } : null
}

/** Making one: "add a note", "make me a quick note", "jot down a note", "note for Friday:". */
const ADD =
  /\b(?:add|make|jot(?:\s+down)?|save|set|create|take|keep)\s+(?:me\s+)?(?:a|an|another|one more|this)?\s*(?:quick\s+|little\s+|short\s+)?note\b|^(?:a\s+)?note\s+(?:for|on|to)\b|^note\s*[:–—-]|\b(?:add|put|write|save)\b[^.?!]*?\b(?:to|in(?:to)?|on)\s+my\s+notes\b/i
/** Said with a day only: "write a note to Sam" is a message, "put a note on Friday" a note. */
const ADD_WITH_DAY =
  /\b(?:put|leave|write)\s+(?:me\s+)?(?:a|an|another|one more|this)?\s*(?:quick\s+|little\s+|short\s+)?note\b/i
/** Or put on their own calendar: "put the dentist on my calendar Friday" (an event is an event). */
const ON_MY_CALENDAR = /\b(?:add|put|write|mark|save)\b.*?\b(?:on|to|in(?:to)?)\s+my\s+calendar\b/i
/** Asking nicely, said first: not part of the note. */
const POLITE =
  /^(?:(?:hey|ok|okay|so|and)\s+)?(?:miriam[,\s]+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|please\s+|i\s+(?:want|need|would like|'d like)\s+(?:you\s+)?to\s+|let's\s+|go\s+ahead\s+and\s+)/i
/** Reading them: "what are my notes for Friday?", "any notes this week?", "read me my notes". */
const READ =
  /\bmy\s+notes?\b|\bany\s+notes?\b|\bnotes?\s+(?:i|i've|i\s+have|i\s+made|i\s+left)\b|\bnotes?\s+(?:for|on)\s+(?:today|tonight|tomorrow|this|next|the\s+\d|\d|[a-z]+day\b)/i
/** Taking one away: "delete my note for Friday", "clear my notes for tomorrow", "remove the projector note". */
const REMOVE =
  /\b(?:delete|remove|clear|erase|get rid of|take (?:off|away|down)|cancel)\s+(?:(?:my|the|that|this|all|all of my|all my|both|those|these|of)\s+)*(?:[\w'’-]+\s+)?notes?\b/i
/** A span said for reading: else, what is coming up. */
const SPAN_SAID = new RegExp(
  `\\b(?:today|tonight|tomorrow|tmrw|week|weekend|month|${WEEKDAY}|${MONTH}\\.?\\s+\\d|\\d{1,2}\\/\\d{1,2}|the\\s+\\d{1,2}(?:st|nd|rd|th))\\b`,
  'i'
)

/** How far ahead "what are my notes?" looks, with no day said. */
export const NOTES_AHEAD_DAYS = 60

export type NoteAsk =
  | { kind: 'add'; date: string | null; text: string }
  | { kind: 'read'; from: string; to: string; span: string }
  | { kind: 'remove'; date: string | null; words: string }

/** What a note is to say, from the rest of what was said: its leading words gone, its first letter up. */
function wordsLeft(s: string): string {
  const t = s
    .replace(/\b(?:on|to|in(?:to)?)\s+my\s+calendar\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:;,.–—-]+/, '')
    .replace(
      /^(?:(?:to\s+)?(?:say|says|saying|that\s+says|reading|that\s+reads)|that|about|which\s+is|of|to|for|:)\s+/i,
      ''
    )
    .replace(/^[\s:;,.–—-]+/, '')
    .replace(/[\s,;:–—-]+$/, '')
    .trim()
  return t ? noteText(t.charAt(0).toUpperCase() + t.slice(1)) : ''
}

/**
 * A note asked for, read, or taken away — or null, for anything else. The
 * day is the first said ("a note for Friday: Sam's birthday is tomorrow" is
 * on Friday); none said, `date` is null, to ask.
 */
export function noteAsked(said: string, today: string): NoteAsk | null {
  const s = said.replace(/[’‘]/g, "'").trim().replace(POLITE, '')
  // A chord sheet's notes are its own (stores/sheetNotesStore).
  if (/\b(?:song|sheet|chart|chords?|set ?list)\b/i.test(s)) return null
  if (REMOVE.test(s)) {
    const day = firstDay(s, today)
    const words = (day ? s.replace(day.said, ' ') : s)
      .replace(/\b(?:delete|remove|clear|erase|get rid of|take (?:off|away|down)|cancel)\b/gi, ' ')
      .replace(
        /\b(?:my|the|a|an|all|of|that|this|these|those|notes?|please|about|on|for|says?|saying|with)\b/gi,
        ' '
      )
      .replace(/[^\w\u00C0-\u024F' ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return { kind: 'remove', date: day?.date ?? null, words }
  }
  const withDay = ADD_WITH_DAY.exec(s)
  const add =
    ADD.exec(s) ??
    (withDay && firstDay(s, today) ? withDay : null) ??
    (/\bevents?\b/i.test(s) ? null : ON_MY_CALENDAR.exec(s))
  if (add) {
    // "Put the dentist on my calendar Friday": what comes before the cue is the note.
    const calendar = !ADD.test(s) && !(withDay && add === withDay)
    const rest = calendar
      ? `${s.slice(0, add.index)} ${s.slice(add.index).replace(/^(?:add|put|write|mark|save)\b/i, '')}`
      : `${s.slice(0, add.index)} ${s.slice(add.index + add[0].length)}`
    const day = firstDay(rest, today)
    const text = wordsLeft(day ? rest.replace(day.said, ' ') : rest)
    return { kind: 'add', date: day?.date ?? null, text }
  }
  if (READ.test(s) && !/\b(?:events?|service|gathering|meeting|practice|rehearsal)\b/i.test(s)) {
    if (!SPAN_SAID.test(s)) {
      // "My notes on Above All": a song's, not a day's.
      if (/\bnotes?\s+(?:on|for|about|in)\s+(?!my\s+calendar\b)\S/i.test(s)) return null
      return { kind: 'read', from: today, to: shiftDate(today, NOTES_AHEAD_DAYS), span: '' }
    }
    const span = spanIn(s, today)
    return { kind: 'read', from: span.from, to: span.to, span: span.said }
  }
  return null
}

/** "Which day is it for?", answered: the day said, or null. */
export const daySaidIn = (reply: string, today: string) => firstDay(reply, today)?.date ?? null

/** Said when it is added: "Okay — I added a note on Friday: bring the projector." */
export const noteAddedSaid = (date: string, text: string, today: string) =>
  `Okay — I added a note ${onDay(date, today)}: ${text.replace(/[.!?]+$/, '')}.`

/** Their notes read out, for a span: "This week you have 2 notes: Friday — …" */
export function notesReadSaid(notes: readonly DateNote[], span: string, today: string): string {
  const when = span || 'coming up'
  if (notes.length === 0) return `You don’t have any notes ${when}.`
  const count = notes.length === 1 ? 'a note' : `${notes.length} notes`
  const lead = span ? `${span.charAt(0).toUpperCase()}${span.slice(1)} you have` : 'You have'
  // All on one day said: just what they say.
  const oneDay = span && new Set(notes.map((n) => n.date)).size === 1
  const said = oneDay
    ? notes.map((n) => n.text.replace(/[.!?]+$/, '')).join('; ')
    : notesSaid(notes, today)
  return `${lead} ${count}${span ? '' : ' coming up'}: ${said}.`
}

/** The notes a "delete my note…" means: on its day, with its words, if said. */
export function notesMeant(
  notes: readonly DateNote[],
  ask: { date: string | null; words: string },
  today: string
): DateNote[] {
  const words = ask.words
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
  const pool = ask.date
    ? notesOn(notes, ask.date)
    : notes.filter((n) => n.date >= shiftDate(today, -7))
  if (words.length === 0) return ask.date ? pool : []
  const scored = pool
    .map((n) => {
      const t = n.text.toLowerCase()
      return { n, hits: words.filter((w) => t.includes(w)).length }
    })
    .filter((x) => x.hits > 0)
  const best = Math.max(0, ...scored.map((x) => x.hits))
  return scored.filter((x) => x.hits === best).map((x) => x.n)
}
