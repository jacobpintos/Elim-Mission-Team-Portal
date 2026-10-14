import type { Skill } from './skills'

/**
 * A second look at what she read, by the words themselves: a request that
 * tells her to change or send something is never one of her questions —
 * "change the picnic's location" is not "where is the picnic" — and a few
 * things her questions are near (food, tasks, everyone's answers) are
 * Claude's. Only ever a reason to hand a request on, never to take one.
 */

/** Opens with doing something to the app, not asking about it. */
const COMMAND =
  /^(?:(?:hey|ok|okay)\s+)?(?:miriam[,\s]+)?(?:please\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|go\s+ahead\s+and\s+)*(?:change|move|update|edit|rename|cancel|delete|remove|add|create|make|schedule|set\s+up|arrange|assign|send|tell|text|message|email|post|announce|invite|book|reschedule|put\s+\w+\s+in)\b/i

/** Her questions about the app's events, and answering for one. */
const EVENTS: Skill[] = [
  'event_time',
  'event_place',
  'event_dress',
  'event_schedule',
  'event_team',
  'event_car',
  'event_lodging',
  'event_flight',
  'event_weather',
  'my_events',
  'availability',
]

const NOT_HERS: [RegExp, Skill[]][] = [
  // Their notes on days of their calendar (src/lib/dateNotes): read and kept in the app.
  [/\bnotes?\b|\bmy\s+calendar\b/i, [...EVENTS, 'reminder', 'web', 'faith']],
  // Their tasks, and anyone's answers or numbers: Claude looks them up.
  [/\b(?:tasks?|assignments?|due|overdue|to-?dos?)\b/i, [...EVENTS, 'reminder']],
  [
    /\b(?:who(?:'s|’s|\s+is|\s+are)?\s+(?:going|coming|attending|available|unavailable|signed\s+up)|how\s+many\s+(?:people|are|have)|hasn'?t\s+(?:said|answered))\b/i,
    EVENTS,
  ],
  // Reminding someone else, or everyone, is a message.
  [/\b(?:everyone|everybody|all\s+of\s+them)\b/i, ['reminder', 'availability', 'my_events']],
  [/\bremind\s+(?!me\b)(?:the|them|him|her|us|our|my|all|every)\b/i, ['reminder']],
  // Someone else's flight, room, car or team — "Guest User's flight", "where
  // is Guest User staying": Claude looks them up, and whose is whose.
  [
    /\b(?!my\b|our\b|your\b)[a-z]+(?:'|’)s\s+(?:flights?|rooms?|lodging|hotel|cars?|ride|team)\b|\b(?:is|are)\s+(?!i\b|we\b|you\b)[a-z]+(?:\s+[a-z]+)?\s+(?:staying|sleeping|flying|landing|arriving|driving|riding)\b/i,
    EVENTS,
  ],
  // A flight's coming and going, or where someone stays, is not an event's
  // time or place — "what time is the flight arriving", "where are they
  // staying" — unless it is their own flight, hers to answer.
  [
    /^(?!.*\bmy\s+flights?\b).*\b(?:flights?|fly|flying|arriv\w*|land(?:s|ed|ing)?|depart\w*|airport|airline|staying|sleeping|lodging|hotel|motel|housing)\b/i,
    ['event_time', 'event_place', 'event_schedule', 'event_dress', 'event_weather', 'my_events'],
  ],
  // Where an event is, asked without a word for a place, is something else:
  // "what is Family Gathering?" asks what it is.
  [
    /^(?!.*\b(?:where|wheres|where's|address|location|located|venue|building|church|city|park|place|directions|map|get\s+to|held|going|meet)\b)/i,
    ['event_place'],
  ],
  // Bringing something is the food sign-up, not coming.
  [/\b(?:bring(?:ing)?|food|sign[-\s]?up\s+sheet|potluck\s+list)\b/i, ['availability']],
  // A span of days ("all of November", "the whole week") is a range, not one event.
  [
    /\b(?:all\s+(?:of\s+)?(?:week|month|november|december|summer)|the\s+whole|every(?:thing)?\s+(?:in|next|this))\b/i,
    ['availability'],
  ],
]

/** Why a request she read as `skill` is Claude's after all, or null. */
export function notHers(text: string, skill: Skill): string | null {
  const said = text.trim()
  // Asked of her, but to do something: her reminders do, and her web search finds.
  if (COMMAND.test(said) && !['reminder', 'web'].includes(skill)) return 'a command'
  for (const [re, skills] of NOT_HERS) {
    if (re.test(said) && skills.includes(skill)) return 'about something else'
  }
  return null
}
