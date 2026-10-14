import type { SheetCommand } from './sheetCommands'

/**
 * What was asked to be done with a song as it was opened — "open Revive Me
 * in C, start autoscroll 5" — held for its chord sheet to do once it is open
 * and laid out (features/worship/ChordSheetViewer), wherever it opens: the
 * Chord Sheets page, an open sheet's place, or over the page.
 */

/** What may be done to a sheet as it opens: autoscroll, its key, a section — not another song, nor closing it. */
export type OnceOpen = Extract<
  SheetCommand<never>,
  { type: 'scroll' | 'key' | 'numbers' | 'section' | 'top' | 'chordsOnly' }
>
const ONCE_OPEN = new Set<string>(['scroll', 'key', 'numbers', 'section', 'top', 'chordsOnly'])
export const isOnceOpen = <T>(cmd: SheetCommand<T> | null): cmd is SheetCommand<T> & OnceOpen =>
  !!cmd && ONCE_OPEN.has(cmd.type)

/** Long enough for the page to open and the sheet to be laid out; never for a song opened later. */
const WAIT_MS = 20_000

let pending: { id: string; commands: OnceOpen[]; until: number } | null = null

/** To be done to this song's sheet once it opens. */
export function onceOpen(
  id: string | number,
  commands: readonly OnceOpen[],
  now = Date.now()
): void {
  pending = commands.length
    ? { id: String(id), commands: [...commands], until: now + WAIT_MS }
    : null
}

/** For the sheet just opened: what to do with it, once — or nothing. */
export function takeOnceOpen(id: string | number, now = Date.now()): OnceOpen[] {
  if (!pending || pending.id !== String(id)) return []
  const { commands, until } = pending
  pending = null
  return now <= until ? commands : []
}
