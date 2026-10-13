import type { ScheduleItem } from '@/types/events'

/**
 * An event's schedule — what happens when, built by an admin in the event
 * form — read, put in order and tidied to be saved. Kept apart from its
 * screens so it can be tested.
 */

/**
 * Minutes after midnight for a time as written: "7pm", "7:30 PM", "19:00",
 * "noon". Null for one that isn't a time ("Morning", "After lunch").
 *
 * Without am or pm, it is read as a schedule would mean it: 7 to 11 the
 * morning, 12 noon, 1 to 6 the afternoon and evening, 13 to 23 as they are.
 */
export function clockMinutes(time: string): number | null {
  const t = time.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ')
  if (!t) return null
  if (t === 'noon' || t === 'midday') return 12 * 60
  if (t === 'midnight') return 0
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(t)
  if (!m) return null
  let hour = Number(m[1])
  const minute = m[2] ? Number(m[2]) : 0
  if (minute > 59) return null
  const meridiem = m[3]?.[0]
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0)
  } else if (hour > 23) return null
  else if (hour >= 1 && hour <= 6) hour += 12
  return hour * 60 + minute
}

/** "7:00 PM", for minutes after midnight. */
export function clockLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24
  const minute = minutes % 60
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

/** A time as it is kept: "7pm" written as "7:00 PM"; anything that isn't a time, as typed. */
export function tidyTime(time: string): string {
  const minutes = clockMinutes(time)
  return minutes === null ? time.trim() : clockLabel(minutes)
}

/**
 * In order: by day, then by time. Those with no time a clock can read
 * ("Morning", or none) keep the order they were put in, after the timed ones
 * of their day.
 */
export function sortSchedule(items: ScheduleItem[]): ScheduleItem[] {
  return items
    .map((item, at) => ({ item, at, minutes: clockMinutes(item.time) }))
    .sort(
      (a, b) =>
        (a.item.day ?? 0) - (b.item.day ?? 0) ||
        (a.minutes ?? Infinity) - (b.minutes ?? Infinity) ||
        a.at - b.at
    )
    .map((x) => x.item)
}

/**
 * The schedule as it is saved: written out tidily, in order, with what was
 * left blank dropped — a row with nothing in it, or an empty note — and no
 * day past the event's last (`days`: how many it has).
 */
export function tidySchedule(items: ScheduleItem[], days: number): ScheduleItem[] {
  const kept = items
    .map((it) => {
      const item: ScheduleItem = { id: it.id, time: tidyTime(it.time), title: it.title.trim() }
      const endTime = tidyTime(it.endTime ?? '')
      if (endTime) item.endTime = endTime
      const notes = (it.notes ?? '').trim()
      if (notes) item.notes = notes
      const day = Math.min(Math.max(0, it.day ?? 0), Math.max(0, days - 1))
      if (day > 0) item.day = day
      return item
    })
    .filter((it) => it.title || it.time)
  return sortSchedule(kept)
}

/** A new row, on the day given. The id only has to be unique among this event's rows. */
export function newScheduleItem(existing: ScheduleItem[], day = 0): ScheduleItem {
  const base = Date.now().toString(36)
  let id = base
  for (let n = 1; existing.some((it) => it.id === id); n++) id = `${base}_${n}`
  return { id, time: '', title: '', ...(day > 0 ? { day } : {}) }
}

/** The schedule by day, in order, leaving out days with nothing on them. */
export function scheduleByDay(items: ScheduleItem[]): { day: number; items: ScheduleItem[] }[] {
  const days = new Map<number, ScheduleItem[]>()
  for (const item of sortSchedule(items)) {
    const day = item.day ?? 0
    days.set(day, [...(days.get(day) ?? []), item])
  }
  return [...days.entries()].sort(([a], [b]) => a - b).map(([day, list]) => ({ day, items: list }))
}

/** When, as shown: "7:00 PM", "7:00–8:30 PM", "7:00 PM–midnight". Empty for none. */
export function whenShown(item: Pick<ScheduleItem, 'time' | 'endTime'>): string {
  if (!item.endTime) return item.time
  if (!item.time) return `until ${item.endTime}`
  const [start, startHalf] = item.time.split(' ')
  const [, endHalf] = item.endTime.split(' ')
  // Both in the same half of the day: said once. "7:00–8:30 PM".
  if (startHalf && startHalf === endHalf && /^\d/.test(start)) return `${start}–${item.endTime}`
  return `${item.time}–${item.endTime}`
}

/**
 * The schedule read out: "Friday: 7:00 PM, Worship; 8:15 PM, the message.
 * Saturday: …". `dayName`: what to call a day of a multi-day event; null for
 * an event of one day. At most `limit` items, with how many more there are.
 */
export function scheduleSaid(
  items: ScheduleItem[],
  dayName: ((day: number) => string) | null,
  limit = 8
): string {
  let left = limit
  let more = 0
  const parts: string[] = []
  for (const { day, items: list } of scheduleByDay(items)) {
    const said: string[] = []
    for (const item of list) {
      if (left <= 0) {
        more++
        continue
      }
      left--
      const when = whenShown(item)
      const notes = item.notes ? ` (${item.notes})` : ''
      said.push(`${when ? `${when}, ` : ''}${item.title || 'something'}${notes}`)
    }
    if (said.length) parts.push(`${dayName ? `${dayName(day)}: ` : ''}${said.join('; ')}`)
  }
  if (!parts.length) return ''
  return `${parts.join('. ')}.${more ? ` And ${more} more — it’s all on the event’s page.` : ''}`
}

/**
 * What each day of an event is called on its schedule: "Day 1 · Fri, Oct 24",
 * "Day 2 · Sat, Oct 25" — or just "Day 2" for one whose date isn't known.
 * `dates`: its first day's, then its extra days', as YYYY-MM-DD.
 */
export function dayNames(dates: (string | null | undefined)[]): string[] {
  return dates.map((date, i) => {
    const valid = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    if (!valid) return `Day ${i + 1}`
    const when = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    return `Day ${i + 1} · ${when}`
  })
}
