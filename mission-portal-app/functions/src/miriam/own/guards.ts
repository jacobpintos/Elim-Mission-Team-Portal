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
  [/\bnotes?\b|\bmy\s+calendar\b/i, [...EVENTS, 'reminder', 'web', 'faith', 'food_signup']],
  // Their tasks, and anyone's answers or numbers: Claude looks them up.
  [/\b(?:tasks?|assignments?|due|overdue|to-?dos?)\b/i, [...EVENTS, 'reminder', 'food_signup']],
  [
    /\b(?:who(?:'s|’s|\s+is|\s+are)?\s+(?:going|coming|attending|available|unavailable|signed\s+up)|how\s+many\s+(?:people|are|have)|hasn'?t\s+(?:said|answered))\b/i,
    EVENTS,
  ],
  // Reminding someone else, or everyone, is a message.
  [
    /\b(?:everyone|everybody|all\s+of\s+them)\b/i,
    ['reminder', 'availability', 'my_events', 'food_signup'],
  ],
  // Reminding anyone but themselves: "remind Sarah at 5 to call mom".
  [/\bremind\s+(?!me\b|myself\b)[a-z]/i, ['reminder']],
  // Someone else coming or not: "my wife can't come to youth night", "she won't make it".
  [
    /^(?:(?:hey|hi|ok|okay|so|um+|uh+|well)[,\s]+)*(?:miriam[,.\s]+)?(?:(?:my|our|his|her|their)\s+[a-z]+|he|she|they|he's|she's|they're|he'll|she'll|they'll)\s+(?:can't|can’t|cannot|won't|won’t|isn't|isn’t|aren't|aren’t|is|are|will|can|could|might|may|does|doesn't|doesn’t|has|had|needs?|wants?|plans?|going|coming|out)\b/i,
    ['availability'],
  ],
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
  if (skill === 'food_signup') return notAnOffer(said)
  return null
}

// --- A food sign-up: them offering to bring something, and nothing else -------

/** Said first, and nothing to what is asked: "Hey Miriam,", "um", "so". */
const FILLER = /^(?:(?:hey|hi|ok|okay|um+|uh+|so|well|oh)[,\s]+)*(?:miriam[,.\s]+)?(?:please\s+)?/i
/** Asked of her: "can you…", "could you please…". */
const ASKED_OF_HER = /^(?:can|could|would|will)\s+you\s+(?:please\s+)?/i
/** Asked as a question — but "can I bring chips?" is an offer. */
const QUESTION =
  /^(?:what|what's|whats|when|where|who|who's|whose|why|how|which|is|are|am|was|were|did|does|do|should|will|would|can|could|may|shall)\b/i
/** An offer put as a question: "can I bring chips?", "could we make the salad?" — not "can I grab some pizza?" (eating). */
const OFFERED = /^(?:can|could|may)\s+(?:i|we)\s+(?:bring|make|cook|bake|handle|cover|provide)\b/i

const NOT_AN_OFFER: [RegExp, string][] = [
  // "Remind me to bring chips": a reminder (./skills: reminder).
  [
    /\b(?:remind|reminder|remember|forget|alarm)\b|\b(?:ping|nudge|alert|buzz)\s+me\b/i,
    'a reminder',
  ],
  // What her briefing suggested is known only to the app (src/features/miriam/localTalk).
  [
    /\b(?:suggested|recommended|like\s+you\s+said|as\s+you\s+said|from\s+(?:my|the)\s+briefing)\b/i,
    'the briefing’s suggestion',
  ],
  // Asking whether they are, not offering: "check I'm bringing chips", "…, right?".
  [
    /\b(?:check|confirm|verify|whether|make\s+sure|supposed\s+to|already|signed\s+up)\b|\b(?:right|correct|ok(?:ay)?|alright)\s*\??\s*$/i,
    'a question',
  ],
  // Someone else bringing it: "Sarah is bringing chips", "is anyone bringing
  // dessert", "my neighbor will bring chips", "ask my husband to bring drinks".
  [/\b(?:everyone|everybody|anyone|anybody|someone|somebody|who)\b/i, 'someone else’s'],
  [/^(?:ask|have|get|tell|let)\s+(?!me\b|us\b)/i, 'someone else’s'],
  [
    /^(?!.*\b(?:and|&)\s+(?:i|we)\b)(?:.*\s)?(?:my|our)\s+(?:[a-z]+\s+){1,2}(?:will|is|are|was|'ll|'s|wants?|can|could|would|might|may|said|says)\b/i,
    'someone else’s',
  ],
  // No, or not now: "I don't want to bring chips", "too busy to", "I'll pass".
  [
    /\b[a-z]+n't\b|\b(?:dont|didnt|doesnt|isnt|arent|wasnt|cant|cannot|wont|wouldnt|couldnt|shouldnt|havent|hasnt|not|never|no\s+longer|instead|anymore|swap|switch|change|cancel|drop|un-?sign|wish|but)\b|\btoo\s+[a-z]+\s+to\b|\bpass\s+on\b|\boff\s+(?:the|my)\s+list\b/i,
    'a change',
  ],
  // Brought already, or only maybe.
  [
    /\b(?:i|we)\s+(?:made|baked|brought|cooked|may|might)\b|\b(?:maybe|probably|perhaps|possibly|doubt|hope|hoping|try|trying)\b|\bthinking\s+(?:of|about)\b|\bused\s+to\b|\bwas\s+(?:going|gonna)\b|\blast\s+(?:time|week|month|year)\b|\bif\b/i,
    'not an offer now',
  ],
]

/** Said by them, of themselves: "I'll", "we can", "sign me up", "count us in". */
const THEIR_OWN = /\b(?:i|i'm|im|i'll|ill|i've|i'd|me|we|we'll|we're|we've|we'd|us)\b/i

/** Why a request read as a food sign-up isn't one to take, or null (./food). */
function notAnOffer(text: string): string | null {
  const said = text.replace(/[’‘]/g, "'").trim()
  const what = said.replace(FILLER, '')
  // "Could you sign me up for chips?" asks her to: not a question about the sheet.
  const ofHer = ASKED_OF_HER.test(what)
  const asked = what.replace(ASKED_OF_HER, '')
  if (!OFFERED.test(asked) && (QUESTION.test(asked) || (!ofHer && /\?\s*$/.test(said)))) {
    return 'a question'
  }
  for (const [re, why] of NOT_AN_OFFER) if (re.test(said)) return why
  if (!THEIR_OWN.test(said)) return 'someone else’s'
  return null
}
