import {
  closestTitles,
  parseSongRequest,
  requestFromAliases,
  splitSpokenKey,
  trailingKey,
} from './songRequest'
import { parseSheetCommand } from './sheetCommands'
import { isOnceOpen, type OnceOpen } from './sheetAfterOpen'

/**
 * A chord sheet asked of Miriam — "open Above All in E flat" — found on the
 * device among the sheets this person has (only the worship team and admins
 * have them), the way the song finder finds one (lib/songRequest): no need
 * to ask the server, and no wait.
 *
 * `open`: the song, plainly, with any key asked for. `guess`: asked for a
 * song, but none plainly — the nearest titles, to offer; `name` is the words
 * used for it, to learn from the one picked (lib/songAliases).
 */
export type SongAsk<T> =
  | { kind: 'open'; sheet: T; key: { key: string; minor: boolean } | null }
  | {
      kind: 'guess'
      sheets: T[]
      key: { key: string; minor: boolean } | null
      name: string
    }

/** Words that ask to see something. */
const OPENING =
  /^(?:(?:hey|ok|okay)\s+)?(?:miriam[,\s]+)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:open|pull\s+up|bring\s+up|put\s+up|show(?:\s+me)?|play|load|get|go\s+to|find|switch\s+to)\b/i
/** Asking about something other than a song: left to the server. */
const NOT_A_SONG =
  /\b(?:events?|tasks?|dress|address|flights?|cars?|ride|availab\w*|meeting|link|food|bring|due|pending|status|schedule|when|where|who)\b/i

/**
 * `onlySongs`: a song screen is up (lib/songHost), so whatever was said is
 * taken as asking for a song — "Above All key of E" — and the nearest titles
 * are offered however it was asked.
 */
export function songAsked<T extends { id: string | number; title: string }>(
  sheets: T[],
  aliases: ReadonlyMap<string, string>,
  text: string,
  onlySongs = false
): SongAsk<T> | null {
  if (sheets.length === 0) return null
  // As said, then without the asking ("switch to Open Heaven"): a title can
  // begin with the asking word itself ("Open the Eyes of My Heart").
  const asked = text.trim().replace(OPENING, '').trim()
  let found = null
  for (const said of asked && asked !== text.trim() ? [text, asked] : [text]) {
    found = requestFromAliases(aliases, sheets, said) ?? parseSongRequest(sheets, said)
    if (found) break
  }
  if (found) {
    return {
      kind: 'open',
      sheet: found.sheet,
      key: found.key ? { key: found.key, minor: found.minor } : null,
    }
  }
  if (!onlySongs && (!OPENING.test(text.trim()) || NOT_A_SONG.test(text))) return null
  const near = closestTitles(sheets, text)
  if (near.length === 0) return null
  return { kind: 'guess', sheets: near, key: trailingKey(text), name: splitSpokenKey(text).name }
}

/** Asking for a song by its asking words: "open…", "queue…", "play…", "switch to…". */
const FOR_A_SONG =
  /^(?:(?:hey|ok|okay)\s+)?(?:miriam[,\s]+)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:open|pull\s+up|bring\s+up|put\s+up|play|load|switch\s+to|change\s+to|queue|cue)\b/i
/** How a question starts. */
const QUESTION =
  /^(?:what|what's|whats|when|where|who|whose|why|how|which|is|are|am|do|does|did|should|will|would|could|can|tell\s+me|remind\s+me)\b/i

/**
 * A question, or something plainly about other than a song ("What am I
 * wearing today?", "show me the dress code") — answered, never taken for a
 * song asked for, even with a song screen up. Asking for a song in a
 * question's words ("can you open Above All?") is still asking for a song.
 */
export function asksAQuestion(text: string): boolean {
  const said = text.trim()
  if (!said || FOR_A_SONG.test(said)) return false
  return said.includes('?') || QUESTION.test(said) || NOT_A_SONG.test(said)
}

/** Where a command for the sheet may start, after the song: "…start autoscroll 5", "…and chords only". */
const STARTS_A_COMMAND =
  /^(?:start|stop|pause|turn|set|scroll|scrolling|autoscroll|auto|speed|chords|lyrics|show|jump|go|numbers|nashville|from|top)$/i
const LINK = /^(?:and|then)$/i

/**
 * A song asked for with what to do once it is open — "Open revive me in C.
 * Start autoscroll 5.", "open Above All and start scrolling at four": the
 * asking for the song, and the commands for its sheet after it
 * (lib/sheetCommands) — or null when nothing after the song is one ("Show
 * Me Your Glory" is a song, not "show").
 */
export function songThen<T extends { id: string | number; title: string }>(
  text: string,
  sheets: T[],
  aliases: ReadonlyMap<string, string> = new Map()
): { song: string; then: OnceOpen[] } | null {
  const words = text.trim().split(/\s+/)
  const bare = (w: string) => w.replace(/[^a-z0-9]/gi, '')
  for (let i = 1; i < words.length; i++) {
    if (!STARTS_A_COMMAND.test(bare(words[i]))) continue
    // The song: up to the command, without "and"/"then", or the stop after it.
    let head = words.slice(0, i)
    while (head.length && LINK.test(bare(head[head.length - 1]))) head = head.slice(0, -1)
    const song = head.join(' ').replace(/[.,;:!]+$/, '')
    if (!song) continue
    // What follows: one command or more ("start autoscroll 5 and chords only"), all to do to the sheet.
    const then: OnceOpen[] = []
    const parts = words
      .slice(i)
      .join(' ')
      .split(/[.;!]\s+|,?\s+(?:and\s+then|and|then)\s+/i)
      .map((p) => p.replace(/[.,;:!]+$/, '').trim())
      .filter(Boolean)
    for (const part of parts) {
      const cmd = parseSheetCommand(part, sheets, aliases)
      if (!isOnceOpen(cmd)) break
      then.push(cmd)
    }
    if (then.length === parts.length) return { song, then }
  }
  return null
}
