/**
 * The rules of a reimbursement request, with nothing to do with Firebase.
 *
 * Kept apart from the callables so they can be tested on their own — the app's
 * test suite imports this file directly. Money is held in whole cents
 * throughout: a request for $12.10 + $3.30 has to total $15.40 exactly, and
 * floating-point dollars do not.
 */

export type ReimbursementStatus = 'submitted' | 'approved' | 'partial' | 'denied' | 'paid'

export type Decision = 'approve' | 'partial' | 'deny'

export interface ReimbursementItem {
  description: string
  /** Whole cents. */
  amount: number
}

export interface PayDateChange {
  /** The date the accountant would like to pay by instead, YYYY-MM-DD. */
  proposed: string
  reason: string
  requestedAt: number
}

export const MAX_ITEMS = 50
export const MAX_RECEIPTS = 10
export const MAX_ITEM_CENTS = 10_000_00
export const MAX_DESCRIPTION = 200
export const MAX_REASON = 1000

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const d = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** $1,234.50 — for messages, which are read on a phone lock screen. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  const dollars = Math.floor(abs / 100)
  const rest = String(abs % 100).padStart(2, '0')
  return `${sign}$${dollars.toLocaleString('en-US')}.${rest}`
}

/** Oct 30, 2026 — a pay-by date as a person reads it. */
export function formatDate(iso: string): string {
  if (!isIsoDate(iso)) return iso
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * The items as typed, checked and cleaned, or a reason they cannot be taken.
 *
 * Amounts arrive as cents from the form, but are not trusted to be whole,
 * positive or sane: a request is money the church pays out.
 */
export function cleanItems(raw: unknown): ReimbursementItem[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return 'Add at least one item.'
  if (raw.length > MAX_ITEMS) return `No more than ${MAX_ITEMS} items in one request.`
  const items: ReimbursementItem[] = []
  for (const r of raw) {
    const description =
      typeof r?.description === 'string' ? r.description.trim().slice(0, MAX_DESCRIPTION) : ''
    const amount = Number(r?.amount)
    if (!description) return 'Every item needs a description.'
    if (!Number.isInteger(amount) || amount <= 0) return `Enter a cost for “${description}”.`
    if (amount > MAX_ITEM_CENTS) return `“${description}” is more than one request can cover.`
    items.push({ description, amount })
  }
  return items
}

export function totalOf(items: ReimbursementItem[]): number {
  return items.reduce((sum, i) => sum + i.amount, 0)
}

export interface DecisionInput {
  decision: Decision
  /** Whole cents; only for a partial approval. */
  approvedAmount?: number
  reason?: string
  payBy?: string
}

export interface CleanDecision {
  status: Extract<ReimbursementStatus, 'approved' | 'partial' | 'denied'>
  approvedAmount: number
  reason: string
  payBy: string | null
}

/**
 * What the accountant decided, checked against what was asked for.
 *
 *  - approve: the whole amount, and a date to pay by.
 *  - partial: an amount above nothing and below the whole, why the rest was
 *    not approved, and a date to pay by.
 *  - deny: why.
 */
export function cleanDecision(
  input: DecisionInput,
  total: number,
  today: string
): CleanDecision | string {
  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, MAX_REASON) : ''

  if (input.decision === 'deny') {
    if (!reason) return 'Say why the request was denied.'
    return { status: 'denied', approvedAmount: 0, reason, payBy: null }
  }

  if (input.decision !== 'approve' && input.decision !== 'partial') {
    return 'Choose approve, partially approve or deny.'
  }
  if (!isIsoDate(input.payBy)) return 'Choose a date to pay by.'
  if (input.payBy < today) return 'The pay-by date has already passed.'

  if (input.decision === 'approve') {
    return { status: 'approved', approvedAmount: total, reason, payBy: input.payBy }
  }

  const amount = Number(input.approvedAmount)
  if (!Number.isInteger(amount) || amount <= 0) return 'Enter the amount approved.'
  if (amount >= total) return 'A partial approval is less than the amount asked for.'
  if (!reason) return 'Say why the rest was not approved.'
  return { status: 'partial', approvedAmount: amount, reason, payBy: input.payBy }
}

/** Whether the accountant may still make a decision. */
export function canDecide(status: ReimbursementStatus): boolean {
  return status === 'submitted'
}

/** Whether there is money owed that has not been paid yet. */
export function isAwaitingPayment(status: ReimbursementStatus): boolean {
  return status === 'approved' || status === 'partial'
}

/** Where the task that tracks a request stands, from where the request stands. */
export function taskStatusFor(status: ReimbursementStatus): 'pending' | 'in_progress' | 'done' {
  if (status === 'submitted') return 'pending'
  if (status === 'approved' || status === 'partial') return 'in_progress'
  return 'done'
}

// ─── What people are told ─────────────────────────────────────────────────────

interface Named {
  submitterName: string
  accountantName: string
  eventTitle: string
}

export function submittedMessage(r: Named & { total: number }): string {
  return `${r.submitterName} asked to be reimbursed ${formatCents(r.total)} for ${r.eventTitle}.`
}

export function decisionMessage(r: Named & { total: number }, d: CleanDecision): string {
  if (d.status === 'denied') {
    return `Your reimbursement request for ${r.eventTitle} was denied. ${d.reason}`
  }
  const when = d.payBy ? ` You will be paid by ${formatDate(d.payBy)}.` : ''
  if (d.status === 'approved') {
    return `Your reimbursement of ${formatCents(d.approvedAmount)} for ${r.eventTitle} was approved.${when}`
  }
  return (
    `${formatCents(d.approvedAmount)} of your ${formatCents(r.total)} reimbursement for ` +
    `${r.eventTitle} was approved.${when} Why the rest was not: ${d.reason}`
  )
}

export function payDateRequestMessage(
  r: Named & { payBy: string },
  change: Pick<PayDateChange, 'proposed' | 'reason'>
): string {
  return (
    `${r.accountantName} asked to move your ${r.eventTitle} reimbursement from ` +
    `${formatDate(r.payBy)} to ${formatDate(change.proposed)}: ${change.reason} ` +
    'Open the task to accept or keep the current date.'
  )
}

export function payDateAnswerMessage(
  r: Named,
  change: Pick<PayDateChange, 'proposed'>,
  accepted: boolean
): string {
  return accepted
    ? `${r.submitterName} accepted moving the ${r.eventTitle} reimbursement to ${formatDate(change.proposed)}.`
    : `${r.submitterName} asked to keep the original pay-by date for the ${r.eventTitle} reimbursement.`
}

export function paidMessage(r: Named & { approvedAmount: number }): string {
  return `${r.accountantName} paid your ${formatCents(r.approvedAmount)} reimbursement for ${r.eventTitle}.`
}

// ─── Keeping receipts ─────────────────────────────────────────────────────────

/** Receipts and invoices are kept this long from when the request was made. */
export const RECEIPT_KEEP_YEARS = 2

/** The moment a request's files may be removed: two calendar years after it was made. */
export function receiptsKeptUntil(createdAt: number): number {
  const d = new Date(createdAt)
  d.setUTCFullYear(d.getUTCFullYear() + RECEIPT_KEEP_YEARS)
  return d.getTime()
}

/**
 * Whether a request's files are due to be removed.
 *
 * Only once it is closed — paid or denied. A request somehow still open after
 * two years keeps its receipts until it is settled: they are the evidence for
 * a payment not yet made.
 */
export function receiptsDue(
  r: { createdAt: number; status: ReimbursementStatus; receipts: string[] },
  now: number
): boolean {
  return (
    r.receipts.length > 0 &&
    (r.status === 'paid' || r.status === 'denied') &&
    now >= receiptsKeptUntil(r.createdAt)
  )
}
