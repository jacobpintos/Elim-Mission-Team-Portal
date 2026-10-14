/**
 * A request to be paid back for something bought for an event.
 *
 * Written only by the callables in functions/src/reimbursements; the shape
 * here mirrors what they store. Money is in whole cents.
 */
export type ReimbursementStatus = 'submitted' | 'approved' | 'partial' | 'denied' | 'paid'

export interface ReimbursementItem {
  description: string
  /** Whole cents. */
  amount: number
}

export interface PayDateChange {
  /** The date the Accountant asked to pay by instead, YYYY-MM-DD. */
  proposed: string
  reason: string
  requestedAt: number
}

export interface ReimbursementHistoryEntry {
  at: number
  by: string
  text: string
}

export interface Reimbursement {
  id: string
  submitterUid: string
  submitterName: string
  accountantUid: string
  accountantName: string
  eventId: string
  eventTitle: string
  eventDate: string | null
  items: ReimbursementItem[]
  total: number
  /** Storage paths, under reimbursements/{submitterUid}/. */
  receipts: string[]
  note: string
  status: ReimbursementStatus
  /** What was approved, in cents; null until a decision. */
  approvedAmount: number | null
  /** Why it was denied, or why the rest was not approved. */
  reason: string
  /** YYYY-MM-DD, set when it is approved. */
  payBy: string | null
  /** A new pay-by date the Accountant asked for, waiting on the person who asked. */
  dateChange: PayDateChange | null
  taskId: number
  createdAt: number
  history?: ReimbursementHistoryEntry[]
}
