import type { UserProfile } from '@/types/user'
import {
  ADMIN_ONLY_NOTIF_KEYS,
  NOTIF_LABELS,
  PUBLIC_NOTIF_LABELS,
  pushDefaultFor,
  type NotifKey,
  type PublicNotifKey,
} from './notificationKeys'
import { isAdmin, isPublic } from './roles'
import { listed, plain, quoted, withoutAsking, withoutEnding } from './miriamReplies'

/**
 * "Turn off chat notifications", "stop alerting me about announcements",
 * "let me know when we go live": one of their notification switches, worked
 * out on the device rather than by Claude.
 *
 * Only the switches Settings shows this person, and only push: email
 * notifications are not on in the app (lib/featureFlags), so Settings shows
 * no email column, and none is offered here.
 */

/** The switches Settings shows this person, in its order. */
export function notificationKeysFor(profile: UserProfile | null): string[] {
  if (!profile) return []
  if (isPublic(profile)) return Object.keys(PUBLIC_NOTIF_LABELS)
  const admin = isAdmin(profile)
  return (Object.keys(NOTIF_LABELS) as NotifKey[]).filter((k) => {
    // Settings also shows it to the Connections Coordinator; that check needs
    // the app's config, so for anyone else it is left to Settings.
    if (k === 'textingListSignup') return admin
    return admin || (k !== 'issueAssigned' && !ADMIN_ONLY_NOTIF_KEYS.includes(k))
  })
}

/** A switch's name, as Settings shows it. */
export function notificationLabel(key: string): string {
  return NOTIF_LABELS[key as NotifKey] ?? PUBLIC_NOTIF_LABELS[key as PublicNotifKey] ?? key
}

/** Whether a switch's push is on, as Settings shows it — a public row unset defaults on. */
export function pushIsOn(
  prefs: Record<string, { push?: boolean } | boolean | undefined> | undefined,
  key: string,
  publicUser: boolean
): boolean {
  const pref = prefs?.[key]
  if (pref && typeof pref === 'object' && typeof pref.push === 'boolean') return pref.push
  return publicUser ? pushDefaultFor(key) : false
}

/**
 * What a switch is called, by those who'd ask for it. Most specific first;
 * where one phrase holds another ("food reminders" holds "reminders"), the
 * longer is taken. `first`: when a phrase fits several switches, the one most
 * likely meant — offered first, the rest after.
 */
const SUBJECT_LIST: { re: RegExp; keys: string[]; first?: string[] }[] = [
  {
    re: /\bflagged(?:\s+(?:chats?|messages?))?|\b(?:chats?|messages?)\s+(?:that\s+are\s+|being\s+|getting\s+)?flagged|\breported\s+(?:chats?|messages?)/g,
    keys: ['chatFlagged'],
  },
  { re: /\btexting\s+list(?:\s+sign\s*-?\s*ups?)?/g, keys: ['textingListSignup'] },
  {
    re: /\b(?:severe\s+)?weather(?:\s+alerts?)?|\bstorm\s+(?:alerts?|warnings?)/g,
    keys: ['weatherAlertAdmin'],
  },
  {
    re: /\b(?:urgent\s+)?security(?:\s+(?:reports?|alerts?|incidents?|concerns?))?|\bincident\s+reports?/g,
    keys: ['securityReport'],
  },
  {
    re: /\bkaizens?(?:\s+(?:submissions?|ideas?|cards?))?|\bnew\s+ideas?|\bidea\s+submissions?/g,
    keys: ['kaizenSubmission'],
  },
  {
    re: /\bissues?\s+(?:assigned|assignments?)|\bassigned\s+(?:an?\s+|to\s+an?\s+)?issues?/g,
    keys: ['issueAssigned'],
  },
  {
    re: /\b(?:new\s+)?issues?(?:\s+(?:submissions?|reports?|submitted|reported))?|\bissue\s+reports?/g,
    keys: ['issueSubmission', 'issueAssigned'],
  },
  {
    re: /\bevent\s+health|\bevents?\s+(?:falling|getting|that\s+are)\s+behind|\bfalling\s+behind/g,
    keys: ['eventHealthBehind'],
  },
  {
    re: /\brsvps?(?:\s+not\s+available)?|\b(?:people|someone|anyone|somebody)\s+(?:is\s+|being\s+)?(?:not\s+available|unavailable|can'?t\s+(?:come|make\s+it))|\bnot\s+available|\bunavailable|\bavailability(?:\s+(?:answers?|responses?))?/g,
    keys: ['rsvpNonAvailable'],
  },
  {
    re: /\b(?:food\s+)?items?\s+(?:that\s+are\s+)?(?:still\s+)?(?:open|unclaimed|left)|\bunclaimed\s+(?:food|items?)|\bfood\s+reminders?|\breminders?\s+(?:about|for)\s+(?:the\s+)?food/g,
    keys: ['foodSignupReminder'],
  },
  {
    re: /\bfood\s+sign\s*-?\s*ups?\s+(?:open(?:ed|ing|s)?|start(?:ed|ing|s)?)|\bsign\s*-?\s*ups?\s+open(?:ed|ing|s)?|\bnew\s+food\s+sign\s*-?\s*ups?|\bfood\s+sheets?\s+open(?:ed|ing|s)?/g,
    keys: ['foodSignupOpen'],
  },
  {
    re: /\bfood(?:\s+sign\s*-?\s*ups?)?|\bpotlucks?|\bsign\s*-?\s*up\s+sheets?/g,
    keys: ['foodSignupOpen', 'foodSignupReminder'],
  },
  {
    re: /\bflight\s+reminders?|\breminders?\s+(?:about|for|before)\s+(?:my\s+|the\s+)?flights?|\bbefore\s+(?:my\s+|the\s+)?flights?/g,
    keys: ['flightReminder'],
  },
  {
    re: /\btravel(?:\s+(?:details?|info|plans?|assignments?))?|\bhotels?|\blodging|\brooms?\s+assign(?:ed|ments?)|\bcarpools?|\bcar\s+seats?|\bseats?\s+assigned|\blogistics/g,
    keys: ['eventLogistics'],
  },
  { re: /\bflights?/g, keys: ['flightReminder', 'eventLogistics'], first: ['flightReminder'] },
  {
    re: /\btasks?\s+(?:that\s+are\s+)?(?:due(?:\s+soon)?|reminders?|deadlines?)|\bdue\s+(?:soon|dates?)|\bdeadlines?|\boverdue(?:\s+tasks?)?|\breminders?\s+(?:about|for)\s+(?:my\s+)?tasks?/g,
    keys: ['taskDueSoon'],
  },
  {
    re: /\b(?:new\s+)?assignments?|\b(?:new\s+)?tasks?\s+assign(?:ed|ments?)|\bassigned\s+(?:a\s+|to\s+a\s+|new\s+)?tasks?|\bnew\s+tasks?|\bgiven\s+a\s+task/g,
    keys: ['newAssignment'],
  },
  { re: /\btasks?|\bto\s*-?\s*dos?/g, keys: ['newAssignment', 'taskDueSoon'] },
  {
    re: /\bworship\s+sets?(?:\s+assign(?:ed|ments?))?|\bset\s*lists?|\bworship/g,
    keys: ['worshipSetAssigned'],
  },
  {
    re: /\blive\s*-?\s*streams?|\blivestream(?:s|ing)?|\b(?:going|goes|go)\s+live|\bservices?\s+(?:going|goes|go|is|are)\s+live|\bwhen\s+(?:we'?re|we\s+are|church\s+is|it'?s)\s+live|\bstreaming/g,
    keys: ['livestream'],
  },
  {
    re: /\b(?:elim\s+)?store\s+sales?|\bsales?\s+(?:at|in|on|from)\s+the\s+(?:elim\s+)?store|\bmerch(?:andise)?\s+sales?|\bwhen\s+(?:there'?s|there\s+is)\s+a\s+sale/g,
    keys: ['storeSale'],
  },
  {
    re: /\badded\s+to\s+(?:an?\s+|new\s+)?(?:events?|teams?)|\bevent\s+(?:invites?|invitations?|additions?)|\bput\s+on\s+(?:an?\s+)?(?:events?|teams?)/g,
    keys: ['eventJoin'],
  },
  {
    re: /\bremoved\s+from\s+(?:an?\s+)?(?:events?|teams?)|\btaken\s+off\s+(?:an?\s+)?(?:events?|teams?)/g,
    keys: ['eventRemoved'],
  },
  {
    re: /\bevent\s+reminders?|\breminders?\s+(?:about|for|before)\s+(?:my\s+|the\s+)?events?|\bupcoming\s+events?/g,
    keys: ['eventReminder'],
  },
  {
    re: /\b(?:nearby|local|virtual|public|new)\s+events?|\bevents?\s+(?:near\s+me|nearby|around\s+me|in\s+my\s+area)/g,
    keys: ['publicEvent'],
  },
  {
    re: /\bevents?/g,
    keys: ['eventReminder', 'eventJoin', 'eventRemoved', 'publicEvent'],
  },
  {
    re: /\breminders?|\breminding/g,
    keys: ['eventReminder', 'taskDueSoon', 'flightReminder', 'foodSignupReminder'],
    first: ['eventReminder'],
  },
  {
    re: /\b(?:new\s+|featured\s+)content|\bcontent|\bsermons?|\bpodcasts?|\bnew\s+music|\bvideos?|\bfeatured/g,
    keys: ['contentFeatured'],
  },
  {
    re: /\b(?:public\s+)?announcements?|\bannounce(?:d|s)?\b|\bchurch\s+news|\bnews/g,
    keys: ['announcement', 'publicAnnouncement'],
  },
  {
    re: /\b(?:new\s+|direct\s+|chat\s+|private\s+|group\s+)?messages?|\bmessaging|\bchats?|\bdms?\b|\bconversations?|\bsomeone\s+(?:messages|texts|writes\s+to)\s+me|\btexts?\b/g,
    keys: ['newMessage'],
  },
]

/** Each ending on a word's end: "news" is not "newsletter", "chat" not "chatting". */
const SUBJECTS = SUBJECT_LIST.map((s) => ({ ...s, re: new RegExp(`(?:${s.re.source})\\b`, 'g') }))

/**
 * One conversation named — "the youth group chat", "my chat with Sarah" —
 * which can't be muted from here: its name, or null.
 */
function oneChatIn(said: string): string | null {
  const m =
    /\b(?:the|my|our)\s+((?:(?!new\b|direct\b|all\b|any\b|group\b|private\b)[a-z0-9']+\s+){1,4})(?:group\s+)?(?:chat|conversation|thread|group\s+chat)\b/.exec(
      said
    ) ??
    /\b(?:chat|conversation|messages?)\s+(?:with|from)\s+([a-z0-9']+(?:\s+[a-z0-9']+)?)/.exec(said)
  const name = m?.[1]?.trim() ?? ''
  if (!name || /^(?:notifications?|alerts?|everyone|anyone|people|messages?)$/.test(name))
    return null
  return name
}

/** A word for a notification: said with a subject, it is plainly a switch. */
const NOTIFY_WORD =
  /\b(?:notifications?|notifs?|notify(?:ing)?|notified|alerts?|alerting|push(?:es)?|push\s+notifications?|pings?|pinging|buzz(?:ing)?|reminders?|reminding|e-?mails?|e-?mailing)\b/

const STRONG_OFF =
  /\bturn(?:ing)?\s+(?:(?!on\b)\S+\s+){0,5}?off\b|\bswitch(?:ing)?\s+(?:(?!on\b)\S+\s+){0,5}?off\b|\bshut\s+(?:(?!on\b)\S+\s+){0,5}?off\b|\bdisable\b|\bdeactivate\b|\b(?:mute|silence)\b|\bunsubscribe\b|\bopt\s+(?:me\s+)?out\b/
const STRONG_ON =
  /\bturn(?:ing)?\s+(?:(?!off\b)\S+\s+){0,5}?on\b|\bswitch(?:ing)?\s+(?:(?!off\b)\S+\s+){0,5}?on\b|\benable\b|\bactivate\b|\bunmute\b|\bre-?subscribe\b|\bsubscribe\b|\bopt\s+(?:me\s+)?in\b/
const LOOSE_OFF =
  /\b(?:stop|pause|quit|cease|no\s+more|never|don'?t|do\s+not|get\s+rid\s+of|remove|block|too\s+many|fewer|less)\b/
const LOOSE_ON =
  /\b(?:start|resume|notify\s+me|let\s+me\s+know|tell\s+me\s+when|alert\s+me|ping\s+me|remind\s+me|send\s+me|i\s+want|i'?d\s+like|keep\s+me\s+(?:posted|updated|informed|in\s+the\s+loop)|get\s+notified|be\s+notified|give\s+me|i\s+need|again)\b/
/**
 * A reminder of their own asked for — "set a reminder for 3:50 to…", "remind
 * me to call Sam" — which names reminders but switches none (lib/reminders).
 */
const OWN_REMINDER =
  /^(?:(?:set|add|make|create|schedule)\s+(?:up\s+)?(?:a\s+|me\s+a\s+|another\s+)?(?:new\s+)?reminder\b|(?:new\s+)?reminder\s+(?:for|at|to|on|in)\b|remind\s+me\s+(?:to|at|in|on|tomorrow|today|tonight|this|next|every)\b)/
/** Asking to be told, which is a notification whatever word follows. */
const TELL_ME =
  /\b(?:notify\s+me|let\s+me\s+know|tell\s+me\s+when|alert\s+me|ping\s+me|remind\s+me\s+(?:about|before|of)|keep\s+me\s+(?:posted|updated|informed|in\s+the\s+loop)|get\s+notified|be\s+notified|(?:i\s+want|i'?d\s+like|i\s+need)\s+to\s+(?:know|hear|be\s+told))\b/

export interface NotificationAsk {
  on: boolean
  /** Each subject named: the switches it could mean, and those most likely. */
  subjects: { keys: string[]; first: string[] }[]
  /**
   * Said after "except", "but not", "other than": the switches left out of
   * it — and kept the other way, so "turn off all notifications except
   * store sales" leaves store sales on, even where it was off.
   */
  except: { keys: string[]; first: string[] }[]
  /** "All notifications", "everything". */
  all: boolean
  /** Said in a word for notifications ("notifications", "alerts"), or as a mute: plainly a switch. */
  plainly: boolean
  /** Email asked for: there are none to switch. */
  email: boolean
  /** One conversation named, which can't be muted from here: "youth group". */
  oneChat: string | null
}

/** Asking how, which is as good as asking for it: "how do I turn off message notifications?" */
const HOW_DO_I =
  /^(?:how\s+(?:do|can|would|should)\s+i|how\s+to|can\s+i|could\s+i|is\s+there\s+a\s+way\s+to)\s+/

/** Where what is left out begins: "except", "but not", "other than". */
const EXCEPT =
  /\s*\b(?:except(?:\s+for)?|but\s+not|other\s+than|apart\s+from|besides|aside\s+from|excluding|save\s+for|but\s+(?:keep|leave)(?:\s+on)?)\b\s*/

/** The subjects named in `text`, in the order said, each once; the longer kept where one holds another. */
function subjectsIn(text: string): { keys: string[]; first: string[] }[] {
  const found: { start: number; end: number; index: number }[] = []
  SUBJECTS.forEach(({ re }, index) => {
    re.lastIndex = 0
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m[0].trim()) found.push({ start: m.index, end: m.index + m[0].length, index })
      if (m[0].length === 0) re.lastIndex++
    }
  })
  const kept = found.filter(
    (f) =>
      !found.some(
        (g) =>
          g !== f &&
          g.start <= f.start &&
          g.end >= f.end &&
          (g.end - g.start > f.end - f.start ||
            (g.end - g.start === f.end - f.start && g.index < f.index))
      )
  )
  return [...new Set([...kept].sort((a, b) => a.start - b.start).map((k) => k.index))].map((i) => ({
    keys: SUBJECTS[i].keys,
    first: SUBJECTS[i].first ?? SUBJECTS[i].keys,
  }))
}

export function notificationAsked(text: string): NotificationAsk | null {
  const said = withoutEnding(withoutAsking(plain(text))).replace(HOW_DO_I, '')
  if (!said || OWN_REMINDER.test(said)) return null
  if (/^(?:what|which|how|are|is|do|does|did|why|when)\b/.test(said)) return null
  // What is left out, said after the rest: one exception, naming what it leaves out.
  const [asked, ...left] = said.split(EXCEPT)
  if (left.length > 1) return null
  const except = left.length ? subjectsIn(left[0]) : []
  if (left.length && except.length === 0) return null

  const strongOff = STRONG_OFF.test(asked)
  const strongOn = STRONG_ON.test(asked)
  if (strongOff && strongOn) return null
  const on = strongOn
    ? true
    : strongOff
      ? false
      : LOOSE_OFF.test(asked)
        ? false
        : LOOSE_ON.test(asked)
          ? true
          : null
  if (on === null) return null

  const subjects = subjectsIn(asked)
  const notifyWord = NOTIFY_WORD.test(said)
  const muting = /\b(?:mute|silence|unmute)\b/.test(said)
  // "Everything except store sales": a notification left out says what everything is.
  const all =
    subjects.length === 0 &&
    /\b(?:all|every|everything|any)\b/.test(asked) &&
    (notifyWord || muting || except.length > 0)
  // A switch when said in so many words; or with a subject and a strong verb
  // ("turn off messages"), or asking to be told ("let me know when…"); or
  // everything muted. Only the first is plain: the rest are asked about.
  const named = subjects.length > 0 && (strongOff || strongOn || TELL_ME.test(said))
  if (!notifyWord && !named && !all) return null
  return {
    on,
    subjects,
    except,
    all,
    plainly: notifyWord,
    email: /\be-?mail/.test(said),
    oneChat: oneChatIn(said),
  }
}

export type NotificationPlan =
  /** These, plainly; `keep`, left out of them, the other way. */
  | { kind: 'sure'; keys: string[]; keep?: string[] }
  /** Most likely these — asked about first — or else one of `others`. */
  | { kind: 'likely'; keys: string[]; others: string[]; keep?: string[] }
  /** None named: asked which. */
  | { kind: 'which' }
  /** Only switches this person doesn't have. */
  | { kind: 'none' }

/** What was asked, among the switches this person has (`visible`, from notificationKeysFor). */
export function notificationPlan(ask: NotificationAsk, visible: string[]): NotificationPlan {
  const has = new Set(visible)
  // All of them, or those named — less what was left out, which is kept the other way.
  if (ask.except.length) {
    const out = new Set(ask.except.flatMap((s) => s.keys))
    const from = ask.all ? visible : [...new Set(ask.subjects.flatMap((s) => s.keys))]
    const keys = from.filter((k) => has.has(k) && !out.has(k))
    const keep = visible.filter((k) => out.has(k))
    if (keys.length === 0) return { kind: 'none' }
    return ask.plainly && !ask.email
      ? { kind: 'sure', keys, keep }
      : { kind: 'likely', keys, others: [], keep }
  }
  if (ask.all) {
    return ask.plainly && !ask.email
      ? { kind: 'sure', keys: visible }
      : { kind: 'likely', keys: visible, others: [] }
  }
  if (ask.subjects.length === 0) return { kind: 'which' }
  const named = ask.subjects
    .map((s) => ({
      keys: s.keys.filter((k) => has.has(k)),
      first: s.first.filter((k) => has.has(k)),
    }))
    .filter((s) => s.keys.length > 0)
  if (named.length === 0) return { kind: 'none' }
  const keys = [...new Set(named.flatMap((s) => (s.first.length ? s.first : s.keys)))]
  const others = [...new Set(named.flatMap((s) => s.keys))].filter((k) => !keys.includes(k))
  // One switch, said plainly — or several, each named ("messages and announcements").
  const exact = named.every((s) => s.keys.length === 1)
  // One conversation named, but only every message can be switched: asked.
  const oneChat = !!ask.oneChat && keys.includes('newMessage')
  if (ask.plainly && exact && !ask.email && !oneChat) return { kind: 'sure', keys }
  return { kind: 'likely', keys, others }
}

/** The switches as said back: “New message”, or “New message” and “Announcement”. */
export function switchesSaid(keys: string[]): string {
  return listed(keys.map((k) => quoted(notificationLabel(k))))
}
