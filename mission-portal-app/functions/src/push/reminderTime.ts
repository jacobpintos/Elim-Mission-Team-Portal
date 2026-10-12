/**
 * Reminder times in the time zone of whoever set them — the server keeps UTC,
 * and "every Sunday at 8" means 8 where they are, through the clocks changing.
 * Kept free of Firebase, for tests (src/lib/reminderTime.test.ts in the app).
 */

export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'monthly'

interface Parts {
  y: number
  m: number
  d: number
  h: number
  min: number
  /** 0 Sunday … 6 Saturday */
  wd: number
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The wall clock in `tz` at an instant. */
export function zonedParts(ms: number, tz: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
  }).formatToParts(new Date(ms))
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? ''
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    h: Number(get('hour')) % 24,
    min: Number(get('minute')),
    wd: WD.indexOf(get('weekday')),
  }
}

/** How far `tz` is ahead of UTC at an instant, in ms. */
function offsetAt(ms: number, tz: string): number {
  const p = zonedParts(ms, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(ms / 60_000) * 60_000
}

/** The instant a wall-clock time in `tz` happens (month and day may overflow: Date.UTC rolls them on). */
export function zonedTime(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  tz: string
): number {
  const guess = Date.UTC(y, m - 1, d, h, min)
  const first = offsetAt(guess, tz)
  let t = guess - first
  const second = offsetAt(t, tz)
  if (second !== first) t = guess - second
  return t
}

const validZone = (tz: string | undefined): tz is string => {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The next time a repeating reminder comes round after `ms` — and after `after`, if it has fallen behind. */
export function nextOccurrence(
  ms: number,
  repeat: Repeat,
  tz: string | undefined,
  after = ms
): number {
  const zone = validZone(tz) ? tz : 'UTC'
  let at = ms
  for (let i = 0; i < 400 && at <= after; i++) {
    const p = zonedParts(at, zone)
    if (repeat === 'monthly') {
      // The same day of the month, or the month's last if it has fewer.
      const last = new Date(Date.UTC(p.y, p.m + 1, 0)).getUTCDate()
      at = zonedTime(p.y, p.m + 1, Math.min(p.d, last), p.h, p.min, zone)
    } else {
      let step = repeat === 'weekly' ? 7 : 1
      if (repeat === 'weekdays') {
        // Friday to Monday; Saturday to Monday.
        step = p.wd === 5 ? 3 : p.wd === 6 ? 2 : 1
      }
      at = zonedTime(p.y, p.m, p.d + step, p.h, p.min, zone)
    }
  }
  return at
}

/** "5 PM", "10:30 AM", "17:00" as hours and minutes; null if it isn't a time. */
export function clockOf(time: string | undefined): { h: number; min: number } | null {
  const m = (time ?? '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  const mer = m[3]?.toLowerCase().replace(/\./g, '')
  if (mer === 'pm' && h < 12) h += 12
  if (mer === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return { h, min }
}
