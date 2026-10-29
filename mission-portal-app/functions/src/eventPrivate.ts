/**
 * An event's private details, kept apart from the event itself.
 *
 * events/{id} is read by every signed-in account: what anyone who can see
 * the event is shown — its name, when and where, its links, who is on it,
 * its food sheet. What only those on it should have — its teams, dress
 * code, report times, schedule, cars, rooms and flights — is kept in
 * eventPrivate/{id}, which only they and admins may read (firestore.rules),
 * with `access`: everyone on it, on any of its dates.
 *
 * The app and the server read the two as one (mergeEvent); the app writes
 * each part to its own record (splitFields). An app not yet updated still
 * writes everything to the event, and events from before were kept that
 * way: the server moves what it finds there across (strays;
 * functions/src/eventPrivateSync).
 *
 * Kept free of Firebase: the app imports it too.
 */

export const PRIVATE_EVENT_FIELDS = [
  'teams',
  'dressCode',
  'dcw',
  'dcm',
  'reportTimes',
  'rtp',
  'rtm',
  'schedule',
  'carpoolCars',
  'carpoolLoc',
  'vehicles',
  'lodgingEntries',
  'flightEntries',
] as const

const PRIVATE = new Set<string>(PRIVATE_EVENT_FIELDS)
export const isPrivateField = (key: string) => PRIVATE.has(key)

type Doc = Record<string, unknown>
type Overrides = Record<string, Doc>

const overridesOf = (d: Doc): Overrides =>
  d.overrides && typeof d.overrides === 'object' ? (d.overrides as Overrides) : {}

/** A record's own fields, split: for anyone who sees the event, and for the private record. */
export function splitFields(data: Doc): { open: Doc; closed: Doc } {
  const open: Doc = {}
  const closed: Doc = {}
  for (const [k, v] of Object.entries(data)) (PRIVATE.has(k) ? closed : open)[k] = v
  return { open, closed }
}

/** The event without its private details, date by date too: for someone not on it. */
export function withoutPrivate<T extends Doc>(open: T): T {
  const out: Doc = splitFields(open).open
  const oo = overridesOf(open)
  if (Object.keys(oo).length) {
    out.overrides = Object.fromEntries(
      Object.entries(oo).map(([k, v]) => [k, v && typeof v === 'object' ? splitFields(v).open : v])
    )
  }
  return out as T
}

/**
 * The event as one: its private details over the event's own, date by
 * date too. `access` is the private record's, not the event's.
 */
export function mergeEvent<T extends Doc>(open: T, closed?: Doc | null): T {
  if (!closed) return open
  const { overrides: _co, access: _access, ...top } = closed
  const merged: Doc = { ...open, ...top }
  const oo = overridesOf(open)
  const co = overridesOf(closed)
  const keys = new Set([...Object.keys(oo), ...Object.keys(co)])
  if (keys.size) {
    merged.overrides = Object.fromEntries([...keys].map((k) => [k, { ...oo[k], ...co[k] }]))
  }
  return merged as T
}

/** The private record with `moved` written into it, date by date too, as a merged write leaves it. */
export function withMoved(closed: Doc, moved: Doc): Doc {
  const { overrides: mo, ...top } = moved
  const out: Doc = { ...closed, ...top }
  if (mo) {
    const co = overridesOf(closed)
    out.overrides = {
      ...co,
      ...Object.fromEntries(
        Object.entries(mo as Overrides).map(([k, v]) => [k, { ...co[k], ...v }])
      ),
    }
  }
  return out
}

const blank = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

/**
 * Private details found in the event record, to move across: what to write
 * into the private record, and the fields to clear from the event (each a
 * path: ['teams'], or ['overrides', key, 'teams'] for one date's).
 *
 * An empty value never replaces a set one. An app not yet updated, which
 * can no longer see the details, shows them empty — and saves them so.
 */
export function strays(open: Doc, closed: Doc = {}): { moved: Doc; cleared: string[][] } {
  const moved: Doc = {}
  const cleared: string[][] = []
  for (const [k, v] of Object.entries(open)) {
    if (!PRIVATE.has(k)) continue
    cleared.push([k])
    if (blank(v) && !blank(closed[k])) continue
    moved[k] = v
  }
  const co = overridesOf(closed)
  for (const [key, entry] of Object.entries(overridesOf(open))) {
    if (!entry || typeof entry !== 'object') continue
    const into: Doc = {}
    for (const [k, v] of Object.entries(entry)) {
      if (!PRIVATE.has(k)) continue
      cleared.push(['overrides', key, k])
      // What that date has now: its own, or the event's.
      const now = co[key]?.[k] ?? moved[k] ?? closed[k]
      if (blank(v) && !blank(now)) continue
      into[k] = v
    }
    if (Object.keys(into).length) ((moved.overrides ??= {}) as Overrides)[key] = into
  }
  return { moved, cleared }
}

interface TeamLike {
  leaders?: unknown[]
  members?: unknown[]
}

/**
 * Everyone on an event, on any of its dates: named on it, in one of its
 * groups, or on one of its teams. Who may read its private record.
 */
export function eventAccess(
  ev: Doc,
  groups: { id: string | number; members?: unknown[] }[]
): string[] {
  const out = new Set<string>()
  const add = (u: unknown) => {
    if (u != null && u !== '') out.add(String(u))
  }
  const from = (part: Doc) => {
    ;((part.users as unknown[]) ?? []).forEach(add)
    for (const gid of (part.groups as unknown[]) ?? []) {
      groups.find((g) => String(g.id) === String(gid))?.members?.forEach(add)
    }
    for (const t of (part.teams as TeamLike[]) ?? []) {
      ;[...(t?.leaders ?? []), ...(t?.members ?? [])].forEach(add)
    }
  }
  from(ev)
  Object.values(overridesOf(ev)).forEach((o) => o && from(o))
  return [...out].sort()
}

export const sameAccess = (a: unknown, b: string[]) =>
  Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i])

/** In `seenBy`: an event anyone signed in may see. */
export const EVERYONE = '*'

/**
 * Who may see an event at all — that there is one, and when — kept on it
 * as `seenBy` for the database's rule (firestore.rules events): everyone
 * (EVERYONE) when it is public, on any of its dates; otherwise only those
 * on it (eventAccess). A draft, no one: admins see every event regardless.
 *
 * The app's own rule (src/lib/events canViewEvent) goes date by date; this
 * is the event's, so a repeating event with one public date is seen by
 * everyone — the app still shows them that date alone.
 */
export function eventSeenBy(
  ev: Doc,
  groups: { id: string | number; members?: unknown[] }[]
): string[] {
  if (ev.unpublished === true) return []
  const isPublic = (part: Doc | undefined) => part?.isPublic === true && part.deleted !== true
  if (ev.isPublic === true || Object.values(overridesOf(ev)).some(isPublic)) return [EVERYONE]
  return eventAccess(ev, groups)
}
