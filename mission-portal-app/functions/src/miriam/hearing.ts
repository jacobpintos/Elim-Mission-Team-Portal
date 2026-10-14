/**
 * What speech recognition wrote down, put right where it is plainly a
 * mishearing — "create an even name Worship Gathering" is "create an event
 * named Worship Gathering", "cue Above All" is "queue Above All" — before
 * Miriam reads it: in the app, before anything there is tried (her button,
 * a chord sheet's voice commands, the song finder), and on the server,
 * before her own model and Claude.
 *
 * Only in words around that tell: "even" alone is a word ("I can't even"),
 * "an even named" is not. And the words a device has learned it mishears —
 * Claude's corrections, kept on it (src/lib/miriamMemory) — but never an
 * everyday word: what is learned of one sentence must not change another.
 *
 * Free of Firebase and React Native: the app and the server share it.
 */

export interface HeardFix {
  /** As meant. */
  text: string
  /** What was put right, as heard and as meant. */
  fixed: { heard: string; meant: string }[]
}

type Fix = [RegExp, string | ((...m: string[]) => string)]

const NAMED: Record<string, string> = { name: 'named', call: 'called', title: 'titled' }
/** A letter as said: "see" is C, "be" is B. */
const LETTER: Record<string, string> = {
  a: 'A',
  eh: 'A',
  ay: 'A',
  be: 'B',
  bee: 'B',
  b: 'B',
  see: 'C',
  sea: 'C',
  c: 'C',
  dee: 'D',
  d: 'D',
  e: 'E',
  ee: 'E',
  eff: 'F',
  f: 'F',
  gee: 'G',
  g: 'G',
}

const FIXES: Fix[] = [
  // Making an event: "create an even" / "make a new even".
  [
    /\b(create|make|add|schedule|plan|set up|start|new)((?:\s+(?:a|an|the|new|another))*)\s+even\b(?!\s+(?:if|though|when|so|more|most|less|least|better|best|worse|worst|now|then|after|before|out|up|\w+er)\b)/gi,
    (_, verb, between) => `${verb}${between} event`,
  ],
  // "An even named…", "the even on Friday", "my evens this week" — not
  // "what even is a capo", "do that even on weekends".
  [
    /\b(an|the|this|next|my|which|each|every)\s+even\s+(?=(?:name|named|call|called|title|titled|for|on|at|is|was|page|details|time|start|starts|tonight|tomorrow|this|next|today)\b)/gi,
    (_, a) => `${a} event `,
  ],
  [/\b(the|my|next|an)\s+even(?=\s*[?.!]*$)/gi, (_, a) => `${a} event`],
  [/\b(my|the|any|upcoming|all|what|which|these|those)\s+evens\b/gi, (_, a) => `${a} events`],
  // "…an event name Worship Gathering": named — not "make the event name shorter".
  [
    /\b((?:create|make|add|schedule|plan|set up|start)\b[^.?!]*?\bevents?)\s+(name|call|title)\s+(?=\S)(?!(?:is|was|to|of|for|in|on|at|and|so|be|should|that|this|the|a|an|it|with|field|box|shorter|longer|right|wrong)\b)/gi,
    (_, before, word) => `${before} ${NAMED[word.toLowerCase()]} `,
  ],
  // Elim, said "LM" as The Well says it: heard as letters, or near it — in words about the name.
  [
    /\b((?:the\s+)?(?:name|word|phrase)\s+(?:the\s+)?)(?:l\.?\s?m\b\.?|elm|ellum|elum|eelum|elam|e\s?lim|ee\s?lim)(?=\s|$|[?.!,])/gi,
    (_, lead) => `${lead}Elim`,
  ],
  [
    /\b(?:l\.?\s?m\b\.?|ellum|elum|eelum)(?=\s+(?:mean|means|come|comes|stand|stands|arrival|missions?|team|church)\b)/gi,
    'Elim',
  ],
  [
    /\b(what\s+(?:does|is|was)|what's|whats|pronounce)\s+(?:l\.?\s?m\b\.?|ellum|elum|eelum)(?=\s|$|[?.!,])/gi,
    (_, lead) => `${lead} Elim`,
  ],
  // The worship team's words.
  [/\b(?:cord|court|core|cored|corps|chords)\s+(sheets?)\b/gi, (_, s) => `chord ${s}`],
  [/\b(?:sad|sat)\s+(lists?)\b/gi, (_, s) => `set ${s}`],
  [/\btran[sc]e?\s+pose(d|s)?\b/gi, (_, end = '') => `transpose${end}`],
  [/\b(?:cape oh|kay po|ca po|cappo|kapo)\b/gi, 'capo'],
  [/\bwarship(ping|ped|per|pers)\b/gi, (_, end) => `worship${end}`],
  [
    /\bwarship(?=\s+(?:team|night|practice|rehearsal|set|song|songs|service|services|leader|leaders|gathering|music|band|pastor|list)\b)/gi,
    'worship',
  ],
  [/\b(to|at|for|after|before|during|from)\s+warship(?=\s*[?.!,]*$)/gi, (_, to) => `${to} worship`],
  [/\b(?:kai\s+zen|kaisen|kaison|kyzen)\b/gi, 'kaizen'],
  // Keys said as letters: "in the key of see sharp", "B flat" heard as "be flat".
  [
    /\b(key of|in)\s+(eh|ay|be|bee|see|sea|dee|ee|eff|gee)(?=\s+(?:sharp|flat|minor|major)\b)/gi,
    (_, lead, letter) => `${lead} ${LETTER[letter.toLowerCase()]}`,
  ],
  [
    /\b(key of)\s+(eh|ay|be|bee|see|sea|dee|ee|eff|gee)(?=\s*[,.!?]*$)/gi,
    (_, lead, letter) => `${lead} ${LETTER[letter.toLowerCase()]}`,
  ],
  // "Open Above All in see": a song's verb first, the letter last.
  [
    /^(.*\b(?:open|play|queue|cue|transpose|put|change|move|sing|pull up|bring up|show|lead)\b.*\bin)\s+(eh|ay|be|bee|see|sea|dee|ee|eff|gee)(?=\s*[,.!?]*$)/gi,
    (_, lead, letter) => `${lead} ${LETTER[letter.toLowerCase()]}`,
  ],
  // Queueing, said first: "cue Above All" (the sheet commands know more).
  [/^((?:please\s+)?)(?:cue|kew)\b(?=\s+\S)/i, (_, please) => `${please}queue`],
  [/\b(to|in|on|from|of)\s+the\s+(?:cue|que|kew)\b/gi, (_, to) => `${to} the queue`],
  // Reminders, carpools, potlucks, as they are often written down.
  [
    /\b(set|add|make|create|new|a|my|another|your)\s+((?:a|an|another|me\s+a|me\s+another)\s+)?remainder(s)?\b(?!\s+of\b)/gi,
    (_, verb, a = '', s = '') => `${verb} ${a}reminder${s}`,
  ],
  [/^remainder(s)?\b(?=\s+(?:to|for|at|on|in|about)\b)/i, (_, s = '') => `reminder${s}`],
  [/\bcar\s+pool(s|ing|ed)?\b/gi, (_, end = '') => `carpool${end}`],
  [/\bcarpal\b(?!\s+tunnel)/gi, 'carpool'],
  [/\bpot\s+luck(s)?\b/gi, (_, s = '') => `potluck${s}`],
  [
    /\b(youth|prayer|game|worship|movie|family|date|ladies|men's|guys|girls)\s+knight(s)?\b/gi,
    (_, a, s = '') => `${a} night${s}`,
  ],
  [/\bdress\s+(?:cold|coded)\b/gi, 'dress code'],
  [
    /\b(what(?:'|’)?s the|what is the|is there a|any)\s+dress\s+coat\b/gi,
    (_, a) => `${a} dress code`,
  ],
]

/**
 * Everyday words, never changed for what a device has learned: one
 * sentence's mishearing ("even" for "event") must not change another's.
 */
const EVERYDAY = new Set(
  (
    'a about after again all also am an and any are as at be because been before being but by can could did do does done down each even ever every few for from get go going good got had has have he her here him his how i if in into is it its just know like make me more most much my need new no not now of off on once one only or other our out over own please put same see set she should so some such take than that the their them then there these they this those through to too under up us very want was way we well were what when where which while who why will with would yes you your ' +
    'event events time name named day night week month next last first today tonight tomorrow play open queue song songs sheet key minor major sharp flat up back'
  ).split(' ')
)

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function heardRight(
  text: string,
  learned: readonly { heard: string; meant: string }[] = []
): HeardFix {
  let s = text
  const fixed: { heard: string; meant: string }[] = []
  for (const [re, to] of FIXES) {
    s = s.replace(re, (...m: string[]) => {
      const whole = m[0]
      const meant = typeof to === 'string' ? to : to(...m.slice(0, -2))
      // Its first letter's case kept: "Cue" → "Queue".
      const out =
        whole[0] && whole[0] === whole[0].toUpperCase() && meant[0]
          ? meant[0].toUpperCase() + meant.slice(1)
          : meant
      if (out !== whole) fixed.push({ heard: whole.trim(), meant: out.trim() })
      return out
    })
  }
  // What this device has learned it mishears: unusual words, or several together.
  for (const { heard, meant } of learned) {
    const h = heard.trim().toLowerCase()
    if (!h || !meant.trim() || h === meant.trim().toLowerCase()) continue
    if (!h.includes(' ') && EVERYDAY.has(h)) continue
    const re = new RegExp(
      `(^|[^\\w\\u00C0-\\u024F'’])(${escape(h)})(?=$|[^\\w\\u00C0-\\u024F'’])`,
      'gi'
    )
    s = s.replace(re, (_, before: string, word: string) => {
      fixed.push({ heard: word, meant: meant.trim() })
      return `${before}${meant.trim()}`
    })
  }
  return { text: s.replace(/\s{2,}/g, ' ').trim(), fixed }
}
