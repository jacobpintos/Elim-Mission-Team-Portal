/**
 * The Accountant's view of the money: every cost tallied by event, and what
 * needs them today.
 *
 * Pure, so the arithmetic can be tested. Built from the requests sent to the
 * signed-in Accountant (reimbursementsStore), which the rules let nobody else
 * read — so the tally is theirs alone without anything here deciding that.
 */
import type { Reimbursement } from '@/types/reimbursement'
import { formatCents } from '@/lib/money'
import { FD } from '@/lib/format'

export const KIND_COLORS = {
  /** Someone on the team, paid back. */
  internal: '#16a085',
  /** An outside bill: a rental, a venue, a supplier. */
  external: '#8e44ad',
} as const

export type ReimbursementKind = keyof typeof KIND_COLORS

export const kindOf = (r: Pick<Reimbursement, 'kind'>): ReimbursementKind =>
  r.kind === 'external' ? 'external' : 'internal'

export interface Tally {
  /** Asked for and not yet decided. */
  awaitingDecision: number
  /** Approved, in whole or in part, including what has since been paid. */
  approved: number
  /** Approved and not yet paid. */
  owed: number
  paid: number
  /** Asked for and turned down — kept so the event's full asks are visible. */
  denied: number
  internal: number
  external: number
  count: number
}

export interface EventTally extends Tally {
  eventId: string
  eventTitle: string
  eventDate: string | null
  requests: Reimbursement[]
}

const empty = (): Tally => ({
  awaitingDecision: 0,
  approved: 0,
  owed: 0,
  paid: 0,
  denied: 0,
  internal: 0,
  external: 0,
  count: 0,
})

function add(t: Tally, r: Reimbursement) {
  const approved = r.approvedAmount ?? 0
  t.count++
  if (r.status === 'submitted') t.awaitingDecision += r.total
  if (r.status === 'approved' || r.status === 'partial') {
    t.approved += approved
    t.owed += approved
  }
  if (r.status === 'paid') {
    t.approved += approved
    t.paid += approved
  }
  if (r.status === 'denied') t.denied += r.total
  // What the event costs, by kind: approved where decided, asked where not.
  const cost = r.status === 'submitted' ? r.total : r.status === 'denied' ? 0 : approved
  t[kindOf(r)] += cost
}

export function tally(requests: Reimbursement[]): Tally {
  const t = empty()
  requests.forEach((r) => add(t, r))
  return t
}

/** Every event's costs, the most recent event first. */
export function tallyByEvent(requests: Reimbursement[]): EventTally[] {
  const byEvent = new Map<string, EventTally>()
  for (const r of requests) {
    let e = byEvent.get(r.eventId)
    if (!e) {
      e = {
        ...empty(),
        eventId: r.eventId,
        eventTitle: r.eventTitle,
        eventDate: r.eventDate,
        requests: [],
      }
      byEvent.set(r.eventId, e)
    }
    add(e, r)
    e.requests.push(r)
  }
  return [...byEvent.values()].sort((a, b) => (b.eventDate ?? '').localeCompare(a.eventDate ?? ''))
}

export interface AccountantAttention {
  kind: 'decide' | 'overdue' | 'week'
  title: string
  sub: string
  spoken: string
}

/**
 * What the Accountant's briefing says about money: requests waiting for a
 * decision, payments past their date, and payments due in the coming week.
 */
export function accountantAttention(
  requests: Reimbursement[],
  today: string,
  weekEnd: string
): AccountantAttention[] {
  const items: AccountantAttention[] = []
  const toDecide = requests.filter((r) => r.status === 'submitted')
  const unpaid = requests.filter(
    (r) => (r.status === 'approved' || r.status === 'partial') && !!r.payBy
  )
  const overdue = unpaid.filter((r) => (r.payBy as string) < today)
  const week = unpaid.filter((r) => (r.payBy as string) >= today && (r.payBy as string) <= weekEnd)
  const sum = (rs: Reimbursement[], f: (r: Reimbursement) => number) =>
    formatCents(rs.reduce((n, r) => n + f(r), 0))
  const who = (rs: Reimbursement[]) =>
    rs
      .slice(0, 3)
      .map((r) => r.payee || r.submitterName)
      .join(', ')

  if (toDecide.length) {
    items.push({
      kind: 'decide',
      title:
        toDecide.length === 1
          ? `Reimbursement to decide: ${toDecide[0].submitterName}`
          : `${toDecide.length} reimbursements to decide`,
      sub: `${sum(toDecide, (r) => r.total)} asked · ${who(toDecide)}`,
      spoken:
        toDecide.length === 1
          ? `a reimbursement request from ${toDecide[0].submitterName} to decide`
          : `${toDecide.length} reimbursement requests to decide`,
    })
  }
  if (overdue.length) {
    items.push({
      kind: 'overdue',
      title:
        overdue.length === 1
          ? `Payment overdue: ${who(overdue)}`
          : `${overdue.length} payments overdue`,
      sub: `${sum(overdue, (r) => r.approvedAmount ?? 0)} · ${who(overdue)}`,
      spoken:
        overdue.length === 1
          ? `a payment to ${who(overdue)} is overdue`
          : `${overdue.length} payments are overdue`,
    })
  }
  if (week.length) {
    items.push({
      kind: 'week',
      title:
        week.length === 1
          ? `Payment due this week: ${who(week)}`
          : `${week.length} payments due this week`,
      sub: `${sum(week, (r) => r.approvedAmount ?? 0)} · ${who(week)}`,
      spoken:
        week.length === 1
          ? `a payment to ${who(week)} is due this week`
          : `${week.length} payments are due this week`,
    })
  }
  return items
}

/** A line of a briefing about one request, opening its task. */
export interface MoneyLine {
  title: string
  sub: string
  spoken: string
  taskId: number
}

/**
 * What a daily briefing tells of reimbursements besides the Accountant's
 * to-dos (accountantAttention).
 *
 * To the one who asked: a decision on their request or its payment, made
 * since `since` — and a change of pay date asked of them, until they answer.
 * To the Accountant: an answer to a change of date they asked for, given
 * since `since`.
 */
export function moneyBriefing(
  requests: Reimbursement[],
  uid: string,
  since: number
): { attention: MoneyLine[]; news: MoneyLine[] } {
  const attention: MoneyLine[] = []
  const news: MoneyLine[] = []
  const at = (n: unknown) => (typeof n === 'number' ? n : 0)
  for (const r of requests) {
    const line = (title: string, sub: string, spoken: string): MoneyLine => ({
      title,
      sub,
      spoken,
      taskId: r.taskId,
    })
    const approved = formatCents(r.approvedAmount ?? r.total)
    const unpaid = r.status === 'approved' || r.status === 'partial'
    if (r.submitterUid === uid && kindOf(r) === 'internal') {
      if (unpaid && r.dateChange) {
        attention.push(
          line(
            `New pay date to answer: ${r.eventTitle}`,
            `${r.accountantName} asked to move it from ${FD(r.payBy)} to ${FD(r.dateChange.proposed)}`,
            `${r.accountantName} asked to move your ${r.eventTitle} reimbursement to ${FD(r.dateChange.proposed)}`
          )
        )
      }
      if (r.status === 'paid' && at(r.paidAt) >= since) {
        news.push(
          line(
            `Reimbursement paid: ${approved}`,
            `${r.eventTitle} · from ${r.accountantName}`,
            `your ${approved} reimbursement for ${r.eventTitle} was paid`
          )
        )
      } else if (at(r.decidedAt) >= since) {
        if (r.status === 'approved') {
          news.push(
            line(
              `Reimbursement approved: ${approved}`,
              `${r.eventTitle} · to be paid by ${FD(r.payBy)}`,
              `your ${approved} reimbursement for ${r.eventTitle} was approved, to be paid by ${FD(r.payBy)}`
            )
          )
        } else if (r.status === 'partial') {
          news.push(
            line(
              `Reimbursement partly approved: ${approved} of ${formatCents(r.total)}`,
              `${r.eventTitle} · ${r.reason}`,
              `${approved} of your ${formatCents(r.total)} reimbursement for ${r.eventTitle} was approved, to be paid by ${FD(r.payBy)}`
            )
          )
        } else if (r.status === 'denied') {
          news.push(
            line(
              `Reimbursement denied: ${formatCents(r.total)}`,
              `${r.eventTitle} · ${r.reason}`,
              `your ${formatCents(r.total)} reimbursement for ${r.eventTitle} was denied`
            )
          )
        }
      }
    }
    const answer = r.dateAnswer
    if (r.accountantUid === uid && answer && at(answer.at) >= since) {
      news.push(
        answer.accepted
          ? line(
              `New pay date accepted: ${r.submitterName}`,
              `${r.eventTitle} · now due ${FD(answer.proposed)}`,
              `${r.submitterName} accepted paying their ${r.eventTitle} reimbursement on ${FD(answer.proposed)}`
            )
          : line(
              `Pay date kept: ${r.submitterName}`,
              `${r.eventTitle} · asked ${FD(answer.proposed)}, still due ${FD(r.payBy)}`,
              `${r.submitterName} kept the pay date for their ${r.eventTitle} reimbursement, ${FD(r.payBy)}`
            )
      )
    }
  }
  return { attention, news }
}

/** The day a cost counts on: its event's date, or the day it was asked for. */
export function costDate(r: Pick<Reimbursement, 'eventDate' | 'createdAt'>): string {
  return r.eventDate ?? new Date(r.createdAt).toISOString().slice(0, 10)
}

export interface FinanceFilter {
  /** Words from an event's name; empty matches every event. */
  query: string
  /** YYYY-MM-DD, inclusive; empty for no bound. */
  from: string
  to: string
}

/**
 * The requests Finance reports on: those whose event's name holds every word
 * searched for, dated within the range chosen.
 */
export function filterForFinance(requests: Reimbursement[], f: FinanceFilter): Reimbursement[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean)
  return requests.filter((r) => {
    const title = r.eventTitle.toLowerCase()
    if (!words.every((w) => title.includes(w))) return false
    const day = costDate(r)
    if (f.from && day < f.from) return false
    if (f.to && day > f.to) return false
    return true
  })
}
