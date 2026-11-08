import type { InputListLocation } from '@/stores/inputListStore'
import { deskValue, setDeskValue, type DeskLink } from './x32'
import { DESKS, type DeskKind } from './deskModel'

/**
 * The input list (Worship → Input List: src/stores/inputListStore) and the
 * sound desk's own names, row for row. The list's rows line up with the
 * board, in the order its strips run. On a WING:
 *
 * - inputs: rows 1–40 are channels 1–40, and rows 41–48 the aux inputs 1–8;
 * - outputs: rows 1–16 are its 16 buses (the in-ear mixes), and no more.
 *
 * On an X32:
 *
 * - inputs: rows 1–32 are channels 1–32, rows 33–40 the aux inputs 1–8, and
 *   rows 41–48 the effects returns 1–8;
 * - outputs: rows 1–16 are mix buses 1–16, and rows 17–22 matrices 1–6.
 *
 * A row past those has no strip of its own to name. Names are as long as the
 * desk shows: 16 characters on a WING, 12 on an X32. Each desk's names are
 * asked for the X32's way; a WING's link puts that in its words (./wing).
 */

export type ListSide = 'input' | 'output'

export interface Strip {
  /** Where its name is on the desk: "/ch/05/config/name". */
  address: string
  /** As the desk labels it: "Ch 5", "Aux 2", "FX 1", "Bus 3", "Matrix 1". */
  label: string
}

/** The longest name an X32 shows. */
export const DESK_NAME_MAX = 12

const two = (n: number) => String(n).padStart(2, '0')
const strip = (path: string, n: number, label: string): Strip => ({
  address: `/${path}/${two(n)}/config/name`,
  label: `${label} ${n}`,
})

/** The desk's strip for a row of the list (from 1), or null for a row past them. */
export function stripFor(side: ListSide, row: number, kind: DeskKind = 'x32'): Strip | null {
  if (!Number.isInteger(row) || row < 1) return null
  if (kind === 'wing') {
    if (side === 'input') {
      if (row <= 40) return strip('ch', row, 'Ch')
      if (row <= 48) return strip('auxin', row - 40, 'Aux')
      return null
    }
    return row <= 16 ? strip('bus', row, 'Bus') : null
  }
  if (side === 'input') {
    if (row <= 32) return strip('ch', row, 'Ch')
    if (row <= 40) return strip('auxin', row - 32, 'Aux')
    if (row <= 48) return strip('fxrtn', row - 40, 'FX')
    return null
  }
  if (row <= 16) return strip('bus', row, 'Bus')
  if (row <= 22) return strip('mtx', row - 16, 'Matrix')
  return null
}

/** A name from the list as the desk would hold it: trimmed, and cut to what it shows. */
export const deskNameOf = (name: string, kind: DeskKind = 'x32') =>
  name.trim().slice(0, DESKS[kind].nameMax).trim()

export interface ListRow {
  input: string
  output: string
}

/** A row whose name differs between the list and the desk. */
export interface NameDifference {
  side: ListSide
  /** The list's row, from 1. */
  row: number
  strip: Strip
  /** The list's name (as the desk would hold it); '' for none. */
  list: string
  /** The desk's name now; '' for none. */
  desk: string
}

/** The strips the list's rows line up with, input side and output side. */
export function stripsOf(
  rows: readonly ListRow[],
  kind: DeskKind = 'x32'
): { side: ListSide; row: number; strip: Strip }[] {
  const out: { side: ListSide; row: number; strip: Strip }[] = []
  for (const side of ['input', 'output'] as const) {
    rows.forEach((_, i) => {
      const s = stripFor(side, i + 1, kind)
      if (s) out.push({ side, row: i + 1, strip: s })
    })
  }
  return out
}

/** The desk's names at these addresses, or null when it can't be reached. */
export async function readStripNames(
  link: DeskLink,
  addresses: readonly string[]
): Promise<Map<string, string> | null> {
  if (!addresses.length) return new Map()
  // One first, on its own: whether the desk is there at all.
  const first = await deskValue(link, addresses[0])
  if (!first) return null
  const names = new Map<string, string>([[addresses[0], first.t === 's' ? first.v.trim() : '']])
  const rest = addresses.slice(1)
  // A few at a time: quick, without flooding the desk.
  for (let i = 0; i < rest.length; i += 8) {
    const batch = rest.slice(i, i + 8)
    const values = await Promise.all(batch.map((a) => deskValue(link, a)))
    batch.forEach((a, j) => {
      const v = values[j]
      names.set(a, v?.t === 's' ? v.v.trim() : '')
    })
  }
  return names
}

/** Where the list and the desk differ, row by row: inputs, then outputs. */
export function namesDiffering(
  rows: readonly ListRow[],
  deskNames: ReadonlyMap<string, string>,
  kind: DeskKind = 'x32'
): NameDifference[] {
  const out: NameDifference[] = []
  for (const { side, row, strip: s } of stripsOf(rows, kind)) {
    const list = deskNameOf(rows[row - 1][side], kind)
    const desk = deskNames.get(s.address) ?? ''
    if (list !== desk) out.push({ side, row, strip: s, list, desk })
  }
  return out
}

/** Rows with a name but no strip on the desk to give it to. */
export function rowsPastTheDesk(
  rows: readonly ListRow[],
  kind: DeskKind = 'x32'
): { side: ListSide; row: number }[] {
  const out: { side: ListSide; row: number }[] = []
  for (const side of ['input', 'output'] as const) {
    rows.forEach((r, i) => {
      if (r[side].trim() && !stripFor(side, i + 1, kind)) out.push({ side, row: i + 1 })
    })
  }
  return out
}

/** Names strips on the desk, each read back: those it took, and those it didn't. */
export async function nameStrips<T extends { strip: Strip }>(
  link: DeskLink,
  names: readonly T[],
  nameOf: (t: T) => string
): Promise<{ sent: T[]; failed: T[] }> {
  const sent: T[] = []
  const failed: T[] = []
  for (const n of names) {
    const ok = await setDeskValue(link, n.strip.address, { t: 's', v: nameOf(n) })
    ;(ok ? sent : failed).push(n)
  }
  return { sent, failed }
}

/**
 * Puts the list's names on the desk where they differ. A row the list leaves
 * empty is left as the desk has it: an empty cell isn't a reason to wipe a
 * strip's name. Each name is read back: what didn't take is given back.
 */
export function sendNamesToDesk(
  link: DeskLink,
  differences: readonly NameDifference[]
): Promise<{ sent: NameDifference[]; failed: NameDifference[] }> {
  return nameStrips(
    link,
    differences.filter((d) => d.list),
    (d) => d.list
  )
}

/** Puts back the names these strips had before (Undo). */
export function putBackDeskNames(
  link: DeskLink,
  sent: readonly NameDifference[]
): Promise<{ sent: NameDifference[]; failed: NameDifference[] }> {
  return nameStrips(link, sent, (d) => d.desk)
}

const LIST_WORDS = /\binput ?lists?\b/
const DESK_WORDS = /\b(desk|board|mixer|console|x32|channels|strips|scribble strips)\b/
const SENDING = /\b(send|put|load|push|copy|apply|name|label|sync|match|update)\b/
const FROM_DESK = /\b(from|off) the (sound )?(desk|board|mixer|console|x32)\b/

/**
 * Miriam, asked to put an input list's names on the desk: "send the Sunday
 * input list to the desk", "load the input list onto the board", "name the
 * channels from the event input list". Which list, or null when it wasn't
 * said. Not the other way round ("…from the desk").
 */
export function inputListAsked(said: string): { loc: InputListLocation | null } | null {
  const s = said.toLowerCase()
  if (!LIST_WORDS.test(s) || !DESK_WORDS.test(s) || !SENDING.test(s) || FROM_DESK.test(s)) {
    return null
  }
  const loc: InputListLocation | null = /\bsunday\b/.test(s)
    ? 'sunday'
    : /\bevent\b/.test(s)
      ? 'event'
      : /\bw\.? ?h\.? ?(2|two)\b/.test(s)
        ? 'wh2'
        : null
  return { loc }
}

/** The list with the desk's names put in where they differ. */
export function rowsWithDeskNames(
  rows: readonly ListRow[],
  differences: readonly NameDifference[]
): ListRow[] {
  const out = rows.map((r) => ({ ...r }))
  for (const d of differences) out[d.row - 1][d.side] = d.desk
  return out
}
