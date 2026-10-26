import { dressCodeFor, seesTeamSide, shiftDate, type EventInstance, type Viewer } from '../data'
import type { Lookups } from '../lookups'
import type { AppToolName } from '../plan'
import type { Mention } from './events'
import type { Skill } from './skills'
import { dayIn, reminderIn, spanIn, statusIn } from './when'
import { hasSheet } from './food'
import { personAnswer, personAsked } from './people'
import {
  plainly,
  scheduleAnswer,
  scheduleAsked,
  scheduleItems,
  timeOf,
  type ScheduleAsk,
} from './schedule'

/**
 * Miriam's own answers to what she has understood (./understand): looked up
 * with the same lookups Claude's answers use (../lookups), so they show only
 * what this person may see, and come back in the same shapes — an answer to
 * show and say, or a change to confirm — so the app needs nothing new for
 * them. Worded as the app's own quick answers are (src/lib/miriamQuick).
 *
 * Whenever it isn't plain — no event she can tell, two that fit, a time she
 * can't read — the answer is null, and the request goes on to Claude.
 */

export type EventSection = 'dress_code' | 'availability' | 'weather' | 'food' | 'details'

export type OwnResult =
  | {
      kind: 'answer'
      text: string
      open:
        | { kind: 'event'; key: string; section: EventSection | null }
        | { kind: 'directions'; key: string }
        | { kind: 'link'; url: string; label: string }
        /** A screen of theirs (src/lib/miriamScreens), at a part of it: Connect's meeting form. */
        | { kind: 'screen'; id: string; section?: 'meeting' }
        | null
      choices: never[]
      heardName: string
      followUp: boolean
      understood: string
      misheard: never[]
      /** Kept open until closed: an answer on faith, to read through (the app's MiriamButton). */
      stay?: true
    }
  | {
      kind: 'confirm'
      name: 'set_availability' | 'create_reminder' | 'sign_up_food'
      input: Record<string, unknown>
      more: false
    }

export interface AnswerContext {
  text: string
  today: string
  /** Their clock, "HH:MM", when the app sends it. */
  now: string | null
  mentions: Mention[]
  lookups: Lookups
  viewer: Viewer
  /** The app's lookups and changes this person has (plan.ts: APP_TOOLS). */
  appTools: readonly AppToolName[]
}

export const said = (
  text: string,
  open: Extract<OwnResult, { kind: 'answer' }>['open'] = null,
  followUp = false
): OwnResult => ({
  kind: 'answer',
  text,
  open,
  choices: [],
  heardName: '',
  followUp,
  understood: '',
  misheard: [],
})

/** An answer on faith, kept open until it is closed — not one sending them to the church's leadership. */
export const toStay = (r: OwnResult): OwnResult => (r.kind === 'answer' ? { ...r, stay: true } : r)

const onPage = (ev: EventInstance, section: EventSection | null = 'details') =>
  ({ kind: 'event', key: ev.instanceKey, section }) as const

/** When an event is, as said: "today", "tomorrow", "on Friday, October 16". */
function whenSaid(date: string, today: string): string {
  if (date === today) return 'today'
  if (date === shiftDate(today, 1)) return 'tomorrow'
  return `on ${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })}`
}

/** When, short, in a list: "today at 5:00 PM", "Friday", "Sunday, Oct 25". */
function whenShort(ev: EventInstance, today: string): string {
  const day =
    ev.date === today
      ? 'today'
      : ev.date === shiftDate(today, 1)
        ? 'tomorrow'
        : new Date(`${ev.date}T12:00:00Z`).toLocaleDateString('en-US', {
            weekday: 'long',
            timeZone: 'UTC',
            ...(ev.date > shiftDate(today, 6) ? { month: 'short', day: 'numeric' } : {}),
          })
  return ev.startTime ? `${day} at ${ev.startTime}` : day
}

/** Their notes, after what is on: "Your note: bring the projector." / "Your notes: Friday — …; Saturday — …". As the app says them (src/features/miriam/localTalk). */
function notesSaid(notes: { date: string; text: string }[], oneDay: boolean, today: string) {
  const lead = notes.length === 1 ? 'Your note' : 'Your notes'
  const plain = (t: string) => t.replace(/[.!?]+$/, '')
  if (oneDay) return `${lead}: ${notes.map((n) => plain(n.text)).join('; ')}.`
  const days = [...new Set(notes.map((n) => n.date))]
  const said = days.map((d) => {
    const day = whenShort({ date: d } as EventInstance, today)
    const texts = notes.filter((n) => n.date === d).map((n) => plain(n.text))
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} — ${texts.join('; ')}`
  })
  return `${lead}: ${said.join('. ')}.`
}

/** Starts with a person's name, not theirs: "Olivia can't make the picnic", "Hey Miriam, Sam is out". */
async function someoneElseFirst(text: string, ctx: AnswerContext): Promise<boolean> {
  const first = text
    .replace(/^(?:(?:hey|hi|ok|okay|so|um+|uh+|well)[,\s]+)*(?:miriam[,.\s]+)?/i, '')
    // A name, then what they will or won't do: "Mark me as out" is not Mark.
    .match(
      /^([a-z]+)(?:'s|’s)?\s+(?:can't|can’t|cannot|won't|won’t|isn't|isn’t|is|will|can|could|might|may|does|doesn't|doesn’t|has|had|needs?|wants?|plans?|going|coming|out)\b/i
    )?.[1]
    ?.toLowerCase()
  if (!first || first === 'i' || first === 'we') return false
  for (const [uid, name] of await ctx.lookups.names()) {
    if (uid !== ctx.viewer.uid && name.toLowerCase().split(/\s+/)[0] === first) return true
  }
  return false
}

/** "Sign me up", "put us down" — but not "put me down as a maybe". */
const SIGN_ME_UP = /\b(?:sign|put)\s+(?:me|us)\s+(?:up|down)\b(?!\s+as\b)/i

/** What a skill needs an event to have, to be the one meant when none is named. */
const HAS: Partial<Record<Skill, (ev: EventInstance, viewer: Viewer) => boolean>> = {
  event_car: (ev) => !!ev.carpool,
  event_lodging: (ev) => !!ev.lodging,
  event_flight: (ev) => !!ev.flights,
  event_team: (ev, v) =>
    (ev.teams ?? []).some((t) => [...t.leaders, ...t.members].some((m) => String(m) === v.uid)),
}

/**
 * The one event meant: by its name (the titles it fits), on the day said,
 * the next of it; or with no name, the one that day, or — for a car, a
 * room, a flight or a team — their next that has one. Null if there is no
 * one plainly.
 */
export async function theEvent(skill: Skill, ctx: AnswerContext): Promise<EventInstance | null> {
  const { mentions, today, lookups, viewer } = ctx
  const day = dayIn(ctx.text, today)
  const from = day ?? today
  const to = day ?? shiftDate(today, 365)
  // A later day of a multi-day event is the same event: only when that day is asked.
  const all = (await lookups.eventsBetween(from, to)).filter(
    (ev) => day || !/_d\d+$/.test(ev.instanceKey)
  )
  if (mentions.length > 0) {
    const titles = mentions.flatMap((m) => m.titles)
    const named = all.filter((ev) => titles.includes(ev.title))
    // Two different events that fit what was said: Claude asks which.
    const distinct = new Set(named.map((ev) => ev.title))
    if (distinct.size !== 1) return null
    return named[0] ?? null
  }
  if (day) {
    const onDay = all.filter((ev) => ev.date === day)
    const has = HAS[skill]
    const fitting = has ? onDay.filter((ev) => has(ev, viewer)) : onDay
    if (fitting.length === 1) return fitting[0]
    const mine: EventInstance[] = []
    for (const ev of fitting) if (await lookups.isOn(ev)) mine.push(ev)
    return mine.length === 1 ? mine[0] : null
  }
  const has = HAS[skill]
  if (!has) return null
  // Their next with a car, a room, a flight or a team for them, within two months.
  for (const ev of all) {
    if (ev.date > shiftDate(today, 60)) break
    if (has(ev, viewer) && (await lookups.isOn(ev))) return ev
  }
  return null
}

/** What its page shows only to an event's team members, and an admin (../data: seesTeamSide). */
const TEAM_SIDE: readonly Skill[] = [
  'event_schedule',
  'event_dress',
  'event_team',
  'event_car',
  'event_lodging',
  'event_flight',
  'event_weather',
]

/** Whether what `skill` asks of an event is shown to them on its page. */
const shownTo = (skill: Skill, viewer: Viewer) => !TEAM_SIDE.includes(skill) || seesTeamSide(viewer)

/** Said of what isn't shown to them, when no event was named: the same whether or not one has it. */
const NOT_SHOWN =
  'Sorry, I can’t help with that one — but I can tell you when and where events are.'

/** One event's answer, as the app words it. */
async function aboutEvent(skill: Skill, ev: EventInstance, ctx: AnswerContext): Promise<OwnResult> {
  const { lookups, viewer, today } = ctx
  const title = ev.title
  const when = whenSaid(ev.date, today)
  // Its team side, which its page shows only to its team's members (../data).
  if (!shownTo(skill, viewer)) {
    return ctx.mentions.length
      ? said(
          `Sorry, I can’t help with that one — but I can tell you when and where ${title} is.`,
          onPage(ev)
        )
      : said(NOT_SHOWN)
  }
  switch (skill) {
    case 'event_time': {
      const details = await lookups.getEvent(ev.instanceKey)
      const report =
        'reportTimes' in details &&
        details.reportTimes &&
        /\b(?:be there|get there|arrive|show up|report|call time)\b/i.test(ctx.text)
          ? ` Report time is ${[details.reportTimes.mission, details.reportTimes.production].filter(Boolean).join(', or ')}.`
          : ''
      return said(
        ev.startTime
          ? `${title} is ${when} at ${ev.startTime}.${report}`
          : `${title} is ${when}; no time is set.`,
        onPage(ev)
      )
    }
    case 'event_place': {
      if (ev.isVirtual) {
        return said(
          `${title} is virtual${ev.virtualLink ? ' — the link is on its page' : ''}.`,
          onPage(ev)
        )
      }
      const where = [ev.location, [ev.address, ev.city, ev.state].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(', ')
      if (!where) return said(`${title} has no place set yet.`, onPage(ev))
      // On the day: maps offered, as the app does (src/features/miriam/localTalk: offerDirections).
      if (ev.date === today) {
        return said(`${title} is at ${where}. Want me to open maps for it?`, onPage(ev), true)
      }
      return said(`${title} is ${when} at ${where}.`, onPage(ev))
    }
    case 'event_dress': {
      const codes = dressCodeFor(ev, viewer)
      return said(
        codes.length
          ? `The dress code for ${title} is ${codes.join('; ')}.`
          : `${title} has no dress code set.`,
        onPage(ev, 'dress_code')
      )
    }
    case 'event_schedule': {
      const details = await lookups.getEvent(ev.instanceKey)
      const lines = 'schedule' in details ? details.schedule : undefined
      return said(
        lines?.length
          ? `The schedule for ${title}: ${lines.join('; ')}.`
          : `${title} has no schedule yet.`,
        onPage(ev)
      )
    }
    case 'event_team': {
      const details = await lookups.getEvent(ev.instanceKey)
      const team = 'yourTeam' in details ? details.yourTeam : undefined
      return said(
        team ? `You’re on the ${team} team for ${title}.` : `You’re not on a team for ${title}.`,
        onPage(ev)
      )
    }
    case 'event_car': {
      if (!ev.carpool) return said(`${title} has no carpool.`, onPage(ev))
      const details = await lookups.getEvent(ev.instanceKey)
      const pool = 'carpool' in details ? details.carpool : undefined
      const cars = pool?.cars ?? []
      const meet = pool?.meetingPlace ? ` Cars meet at ${pool.meetingPlace}.` : ''
      return said(
        cars.length
          ? `${title}: ${cars.join('. ')}.${meet}`
          : `You haven’t been put in a car for ${title} yet.`,
        onPage(ev)
      )
    }
    case 'event_lodging': {
      if (!ev.lodging) return said(`${title} has no lodging.`, onPage(ev))
      const details = await lookups.getEvent(ev.instanceKey)
      const rooms = ('lodging' in details ? details.lodging : undefined) ?? []
      return said(
        rooms.length
          ? `${title}: ${rooms.join('. ')}.`
          : `You haven’t been given a room for ${title} yet.`,
        onPage(ev)
      )
    }
    case 'event_flight': {
      if (!ev.flights) return said(`${title} has no flights.`, onPage(ev))
      const details = await lookups.getEvent(ev.instanceKey)
      const flights = ('flights' in details ? details.flights : undefined) ?? []
      return said(
        flights.length ? `${title}: ${flights.join(' ')}` : `You have no flight for ${title} yet.`,
        onPage(ev)
      )
    }
    case 'event_weather': {
      const w = await lookups.weather(ev.instanceKey)
      if ('forecast' in w && w.forecast) {
        const f = w.forecast
        const rain = f.chanceOfRain >= 20 ? `, ${f.chanceOfRain}% chance of rain` : ''
        return said(
          `${title} ${when}: ${f.summary.toLowerCase()}, high ${Math.round(f.high)}°, low ${Math.round(f.low)}°${rain}.`,
          onPage(ev, 'weather')
        )
      }
      return said(
        'note' in w && w.note
          ? `${title} ${when}: ${w.note.charAt(0).toLowerCase()}${w.note.slice(1)}`
          : `There’s no forecast for ${title} yet.`,
        onPage(ev, 'weather')
      )
    }
    default:
      return said('')
  }
}

/** Her answer to a request she has read as `skill`, or null to hand it to Claude. */
export async function answerFor(skill: Skill, ctx: AnswerContext): Promise<OwnResult | null> {
  const { text, today, lookups } = ctx
  if (skill.startsWith('event_')) {
    // None named, and none of it theirs to be told: said before any is
    // looked for, as which one has a team or a car for them is that too.
    if (!shownTo(skill, ctx.viewer) && ctx.mentions.length === 0) return said(NOT_SHOWN)
    const ev = await theEvent(skill, ctx)
    return ev ? aboutEvent(skill, ev, ctx) : null
  }
  if (skill === 'my_events') {
    const span = spanIn(text, today)
    const all = await lookups.eventsBetween(span.from, span.to)
    if (span.next) {
      let ev: EventInstance | undefined
      for (const e of all) {
        if (await lookups.isOn(e)) {
          ev = e
          break
        }
      }
      ev ??= all[0]
      return ev
        ? said(`Your next event is ${ev.title}, ${whenShort(ev, today)}.`, onPage(ev))
        : said('You have nothing coming up.')
    }
    // Their own notes on those days, said after (src/lib/dateNotes).
    const notes = await lookups.notesBetween(span.from, span.to).catch(() => [])
    const noted = notes.length ? ` ${notesSaid(notes, span.from === span.to, today)}` : ''
    if (all.length === 0) return said(`Nothing is on ${span.said}.${noted}`)
    const shown = all.slice(0, 5).map((ev) => `${ev.title}, ${whenShort(ev, today)}`)
    const more = all.length > 5 ? `; and ${all.length - 5} more` : ''
    return said(`On ${span.said}: ${shown.join('; ')}${more}.${noted}`)
  }
  if (skill === 'availability') {
    if (!ctx.appTools.includes('set_availability') || !seesTeamSide(ctx.viewer)) return null
    const ev = await theEvent(skill, ctx)
    if (!ev) return null
    const status = statusIn(text)
    // "Sign me up for the potluck", where it has a food sign-up they could
    // sign up on: as likely bringing something as coming — Claude asks (./food).
    // Not a maybe or a no: "put me down for a maybe for the potluck".
    if (
      status === 'yes' &&
      ctx.appTools.includes('sign_up_food') &&
      SIGN_ME_UP.test(text) &&
      hasSheet(ev)
    ) {
      return null
    }
    // Someone else, by name: "Olivia can't make the picnic" (./guards has "my wife", "she").
    if (await someoneElseFirst(text, ctx)) return null
    return {
      kind: 'confirm',
      name: 'set_availability',
      input: {
        event_key: ev.instanceKey,
        status,
        // In their words, where it says more than yes or no.
        note: status === 'partial' || status === 'tbd' ? text.trim().slice(0, 300) : '',
      },
      more: false,
    }
  }
  if (skill === 'reminder') {
    if (!ctx.appTools.includes('create_reminder')) return null
    const r = reminderIn(text, today, ctx.now)
    if (!r) return null
    return {
      kind: 'confirm',
      name: 'create_reminder',
      input: {
        text: r.text,
        when: r.when,
        repeat: r.repeat,
        event_key: '',
        minutes_before: 0,
        every_event: false,
      },
      more: false,
    }
  }
  return null
}

// --- From the event itself, whatever she read it as ---------------------------

/**
 * The event a schedule question is about: the one named, or on the day said
 * — or, named neither way, the next of theirs (within six months) whose
 * schedule has it: "When does Olivia arrive?" in October, for New Year's
 * Eve. Its answer names it.
 */
async function eventWithIt(ask: ScheduleAsk, ctx: AnswerContext): Promise<EventInstance | null> {
  const named = await theEvent('event_schedule', ctx)
  if (named) return named
  if (ctx.mentions.length || dayIn(ctx.text, ctx.today)) return null
  const soon = await ctx.lookups.eventsBetween(ctx.today, shiftDate(ctx.today, 182))
  for (const ev of soon) {
    if (scheduleItems(ev, ask.what).found.length && (await ctx.lookups.isOn(ev))) return ev
  }
  return null
}

/**
 * Something on an event's schedule, asked by what it is (./schedule) — "When
 * does Olivia arrive for the event?", "what comes after the sermon?" — from
 * its own schedule, or null when it isn't on it.
 */
export async function scheduleItemAnswer(
  masked: string,
  ctx: AnswerContext
): Promise<OwnResult | null> {
  const ask = scheduleAsked(masked)
  // The schedule is its team's (../data: seesTeamSide).
  if (!ask || !seesTeamSide(ctx.viewer)) return null
  const ev = await eventWithIt(ask, ctx)
  const text = ev && scheduleAnswer(ask, ev)
  return ev && text ? said(text, onPage(ev)) : null
}

/** Asking all that is theirs at an event: "what are my responsibilities?", "what am I doing for it?". */
const RESPONSIBILITIES =
  /\b(?:responsibilit\w*|my\s+(?:role|part|job|duties|assignments?)|what\s+am\s+i\s+(?:doing|supposed\s+to\s+(?:do|bring)|in\s+charge\s+of|responsible\s+for)|what\s+do\s+i\s+(?:need\s+to\s+|have\s+to\s+)?do)\b/i

/**
 * All that is theirs at an event they name, together — team, car, food,
 * tasks, room, flight — or null: "what am I doing this weekend?" is their
 * week, not one event's.
 */
export async function yoursAnswer(ctx: AnswerContext): Promise<OwnResult | null> {
  if (!RESPONSIBILITIES.test(ctx.text) || ctx.mentions.length === 0) return null
  // Their team side at it: never a public follower's to be told (../data: seesTeamSide).
  if (!seesTeamSide(ctx.viewer)) return null
  const ev = await theEvent('event_team', ctx)
  if (!ev) return null
  const details = await ctx.lookups.getEvent(ev.instanceKey)
  const yours = ('yours' in details ? details.yours : undefined) ?? []
  const when = ev.startTime ? ` It starts ${whenSaid(ev.date, ctx.today)} at ${ev.startTime}.` : ''
  if (!yours.length) {
    return said(`You don’t have anything assigned for ${ev.title}.${when}`, onPage(ev))
  }
  // "you're on the Audio team", "you're driving…", "you have the task…"
  const parts = yours.map((y) =>
    y.startsWith('the task ')
      ? `you have ${y}`
      : y.startsWith('flying:')
        ? `your flight — ${y.slice(8)}`
        : `you’re ${y}`
  )
  const list =
    parts.length > 1 ? `${parts.slice(0, -1).join('; ')}; and ${parts[parts.length - 1]}` : parts[0]
  return said(`For ${ev.title}, ${list}.${when}`, onPage(ev))
}

/** Asking what an event is: "what is Family Gathering?", "tell me about the retreat". */
const WHAT_IT_IS =
  /^(?:so\s+|and\s+|hey\s+)?(?:what(?:'s|s|\s+is)|tell\s+me\s+about|what\s+about)\s+the\s+event$/

/** What an event is, as its page has it: when, where, and the first of its schedule. */
export async function overviewAnswer(
  masked: string,
  ctx: AnswerContext
): Promise<OwnResult | null> {
  if (!WHAT_IT_IS.test(plainly(masked))) return null
  const ev = await theEvent('event_schedule', ctx)
  if (!ev) return null
  const where = ev.isVirtual
    ? 'online'
    : [ev.location, [ev.address, ev.city, ev.state].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(', ')
  const when = `${whenSaid(ev.date, ctx.today)}${ev.startTime ? ` at ${ev.startTime}` : ''}`
  // Its schedule is the team's (../data: seesTeamSide).
  const schedule = [...(seesTeamSide(ctx.viewer) ? (ev.schedule ?? []) : [])]
    .sort((a, b) => (a.day ?? 0) - (b.day ?? 0))
    .slice(0, 4)
    .map((it) => `${timeOf(it) ? `${timeOf(it)} ` : ''}${it.title}`)
  const more = schedule.length && (ev.schedule?.length ?? 0) > 4 ? ', and more' : ''
  return said(
    `${ev.title} is ${when}${where ? (where === 'online' ? ', online' : `, at ${where}`) : ''}.` +
      (schedule.length ? ` On its schedule: ${schedule.join('; ')}${more}.` : ''),
    onPage(ev)
  )
}

/**
 * Someone's flight or room, asked by name — "what time is Guest User's
 * flight arriving?", "where is Guest User staying?" (./people) — from the
 * event's own lists, or null.
 */
export async function travelAnswer(ctx: AnswerContext): Promise<OwnResult | null> {
  const ask = personAsked(ctx.text)
  // Their own; anyone's, to an admin (./people). Never a public follower's.
  if (!ask || !seesTeamSide(ctx.viewer)) return null
  const ev = await theEvent(ask.kind === 'lodging' ? 'event_lodging' : 'event_flight', ctx)
  if (!ev) return null
  const text = await personAnswer(ask, ev, ctx)
  return text ? said(text, onPage(ev)) : null
}
