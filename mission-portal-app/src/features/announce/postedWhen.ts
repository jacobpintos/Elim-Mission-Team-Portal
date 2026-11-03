/**
 * When an announcement went up, as its card says it: "Just now", "12 min
 * ago", "Today at 7:11 PM", "Yesterday at 9:30 AM", "Tuesday", "Nov 2",
 * "Nov 2, 2025". Close by, the time; further off, the day.
 */
export function postedWhen(ts: number, now: number = Date.now()): string {
  const ago = now - ts
  if (ago < 60_000) return 'Just now'
  if (ago < 60 * 60_000) return `${Math.floor(ago / 60_000)} min ago`
  const at = new Date(ts)
  const today = new Date(now)
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((dayStart(today) - dayStart(at)) / 86_400_000)
  if (days <= 0) return `Today at ${time}`
  if (days === 1) return `Yesterday at ${time}`
  if (days < 7) return at.toLocaleDateString('en-US', { weekday: 'long' })
  return at.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(at.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  })
}

/** "Deletes after Nov 20" / "Expired Nov 2 — deletes overnight": for admins, from YYYY-MM-DD. */
export function expirySaid(expiresAt: string, today: string): { text: string; past: boolean } {
  const d = new Date(`${expiresAt}T12:00:00`)
  const day = Number.isNaN(d.getTime())
    ? expiresAt
    : d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(expiresAt.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
      })
  return expiresAt < today
    ? { text: `Expired ${day} — deletes overnight`, past: true }
    : { text: `Deletes after ${day}`, past: false }
}
