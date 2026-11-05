import type { Sex } from '@/types/user'

/**
 * A message asked for in so many words — "tell Kolton he's snug", "let Sam
 * know I'm running late", "remind Beth to bring her guitar" — worked out on
 * the device, without asking Claude: who it's for, and the message as it
 * should reach them ("You're snug").
 *
 * Only what is plain is worked out here. Anything else — a name that fits no
 * one (misheard, perhaps), "they" said of one person, a question to be asked
 * of them — is left to Claude: null.
 */

/** How what follows their name is put. */
export type SendForm =
  /** As it's to be said to them: "tell Sam I'm late", "message Sam saying hi". */
  | 'said'
  /** Something for them to do: "tell Sam to call me" — "Please call me". */
  | 'to'
  /** "Remind Sam to bring chairs" — "Don't forget to bring chairs". */
  | 'remind'
  /** "Ask Sam to bring chairs" — "Could you bring chairs?" */
  | 'ask'

export interface SendAsk {
  /** Who it's for, then what to say, as said: the two told apart by the names known (sendSplit). */
  rest: string
  /** Who it's for, when said apart from the message ("let Sam know …", "send Sam a text …"). */
  to?: string
  /** What to say, when said apart from who it's for. */
  message?: string
  form: SendForm
}

/** Their asking taken off the front, as said: "Hey Miriam, could you please …". */
const ASKING =
  /^(?:(?:hey|hi|ok|okay|so|um+|uh+|oh|well|alright|miriam|please|(?:can|could|would|will)\s+you(?:\s+please)?|i\s+need\s+you\s+to|i\s+want\s+you\s+to|i'?d\s+like\s+you\s+to|go\s+ahead\s+and|just)[\s,]+)+/i

/** Never someone to send to: "tell me …", "tell everyone …" (an announcement, or not a message at all). */
const NOT_SOMEONE =
  /^(?:me|myself|us|everyone|everybody|all|people|someone|somebody|anyone|anybody|them|him|her)\b/i

/**
 * Asked to send someone a message, in one of the plain ways of saying so.
 * Null when it isn't, or isn't plainly — left to the rest of her.
 */
export function sendAsked(said: string): SendAsk | null {
  const s = said.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().replace(ASKING, '')
  let m: RegExpMatchArray | null
  // "Let Sam know I'm running late."
  if ((m = s.match(/^let\s+(.+?)\s+know\b[\s,:]*(.*)$/i))) {
    return someone(m[1]) ? { rest: '', to: m[1], message: m[2], form: 'said' } : null
  }
  // "Send a message to Sam saying …".
  if ((m = s.match(/^send\s+(?:a\s+)?(?:quick\s+)?(?:message|text|note|dm)\s+to\s+(.+)$/i))) {
    return someone(m[1]) ? { rest: m[1], form: 'said' } : null
  }
  // "Send Sam a text saying …", "send the youth group a message: …".
  if (
    (m = s.match(/^send\s+(.+?)\s+(?:a\s+)?(?:quick\s+)?(?:message|text|note|dm)\b[\s,:]*(.*)$/i))
  ) {
    return someone(m[1]) ? { rest: '', to: m[1], message: m[2], form: 'said' } : null
  }
  // "Tell Kolton he's snug", "text Sam …", "message Kolton".
  if ((m = s.match(/^(?:tell|text|message|msg|dm)\s+(.+)$/i))) {
    return someone(m[1]) ? { rest: m[1], form: 'said' } : null
  }
  // "Remind Sam to bring chairs" — never "remind me".
  if ((m = s.match(/^remind\s+(.+)$/i))) {
    return someone(m[1]) ? { rest: m[1], form: 'remind' } : null
  }
  // "Ask Sam to bring chairs" — a request of them; "ask Sam if …" is Claude's to put.
  if ((m = s.match(/^ask\s+(.+?\s+to\s+.+)$/i))) {
    return someone(m[1]) ? { rest: m[1], form: 'ask' } : null
  }
  return null
}

const someone = (rest: string) => !!rest.trim() && !NOT_SOMEONE.test(rest.trim())

/** The longest a name said for someone is taken to be, in words. */
const NAME_WORDS = 5

/**
 * Who it's for and what to say, told apart: the most words from the front
 * that `fits` takes for someone's name ("Sam Holub", before "Sam"), and
 * whatever follows. Null when no words from the front name anyone.
 */
export function sendSplit(
  ask: SendAsk,
  fits: (name: string) => boolean
): { to: string; message: string } | null {
  if (ask.to !== undefined) {
    const to = ask.to.replace(/^the\s+/i, '').trim()
    return fits(to) ? { to, message: ask.message ?? '' } : null
  }
  const tokens = ask.rest.split(' ').filter(Boolean)
  for (let k = Math.min(NAME_WORDS, tokens.length); k >= 1; k--) {
    const to = tokens
      .slice(0, k)
      .join(' ')
      .replace(/^the\s+/i, '')
      .replace(/[,:;.!?]+$/, '')
    if (to && fits(to)) return { to, message: tokens.slice(k).join(' ') }
  }
  return null
}

/** Who it's going to, as the message is put to them. */
export interface SendTo {
  /** A group chat: "they" is them. */
  group: boolean
  /** A person's sex, where known: "he" said of a woman is someone else. */
  sex?: Sex | null
}

/**
 * The message as it should reach them, from what was said after their name:
 * "he's snug" is "You're snug"; "to call me" is "Please call me"; a
 * reminder, "Don't forget to …". '' when nothing was said for them yet. Null
 * when it can't be put plainly — left to Claude.
 */
export function sendText(after: string, form: SendForm, to: SendTo): string | null {
  let s = after
    .replace(/[’‘]/g, "'")
    .trim()
    .replace(/^[,:;-]+\s*/, '')
  // "… saying hi", "… that he's snug", "… and tell him he's snug".
  s = s.replace(
    /^(?:saying|that|and\s+say(?:\s+that)?|to\s+say(?:\s+that)?|and\s+tell\s+(?:him|her|them)(?:\s+that)?)\b[\s,:]*/i,
    ''
  )
  const quoted = s.match(/^["“'](.+)["”']$/)
  if (quoted) return capital(quoted[1].trim())
  if (!s) return ''
  let lead = ''
  let tail = ''
  if (form === 'remind') {
    if (/^to\s+/i.test(s)) {
      lead = 'Don’t forget '
    } else if (/^about\s+/i.test(s)) {
      lead = 'Don’t forget '
    } else lead = 'Reminder: '
  } else if (form === 'ask') {
    const m = s.match(/^to\s+(.+)$/i)
    if (!m) return null
    s = m[1].replace(/[.!?]+$/, '')
    lead = 'Could you '
    tail = '?'
  } else if (form === 'said' && /^to\s+\S/i.test(s) && !/^to\s+(?:say|tell)\b/i.test(s)) {
    // "Tell Sam to call me": something for them to do.
    s = s.replace(/^to\s+/i, '')
    lead = 'Please '
  }
  const put = toThem(s, to)
  if (put === null) return null
  return lead ? `${lead}${put}${tail}` : capital(put)
}

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** Said between "he" and what he does: "he always forgets" — "you always forget". */
const BETWEEN = new Set([
  'always',
  'never',
  'also',
  'still',
  'just',
  'really',
  'probably',
  'definitely',
  'usually',
  'sometimes',
  'already',
  'actually',
  'totally',
  'only',
  'even',
  'often',
  'too',
])

/** "Her" followed by one of these is her, not hers: "pick her up", "call her at 5". */
const AFTER_HER = new Set([
  'up',
  'down',
  'in',
  'out',
  'at',
  'to',
  'from',
  'with',
  'for',
  'about',
  'off',
  'on',
  'back',
  'later',
  'tomorrow',
  'today',
  'tonight',
  'soon',
  'now',
  'there',
  'here',
  'when',
  'if',
  'and',
  'or',
  'so',
  'again',
  'too',
  'a',
  'the',
  'some',
])

/** He or she, for them, to "you": the verb after with it. */
const PERSON_VERB: Record<string, string> = {
  is: 'are',
  was: 'were',
  has: 'have',
  does: 'do',
  "isn't": "aren't",
  "wasn't": "weren't",
  "hasn't": "haven't",
  "doesn't": "don't",
  goes: 'go',
  says: 'say',
}

/** Said of them, as said to them — he/she for a person, they for a group. Null when unsure. */
function toThem(text: string, to: SendTo): string | null {
  const tokens = text.split(' ')
  const out: string[] = []
  const core = (t: string) => t.toLowerCase().replace(/^[("“]+|[)"”.,!?:;]+$/g, '')
  const keep = (t: string, word: string) => {
    // Its punctuation, as said: "him." — "you."
    const before = t.match(/^[("“]+/)?.[0] ?? ''
    const after = t.match(/[)"”.,!?:;]+$/)?.[0] ?? ''
    return `${before}${word}${after}`
  }
  const subjects = to.group
    ? new Set(['they'])
    : new Set([...(to.sex === 'female' ? [] : ['he']), ...(to.sex === 'male' ? [] : ['she'])])
  const objects = to.group
    ? new Set(['them'])
    : new Set([...(to.sex === 'female' ? [] : ['him']), ...(to.sex === 'male' ? [] : ['her'])])
  // "They" said of one person is anyone's guess: someone else, or them.
  if (
    !to.group &&
    tokens.some((t) =>
      /^(?:they|them|their|theirs|themselves|they're|they've|they'll|they'd)$/.test(core(t))
    )
  ) {
    return null
  }
  let fixVerb = false
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const w = core(t)
    const next = core(tokens[i + 1] ?? '')
    const atEnd = i === tokens.length - 1 || /[.,!?;:]$/.test(t)
    if (fixVerb) {
      if (BETWEEN.has(w)) {
        out.push(t)
        continue
      }
      fixVerb = false
      out.push(keep(t, asYouDo(w, t)))
      continue
    }
    if (subjects.has(w)) {
      out.push(keep(t, 'you'))
      // "They" go as they did: "they need" is "you need".
      fixVerb = !to.group
      continue
    }
    const contracted = w.match(/^(he|she|they)'(s|re|ve|ll|d)$/)
    if (contracted && subjects.has(contracted[1])) {
      const rest = tokens.slice(i + 1).map(core)
      const verb = rest.find((x) => !BETWEEN.has(x)) ?? ''
      const word =
        contracted[2] === 'll'
          ? "you'll"
          : contracted[2] === 'd'
            ? "you'd"
            : contracted[2] === 've' ||
                (contracted[2] === 's' && /^(?:been|got|gotten)$/.test(verb))
              ? "you've"
              : "you're"
      out.push(keep(t, word))
      continue
    }
    if (objects.has(w)) {
      // "Her": hers before a thing ("her guitar"), her before anything else.
      const possessive = w === 'her' && !atEnd && next && !AFTER_HER.has(next)
      out.push(keep(t, possessive ? 'your' : 'you'))
      continue
    }
    if ((w === 'his' && !to.group && to.sex !== 'female') || (w === 'their' && to.group)) {
      out.push(keep(t, atEnd || !next ? 'yours' : 'your'))
      continue
    }
    if (
      (w === 'himself' && !to.group && to.sex !== 'female') ||
      (w === 'herself' && !to.group && to.sex !== 'male')
    ) {
      out.push(keep(t, 'yourself'))
      continue
    }
    if (to.group && (w === 'themselves' || w === 'theirs')) {
      out.push(keep(t, w === 'theirs' ? 'yours' : 'yourselves'))
      continue
    }
    out.push(t)
  }
  return out.join(' ')
}

/** What he does, as what you do: "needs" — "need", "is" — "are", "can" — "can". */
function asYouDo(w: string, said: string): string {
  const word = PERSON_VERB[w]
  const plainWord = said.replace(/^[("“]+|[)"”.,!?:;]+$/g, '')
  if (word) return word
  if (/^[a-z]+ies$/.test(w) && w.length > 4) return plainWord.slice(0, -3) + 'y'
  if (/^[a-z]+(?:sses|shes|ches|xes|zes|oes)$/.test(w)) return plainWord.slice(0, -2)
  if (/^[a-z]+s$/.test(w) && !/(?:ss|us|is)$/.test(w) && w.length > 3) return plainWord.slice(0, -1)
  return plainWord
}
