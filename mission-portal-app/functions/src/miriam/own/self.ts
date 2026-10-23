/**
 * Miriam on herself: "who are you?", "what can you do?", "are you a real
 * person?" — answered plainly: what she is (an AI language model, not a
 * person), how she answers, and what she can do for this person.
 *
 * Asked of Claude, "who are you" came back as a question about her name —
 * a question of faith (./names, ./faith) — and was sent to the church's
 * leadership. Where her name comes from still is; who she is is not.
 *
 * What she says she can do follows what this person can do: a public
 * account's requests never leave her own model, and its account has no
 * messages, set lists or admin work, so she doesn't offer them.
 *
 * Pure, and free of Firebase: the app says the same on the phone
 * (src/features/miriam/useMiriamConversation).
 */

/** What this person can do, as far as what she offers goes. */
export interface SelfFor {
  /** A public account: no Claude, and the visitor's side of the app. */
  isPublic: boolean
  messages?: boolean
  worship?: boolean
  admin?: boolean
}

const tidy = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[?!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:hey|hi|ok|okay|so)\s+)*(?:miriam\s+)?(?:please\s+)?/, '')
    .replace(/\s+miriam$/, '')

/** Asked about her as a whole sentence, so "what can you do about the picnic" stays a request. */
const ASKED = [
  /^(?:who|what) (?:are|r) (?:you|u)(?: exactly| really| anyway)?$/,
  /^(?:who|what)(?:'s| is) this$/,
  /^what is miriam$/,
  /^(?:tell me|talk) about yourself$/,
  /^(?:tell me|say) (?:a (?:little|bit) )?(?:more )?about (?:yourself|you)$/,
  /^introduce yourself$/,
  /^what (?:can|could) (?:you|u) do(?: for me)?$/,
  /^what (?:can|could) (?:you|u) help (?:me )?with$/,
  /^how (?:can|could) (?:you|u) help(?: me)?$/,
  /^what (?:do|are) (?:you|u) (?:do|for|good at|able to do|capable of)$/,
  /^how do (?:you|u) work$/,
  /^are (?:you|u) (?:a |an )?(?:robot|bot|ai|a i|computer|machine|program|language model|llm|chatbot|chat bot|real|real person|person|human|alive|chatgpt|claude)(?: or (?:a |an )?(?:real )?(?:person|human|robot|bot|ai|not))?$/,
  /^(?:what|which) (?:kind of |sort of )?(?:ai|model|language model|llm|bot) (?:are you|is this)$/,
  /^what are you made of$/,
]

/** Whether this is a question about her — who or what she is, or what she can do. */
export function selfAsked(text: string): boolean {
  const t = tidy(text)
  return ASKED.some((re) => re.test(t))
}

/** "a, b and c". */
const listed = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/** Who she is, and what she can do for this person: a few sentences, to be heard. */
export function selfIntro(who: SelfFor): string {
  if (who.isPublic) {
    return (
      'I’m Miriam, the assistant in this app — an AI language model, not a person, and I run on the app’s own servers. ' +
      'I can tell you about events and The Well, answer questions about the Elim Store, play videos from Content, ' +
      'take you around the app, and help you ask to meet with our leadership. ' +
      'I can get things wrong, so check anything that matters. Say “give me a tour” to see around.'
    )
  }
  const can = [
    'tell you about your events — times, places, what to wear, your team and your ride',
    'open any screen',
    'set reminders',
    who.messages ? 'read your messages and announcements' : 'read announcements',
    'play videos from Content',
    ...(who.worship ? ['open chord sheets and set lists'] : []),
    ...(who.admin ? ['help with admin work like tasks, people and events'] : []),
  ]
  return (
    'I’m Miriam, the assistant in this app — an AI language model, not a person. ' +
    'I answer a lot of what you ask myself, and for the rest I use Claude, an AI model from Anthropic. ' +
    `I can ${listed(can)}. ` +
    'I can get things wrong, so check anything that matters. ' +
    'Say “give me a tour” to see around the app.'
  )
}
