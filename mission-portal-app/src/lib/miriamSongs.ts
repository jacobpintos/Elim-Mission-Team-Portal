import {
  closestTitles,
  parseSongRequest,
  requestFromAliases,
  splitSpokenKey,
  trailingKey,
} from './songRequest'

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
