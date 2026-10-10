import type { SectionType } from '@/types/chordSheet'
import {
  parseSongRequest,
  requestFromAliases,
  spokenKey,
  spokenWords,
  type SongRequest,
} from '@/lib/songRequest'

/**
 * What can be said to an open chord sheet, hands on an instrument.
 *
 * A command is the whole of what was said — "next song", "chorus two",
 * "queue Holy Forever in D" — give or take "go to", "okay", "please". A
 * lyric that happens to hold a command word ("…the next thing…") is not
 * one, so a band singing in the room does not drive the sheet.
 */
export type SheetCommand<T> =
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'queue'; request: SongRequest<T> }
  /** Another song, now, in this one's place: "open Above All in E". */
  | { type: 'open'; request: SongRequest<T> }
  | { type: 'clearQueue' }
  | { type: 'key'; key: string; minor: boolean }
  | { type: 'numbers' }
  | { type: 'scroll'; action: 'start' | 'pause' | 'faster' | 'slower' }
  | { type: 'section'; kind: SectionType; number: number | null }
  | { type: 'top' }
  | { type: 'chordsOnly'; on: boolean }
  | { type: 'close' }
  | { type: 'stopListening' }

/** Asking words either side of a command: "okay, go to the chorus please". */
const POLITE = new Set([
  'ok',
  'okay',
  'please',
  'go',
  'to',
  'jump',
  'the',
  'now',
  'lets',
  'let',
  'us',
  'and',
  'can',
  'you',
  'hey',
  'um',
  'uh',
  'so',
  'back',
])

const strip = (words: string[]) => {
  let a = 0
  let b = words.length
  while (a < b && POLITE.has(words[a])) a++
  while (b > a && POLITE.has(words[b - 1])) b--
  return words.slice(a, b)
}

const NUMBERS: Record<string, number> = {
  one: 1,
  won: 1,
  first: 1,
  '1': 1,
  two: 2,
  to: 2,
  too: 2,
  second: 2,
  '2': 2,
  three: 3,
  third: 3,
  '3': 3,
  four: 4,
  for: 4,
  fourth: 4,
  '4': 4,
  five: 5,
  fifth: 5,
  '5': 5,
  six: 6,
  sixth: 6,
  '6': 6,
}

/** Section names as said, and the type each is. */
const SECTIONS: [string[], SectionType][] = [
  [['pre', 'chorus'], 'pre-chorus'],
  [['prechorus'], 'pre-chorus'],
  [['chorus'], 'chorus'],
  [['course'], 'chorus'], // as "chorus" is often heard
  [['verse'], 'verse'],
  [['bridge'], 'bridge'],
  [['intro'], 'intro'],
  [['interlude'], 'interlude'],
  [['instrumental'], 'interlude'],
  [['tag'], 'tag'],
  [['outro'], 'outro'],
  [['ending'], 'outro'],
]

/** Fixed phrases, as the whole of what was said. */
const PHRASES: [string[], (w: string[]) => SheetCommand<never> | null][] = []
const said = (cmd: SheetCommand<never>, ...forms: string[]) =>
  forms.forEach((f) => PHRASES.push([f.split(' '), () => cmd]))

said({ type: 'next' }, 'next song', 'next', 'next one', 'skip', 'skip song', 'next track')
said({ type: 'previous' }, 'previous song', 'previous', 'last song', 'previous one', 'song before')
said(
  { type: 'clearQueue' },
  'clear queue',
  'cancel queue',
  'clear the queue',
  'cancel next song',
  'never mind'
)
said({ type: 'numbers' }, 'numbers', 'nashville numbers', 'nashville', 'show numbers')
said(
  { type: 'scroll', action: 'start' },
  'scroll',
  'start scrolling',
  'autoscroll',
  'auto scroll',
  'start',
  'resume',
  'keep going',
  'continue',
  'go'
)
said({ type: 'scroll', action: 'pause' }, 'stop', 'pause', 'hold', 'stop scrolling', 'wait')
said({ type: 'scroll', action: 'faster' }, 'faster', 'speed up', 'scroll faster')
said({ type: 'scroll', action: 'slower' }, 'slower', 'slow down', 'scroll slower')
said({ type: 'top' }, 'top', 'from the top', 'start over', 'beginning', 'top of the song')
said({ type: 'chordsOnly', on: true }, 'chords only', 'only chords', 'just chords', 'chords')
said({ type: 'chordsOnly', on: false }, 'lyrics', 'show lyrics', 'chords off', 'words')
said({ type: 'close' }, 'close', 'close song', 'close sheet', 'done')
said({ type: 'stopListening' }, 'stop listening', 'mic off', 'microphone off', 'stop voice')

/** Ways of asking for a song to be queued, before its name or after it. */
const QUEUE_BEFORE = [
  ['queue', 'up'],
  ['cue', 'up'],
  ['q', 'up'],
  ['queue'],
  ['cue'],
  ['q'],
  ['up', 'next'],
  ['next', 'up'],
  ['play', 'next'],
]
const QUEUE_AFTER = [['next'], ['up', 'next']]
/** Ways of asking for another song now, in place of this one. */
const OPEN_BEFORE = [
  ['open'],
  ['open', 'up'],
  ['pull', 'up'],
  ['bring', 'up'],
  ['switch', 'to'],
  ['change', 'to'],
]

const startsWith = (w: string[], p: string[]) => p.every((x, i) => w[i] === x)

export function parseSheetCommand<T extends { id: string | number; title: string }>(
  text: string,
  sheets: T[],
  aliases: ReadonlyMap<string, string> = new Map()
): SheetCommand<T> | null {
  const raw = spokenWords(text)
  // "Go back" is the song before; "back to the chorus" is not.
  if (['go back', 'back', 'go back one'].includes(raw.join(' '))) return { type: 'previous' }
  const words = strip(raw)
  if (words.length === 0) return null
  const joined = words.join(' ')

  // Queue a song: "queue Holy Forever in D", "up next Breathe", "Way Maker next".
  const asSong = (rest: string[]) => {
    if (rest.length === 0) return null
    const said = rest.join(' ')
    return requestFromAliases(aliases, sheets, said) ?? parseSongRequest(sheets, said)
  }
  for (const p of QUEUE_BEFORE) {
    if (startsWith(raw, p)) {
      const request = asSong(raw.slice(p.length))
      if (request) return { type: 'queue', request }
    }
  }
  for (const p of QUEUE_AFTER) {
    if (raw.length > p.length && raw.slice(-p.length).join(' ') === p.join(' ')) {
      const before = raw.slice(0, -p.length)
      const request = asSong(before[0] === 'add' || before[0] === 'play' ? before.slice(1) : before)
      if (request) return { type: 'queue', request }
    }
  }

  // Another song now: "open Above All in E", "switch to Way Maker".
  for (const p of [...OPEN_BEFORE].sort((a, b) => b.length - a.length)) {
    if (startsWith(raw, p)) {
      const request = asSong(raw.slice(p.length))
      if (request) return { type: 'open', request }
    }
  }

  for (const [form, make] of PHRASES) {
    if (form.join(' ') === joined) return make(words) as SheetCommand<T>
  }

  // A section: "chorus", "the bridge", "verse two", "chorus 2".
  for (const [name, kind] of SECTIONS) {
    if (!startsWith(words, name)) continue
    const rest = words.slice(name.length)
    if (rest.length === 0) return { type: 'section', kind, number: null }
    if (rest.length === 1 && rest[0] in NUMBERS) {
      return { type: 'section', kind, number: NUMBERS[rest[0]] }
    }
  }

  // A key on its own: "key of G", "in E flat", "G minor".
  const key = spokenKey(words)
  if (key && (words.length > 1 || words[0].length > 1)) return { type: 'key', ...key }
  return null
}

/** Phrases to steer recognition towards while voice control is on. */
export const COMMAND_HINTS = [
  'next song',
  'previous song',
  'queue',
  'up next',
  'open',
  'switch to',
  'clear queue',
  'chorus',
  'verse',
  'bridge',
  'pre-chorus',
  'intro',
  'outro',
  'tag',
  'from the top',
  'numbers',
  'chords only',
  'lyrics',
  'faster',
  'slower',
  'start scrolling',
  'stop listening',
]
