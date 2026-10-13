import { eventRef } from './miriamQuick'
import { plain, withoutAsking, withoutEnding } from './miriamReplies'

/**
 * The way to an event, asked of Miriam — "take me to the retreat", "give me
 * directions to the event on Sunday", "how do I get to youth night?" — worked
 * out on the device (features/miriam/localTalk), and opened in maps
 * (lib/location: openDirections).
 */

/** Words of the asking, not of the event's name. */
const ASKING = new Set(
  (
    'directions direction route way navigate navigation take get bring drive guide lead show ' +
    'find open maps map google apple me us to there how do can would should i we the please ' +
    'give send need want best quickest fastest with a an my our event events place location'
  ).split(' ')
)

/** How it is asked; what follows names the event. */
const ASKED = [
  // "Directions to X", "give me directions to X", "I need directions to X"
  /^(?:(?:give|get|send|show)\s+(?:me|us)\s+|i\s+(?:need|want)\s+|can\s+i\s+(?:get|have)\s+)?(?:the\s+)?directions?\b\s*(.*)$/,
  // "Take me to X", "get us there", "navigate me to X"
  /^(?:take|get|bring|drive|guide|lead|route|navigate)\s+(?:me|us)\s+(?:to\b|there\b)\s*(.*)$/,
  // "Navigate to X"
  /^navigate\s+(?:to\b\s*)?(.*)$/,
  // "How do I get to X", "how do we get there"
  /^how\s+(?:do|can|would|should|will)\s+(?:i|we)\s+get\s+(?:to\b|there\b)\s*(.*)$/,
  // "Open maps for X", "maps to X", "Google Maps to X"
  /^(?:open\s+)?(?:(?:google|apple)\s+)?maps?\s+(?:to|for)\b\s*(.*)$/,
  // "Show me the way to X", "what's the best route to X"
  /^(?:(?:show|find)\s+(?:me\s+)?|(?:what's|what\s+is)\s+)?the\s+(?:best\s+|quickest\s+|fastest\s+)?(?:way|route)\s+to\b\s*(.*)$/,
]

/**
 * The event they asked the way to, as far as it was said: a day, and the words
 * naming it — both empty for "take me there" or "directions please". Null
 * when it isn't asking the way at all.
 */
export function directionsAsked(
  text: string,
  today: string
): { date: string | null; name: string } | null {
  if (!text.trim()) return null
  const s = withoutEnding(plain(withoutAsking(plain(text))))
  for (const re of ASKED) {
    const m = re.exec(s)
    if (!m) continue
    const rest = (m[1] ?? '').trim()
    if (!rest) return { date: null, name: '' }
    const ref = eventRef(rest, today, ASKING)
    return { date: ref?.date ?? null, name: ref?.name ?? '' }
  }
  return null
}
