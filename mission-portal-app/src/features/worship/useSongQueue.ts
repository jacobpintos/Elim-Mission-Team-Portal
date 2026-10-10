import { useReducer, useState } from 'react'
import type { ChordSheet } from '@/types/chordSheet'

/** A song to come, or one moved on from: the sheet, in the key it was asked for (or was in). */
export interface QueuedSong {
  sheet: ChordSheet
  key: string | null
  minor: boolean
}

/**
 * The songs said out loud to come next ("queue Holy Forever in D"), in the
 * order asked for, and the ones moved on from, for "back".
 *
 * Held by whoever opens the chord sheet (the Chord Sheets page, a set list,
 * Miriam), so it lasts from one song to the next while the sheet stays open.
 */
export interface SongQueue {
  /** Songs to come, the next first. */
  upcoming: QueuedSong[]
  /** Whether there is a song to go back to. */
  canGoBack: boolean
  add: (song: QueuedSong) => void
  /** The next one taken off without playing it (its ✕). */
  dropNext: () => void
  clear: () => void
  /** On to the next queued song, `current` remembered for "back": the song to open, or null. */
  advance: (current: QueuedSong) => QueuedSong | null
  /** Back to the song before, `current` put first in the queue: the song to open, or null. */
  back: (current: QueuedSong) => QueuedSong | null
  /** Another song opened in this one's place, not from the queue: `current` remembered for "back". */
  leave: (current: QueuedSong) => void
  /** Everything forgotten: the sheet has closed. */
  reset: () => void
}

/** How many songs moved on from are kept for "back". */
const HISTORY = 20

/** Taken as the same song: another of it is not queued twice in a row. */
const same = (a: QueuedSong, b: QueuedSong) =>
  String(a.sheet.id) === String(b.sheet.id) && a.key === b.key && a.minor === b.minor

/** The queue itself, apart from React: what each change makes of it. */
export function nextQueue(
  state: { upcoming: QueuedSong[]; history: QueuedSong[] },
  change:
    | { kind: 'add'; song: QueuedSong }
    | { kind: 'dropNext' }
    | { kind: 'clear' }
    | { kind: 'advance'; current: QueuedSong }
    | { kind: 'back'; current: QueuedSong }
    | { kind: 'leave'; current: QueuedSong }
    | { kind: 'reset' }
): { upcoming: QueuedSong[]; history: QueuedSong[]; open: QueuedSong | null } {
  const { upcoming, history } = state
  const remember = (song: QueuedSong) => [...history, song].slice(-HISTORY)
  switch (change.kind) {
    case 'add': {
      const last = upcoming[upcoming.length - 1]
      if (last && same(last, change.song)) return { upcoming, history, open: null }
      return { upcoming: [...upcoming, change.song], history, open: null }
    }
    case 'dropNext':
      return { upcoming: upcoming.length ? upcoming.slice(1) : upcoming, history, open: null }
    case 'clear':
      return { upcoming: upcoming.length ? [] : upcoming, history, open: null }
    case 'advance':
      if (upcoming.length === 0) return { upcoming, history, open: null }
      return { upcoming: upcoming.slice(1), history: remember(change.current), open: upcoming[0] }
    case 'back': {
      if (history.length === 0) return { upcoming, history, open: null }
      return {
        upcoming: [change.current, ...upcoming],
        history: history.slice(0, -1),
        open: history[history.length - 1],
      }
    }
    case 'leave':
      return { upcoming, history: remember(change.current), open: null }
    case 'reset':
      if (upcoming.length === 0 && history.length === 0) return { upcoming, history, open: null }
      return { upcoming: [], history: [], open: null }
  }
}

/** A queue that calls `changed` whenever it changes: what useSongQueue holds. */
export function makeSongQueue(changed: () => void): SongQueue {
  let state: { upcoming: QueuedSong[]; history: QueuedSong[] } = { upcoming: [], history: [] }
  const change = (c: Parameters<typeof nextQueue>[1]) => {
    const { open, ...next } = nextQueue(state, c)
    if (next.upcoming !== state.upcoming || next.history !== state.history) {
      state = next
      changed()
    }
    return open
  }
  return {
    get upcoming() {
      return state.upcoming
    },
    get canGoBack() {
      return state.history.length > 0
    },
    add: (song) => void change({ kind: 'add', song }),
    dropNext: () => void change({ kind: 'dropNext' }),
    clear: () => void change({ kind: 'clear' }),
    advance: (current) => change({ kind: 'advance', current }),
    back: (current) => change({ kind: 'back', current }),
    leave: (current) => void change({ kind: 'leave', current }),
    reset: () => void change({ kind: 'reset' }),
  }
}

export function useSongQueue(): SongQueue {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  // One queue for as long as its holder is up; it answers "next" at once,
  // before the change has rendered, and renders its holder when it changes.
  const [queue] = useState(() => makeSongQueue(rerender))
  return queue
}
