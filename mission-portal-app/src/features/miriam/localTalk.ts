import type { Announcement, Message, Room, Task } from '@/types/events'
import type { UserProfile } from '@/types/user'
import type { EventInstance } from '../../../functions/src/miriam/data'
import { FD } from '@/lib/format'
import { foodStillOpenSaid, foodTakenSaid, stillOpen } from '@/lib/miriamActions'
import { eventRef, type QuickData } from '@/lib/miriamQuick'
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
}

/** Worked out here, when it plainly can be: false to leave it to Claude. */
export async function talkHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  // Notifications first: "turn off message notifications" names messages too.
  return (
    (await notificationsHere(said, here, talk)) ||
    (await taskStatusHere(said, here, talk)) ||
    (await foodHere(said, here, talk)) ||
    (await announcementsHere(said, here, talk)) ||
    (await messagesHere(said, here, talk))
  )
}

const dayOf = (ev: EventInstance) => FD(ev.date, { weekday: true })

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
