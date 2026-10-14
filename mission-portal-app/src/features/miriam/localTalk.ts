import type { Announcement, CarpoolCarData, Message, PostPage, Room, Task } from '@/types/events'
import { visibleTabs } from '@/lib/roles'
import { postsAsked, postsFor, postsSaid } from '@/lib/miriamPosts'
import type { UserProfile } from '@/types/user'
import type { EventInstance } from '../../../functions/src/miriam/data'
import { FD } from '@/lib/format'
import { foodStillOpenSaid, foodTakenSaid, stillOpen } from '@/lib/miriamActions'
import { eventRef, listAsked, type QuickData } from '@/lib/miriamQuick'
import {
  availabilityReply,
  availabilitySaid,
  type AvailabilitySaid,
  type AvailStatus,
} from '@/lib/miriamAvailability'
import { eventCalled, eventDay, eventPick } from '@/lib/miriamEvents'
import { carpoolAsked, type CarpoolMove } from '@/lib/miriamCarpool'
import { directionsAsked } from '@/lib/miriamDirections'
import { placeOf } from '@/lib/directions'
import { carName } from '@/features/events/carpoolCards'
import {
  beforeEachWithoutSpan,
  eventReminderAsked,
  everyEventSaid,
  reminderAsked,
  reminderWithoutWhen,
  type EventReminderAsk,
} from '@/lib/reminders'
import { clockMinutes } from '@/lib/eventSchedule'
import { clockOf } from '../../../functions/src/push/reminderTime'
import type { ReminderExtra } from '@/stores/remindersStore'
import { assignedTo, canSeeEvent, instancesOf, shiftDate } from '../../../functions/src/miriam/data'
import {
  dateSaid,
  eventPicked,
  foodAsked,
  foodEventsFor,
  foodItemPicked,
  type FoodAsk,
} from '@/lib/miriamFood'
import {
  choicePicked,
  listed,
  looksLikeNewRequest,
  pickBest,
  plain,
  quoted,
  saidNeverMind,
  saidNo,
  saidYes,
  squash,
  type Picked,
} from '@/lib/miriamReplies'
import {
  STATUS_WORDS,
  taskPicked,
  taskSaid,
  taskStatusAsked,
  type TaskStatusAsk,
} from '@/lib/miriamTaskStatus'
import {
  notificationAsked,
  notificationKeysFor,
  notificationLabel,
  notificationPlan,
  switchesSaid,
  type NotificationAsk,
  type NotificationPlan,
} from '@/lib/miriamNotifications'
import {
  daySaid,
  daySaidIn,
  noteAddedSaid,
  noteAsked,
  notesBetween,
  notesMeant,
  notesOn,
  notesReadSaid,
  noteText,
  type DateNote,
} from '@/lib/dateNotes'
import {
  agoSaid,
  announcementsAsked,
  announcementsSaid,
  conversationPicked,
  messagesAsked,
  messagesSaid,
  unreadIn,
  unreadSaid,
  type RoomFit,
} from '@/lib/miriamReads'

/**
 * Miriam's conversations that run on the device — food sign-ups, a task's
 * status, a notification switch, announcements and messages read out — with
 * the questions she asks back when she isn't sure what was meant.
 *
 * The rule: sure, and the change is shown to confirm, as any change is.
 * Likely, and she asks whether that was meant, saying exactly what she would
 * do — so a yes to that is the confirmation, and it is done at once (with Undo).
 * Several alike, and she asks which. A reply she can't place as an answer is
 * handed back (false) to be taken as a request of its own.
 *
 * Kept apart from MiriamButton, which supplies `Talk` and `Here`, so that the
 * conversations themselves can be tested.
 */

/** A reply to her question: true when it was an answer to it. */
export type Reply = (reply: string, talk: Talk) => Promise<boolean>

/** How she speaks and acts, as MiriamButton does it. */
export interface Talk {
  /** Says this; nothing more is asked. `sheet`: an event whose food sheet to show. */
  say: (text: string, sheet?: EventInstance | null) => void
  /** Asks this; the reply comes to `onReply`. */
  ask: (text: string, onReply: Reply) => void
  /** Shows a change to confirm, as every change is shown. */
  offer: (name: string, input: Record<string, unknown>) => Promise<void>
  /** Makes a change already agreed to in so many words, as a confirmed one is made. */
  doNow: (name: string, input: Record<string, unknown>) => Promise<void>
  /** Shown while something is looked up. */
  thinking: () => void
  /** Sets them a reminder, and says when — with a tap to take it back (MiriamButton: setReminder). */
  remind: (text: string, at: Date, spoken: string, extra?: ReminderExtra) => Promise<void>
  /**
   * Opens maps with the way to an event — the phone's own, or Google Maps in a
   * browser; where a browser won't open it unasked, a button to (MiriamButton).
   */
  directions: (ev: EventInstance) => void
  /**
   * Sets them one reminder before every event of theirs, from now on — and
   * says so, with the first of them (MiriamButton). `first`: none coming up yet.
   */
  remindBeforeEach: (
    text: string,
    spoken: string,
    before: EventReminderAsk['before'],
    relation: string,
    first: { ev: EventInstance; at: Date } | null
  ) => Promise<void>
  /** Adds a note on a day of their calendar, and says so — with a tap to take it back (MiriamButton). */
  note: (date: string, text: string) => Promise<void>
}

/** What she can see, as this person: loaded, or read on asking. */
export interface Here {
  data: QuickData | null
  profile: UserProfile | null
  /** What this person's screens let Miriam do (./appTools: appToolsFor). */
  tools: readonly string[]
  tasks: () => { ready: boolean; mine: Task[] }
  openFood: (ev: EventInstance) => Promise<string[] | null>
  /** The sheet as it is now: who has what, keyed by the item's place. Null when it can't be read. */
  foodSheet: (
    ev: EventInstance
  ) => Promise<Record<string, { uid: string; displayName: string }> | null>
  nextOpenFood: (
    events: EventInstance[],
    uid: string
  ) => Promise<{ ev: EventInstance; open: string[] } | null>
  /** Announcements as this person's screen shows them, newest first. */
  announcements: () => Promise<Announcement[]>
  names: () => ReadonlyMap<string, string>
  /** Their conversations, most recently active first. */
  rooms: () => Promise<Room[]>
  latest: (room: Room, n: number) => Promise<Message[]>
  now: () => number
  /** The food today's briefing showed open, by event, and the item it suggested. */
  briefedFood: () => { eventKey: string; suggestion: string; open: string[] }[]
  /** Their availability answer for an event as it stands: the date's own, else a weekly event's for every date. */
  answerOf: (ev: EventInstance) => { status: AvailStatus; note: string; ts: number } | null
  /** Their answer saved, as the event's page saves it. False when it couldn't be. */
  answer: (ev: EventInstance, status: AvailStatus, note: string) => Promise<boolean>
  /** An event's cars: set in its form, else for its date on its page. Null when they can't be read. */
  carsFor: (ev: EventInstance) => Promise<CarpoolCarData[] | null>
  /** Their notes on days of their calendar (lib/dateNotes), once loaded; not ready if they can't be read. */
  notes: () => Promise<{ ready: boolean; all: DateNote[] }>
  /** The church's post pages, as the Posts screen has them; null when they can't be read. */
  posts: () => Promise<PostPage[] | null>
}

/** Worked out here, when it plainly can be: false to leave it to Claude. */
export async function talkHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  // Notifications first: "turn off message notifications" names messages too.
  // Directions before food: "take me to the potluck" brings nothing. A
  // reminder asked for, before what it names: "remind me before all my events"
  // is no list of them.
  return (
    (await notificationsHere(said, here, talk)) ||
    (await notesHere(said, here, talk)) ||
    (await directionsHere(said, here, talk)) ||
    (await remindersHere(said, here, talk)) ||
    (await taskStatusHere(said, here, talk)) ||
    (await foodHere(said, here, talk)) ||
    (await availabilityHere(said, here, talk)) ||
    (await agendaHere(said, here, talk)) ||
    (await carpoolHere(said, here, talk)) ||
    (await postsHere(said, here, talk)) ||
    (await announcementsHere(said, here, talk)) ||
    (await messagesHere(said, here, talk))
  )
}

const dayOf = (ev: EventInstance) => FD(ev.date, { weekday: true })

// --- Directions -------------------------------------------------------------------

/**
 * "Take me to the retreat", "directions to the event on Sunday", "how do I
 * get there?": maps opened with the way to it. Plainly one event, at once;
 * probably one, asked about; several, asked which. None said ("take me
 * there"): theirs today, else their next, asked about. One not found among
 * theirs is left to Claude, which looks further.
 */
async function directionsHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  const { data } = here
  if (!data) return false
  const ask = directionsAsked(said, data.today)
  if (!ask) return false
  if (!ask.date && !ask.name) {
    const soon = theirEvents(data, data.today, shiftDate(data.today, DIRECTIONS_DAYS))
    const todays = soon.filter((ev) => ev.date === data.today)
    if (todays.length === 1) return goTo(todays[0], talk)
    if (todays.length > 1) return whichTo(todays, data.today, talk)
    const next = soon[0]
    if (!next) {
      talk.say('You don’t have an event coming up to take you to.')
      return true
    }
    return directionsTo(next, [], here, talk)
  }
  const picked = eventPick(ask, data, { ahead: DIRECTIONS_DAYS })
  if (picked.kind === 'none') return false
  if (picked.kind === 'sure') return goTo(picked.item, talk)
  if (picked.kind === 'likely') return directionsTo(picked.item, picked.others, here, talk)
  return whichTo(picked.items, data.today, talk)
}

/** How far ahead an event is looked for, to be taken to. */
const DIRECTIONS_DAYS = 60

/**
 * "Directions to Youth Night on Friday?" — yes opens maps; another of them
 * named, that one; "no, the retreat", the way to that instead.
 */
function directionsTo(ev: EventInstance, others: EventInstance[], here: Here, talk: Talk): boolean {
  const today = here.data?.today ?? ev.date
  talk.ask(`Directions to ${eventCalled(ev, today)}?`, async (r, t) => {
    if (neverMind(r, t)) return true
    if (saidYes(r)) return goTo(ev, t)
    const i = others.length
      ? choicePicked(
          r,
          others.map((o) => o.title)
        )
      : -1
    if (i >= 0) return goTo(others[i], t)
    const no = saidNo(r)
    if (no && !no.rest) {
      t.say('Okay — tell me which event, and I’ll open maps for it.')
      return true
    }
    if (!no && looksLikeNewRequest(r)) return false
    // The event they meant instead.
    if (await directionsHere(`directions to ${no ? no.rest : r}`, here, t)) return true
    t.say('I couldn’t find that among your events.')
    return true
  })
  return true
}

function whichTo(events: EventInstance[], today: string, talk: Talk): boolean {
  talk.ask(
    `Which one: ${listed(
      events.map((ev) => eventCalled(ev, today)),
      'or'
    )}?`,
    async (r, t) => {
      if (neverMind(r, t)) return true
      const i = choicePicked(
        r,
        events.map((ev) => ev.title)
      )
      return i >= 0 ? goTo(events[i], t) : false
    }
  )
  return true
}

/** Maps opened to the event — or why there is nowhere to open them to. */
function goTo(ev: EventInstance, talk: Talk): boolean {
  if (ev.isVirtual) {
    talk.say(`${ev.title} is virtual${ev.virtualLink ? ' — the link is on its page' : ''}.`)
  } else if (!placeOf(ev)) talk.say(`${ev.title} has no place set yet.`)
  else talk.directions(ev)
  return true
}

/** Words that, said back to her offer, mean "open them". */
const OPEN_THEM =
  /^(?:open(?:\s+(?:it|them|maps?|the\s+maps?|directions))?|maps?|directions|take\s+me(?:\s+there)?|let'?s\s+go|go)$/

/**
 * Where an event is, said on the day it happens — with maps offered for it:
 * a yes opens them (MiriamButton, for a plain "where is it?" answered here).
 */
export function offerDirections(ev: EventInstance, said: string, talk: Talk): void {
  talk.ask(`${said} Want me to open maps for it?`, async (r, t) => {
    if (saidNeverMind(r)) {
      t.say('Okay.')
      return true
    }
    if (saidYes(r) || OPEN_THEM.test(plain(r))) return goTo(ev, t)
    const no = saidNo(r)
    if (no && !no.rest) {
      t.say('Okay.')
      return true
    }
    return false
  })
}

/** "Never mind": nothing more asked. */
function neverMind(reply: string, talk: Talk): boolean {
  if (!saidNeverMind(reply)) return false
  talk.say('Okay — nothing was changed.')
  return true
}

// --- Food sign-ups --------------------------------------------------------------

async function foodHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  const { data } = here
  if (!data || !here.tools.includes('sign_up_food')) return false
  const said0 = foodAsked(said, data.today)
  if (!said0) return false
  // "Sign me up for the potluck": the event named, not a dish — when it is an
  // event's name and on no sheet.
  const asEvent =
    !said0.date && !said0.name && said0.item
      ? foodEventsFor({ date: null, name: said0.item }, data)
      : []
  const ask: FoodAsk =
    asEvent.length && foodItemPicked(asEvent[0].foodItems ?? [], said0.item).kind === 'none'
      ? { ...said0, name: said0.item, item: '', surelyFood: true }
      : said0
  // Neither a dish nor food said: "put me down for Sunday" is as likely availability.
  if (!ask.surelyFood && !ask.item) return false

  // What today's briefing suggested: "I'll bring chips as suggested" is that
  // event, with nothing to ask.
  const briefed = ask.date || ask.name ? null : briefedEvent(ask, here, data)
  if (briefed && 'choose' in briefed) {
    const { options } = briefed
    talk.ask(
      `Which did you mean: ${listed(
        options.map((o) => `${o.item} for ${o.ev.title}`),
        'or'
      )}?`,
      async (r, t) => {
        if (neverMind(r, t)) return true
        const i = choicePicked(
          r,
          options.map((o) => `${o.item} ${o.ev.title}`)
        )
        if (i < 0) return looksLikeNewRequest(r) ? false : foodWhich(r, ask, [], here, t)
        return foodOnEvent(options[i].ev, { ...ask, item: options[i].item }, here, t)
      }
    )
    return true
  }
  if (briefed && ask.suggested) {
    return foodOnEvent(briefed.ev, { ...ask, item: ask.item || briefed.item }, here, talk)
  }

  if (ask.date || ask.name) {
    const found = foodEventsFor(ask, data)
    // None with a sheet: perhaps not food at all ("bring my guitar to practice").
    if (found.length === 0) return false
    if (found.length === 1 || !ask.date) {
      const ev = found[0]
      // Not plainly food, and not on its sheet: "the projector to youth night".
      if (
        !ask.surelyFood &&
        ask.item &&
        foodItemPicked(ev.foodItems ?? [], ask.item).kind === 'none'
      ) {
        return false
      }
      return foodOnEvent(ev, ask, here, talk)
    }
    talk.ask(
      `You have ${found.length} events with a food sign-up then: ${listed(
        found.map((ev) => ev.title),
        'or'
      )}. Which one?`,
      (r, t) => foodWhich(r, ask, found, here, t)
    )
    return true
  }

  // No day or event said: the event her briefing showed it open on, else the
  // next of theirs with food still open — asked about.
  talk.thinking()
  const next: { ev: EventInstance; open?: string[] } | null = briefed
    ? { ev: briefed.ev }
    : await here.nextOpenFood(foodEventsFor({ date: null, name: '' }, data), data.viewer.uid)
  if (!next) {
    if (!ask.surelyFood) return false
    talk.say('None of your upcoming events has food still open.')
    return true
  }
  // "I'll bring chips": food only if chips are on that sheet.
  if (!ask.surelyFood && foodItemPicked(next.ev.foodItems ?? [], ask.item).kind === 'none') {
    return false
  }
  talk.ask(`Do you mean ${next.ev.title} on ${dayOf(next.ev)}?`, async (r, t) => {
    if (neverMind(r, t)) return true
    if (saidYes(r)) return foodOnEvent(next.ev, ask, here, t, next.open)
    const no = saidNo(r)
    if (no && !no.rest) {
      t.ask('Which date or event do you mean?', (r2, t2) => foodWhich(r2, ask, [], here, t2))
      return true
    }
    return foodWhich(no ? no.rest : r, ask, [], here, t)
  })
  return true
}

/**
 * The event today's briefing meant: the one it showed the dish open on, or —
 * said "as suggested" — the one it suggested. Two suggested and no dish said
 * ("I'll bring what you suggested"): which, to choose.
 */
function briefedEvent(
  ask: FoodAsk,
  here: Here,
  data: QuickData
):
  | { ev: EventInstance; item: string }
  | { choose: true; options: { ev: EventInstance; item: string }[] }
  | null {
  const events = foodEventsFor({ date: null, name: '' }, data)
  const briefed = here
    .briefedFood()
    .map((n) => ({ n, ev: events.find((e) => e.instanceKey === n.eventKey) }))
    .filter((b): b is { n: (typeof b)['n']; ev: EventInstance } => !!b.ev)
  if (briefed.length === 0) return null
  if (ask.item) {
    const onIt = briefed.filter((b) => {
      const p = foodItemPicked(b.n.open, ask.item)
      return p.kind === 'sure' || p.kind === 'likely'
    })
    if (onIt.length === 1) return { ev: onIt[0].ev, item: ask.item }
    if (onIt.length > 1 || !ask.suggested) return null
  }
  if (!ask.suggested) return null
  if (briefed.length === 1 || ask.item)
    return { ev: briefed[0].ev, item: ask.item || briefed[0].n.suggestion }
  return { choose: true, options: briefed.map((b) => ({ ev: b.ev, item: b.n.suggestion })) }
}

/**
 * Whether they were shown an item open on this event's sheet — by today's
 * briefing, or read or listed by Miriam just now (`also`). Taken since, it is
 * "just signed up for"; never shown open, "already bringing".
 */
function shownOpen(ev: EventInstance, here: Here, also: string[] = []): (item: string) => boolean {
  const briefed = here.briefedFood().find((n) => n.eventKey === ev.instanceKey)?.open ?? []
  const open = new Set([...also, ...briefed].map(squash))
  return (item) => open.has(squash(item))
}

/**
 * An item offered to confirm — or, if the sheet as it is now has it taken,
 * who has it said, with what is still open asked about instead: "Sam just
 * signed up for Chips. Salsa and Drinks are still open. Which one will you
 * bring instead?" `now`: agreed to in so many words ("Did you mean…? — Yes"),
 * so done at once rather than shown to confirm. The sign-up itself still
 * checks again, and can't be written over anyone's (lib/foodSignups).
 */
async function offerFood(
  ev: EventInstance,
  item: string,
  shown: boolean,
  here: Here,
  talk: Talk,
  now = false
): Promise<boolean> {
  const input = { event_key: ev.instanceKey, item, shown_open: shown }
  const items = ev.foodItems ?? []
  const sheet = await here.foodSheet(ev)
  const at = items.findIndex((x) => squash(x) === squash(item))
  const by = sheet && at >= 0 ? sheet[String(at)] : undefined
  if (sheet && by) {
    const uid = String(here.profile?.uid ?? '')
    const taken = foodTakenSaid(by, item, uid, shown)
    const open = stillOpen(items, sheet)
    if (String(by.uid) === uid || open.length === 0) {
      talk.say(String(by.uid) === uid ? taken : `${taken} ${foodStillOpenSaid(open)}`)
      return true
    }
    const instead =
      open.length === 1 ? 'Want to bring it instead?' : 'Which one will you bring instead?'
    talk.ask(`${taken} ${foodStillOpenSaid(open)} ${instead}`, (r, t) =>
      // Just read as open: taken since is "just signed up for" too.
      foodChoice(r, ev, open, here, t, () => true)
    )
    return true
  }
  if (now) await talk.doNow('sign_up_food', input)
  else await talk.offer('sign_up_food', input)
  return true
}

/**
 * The event settled: the dish found on its sheet and shown to confirm; close,
 * and asked about; or what is still open asked about.
 */
async function foodOnEvent(
  ev: EventInstance,
  ask: FoodAsk,
  here: Here,
  talk: Talk,
  known?: string[]
): Promise<boolean> {
  const items = ev.foodItems ?? []
  const shown = shownOpen(ev, here, known)
  const picked: Picked<number> = ask.item ? foodItemPicked(items, ask.item) : { kind: 'none' }

  if (picked.kind === 'sure') {
    const item = items[picked.item]
    return offerFood(ev, item, shown(item), here, talk)
  }
  if (picked.kind === 'likely') {
    const item = items[picked.item]
    talk.ask(
      `Did you mean ${item}? If so, I’ll sign you up to bring it to ${ev.title} on ${dayOf(ev)}.`,
      async (r, t) => {
        if (neverMind(r, t)) return true
        if (saidYes(r)) return offerFood(ev, item, shown(item), here, t, true)
        const no = saidNo(r)
        // "No, the dessert": the one they meant; "no" alone: what is open.
        return foodItemNamed(no ? no.rest : r, ev, here, t, !!no)
      }
    )
    return true
  }
  if (picked.kind === 'which') {
    const options = picked.items.map((i) => items[i])
    talk.ask(`Which did you mean: ${listed(options, 'or')}?`, (r, t) =>
      foodChoice(r, ev, options, here, t, shown)
    )
    return true
  }
  return foodOpenAsked(ev, ask.item, here, talk, known)
}

/** What is still open on the sheet, asked which. `missed`: the dish said, not on it. */
async function foodOpenAsked(
  ev: EventInstance,
  missed: string,
  here: Here,
  talk: Talk,
  known?: string[]
): Promise<boolean> {
  talk.thinking()
  const open = known ?? (await here.openFood(ev))
  if (open === null) {
    talk.say(`I couldn’t read the food sheet for ${ev.title} just now.`, ev)
    return true
  }
  if (open.length === 0) {
    talk.say(`Everything on the food sheet for ${ev.title} is already taken.`)
    return true
  }
  const lead = missed ? `I didn’t see ${missed} on the sheet. ` : ''
  talk.ask(
    `${lead}${ev.title} on ${dayOf(ev)} still needs ${listed(open)}. Which one will you bring?`,
    // Listed as open just now: taken since is "just signed up for".
    (r, t) => foodChoice(r, ev, open, here, t, () => true)
  )
  return true
}

/** A dish named after a no, or instead of a yes: found on the sheet, or what is open asked. */
async function foodItemNamed(
  said: string,
  ev: EventInstance,
  here: Here,
  talk: Talk,
  wasNo: boolean
): Promise<boolean> {
  const today = here.data?.today ?? ''
  const dish = foodAsked(said, today)?.item || said
  if (!dish.trim()) return foodOpenAsked(ev, '', here, talk)
  const items = ev.foodItems ?? []
  const picked = foodItemPicked(items, dish)
  if (picked.kind === 'sure' || picked.kind === 'likely') {
    const item = items[picked.item]
    return offerFood(ev, item, shownOpen(ev, here)(item), here, talk)
  }
  if (!wasNo && looksLikeNewRequest(said)) return false
  return foodOpenAsked(ev, dish, here, talk)
}

/** Which of the items offered: by order, by name, or said as a sign-up. */
async function foodChoice(
  reply: string,
  ev: EventInstance,
  options: string[],
  here: Here,
  talk: Talk,
  shown: (item: string) => boolean
): Promise<boolean> {
  if (neverMind(reply, talk)) return true
  const today = here.data?.today ?? ''
  const dish = foodAsked(reply, today)?.item || reply
  let index = choicePicked(reply, options)
  if (index < 0) {
    const picked = foodItemPicked(options, dish)
    if (picked.kind === 'sure' || picked.kind === 'likely') index = picked.item
  }
  if (index >= 0) {
    const item = options[index]
    return offerFood(ev, item, shown(item), here, talk)
  }
  if (saidNo(reply)) {
    talk.say('Okay — nothing was changed.')
    return true
  }
  if (looksLikeNewRequest(reply)) return false
  talk.say(`I couldn’t tell which one you meant. Here’s the sheet for ${ev.title}.`, ev)
  return true
}

/** "Which date or event?", answered: from the events offered, or any with a sheet. */
async function foodWhich(
  reply: string,
  ask: FoodAsk,
  offered: EventInstance[],
  here: Here,
  talk: Talk
): Promise<boolean> {
  if (neverMind(reply, talk)) return true
  const { data } = here
  if (!data) {
    talk.say('I can’t see your events just now. Try again in a moment.')
    return true
  }
  if (offered.length) {
    const i = choicePicked(
      reply,
      offered.map((ev) => ev.title)
    )
    const picked = i >= 0 ? offered[i] : eventPicked(reply, offered, data.today)
    if (picked) return foodOnEvent(picked, ask, here, talk)
  }
  const said = plain(reply)
  const ref = eventRef(said, data.today)
  const date = dateSaid(said, data.today) ?? ref?.date ?? null
  const name = date && !ref?.date ? '' : (ref?.name ?? '')
  // Neither a day nor a name: not an answer, but a request of its own.
  if (!date && !name) return false
  const found = foodEventsFor({ date, name }, data)
  if (found.length === 1 || (found.length > 1 && !date))
    return foodOnEvent(found[0], ask, here, talk)
  if (found.length > 1) {
    talk.ask(
      `There’s more than one then: ${listed(
        found.map((ev) => ev.title),
        'or'
      )}. Which one?`,
      (r, t) => foodWhich(r, ask, found, here, t)
    )
    return true
  }
  if (looksLikeNewRequest(reply)) return false
  talk.say('I couldn’t find an event with a food sign-up for that.')
  return true
}

// --- A task's status ---------------------------------------------------------------

async function taskStatusHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  if (!here.tools.includes('set_task_status')) return false
  const ask = taskStatusAsked(said)
  if (!ask) return false
  const { ready, mine } = here.tasks()
  // Not loaded yet: Claude, which reads them itself.
  if (!ready) return false
  return taskOffer(taskPicked(mine, ask), ask, mine, talk)
}

async function taskOffer(
  picked: Picked<Task>,
  ask: TaskStatusAsk,
  mine: Task[],
  talk: Talk
): Promise<boolean> {
  const word = STATUS_WORDS[ask.status]
  const input = (t: Task) => ({ task_id: String(t.id), status: ask.status })

  if (picked.kind === 'sure') {
    await talk.offer('set_task_status', input(picked.item))
    return true
  }
  if (picked.kind === 'likely') {
    const task = picked.item
    talk.ask(`Did you mean ${taskSaid(task)}? If so, I’ll mark it ${word}.`, async (r, t) => {
      if (neverMind(r, t)) return true
      if (saidYes(r)) {
        await t.doNow('set_task_status', input(task))
        return true
      }
      const no = saidNo(r)
      if (no && !no.rest) {
        const others = picked.others.slice(0, 3)
        // One other: asked about in the same way, so a yes does it.
        if (others.length === 1) {
          return taskOffer({ kind: 'likely', item: others[0], others: [] }, ask, mine, t)
        }
        if (others.length === 0) {
          t.ask('Which task did you mean?', (r2, t2) => taskNamed(r2, ask, mine, t2))
          return true
        }
        t.ask(`Which one, then: ${listed(others.map(taskSaid), 'or')}?`, (r2, t2) =>
          taskChoice(r2, ask, others, mine, t2)
        )
        return true
      }
      // "No, the youth one", or another name said instead.
      return taskNamed(no ? no.rest : r, ask, mine, t, picked.others)
    })
    return true
  }
  if (picked.kind === 'which') {
    const options = picked.items.slice(0, 3)
    talk.ask(`Which one: ${listed(options.map(taskSaid), 'or')}?`, (r, t) =>
      taskChoice(r, ask, options, mine, t)
    )
    return true
  }
  // None of theirs fits: said so only if it was plainly about a task.
  if (!ask.saidTask) return false
  talk.say(`I couldn’t find a task of yours called ${quoted(ask.name)}.`)
  return true
}

/** Which of the tasks offered: by order, by name, or by its due day. */
async function taskChoice(
  reply: string,
  ask: TaskStatusAsk,
  options: Task[],
  mine: Task[],
  talk: Talk
): Promise<boolean> {
  if (neverMind(reply, talk)) return true
  // By the name and due date, so "the 25th" picks the one due then.
  const i = choicePicked(
    reply,
    options.map((o) => `${o.title} ${o.dueDate ? FD(o.dueDate) : ''}`)
  )
  if (i >= 0) {
    await talk.offer('set_task_status', { task_id: String(options[i].id), status: ask.status })
    return true
  }
  return taskNamed(reply, ask, mine, talk, options)
}

/** A task named in a reply: matched among theirs, as when first asked. */
async function taskNamed(
  reply: string,
  ask: TaskStatusAsk,
  mine: Task[],
  talk: Talk,
  among: Task[] = []
): Promise<boolean> {
  if (neverMind(reply, talk)) return true
  const again = taskStatusAsked(reply)
  const name = (
    again?.name ?? plain(reply).replace(/^(?:the|my|it'?s|it\s+was|i\s+meant)\s+/, '')
  ).trim()
  if (!name) return false
  const asked = { ...ask, name, status: again?.status ?? ask.status }
  // Among those offered first, then any of theirs.
  const pool = among.length && taskPicked(among, asked).kind !== 'none' ? among : mine
  const picked = taskPicked(pool, asked)
  if (picked.kind === 'none') {
    if (looksLikeNewRequest(reply) && !again) return false
    talk.say(`I couldn’t find a task of yours called ${quoted(name)}.`)
    return true
  }
  return taskOffer(picked, { ...asked, saidTask: true }, mine, talk)
}

// --- Notification switches ------------------------------------------------------------

async function notificationsHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  if (!here.tools.includes('change_notification')) return false
  const ask = notificationAsked(said)
  if (!ask) return false
  const visible = notificationKeysFor(here.profile)
  return notificationOffer(notificationPlan(ask, visible), ask, visible, talk)
}

/** The switches as a phrase: “New message” notifications, or all your notifications. */
function switchesPhrase(keys: string[], visible: string[]): string {
  if (keys.length === visible.length && visible.length > 1) return 'all your notifications'
  return `${switchesSaid(keys)} notifications`
}

async function notificationOffer(
  plan: NotificationPlan,
  ask: NotificationAsk,
  visible: string[],
  talk: Talk
): Promise<boolean> {
  const state = ask.on ? 'on' : 'off'
  const change = (keys: string[]) => ({ notifications: keys, on: ask.on })

  if (plan.kind === 'sure') {
    await talk.offer('change_notifications', change(plan.keys))
    return true
  }
  if (plan.kind === 'none') {
    talk.say('That isn’t one of the notifications you have. Yours are all in Settings.')
    return true
  }
  if (plan.kind === 'which') {
    talk.ask(
      `Which notifications should I turn ${state}? You can name a kind — messages, announcements, event reminders — or say all of them.`,
      (r, t) => notificationNamed(r, ask, visible, [], t)
    )
    return true
  }

  // Likely: asked, saying exactly what would be done.
  const lead = ask.email
    ? 'Email notifications aren’t on in the app, so I can only change the push ones. '
    : ask.oneChat
      ? `I can’t mute just one conversation from here — only every new message. `
      : ''
  const others = plan.others.slice(0, 3)
  const also = others.length
    ? ` There’s also ${listed(
        others.map((k) => quoted(notificationLabel(k))),
        'and'
      )}.`
    : ''
  talk.ask(
    `${lead}Did you mean: turn ${state} ${switchesPhrase(plan.keys, visible)}?${also}`,
    async (r, t) => {
      if (neverMind(r, t)) return true
      if (saidYes(r)) {
        await t.doNow('change_notifications', change(plan.keys))
        return true
      }
      const no = saidNo(r)
      // "No, the flight ones": the one meant, named.
      if (no?.rest)
        return notificationNamed(no.rest, ask, visible, [...plan.keys, ...plan.others], t)
      if (no) {
        // The others that fit, or — for several at once — each of them.
        const choices = plan.others.length ? plan.others : plan.keys.length > 1 ? plan.keys : []
        if (choices.length === 0) {
          t.say('Okay — nothing was changed.')
          return true
        }
        // One other: asked about in the same way, so a yes does it.
        if (choices.length === 1) {
          return notificationOffer({ kind: 'likely', keys: choices, others: [] }, ask, visible, t)
        }
        t.ask(
          `Which, then: ${listed(
            choices.slice(0, 4).map((k) => quoted(notificationLabel(k))),
            'or'
          )}?`,
          (r2, t2) => notificationNamed(r2, ask, visible, choices, t2)
        )
        return true
      }
      // Another named instead: "just the event ones", "all of them".
      return notificationNamed(r, ask, visible, [...plan.keys, ...plan.others], t)
    }
  )
  return true
}

/**
 * Which switches a reply names: "all of them" (of those offered, or all of
 * theirs), one of those offered by order or name, or a kind said afresh.
 * Named in so many words, it is shown to confirm.
 */
async function notificationNamed(
  reply: string,
  ask: NotificationAsk,
  visible: string[],
  offered: string[],
  talk: Talk
): Promise<boolean> {
  if (neverMind(reply, talk)) return true
  const change = (keys: string[]) => ({ notifications: keys, on: ask.on })
  const r = plain(reply).replace(/^(?:just|only|the|i\s+meant|i\s+mean)\s+/, '')
  if (
    /^(?:all|both|every\s*one|everything|all\s+of\s+(?:them|those|these|it)|both\s+of\s+them)(?:\s+of\s+them)?$/.test(
      r
    )
  ) {
    await talk.offer('change_notifications', change(offered.length ? offered : visible))
    return true
  }
  if (offered.length) {
    const i = choicePicked(reply, offered.map(notificationLabel))
    if (i >= 0) {
      await talk.offer('change_notifications', change([offered[i]]))
      return true
    }
  }
  // A kind named: read as if asked for in so many words.
  const asked = notificationAsked(`turn ${ask.on ? 'on' : 'off'} ${r} notifications`)
  if (asked && asked.subjects.length) {
    const plan = notificationPlan({ ...asked, plainly: true, email: false, oneChat: null }, visible)
    if (plan.kind === 'sure' || plan.kind === 'likely') {
      // Of those offered, the ones the kind named could mean: "just the
      // reminders", of the two food ones, is the food reminder.
      const could = plan.kind === 'likely' ? [...plan.keys, ...plan.others] : plan.keys
      const among = could.filter((k) => offered.includes(k))
      await talk.offer('change_notifications', change(among.length ? among : plan.keys))
      return true
    }
    if (plan.kind === 'none') {
      talk.say('That isn’t one of the notifications you have. Yours are all in Settings.')
      return true
    }
  }
  if (looksLikeNewRequest(reply)) return false
  talk.say('I couldn’t tell which notifications you meant. You can change them in Settings.')
  return true
}

// --- Availability ----------------------------------------------------------------------

/** How each answer is said back, in "I'll mark you …". */
const MARKED: Record<AvailStatus, string> = {
  yes: 'as available',
  no: 'as not available',
  partial: 'as partly available',
  tbd: 'as not sure yet',
}

/** How far ahead "the next one they haven't answered" is looked for. */
const NEXT_ANSWER_DAYS = 21

/** Their events between two dates, nearest first: those they're on, as their calendar shows them. */
function theirEvents(data: QuickData, from: string, to: string): EventInstance[] {
  const { templates, overrides, groups, viewer } = data
  return templates
    .filter((t) => canSeeEvent(t, viewer, groups))
    .flatMap((t) => instancesOf(t, from, to, overrides))
    .filter((ev) => canSeeEvent(ev, viewer, groups) && assignedTo(ev, groups).has(viewer.uid))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

/** The next of theirs with no answer — else simply their next. */
function nextToAnswer(here: Here, data: QuickData): EventInstance | null {
  const ahead = theirEvents(data, data.today, shiftDate(data.today, NEXT_ANSWER_DAYS))
  return ahead.find((ev) => !here.answerOf(ev)) ?? ahead[0] ?? null
}

/**
 * "I can't make it Friday", "count me in for the retreat", "I'll be late to
 * youth night": their answer for the event meant. Plainly one, it is shown to
 * confirm; probably one, asked about; several, asked which. No event said —
 * "I can't make it" — and the next of theirs they haven't answered is asked
 * about. One not found among theirs is left to Claude, which looks further.
 */
async function availabilityHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  const { data } = here
  if (!data || !here.tools.includes('set_availability')) return false
  const ask = availabilitySaid(said, data.today)
  if (!ask) return false
  if (!ask.date && !ask.name) {
    const next = nextToAnswer(here, data)
    if (!next) {
      talk.say('You don’t have any events coming up to answer for.')
      return true
    }
    talk.ask(
      `Do you mean ${eventCalled(next, data.today)}? If so, I’ll mark you ${MARKED[ask.status]}.`,
      async (r, t) => {
        if (neverMind(r, t)) return true
        if (saidYes(r)) {
          await t.doNow('set_availability', answerInput(next, ask))
          return true
        }
        const no = saidNo(r)
        if (no && !no.rest) {
          t.ask('Which event do you mean?', (r2, t2) => availabilityWhich(r2, ask, [], here, t2))
          return true
        }
        return availabilityWhich(no ? no.rest : r, ask, [], here, t)
      }
    )
    return true
  }
  const picked = eventPick(ask, data)
  if (picked.kind === 'none') return false
  return availabilityPicked(picked, ask, here, talk)
}

const answerInput = (ev: EventInstance, ask: Pick<AvailabilitySaid, 'status' | 'note'>) => ({
  event_key: ev.instanceKey,
  status: ask.status,
  note: ask.note,
})

/** The event settled on, or nearly: shown to confirm, asked about, or asked which. */
async function availabilityPicked(
  picked: Picked<EventInstance>,
  ask: AvailabilitySaid,
  here: Here,
  talk: Talk
): Promise<boolean> {
  const today = here.data?.today ?? ''
  if (picked.kind === 'none') return false
  if (picked.kind === 'sure') {
    await talk.offer('set_availability', answerInput(picked.item, ask))
    return true
  }
  if (picked.kind === 'likely') {
    const ev = picked.item
    talk.ask(
      `Did you mean ${eventCalled(ev, today)}? If so, I’ll mark you ${MARKED[ask.status]}.`,
      async (r, t) => {
        if (neverMind(r, t)) return true
        if (saidYes(r)) {
          await t.doNow('set_availability', answerInput(ev, ask))
          return true
        }
        const no = saidNo(r)
        if (no && !no.rest && picked.others.length === 0) {
          t.ask('Which event do you mean?', (r2, t2) => availabilityWhich(r2, ask, [], here, t2))
          return true
        }
        return availabilityWhich(no?.rest || r, ask, picked.others, here, t)
      }
    )
    return true
  }
  const options = picked.items
  talk.ask(
    `Which one: ${listed(
      options.map((ev) => eventCalled(ev, today)),
      'or'
    )}?`,
    (r, t) => availabilityWhich(r, ask, options, here, t)
  )
  return true
}

/** "Which event?", answered: one of those offered, by order, name or day — or any of theirs named. */
async function availabilityWhich(
  reply: string,
  ask: AvailabilitySaid,
  offered: EventInstance[],
  here: Here,
  talk: Talk
): Promise<boolean> {
  if (neverMind(reply, talk)) return true
  const { data } = here
  if (!data) return false
  if (offered.length) {
    const i = choicePicked(
      reply,
      offered.map((ev) => `${ev.title} ${eventDay(ev, data.today)}`)
    )
    const ev = i >= 0 ? offered[i] : eventPicked(reply, offered, data.today)
    if (ev) {
      await talk.offer('set_availability', answerInput(ev, ask))
      return true
    }
  }
  const ref = eventRef(plain(reply), data.today)
  if (ref) {
    const picked = eventPick(ref, data)
    // Named in a reply: taken as meant, and shown to confirm.
    if (picked.kind === 'likely')
      return availabilityPicked({ kind: 'sure', item: picked.item }, ask, here, talk)
    if (picked.kind !== 'none') return availabilityPicked(picked, ask, here, talk)
  }
  if (looksLikeNewRequest(reply)) return false
  talk.say('I couldn’t find that among your events. You can answer on the event’s page.')
  return true
}

/** How each answer is taken, said back before the next question. */
const NOTED: Record<AvailStatus, string> = {
  yes: 'Great — you’re down as available.',
  no: 'Okay — you’re down as not available.',
  partial: 'Okay — partly available, noted.',
  tbd: 'Okay — I’ll ask you again later.',
}

/** An event to ask about, and whether they answered "not sure yet" last time. */
export interface AvailabilityQuestion {
  ev: EventInstance
  wasUnsure: boolean
}

/**
 * Her questions about events they haven't answered for — after the daily
 * briefing, or after telling them what they have this week — one at a time:
 * "Can you make Youth Night on Friday?" Each reply is saved as their answer
 * and the next asked: yes, no (with why, if said), late or leaving early
 * (partly available, noted), or "I don't know yet" (TBD — asked again in a
 * later briefing). "Skip" leaves that one for another time; "not now" ends
 * the questions. `lead`: said before the first question.
 */
export function askAvailability(
  questions: AvailabilityQuestion[],
  here: Here,
  talk: Talk,
  lead = ''
): void {
  askOne(questions, 0, here, talk, lead, false)
}

function askOne(
  questions: AvailabilityQuestion[],
  at: number,
  here: Here,
  talk: Talk,
  lead: string,
  again: boolean
): void {
  const today = here.data?.today ?? ''
  if (at >= questions.length) {
    talk.say(`${lead}That’s all of them — thanks.`.trim())
    return
  }
  const { ev, wasUnsure } = questions[at]
  const called = eventCalled(ev, today)
  const question = again
    ? `Sorry — can you make ${ev.title}? You can say yes, no, not sure yet, or skip.`
    : wasUnsure
      ? `Last time you weren’t sure about ${called}. Can you make it now?`
      : `Can you make ${called}?`
  talk.ask(`${lead}${question}`, async (r, t) => {
    const reply = availabilityReply(r)
    if (!reply) {
      if (looksLikeNewRequest(r)) return false
      // Asked once more; then left for another time.
      if (!again) askOne(questions, at, here, t, '', true)
      else askOne(questions, at + 1, here, t, 'I’ll ask about that one another time. ', false)
      return true
    }
    if (reply.kind === 'stop') {
      t.say(at + 1 < questions.length ? 'Okay — I’ll ask about the rest another time.' : 'Okay.')
      return true
    }
    if (reply.kind === 'skip') {
      askOne(questions, at + 1, here, t, 'Okay. ', false)
      return true
    }
    const saved = await here.answer(ev, reply.status, reply.note)
    const said = saved
      ? NOTED[reply.status]
      : `That didn’t save — you can answer on ${ev.title}’s page.`
    askOne(questions, at + 1, here, t, `${said} `, false)
    return true
  })
}

// --- What they have coming up ---------------------------------------------------------

/**
 * "What do I have this week?", "what's my schedule this weekend?": their own
 * events then, each with what is theirs at it — their team, what they're
 * bringing, their car, and whether they've answered. Any they haven't
 * answered for are asked about after. ("What's on this week?" — not theirs —
 * is the plain list, lib/miriamQuick.)
 */
async function agendaHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  const { data } = here
  if (!data || !here.profile) return false
  const ask = listAsked(said, data.today)
  if (!ask || ask.next) return false
  if (!/\b(?:i|my|me|i'm|am\s+i|i\s+have)\b/.test(plain(said))) return false
  const events = theirEvents(data, ask.from, ask.to)
  // Their own notes on those days, said after.
  const notes = here.tools.includes('add_date_note')
    ? notesBetween((await here.notes()).all, ask.from, ask.to)
    : []
  const noted = notes.length ? ` ${notesTooSaid(notes, ask.from === ask.to, data.today)}` : ''
  if (events.length === 0) {
    talk.say(`You have nothing on ${ask.span}.${noted}`)
    return true
  }
  talk.thinking()
  const shown = events.slice(0, 5)
  const lines = await Promise.all(shown.map((ev) => agendaLine(ev, here, data)))
  const count = events.length === 1 ? 'one event' : `${events.length} events`
  const more = events.length > shown.length ? ` And ${events.length - shown.length} more.` : ''
  const text = `${ask.span.charAt(0).toUpperCase()}${ask.span.slice(1)} you have ${count}. ${lines.join(' ')}${more}${noted}`
  const unanswered = here.tools.includes('set_availability')
    ? shown.filter((ev) => !here.answerOf(ev)).slice(0, 3)
    : []
  if (unanswered.length) {
    askAvailability(
      unanswered.map((ev) => ({ ev, wasUnsure: false })),
      here,
      talk,
      `${text} `
    )
  } else talk.say(text)
  return true
}

/** One of their events, with what is theirs at it: "Youth Night, Friday at 7 PM — you're on Worship, bringing Chips." */
async function agendaLine(ev: EventInstance, here: Here, data: QuickData): Promise<string> {
  const uid = data.viewer.uid
  const parts: string[] = []
  const team = (ev.teams ?? []).find((t) =>
    [...t.leaders, ...t.members].some((m) => String(m) === uid)
  )
  if (team) parts.push(`you’re on ${team.name}`)
  if (ev.food && ev.foodItems?.length) {
    const sheet = await here.foodSheet(ev).catch(() => null)
    const mine = Object.entries(sheet ?? {})
      .filter(([, who]) => String(who.uid) === uid)
      .map(([i]) => ev.foodItems?.[Number(i)])
      .filter((x): x is string => !!x)
    if (mine.length) parts.push(`bringing ${listed(mine)}`)
  }
  if (ev.carpool) {
    const cars = await here.carsFor(ev).catch(() => null)
    const i = (cars ?? []).findIndex((c) => c.driver === uid || c.riders.includes(uid))
    if (cars && i >= 0) {
      const car = cars[i]
      const name = car.label.trim() || `Car ${i + 1}`
      parts.push(car.driver === uid ? `driving ${name}` : `riding in ${name}`)
    }
  }
  const answer = here.answerOf(ev)
  if (!answer) parts.push('you haven’t said if you can make it')
  else if (answer.status === 'no') parts.push('you said you can’t make it')
  else if (answer.status === 'tbd') parts.push('you weren’t sure yet')
  else if (answer.status === 'partial') parts.push('you’ll be there for part of it')
  const when = `${eventDay(ev, data.today)}${ev.startTime ? ` at ${ev.startTime}` : ''}`
  return `${ev.title}, ${when}${parts.length ? ` — ${parts.join(', ')}` : ''}.`
}

/** Their notes, after what they have on: "Your note: bring the projector." / "Your notes: Friday — …". */
function notesTooSaid(notes: DateNote[], oneDay: boolean, today: string): string {
  const lead = notes.length === 1 ? 'Your note' : 'Your notes'
  if (oneDay) return `${lead}: ${notes.map((n) => n.text.replace(/[.!?]+$/, '')).join('; ')}.`
  const days = [...new Set(notes.map((n) => n.date))]
  const said = days
    .map((d) => {
      const day = daySaid(d, today)
      const texts = notesOn(notes, d).map((n) => n.text.replace(/[.!?]+$/, ''))
      return `${day.charAt(0).toUpperCase()}${day.slice(1)} — ${texts.join('; ')}`
    })
    .join('. ')
  return `${lead}: ${said}.`
}

// --- Notes on days of their calendar -----------------------------------------------------

/**
 * "Add a note to Friday: bring the projector", "what are my notes this
 * week?", "delete my note for Friday": their own notes on days of their
 * calendar (lib/dateNotes). Made at once, with a tap to take it back — the
 * day, or what it says, asked for if not said; read out; and taken away once
 * confirmed, as any change is.
 */
async function notesHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  if (!here.data || !here.tools.includes('add_date_note')) return false
  const { today } = here.data
  const ask = noteAsked(said, today)
  if (!ask) return false
  if (ask.kind === 'add') return noteWith(ask.date, ask.text, here, talk)
  const notes = await here.notes()
  if (!notes.ready) {
    talk.say('I can’t read your notes just now. Try again in a moment.')
    return true
  }
  if (ask.kind === 'read') {
    talk.say(notesReadSaid(notesBetween(notes.all, ask.from, ask.to), ask.span, today))
    return true
  }
  const meant = notesMeant(notes.all, ask, today)
  if (meant.length === 0) {
    talk.say(
      ask.date
        ? `You don’t have a note ${onTheDay(ask.date, today)}.`
        : ask.words
          ? 'I couldn’t find a note like that.'
          : 'Which day’s note? Try “delete my note for Friday.”'
    )
    return true
  }
  await talk.offer('remove_date_note', { ids: meant.map((n) => n.id) })
  return true
}

/** "On Friday", "today": a day, for a sentence. */
const onTheDay = (date: string, today: string) => {
  const d = daySaid(date, today)
  return /^(?:today|tomorrow|yesterday)$/.test(d) ? d : `on ${d}`
}

/** A note with what is known of it: added, or what is missing asked for. */
async function noteWith(
  date: string | null,
  text: string,
  here: Here,
  talk: Talk
): Promise<boolean> {
  const today = here.data?.today ?? ''
  if (!text) {
    talk.ask(
      date ? `What should the note ${onTheDay(date, today)} say?` : 'What should the note say?',
      async (reply, t) => {
        if (neverMind(reply, t)) return true
        // A question back is a new request; anything else is the note.
        if (/\?\s*$/.test(reply) || /^(?:what|when|where|who|why|how)\b/i.test(plain(reply))) {
          return false
        }
        const words = noteText(reply)
        if (!words) return false
        return noteWith(date, words.charAt(0).toUpperCase() + words.slice(1), here, t)
      }
    )
    return true
  }
  if (!date) {
    talk.ask('Which day should I put it on?', async (reply, t) => {
      if (neverMind(reply, t)) return true
      const day = daySaidIn(reply, today)
      if (day) return noteWith(day, text, here, t)
      if (looksLikeNewRequest(reply)) return false
      t.say('I couldn’t tell which day. Try “Friday” or “October 20th.”')
      return true
    })
    return true
  }
  await talk.note(date, text)
  return true
}

/** Said once a note is added, for MiriamButton. */
export const noteAdded = noteAddedSaid

// --- Posts ---------------------------------------------------------------------------

/**
 * "What's the latest post?", "read me the newest post from Missions": the
 * church's posts (lib/miriamPosts), for anyone whose screens show them — a
 * public follower's Posts, a member's Public Facing.
 */
async function postsHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  if (!here.profile) return false
  const tabs = visibleTabs(here.profile)
  if (!tabs.includes('posts') && !tabs.includes('public')) return false
  const ask = postsAsked(said)
  if (!ask) return false
  talk.thinking()
  const pages = await here.posts().catch(() => null)
  if (!pages) {
    talk.say('I can’t read the posts just now. Try again in a moment.')
    return true
  }
  talk.say(postsSaid(postsFor(pages, ask.page), ask.page, here.now()))
  return true
}

// --- An event's cars, arranged by an admin ------------------------------------------

/** How far ahead an event with a carpool is looked for, when none is said. */
const CARPOOL_AHEAD_DAYS = 45

/** A name as heard, written as a name: "sam lee" — "Sam Lee". */
const titled = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

/** An event, its cars, and the car said among them. */
interface CarsOf {
  ev: EventInstance
  cars: CarpoolCarData[]
  car: Picked<number>
}

/** The car said, among an event's: by its name, or its place ("car 2"). */
function carPicked(cars: CarpoolCarData[], said: string): Picked<number> {
  const picked = pickBest(
    cars.map((car, i) => ({ car, i })),
    (x) => plain(carName(x.car, x.i)),
    plain(said)
  )
  if (picked.kind === 'none') return picked
  if (picked.kind === 'which') return { kind: 'which', items: picked.items.map((x) => x.i) }
  if (picked.kind === 'likely')
    return { kind: 'likely', item: picked.item.i, others: picked.others.map((x) => x.i) }
  return { kind: 'sure', item: picked.item.i }
}

/**
 * "Put Sam in Andy's truck", "make Beth the driver of van 1", "take Sam out of
 * the van", "add a child named Joey to van 1" — for an admin, the change shown
 * to confirm (actions: move_in_carpool). The event is the one said, else the
 * one coming up whose cars include the car named; the car and the person are
 * asked about when it isn't plain which. A car not found on any event coming
 * up is no carpool change at all — "put chips on the list" — and is left alone.
 */
async function carpoolHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  const { data } = here
  if (!data || !here.tools.includes('set_carpool')) return false
  const move = carpoolAsked(said, data.today)
  if (!move) return false
  let events: EventInstance[]
  if (move.event.date || move.event.name) {
    const picked = eventPick(move.event, data, { only: (ev) => !!ev.carpool })
    if (picked.kind === 'none') return false
    events = picked.kind === 'which' ? picked.items : [picked.item]
  } else {
    const { templates, overrides, groups, viewer, today } = data
    const seen = new Set<string>()
    events = templates
      .filter((t) => t.carpool && canSeeEvent(t, viewer, groups))
      .flatMap((t) => instancesOf(t, today, shiftDate(today, CARPOOL_AHEAD_DAYS), overrides))
      .filter((ev) => ev.carpool && !ev.unpublished)
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((ev) => {
        const id = String(ev.templateId)
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
      .slice(0, 6)
  }
  if (events.length === 0) return false
  talk.thinking()
  const found: CarsOf[] = []
  for (const ev of events) {
    const cars = (await here.carsFor(ev)) ?? []
    if (!cars.length) continue
    found.push({ ev, cars, car: move.car ? carPicked(cars, move.car) : { kind: 'none' } })
  }
  // With a car named, the events that have one like it: none, and it was no carpool change.
  const fits = move.car ? found.filter((f) => f.car.kind !== 'none') : found
  if (fits.length === 0) return false
  if (fits.length === 1) return carpoolOn(fits[0], move, here, talk)
  const today = data.today
  talk.ask(
    `Which event: ${listed(
      fits.map((f) => eventCalled(f.ev, today)),
      'or'
    )}?`,
    async (r, t) => {
      if (neverMind(r, t)) return true
      const i = choicePicked(
        r,
        fits.map((f) => `${f.ev.title} ${eventDay(f.ev, today)}`)
      )
      const ev =
        i >= 0
          ? fits[i].ev
          : eventPicked(
              r,
              fits.map((f) => f.ev),
              today
            )
      const fit = fits.find((f) => f.ev === ev)
      if (fit) return carpoolOn(fit, move, here, t)
      if (looksLikeNewRequest(r)) return false
      t.say('I couldn’t tell which event you meant. You can arrange the cars on its page.')
      return true
    }
  )
  return true
}

/** The event settled: the car, then the person — each asked about if need be — then the change shown. */
async function carpoolOn(fit: CarsOf, move: CarpoolMove, here: Here, talk: Talk): Promise<boolean> {
  const { ev, cars } = fit
  const name = (i: number) => carName(cars[i], i)
  const withCar = async (carAt: number | null, t: Talk): Promise<boolean> => {
    if (move.kind === 'child') {
      if (carAt === null) return false
      await t.offer('move_in_carpool', {
        event_key: ev.instanceKey,
        car_id: cars[carAt].id,
        seat: 'child',
        child: titled(move.child),
      })
      return true
    }
    return carpoolPerson(fit, move, carAt, here, t)
  }
  // Taking someone out of "the carpool": whichever car they're in.
  if (!move.car) return withCar(null, talk)
  const car = fit.car
  if (car.kind === 'sure' || car.kind === 'likely') return withCar(car.item, talk)
  if (car.kind === 'which') {
    const options = car.items
    talk.ask(`Which car: ${listed(options.map(name), 'or')}?`, async (r, t) => {
      if (neverMind(r, t)) return true
      const i = choicePicked(r, options.map(name))
      if (i >= 0) return withCar(options[i], t)
      if (looksLikeNewRequest(r)) return false
      t.say(
        `I couldn’t tell which car you meant. ${ev.title}’s cars are ${listed(cars.map((_, j) => name(j)))}.`
      )
      return true
    })
    return true
  }
  talk.say(
    `${ev.title} doesn’t have a car called ${quoted(titled(move.car))}. Its cars are ${listed(cars.map((_, j) => name(j)))}.`
  )
  return true
}

/** Who was said, among the people the app knows — those in its cars or on the event first. */
async function carpoolPerson(
  fit: CarsOf,
  move: Extract<CarpoolMove, { who: string }>,
  carAt: number | null,
  here: Here,
  talk: Talk
): Promise<boolean> {
  const { ev, cars } = fit
  const groups = here.data?.groups ?? []
  const names = here.names()
  const inCars = new Set(cars.flatMap((c) => [c.driver, ...c.riders].filter(Boolean)))
  const near = new Set([...inCars, ...assignedTo(ev, groups)])
  const people = [...names.entries()].map(([uid, name]) => ({ uid, name }))
  const among = (pool: { uid: string; name: string }[]) =>
    pickBest(pool, (p) => p.name, move.who, 3, 0.8)
  let picked = among(people.filter((p) => near.has(p.uid)))
  if (picked.kind === 'none') picked = among(people)
  const offer = async (uid: string, t: Talk) => {
    await t.offer('move_in_carpool', {
      event_key: ev.instanceKey,
      car_id: carAt === null ? '' : cars[carAt].id,
      seat: move.kind,
      uid,
    })
    return true
  }
  if (picked.kind === 'sure' || picked.kind === 'likely') return offer(picked.item.uid, talk)
  if (picked.kind === 'which') {
    const options = picked.items
    talk.ask(
      `Which one: ${listed(
        options.map((p) => p.name),
        'or'
      )}?`,
      async (r, t) => {
        if (neverMind(r, t)) return true
        const i = choicePicked(
          r,
          options.map((p) => p.name)
        )
        if (i >= 0) return offer(options[i].uid, t)
        if (looksLikeNewRequest(r)) return false
        t.say('I couldn’t tell who you meant. You can arrange the cars on the event’s page.')
        return true
      }
    )
    return true
  }
  talk.say(`I couldn’t find anyone called ${quoted(titled(move.who))}.`)
  return true
}

// --- Reminders: from an event, or asked when ------------------------------------------

/**
 * "Remind me an hour before youth night", "the day before the retreat to
 * pack": set from the event's own time, and tied to it, so it moves if the
 * event does (functions: moveEventReminders). "Remind me to bring chips",
 * with no time: she asks when. (A time said outright — "at 5 tomorrow" — is
 * set before any of this, in MiriamButton.)
 */
async function remindersHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  if (!here.data || !here.tools.includes('create_reminder')) return false
  const fromEvent = eventReminderAsked(said)
  // "An hour before every event": one reminder for all of theirs.
  if (fromEvent && everyEventSaid(fromEvent.event)) return remindBeforeEach(fromEvent, here, talk)
  if (fromEvent) return reminderFromEvent(fromEvent, here, talk)
  // "Before every event", and nothing of how long: asked.
  const each = beforeEachWithoutSpan(said)
  if (each) {
    talk.ask(
      `How long before each event should I remind you${each.spoken ? ` ${each.spoken}` : ''}? An hour before, say.`,
      (r, t) => beforeEachWhenSaid(r, each, here, t)
    )
    return true
  }
  const what = reminderWithoutWhen(said)
  if (!what) return false
  talk.ask(`When should I remind you ${what.spoken}?`, (r, t) => reminderWhenSaid(r, what, here, t))
  return true
}

/** "When should I remind you?", answered: a time, or one from an event. */
async function reminderWhenSaid(
  reply: string,
  what: { text: string; spoken: string },
  here: Here,
  talk: Talk
): Promise<boolean> {
  if (neverMind(reply, talk)) return true
  const asked = `remind me ${what.spoken} ${reply}`
  const fromEvent = eventReminderAsked(asked)
  if (fromEvent) return reminderFromEvent({ ...fromEvent, ...what }, here, talk)
  const at = reminderAsked(asked, new Date(here.now()))
  if (at) {
    await talk.remind(at.text, at.at, at.spoken, at.repeat ? { repeat: at.repeat } : {})
    return true
  }
  if (looksLikeNewRequest(reply)) return false
  talk.say(
    'I couldn’t tell when. Try something like “tomorrow at 9” or “an hour before the potluck.”'
  )
  return true
}

/** "How long before each event?", answered: "an hour", "30 minutes before", "the morning of". */
async function beforeEachWhenSaid(
  reply: string,
  what: { text: string; spoken: string },
  here: Here,
  talk: Talk
): Promise<boolean> {
  if (neverMind(reply, talk)) return true
  const r = reply.trim().replace(/[.!?]+$/, '')
  const asked = `remind me ${what.spoken} ${/\b(?:before|of)$/i.test(r) ? r : `${r} before`} every event`
  const fromEvent = eventReminderAsked(asked)
  if (fromEvent && everyEventSaid(fromEvent.event)) {
    return remindBeforeEach({ ...fromEvent, text: what.text, spoken: what.spoken }, here, talk)
  }
  if (looksLikeNewRequest(reply)) return false
  talk.say('I couldn’t tell how long before. Try “an hour before every event.”')
  return true
}

/**
 * One reminder before every event of theirs, from now on — the server keeps
 * it on the next (functions/src/push/everyEvent) — with the first of them
 * found here, to be said: the soonest whose time is still to come.
 */
export async function remindBeforeEach(
  ask: Omit<EventReminderAsk, 'event'>,
  here: Here,
  talk: Talk
): Promise<boolean> {
  const { data } = here
  if (!data) return false
  const now = here.now()
  let first: { ev: EventInstance; at: Date } | null = null
  for (const ev of theirEvents(data, data.today, shiftDate(data.today, EACH_DAYS))) {
    // A later day of a multi-day event is the same event.
    if (ev.unpublished === true || /_d\d+$/.test(ev.instanceKey)) continue
    const at = beforeEventAt(ev, ask.before)
    if (at && at.getTime() > now && (!first || at < first.at)) first = { ev, at }
  }
  await talk.remindBeforeEach(ask.text, ask.spoken, ask.before, ask.relation, first)
  return true
}

/** How far ahead the first event of a reminder before each is looked for. */
const EACH_DAYS = 120

/**
 * When a reminder comes before this event: so long before its start, or a day
 * before it at an hour. Its start read as the server reads it (clockOf), which
 * keeps the reminder on from here, so the two agree.
 */
function beforeEventAt(ev: EventInstance, before: EventReminderAsk['before']): Date | null {
  if ('minutes' in before) {
    const clock = clockOf(ev.startTime)
    if (!clock) return null
    const [y, m, d] = ev.date.split('-').map(Number)
    return new Date(new Date(y, m - 1, d, clock.h, clock.min).getTime() - before.minutes * 60_000)
  }
  const [y, m, d] = ev.date.split('-').map(Number)
  return new Date(y, m - 1, d - before.days, before.hour, 0)
}

/** The event a reminder is set from: found, or asked about — then the reminder set from its time. */
async function reminderFromEvent(ask: EventReminderAsk, here: Here, talk: Talk): Promise<boolean> {
  const { data } = here
  if (!data) return false
  const ref = eventRef(ask.event, data.today) ?? { date: null, name: ask.event }
  const picked = eventPick(ref, data)
  if (picked.kind === 'none') return false
  if (picked.kind === 'sure') return remindFrom(picked.item, ask, here, talk)
  if (picked.kind === 'likely') {
    const ev = picked.item
    talk.ask(`Did you mean ${eventCalled(ev, data.today)}?`, async (r, t) => {
      if (neverMind(r, t)) return true
      if (saidYes(r)) return remindFrom(ev, ask, here, t)
      const others = picked.others
      const i = others.length
        ? choicePicked(
            r,
            others.map((o) => o.title)
          )
        : -1
      if (i >= 0) return remindFrom(others[i], ask, here, t)
      if (looksLikeNewRequest(r)) return false
      t.say('Okay — no reminder was set.')
      return true
    })
    return true
  }
  const options = picked.items
  talk.ask(
    `Which one: ${listed(
      options.map((ev) => eventCalled(ev, data.today)),
      'or'
    )}?`,
    async (r, t) => {
      if (neverMind(r, t)) return true
      const i = choicePicked(
        r,
        options.map((ev) => `${ev.title} ${eventDay(ev, data.today)}`)
      )
      const ev = i >= 0 ? options[i] : eventPicked(r, options, data.today)
      if (ev) return remindFrom(ev, ask, here, t)
      if (looksLikeNewRequest(r)) return false
      t.say('I couldn’t tell which you meant — no reminder was set.')
      return true
    }
  )
  return true
}

/** When an event starts, on this device: its date and time. Null with no time set. */
function startOf(ev: EventInstance): Date | null {
  const minutes = clockMinutes(ev.startTime ?? '')
  if (minutes === null) return null
  const [y, m, d] = ev.date.split('-').map(Number)
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60)
}

/** The reminder set from the event's time, tied to it, and said back. */
async function remindFrom(
  ev: EventInstance,
  ask: EventReminderAsk,
  here: Here,
  talk: Talk
): Promise<boolean> {
  const start = startOf(ev)
  let at: Date
  if ('minutes' in ask.before) {
    if (!start) {
      talk.say(
        `${ev.title} has no start time set, so I can’t time a reminder from it. Try a time instead — like “${eventDay(ev, here.data?.today ?? '')} at 6 PM.”`
      )
      return true
    }
    at = new Date(start.getTime() - ask.before.minutes * 60_000)
  } else {
    const [y, m, d] = ev.date.split('-').map(Number)
    at = new Date(y, m - 1, d - ask.before.days, ask.before.hour, 0)
  }
  if (at.getTime() <= here.now()) {
    talk.say(`That time has already passed — ${ask.relation} ${ev.title} was earlier.`)
    return true
  }
  // "to pack — the day before Youth Retreat"; nothing said but the event: "about Youth Night — an hour before it".
  const text = ask.text || ev.title
  const spoken = ask.spoken
    ? `${ask.spoken} — ${ask.relation} ${ev.title}`
    : `about ${ev.title} — ${ask.relation} it`
  await talk.remind(text, at, spoken, {
    eventKey: ev.instanceKey,
    eventTemplateId: String(ev.templateId),
    eventTitle: ev.title,
    // From its start, so it moves with it; with no time set, it stays where it is.
    ...(start ? { minutesBefore: Math.round((start.getTime() - at.getTime()) / 60_000) } : {}),
  })
  return true
}

// --- Announcements and messages, read out ----------------------------------------------

async function announcementsHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  if (!here.tools.includes('read_announcements')) return false
  const ask = announcementsAsked(said)
  if (!ask) return false
  talk.thinking()
  let shown: Announcement[]
  try {
    shown = await here.announcements()
  } catch {
    talk.say('I couldn’t read the announcements just now. Try again in a moment.')
    return true
  }
  talk.say(announcementsSaid(shown, here.names(), ask, here.now()))
  return true
}

async function messagesHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  if (!here.tools.includes('read_messages') || !here.profile) return false
  const ask = messagesAsked(said)
  if (!ask) return false
  const uid = String(here.profile.uid)
  const names = here.names()
  talk.thinking()
  let rooms: Room[]
  try {
    rooms = await here.rooms()
  } catch {
    talk.say('I couldn’t read your messages just now. Try again in a moment.')
    return true
  }

  if (!ask.who) {
    // Who has written: the conversations active this last fortnight.
    const recent = rooms.slice(0, 15)
    const convos = await Promise.all(
      recent.map(async (room) => ({ room, messages: await here.latest(room, 20).catch(() => []) }))
    )
    talk.say(unreadSaid(convos, uid, names, here.now()))
    return true
  }

  const picked = conversationPicked(rooms, uid, names, ask.who)
  if (picked.kind === 'none') {
    // "What did the doctor say?" could be about anyone: Claude's.
    if (ask.onlyIfFound) return false
    talk.say(`I couldn’t find a conversation with ${ask.who}.`)
    return true
  }
  if (picked.kind === 'which') {
    const options = picked.items
    talk.ask(
      `Which conversation: ${listed(
        options.map((o) => (o.room.name?.trim() ? quoted(o.name) : o.name)),
        'or'
      )}?`,
      async (r, t) => {
        if (neverMind(r, t)) return true
        const i = choicePicked(
          r,
          options.map((o) => o.name)
        )
        if (i < 0) {
          if (looksLikeNewRequest(r)) return false
          t.say('I couldn’t tell which one you meant. They’re all in Messages.')
          return true
        }
        await readConversation(options[i], [], uid, names, here, t)
        return true
      }
    )
    return true
  }
  await readConversation(
    picked.item,
    picked.kind === 'likely' ? picked.others : [],
    uid,
    names,
    here,
    talk
  )
  return true
}

/** A conversation as people would name it: “Youth Leaders”, your conversation with Sarah Kim, your group with Sarah and Bob. */
function convoSaid(fit: RoomFit, uid: string, names: ReadonlyMap<string, string>): string {
  if (fit.room.name?.trim()) return quoted(fit.room.name.trim())
  const others = fit.room.members.filter((m) => String(m) !== uid)
  if (others.length <= 1) return `your conversation with ${fit.name}`
  return `your group with ${listed(others.map((m) => (names.get(String(m)) ?? 'someone').split(' ')[0]))}`
}

/**
 * One conversation, read: what is unread in it, else its last few. Read even
 * when only likely — reading the wrong one costs nothing — with the others
 * that fit named, to ask for instead.
 */
async function readConversation(
  fit: RoomFit,
  others: RoomFit[],
  uid: string,
  names: ReadonlyMap<string, string>,
  here: Here,
  talk: Talk
): Promise<void> {
  let messages: Message[]
  try {
    messages = await here.latest(fit.room, 8)
  } catch {
    talk.say(`I couldn’t read your conversation with ${fit.name} just now.`)
    return
  }
  const oneToOne = fit.room.members.length <= 2 && !fit.room.name?.trim()
  const shownOthers = others.slice(0, 2).map((o) => convoSaid(o, uid, names))
  const also = shownOthers.length
    ? ` You also have ${listed(shownOthers)} — ask for ${shownOthers.length === 1 ? 'it' : 'one'} by name if you meant that.`
    : ''
  // "from Sarah Kim", "with Sarah Kim"; a group: "in “Youth Leaders”", "in your group with Sarah and Bob".
  const where = (one: 'from' | 'with') =>
    oneToOne ? `${one} ${fit.name}` : `in ${convoSaid(fit, uid, names)}`
  if (messages.length === 0) {
    talk.say(`There are no messages ${where('with')} yet.${also}`)
    return
  }
  const unread = unreadIn(messages, uid)
  const shown = unread.length ? unread : messages
  const newest = [...shown].sort((a, b) => b.ts - a.ts)[0]
  const lead = unread.length
    ? `${unread.length === 1 ? 'One unread message' : `${unread.length} unread messages`} ${where('from')}`
    : `The latest ${where('with')}`
  talk.say(
    `${lead}, ${agoSaid(newest.ts, here.now())}: ${messagesSaid(shown, uid, names, unread.length ? 4 : 3)}.${also}`
  )
}
