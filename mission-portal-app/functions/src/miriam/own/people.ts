import { isAdminViewer, seesTeamSide, type EventInstance, type Flight, type Lodging } from '../data'
import type { Lookups } from '../lookups'
import type { Viewer } from '../data'

/**
 * Someone's travel for an event, asked by name — "When does Olivia arrive
 * for the retreat?", "what time is Guest User's flight arriving?", "where
 * is Guest User staying for New Year's Eve?" — answered from the event's own
 * flights and lodging: everyone's for an admin, anyone else's own only.
 */

export type PersonAsk = {
  kind: 'arrival' | 'departure' | 'flight' | 'lodging'
  /** The words naming them, as said: "guest user", "olivia". */
  said: string
}

const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[?!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Who it is about: before "'s flight", or between "when does" and "arrive". */
const ASKS: [PersonAsk['kind'], RegExp][] = [
  // "where is Guest User staying", "where will the Smiths sleep"
  [
    'lodging',
    /\bwhere\s+(?:is|are|will)\s+(.+?)\s+(?:be\s+)?(?:staying|sleeping|stay|sleep|lodging)\b/,
  ],
  ['lodging', /\b([a-z][a-z' -]*?)'s\s+(?:room|hotel|lodging|host\s+home)\b/],
  // "what time is Guest User's flight arriving", "when does Sam's flight land"
  ['arrival', /\b([a-z][a-z' -]*?)'s\s+flight\s+(?:arriv\w*|land\w*|get(?:s|ting)?\s+in)\b/],
  [
    'departure',
    /\b([a-z][a-z' -]*?)'s\s+flight\s+(?:leav\w*|depart\w*|take\s+off|go(?:es)?\s+home)\b/,
  ],
  // "when does Olivia arrive", "when is Olivia landing", "when will Sam get in"
  [
    'arrival',
    /\bwhen\s+(?:does|will|is|do|are)\s+(.+?)\s+(?:arriv\w*|land\w*|get(?:ting)?\s+in|fly(?:ing)?\s+in)\b/,
  ],
  [
    'departure',
    /\bwhen\s+(?:does|will|is|do|are)\s+(.+?)\s+(?:leav\w*|depart\w*|fly(?:ing)?\s+(?:out|home|back))\b/,
  ],
  ['flight', /\b([a-z][a-z' -]*?)'s\s+flights?\b/],
]

/** Never someone named: the one asking, or everyone. */
const NOT_SOMEONE = /^(?:i|we|you|my|our|your|me|everyone|everybody|they|them|it|the\s+event)$/

/** A question about someone's travel, by name — or null for anything else. */
export function personAsked(text: string): PersonAsk | null {
  const s = plain(text)
  for (const [kind, re] of ASKS) {
    const m = re.exec(s)
    if (!m) continue
    const said = m[1]
      .replace(/^(?:what\s+time\s+is|when\s+is|when\s+does|is|does|the)\s+/, '')
      .trim()
    if (!said || NOT_SOMEONE.test(said)) return null
    return { kind, said }
  }
  return null
}

/** The one named among those listed: by every word said, the most words first ("guest user" — "Guest User"). */
export function personNamed(
  said: string,
  uids: readonly string[],
  names: Map<string, string>
): string | null {
  const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean)
  const asked = words(said)
  // The last words said are the name: "is guest user" is "guest user".
  for (let from = 0; from < asked.length; from++) {
    const tail = asked.slice(from)
    const found = uids.filter((uid) => {
      const theirs = words(names.get(uid) ?? '')
      return tail.every((w) => theirs.includes(w))
    })
    if (found.length === 1) return found[0]
    if (found.length > 1) return null
  }
  return null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-12-30" as "Wednesday, Dec 30"; anything else as written. */
const daySaid = (d: string | undefined) => {
  if (!d) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) return d
  const at = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))
  return `${DAYS[at.getUTCDay()]}, ${MONTHS[at.getUTCMonth()]} ${at.getUTCDate()}`
}

/** One way of a flight, as said: "leaving Wednesday, Dec 30 at 5 PM from Nashville, American Airlines 1234". */
function legSaid(f: Flight, way: 'out' | 'ret'): string | null {
  const g = (k: string) => (f as unknown as Record<string, string | undefined>)[`${way}${k}`]
  const flight = [g('Airline'), g('Flight')].filter(Boolean).join(' ')
  const parts = [
    g('Date') || g('Time')
      ? `leaving ${[daySaid(g('Date')), g('Time') && `at ${g('Time')}`].filter(Boolean).join(' ')}`
      : null,
    g('Airport') && `from ${g('Airport')}`,
    flight || null,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** Their answer, from the event's lists — or null when the event, or they, can't be told plainly. */
export async function personAnswer(
  ask: PersonAsk,
  ev: EventInstance,
  { lookups, viewer }: { lookups: Lookups; viewer: Viewer }
): Promise<string | null> {
  // Never a public follower's to be told: its page shows them no rooms or flights.
  if (!seesTeamSide(viewer)) return null
  const names = await lookups.names()
  const title = ev.title
  // Anyone else's is an admin's to see — never even whether they have one.
  const admin = isAdminViewer(viewer)
  if (!admin) {
    const asked = personNamed(ask.said, [...names.keys()], names)
    if (!asked) return null
    if (asked !== viewer.uid) {
      return ask.kind === 'lodging'
        ? 'Only admins can see where others are staying.'
        : 'Only admins can see others’ flights.'
    }
  }
  const self = (uid: string) => uid === viewer.uid
  /**
   * Who of those with an entry was asked about: for anyone but an admin,
   * only themselves — never someone else whose name ends as theirs does
   * ("Mary Smith", with none, is not "Tom Smith", with one).
   */
  const whoOf = (holders: string[]) =>
    admin ? personNamed(ask.said, holders, names) : holders.includes(viewer.uid) ? viewer.uid : null
  if (ask.kind === 'lodging') {
    const rooms: Lodging[] = ev.lodgingEntries ?? []
    const uid = whoOf([...new Set(rooms.flatMap((l) => l.assignees.map(String)))])
    if (!uid) return admin ? null : `You haven’t been given a room for ${title} yet.`
    const room = rooms.find((l) => l.assignees.some((a) => String(a) === uid))!
    const where = [room.name, room.address, room.room && `room ${room.room}`].filter(Boolean)
    const who = self(uid) ? 'You’re' : names.get(uid) ? `${names.get(uid)} is` : 'They’re'
    return `${who} staying at ${where.join(', ')} for ${title}.`
  }
  const flights: Flight[] = ev.flightEntries ?? []
  const uid = whoOf(flights.map((f) => String(f.uid)))
  if (!uid) return admin ? null : `You have no flight for ${title} yet.`
  const whose = self(uid) ? 'Your' : names.get(uid) ? `${names.get(uid)}’s` : 'Their'
  const f = flights.find((x) => String(x.uid) === uid)!
  const out = legSaid(f, 'out')
  const back = legSaid(f, 'ret')
  if (ask.kind === 'arrival') {
    if (!out) return `${whose} flight for ${title} has no details yet.`
    return f.outArrival
      ? `${whose} flight is expected to arrive at ${f.outArrival}${f.outDate ? ` on ${daySaid(f.outDate)}` : ''} — ${out}.`
      : `${whose} flight for ${title}: ${out}. No arrival time is set.`
  }
  if (ask.kind === 'departure') {
    if (!back) return `${whose} return flight for ${title} has no details yet.`
    return `${whose} flight home: ${back}${f.retArrival ? `, arriving ${f.retArrival}` : ''}.`
  }
  const legs = [
    out && `going: ${out}${f.outArrival ? `, arriving ${f.outArrival}` : ''}`,
    back && `returning: ${back}${f.retArrival ? `, arriving ${f.retArrival}` : ''}`,
  ].filter(Boolean)
  return legs.length
    ? `${whose} flight for ${title} — ${legs.join('; ')}.`
    : `${whose} flight for ${title} has no details yet.`
}
