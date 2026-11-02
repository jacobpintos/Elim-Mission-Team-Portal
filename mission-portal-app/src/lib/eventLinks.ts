import { toExternalUrl } from '@/lib/externalUrl'

/**
 * A public event's Facebook event, as an admin pastes it: "facebook.com/
 * events/123", "https://fb.me/e/abc", "m.facebook.com/events/…" — kept
 * with its https://, and nothing else.
 */
export function isFacebookUrl(raw: string): boolean {
  const url = toExternalUrl(raw)
  if (!url) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    return /(?:^|\.)(?:facebook\.com|fb\.com|fb\.me)$/.test(host)
  } catch {
    return false
  }
}

/** The link as stored: its https:// added, spaces trimmed; '' when there is none. */
export function tidyFacebookUrl(raw: string): string {
  const url = toExternalUrl(raw.trim())
  return url && isFacebookUrl(url) ? url : ''
}
