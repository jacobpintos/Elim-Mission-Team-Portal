/**
 * Dollars as people type them, and cents as they are stored.
 *
 * Amounts for reimbursements are kept in whole cents so that items add up
 * exactly. These turn what someone typed — "12", "12.5", "$1,204.99" — into
 * cents, and back.
 */

/** Cents from what was typed, or null when it is not an amount. */
export function parseDollars(text: string): number | null {
  const cleaned = text.trim().replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned) && !/^\.\d{1,2}$/.test(cleaned)) return null
  const [whole, frac = ''] = cleaned.split('.')
  const cents = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

/** $1,234.50 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  return `${sign}$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`
}
