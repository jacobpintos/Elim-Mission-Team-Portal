import type { Announcement, Message, Room } from '@/types/events'
import { fits, roomName } from './miriamAppData'
import { nameScore } from '../../functions/src/miriam/names'
import {
  listed,
  pickBest,
  plain,
  quoted,
  withoutAsking,
  withoutEnding,
  type Picked,
} from './miriamReplies'

/**
 * "Any new announcements?", "do I have messages?", "what did Sarah say?":
 * read out on the device from what this person can see, rather than by Claude.
 * Reading costs nothing if it is the wrong one, so the likeliest is read and
 * the others named — asked first only when two people fit alike.
 */

const DAY_MS = 86_400_000

/** When, as said: "just now", "2 hours ago", "yesterday", "on Tuesday", "on Oct 2". */
export function agoSaid(ts: number, now: number): string {
  const mins = Math.round((now - ts) / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.round(mins / 60)
  const then = new Date(ts)
  const today = new Date(now)
  const sameDay = then.toDateString() === today.toDateString()
  if (sameDay) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  const yesterday = new Date(now - DAY_MS)
  if (then.toDateString() === yesterday.toDateString()) return 'yesterday'
  if (now - ts < 6 * DAY_MS) return `on ${then.toLocaleDateString('en-US', { weekday: 'long' })}`
  return `on ${then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

/** The start of a text, to say: a sentence or two, never cut mid-word. */
export function snippet(text: string, max = 220): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sentence = cut.lastIndexOf('. ')
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

// --- Announcements ------------------------------------------------------------

export interface AnnouncementsAsk {
  /** Words for what it's about: "retreat". */
  about: string
  /** Who posted it, as said: "pastor john". */
  from: string
  /** Only the newest. */
  latest: boolean
  /** How far back is wanted, in days; 0 for all that are up. */
  days: number
}

const ANNOUNCE =
  /\b(?:announcements?|announced|announcing)\b|\b(?:anything|something)\s+(?:new\s+)?(?:been\s+)?(?:posted|announced)\b|\b(?:did|has)\s+(?:anyone|anybody|someone|somebody|the\s+church|pastor\s+\w+|\w+)\s+(?:post(?:ed)?|announce[d]?)\b|\bwhat(?:'s|\s+is|\s+has\s+been)\s+(?:been\s+)?(?:posted|announced)\b/

const MAKING =
  /\b(?:post|make|create|write|send|publish|draft|delete|remove|edit|change|update|take\s+down|turn\s+(?:off|on)|mute)\b|\bnotif\w*|\balerts?\b/

export function announcementsAsked(text: string): AnnouncementsAsk | null {
  const said = withoutEnding(withoutAsking(plain(text)))
  if (!ANNOUNCE.test(said)) return null
  // Making, changing or removing one — or its notifications — is not a read;
  // "did Pastor John post anything?" is.
  const asking = said.replace(/\b(?:did|has)\s+\S+(?:\s+\S+)?\s+post(?:ed)?\b/, '')
  if (/^(?:announce|put\s+up|add|share)\b/.test(said) || MAKING.test(asking)) return null
  const aboutM =
    /\b(?:about|regarding|concerning|for|on)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?:\s+(?:today|this\s+week|lately|recently))?$/.exec(
      said
    )
  const fromM =
    /\b(?:from|by)\s+(?:the\s+)?(.+?)(?:\s+(?:about|regarding|on|today|this\s+week|lately|recently)\b.*)?$/.exec(
      said
    ) ??
    /\b(?:did|has)\s+(?!(?:anything|something|nothing|anyone|anybody|someone|somebody)\b)(.+?)\s+(?:been\s+)?(?:post(?:ed)?|announce[d]?)\b/.exec(
      said
    )
  let from = fromM?.[1]?.trim() ?? ''
  if (/^(?:anyone|anybody|someone|somebody|they|we|people|the\s+church|church)$/.test(from))
    from = ''
  let about = aboutM?.[1]?.trim() ?? ''
  // "Announcements for today": a day, not a subject.
  if (/^(?:today|this\s+week|now|me|us|everyone)$/.test(about)) about = ''
  return {
    about,
    from,
    latest: /\b(?:latest|last|newest|most\s+recent)\s+(?:announcement|one|post)\b(?!s)/.test(said),
    days: /\btoday\b/.test(said)
      ? 1
      : /\b(?:new|any|recent|recently|lately|this\s+week)\b/.test(said)
        ? 7
        : 0,
  }
}

/**
 * The answer: the newest that fit, read out when there is one, listed when
 * there are a few, and the newest offered when none is new. `shown`: as
 * Announcements shows this person (lib/miriamAppData: announcementsShown), newest first.
 */
export function announcementsSaid(
  shown: Announcement[],
  names: ReadonlyMap<string, string>,
  ask: AnnouncementsAsk,
  now: number
): string {
  if (shown.length === 0) return 'There are no announcements up right now.'
  const by = (a: Announcement) => names.get(String(a.by)) ?? 'someone'
  const fromWho = ask.from ? shown.filter((a) => nameScore(by(a), ask.from) >= 0.75) : shown
  const aboutIt = ask.about
    ? fromWho.filter((a) => fits(`${a.title} ${a.body}`, ask.about))
    : fromWho
  const recent = ask.days ? aboutIt.filter((a) => now - a.ts < ask.days * DAY_MS) : aboutIt
  const read = (a: Announcement) =>
    `${quoted(a.title)}, from ${by(a)}, ${agoSaid(a.ts, now)}: ${snippet(a.body)}`

  if (ask.latest) {
    const [newest] = aboutIt
    return newest
      ? `The latest announcement is ${read(newest)}`
      : `I didn’t find an announcement${ask.about ? ` about ${ask.about}` : ''}${ask.from ? ` from ${ask.from}` : ''}.`
  }
  if (recent.length === 0) {
    const what = `${ask.about ? ` about ${ask.about}` : ''}${ask.from ? ` from ${ask.from}` : ''}`
    if (aboutIt.length > 0) {
      const span = ask.days === 1 ? 'today' : 'this week'
      return `No new announcements${what} ${span}. The latest is ${quoted(aboutIt[0].title)}, ${agoSaid(aboutIt[0].ts, now)}.`
    }
    return `I didn’t find an announcement${what}.`
  }
  if (recent.length === 1) return `There’s one: ${read(recent[0])}`
  const span = ask.days === 1 ? ' today' : ask.days ? ' this week' : ''
  const titles = recent.slice(0, 3).map((a) => quoted(a.title))
  const more = recent.length > 3 ? `, and ${recent.length - 3} more` : ''
  return `There are ${recent.length} announcements${span}: ${listed(titles)}${more}. The newest, from ${by(recent[0])}: ${snippet(recent[0].body, 160)}`
}

// --- Messages -----------------------------------------------------------------

export interface MessagesAsk {
  /** The conversation or person asked about: "sarah", "youth leaders". Empty for all of them. */
  who: string
  /**
   * Asked as "what did Sarah say?", which could as well be about anyone: read
   * only if they have a conversation, else left to Claude.
   */
  onlyIfFound: boolean
}

const MESSAGE_WORD =
  /\b(?:messages?|msgs?|texts?|dms?|chats?|inbox|messaged|texted|replied|responded|got\s+back|gotten\s+back|wrote\s+(?:me|back)|written\s+(?:me|back)|write\s+back|text(?:ed)?\s+back|sent\s+me|conversations?|threads?)\b|\b(?:anything|something|any\s+word|word)\s+(?:new\s+)?from\s+\S/
/** "What did Sarah say?" — a read only if Sarah is someone they talk to. */
const SAY_FORM = /^what\s+did\s+(.+?)\s+(?:say|send|write|text|message|reply|ask|want)\b/
const READING =
  /^(?:any|anything|do\s+i\s+have|have\s+i\s+(?:got|gotten|received)|did\s+(?:i\s+get|i\s+receive|anyone|anybody|someone|somebody|\S+(?:\s+\S+)?\s+(?:message|text|write|send|say|reply|respond|get\s+back|answer|ask))|who\s+(?:messaged|texted|wrote|sent|replied|has\s+messaged)|check|read|show\s+me\s+(?:my\s+)?(?:new|unread|latest|last)|what(?:'s|\s+is|\s+did|\s+are|\s+has|\s+have|\s+was)|is\s+there|are\s+there|tell\s+me|unread|new|latest|last|catch\s+me\s+up\s+on|has\s+(?:anyone|anybody|someone|somebody|\S+(?:\s+\S+)?)\s+(?:messaged|texted|written|replied|responded|gotten\s+back|got\s+back|answered|said))\b/
/** People in general, not one person: "anyone", "somebody". */
const ANYONE =
  /^(?:anyone|anybody|someone|somebody|people|everyone|everybody|i|me|you|they|we|any)$/

/** Words left on a name: "Sarah back", "Sarah's", "to me". */
function personFrom(said: string): string {
  return said
    .replace(/'s$/, '')
    .replace(
      /\s+(?:to\s+me|back|me|yet|today|yesterday|lately|recently|this\s+week|at\s+all)$/g,
      ''
    )
    .replace(/^(?:the|my|our)\s+/, '')
    .trim()
}

export function messagesAsked(text: string): MessagesAsk | null {
  const said = withoutEnding(withoutAsking(plain(text)))
  const sayForm = SAY_FORM.exec(said)
  // "What did you say?" is asking her to say it again.
  if (sayForm && /^(?:you|i|we|they|he|she|it|that)$/.test(sayForm[1].trim())) return null
  if (!sayForm && !(MESSAGE_WORD.test(said) && READING.test(said))) return null
  // Sending, muting, removing — or about notifications or announcements — is not a read.
  if (
    /\b(?:delete|remove|mute|unmute|block|report|turn\s+(?:off|on)|notif\w*|alerts?|announce\w*|post(?:ed)?)\b/.test(
      said
    )
  ) {
    return null
  }
  const tries = [
    /\bwhat\s+did\s+(.+?)\s+(?:say|send|write|text|message|reply|respond|ask)\b/,
    /\b(?:messages?|texts?|anything|something|any\s+word|word|news|dms?)\s+(?:new\s+)?from\s+(.+)$/,
    /\bdid\s+(.+?)\s+(?:message|text|write|reply|respond|get\s+back|send|answer|ask)\b/,
    /\bhas\s+(.+?)\s+(?:messaged|texted|written|replied|responded|gotten\s+back|got\s+back|answered|said)\b/,
    /\b(?:in|on)\s+(?:the|my|our)\s+(.+?)\s+(?:group\s+chat|chat|group|conversation|thread)\b/,
    /\b(?:the|my)\s+(.+?)\s+(?:group\s+chat|chat|conversation|thread)\b/,
    /\b(?:chat|conversation|messages?|thread)\s+with\s+(.+)$/,
  ]
  for (const re of tries) {
    const m = re.exec(said)
    if (!m) continue
    const who = personFrom(m[1])
    if (who && !ANYONE.test(who) && !/^(?:new|unread|latest|last|recent|any)$/.test(who)) {
      return { who, onlyIfFound: !!sayForm && !MESSAGE_WORD.test(said) }
    }
  }
  return sayForm ? null : { who: '', onlyIfFound: false }
}

/** A conversation and how it fits what was said. */
export interface RoomFit {
  room: Room
  /** Its name, as said: the room's own, or the others in it. */
  name: string
}

/**
 * Which conversation was meant. A person's own conversation with them is
 * likeliest; one in a group they're in only if there is none. Two people who
 * fit alike — two Sarahs — and which is asked.
 */
export function conversationPicked(
  rooms: Room[],
  uid: string,
  names: ReadonlyMap<string, string>,
  who: string
): Picked<RoomFit> {
  const fitsOf = rooms.map((room) => ({ room, name: roomName(room, uid, names) }))
  const oneToOne = (r: RoomFit) => r.room.members.length <= 2 && !r.room.name?.trim()
  // By its name: a group's own, or a one-to-one's other person — every word
  // of it, for a person: "Sarah Miller" is not Sarah Kim.
  const byName = pickBest(fitsOf, (r) => r.name, who, 3, 0.75)
  if (byName.kind === 'which') {
    // Their own conversation with the one person, over a group they're both in;
    // with two people alike, the two of them to choose from.
    const own = byName.items.filter(oneToOne)
    if (own.length === 1) {
      return { kind: 'likely', item: own[0], others: byName.items.filter((r) => r !== own[0]) }
    }
    if (own.length > 1) return { kind: 'which', items: own }
  }
  if (byName.kind !== 'none') return byName
  // Else a group with that person in it.
  const withThem = fitsOf.filter((r) =>
    r.room.members.some(
      (m) => String(m) !== uid && nameScore(names.get(String(m)) ?? '', who) >= 0.75
    )
  )
  if (withThem.length === 0) return { kind: 'none' }
  if (withThem.length === 1) return { kind: 'likely', item: withThem[0], others: [] }
  return { kind: 'which', items: withThem.slice(0, 3) }
}

/** Messages as read out, oldest first: "Sarah: “Running late”". */
export function messagesSaid(
  messages: Message[],
  uid: string,
  names: ReadonlyMap<string, string>,
  max = 4
): string {
  const lines = [...messages]
    .sort((a, b) => a.ts - b.ts)
    .slice(-max)
    .map((m) => {
      const from =
        String(m.uid) === uid ? 'You' : (names.get(String(m.uid)) ?? 'Someone').split(' ')[0]
      const text = m.text?.trim()
        ? quoted(snippet(m.text, 150))
        : m.attachment
          ? `sent ${m.attachment.type === 'image' ? 'a photo' : 'a file'}`
          : ''
      return text.startsWith('sent') ? `${from} ${text}` : `${from}: ${text}`
    })
    .filter((l) => !/:\s*$/.test(l))
  return lines.join('; ')
}

/** Unread from others, newest last. */
export const unreadIn = (messages: Message[], uid: string) =>
  messages.filter((m) => String(m.uid) !== uid && !m.readBy?.[uid]).sort((a, b) => a.ts - b.ts)

/**
 * "Do I have messages?": who has written that hasn't been read — and, when it
 * is one conversation with a few, what they said.
 */
export function unreadSaid(
  convos: { room: Room; messages: Message[] }[],
  uid: string,
  names: ReadonlyMap<string, string>,
  now: number
): string {
  const waiting = convos
    .map((c) => ({ ...c, unread: unreadIn(c.messages, uid), name: roomName(c.room, uid, names) }))
    .filter((c) => c.unread.length > 0)
    .sort((a, b) => b.unread[b.unread.length - 1].ts - a.unread[a.unread.length - 1].ts)
  if (waiting.length === 0) {
    const last = convos
      .flatMap((c) => c.messages.map((m) => ({ m })))
      .filter(({ m }) => String(m.uid) !== uid)
      .sort((a, b) => b.m.ts - a.m.ts)[0]
    return last
      ? `No unread messages — you’re all caught up. The last was from ${names.get(String(last.m.uid)) ?? 'someone'}, ${agoSaid(last.m.ts, now)}.`
      : 'No unread messages — you’re all caught up.'
  }
  const total = waiting.reduce((n, c) => n + c.unread.length, 0)
  const where = (c: (typeof waiting)[number]) =>
    `${c.unread.length} ${c.room.members.length <= 2 && !c.room.name?.trim() ? 'from' : 'in'} ${c.name}`
  if (waiting.length === 1 && waiting[0].unread.length <= 3) {
    const c = waiting[0]
    const lead =
      c.room.members.length <= 2 && !c.room.name?.trim() ? `from ${c.name}` : `in ${c.name}`
    return `You have ${total === 1 ? 'one unread message' : `${total} unread messages`} ${lead}, ${agoSaid(c.unread[c.unread.length - 1].ts, now)}. ${messagesSaid(c.unread, uid, names, 3)}.`
  }
  const parts = waiting.slice(0, 3).map(where)
  const more = waiting.length > 3 ? `, and more in ${waiting.length - 3} other conversations` : ''
  return `You have ${total} unread messages: ${listed(parts)}${more}.`
}
