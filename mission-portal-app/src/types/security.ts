import type { Attachment } from './shared'

export interface AckNote {
  note: string
  attachment?: Attachment | null
  by: string // uid of responder
  ts: number
}

export interface SecurityReport {
  id: number // Firestore doc ID (string) = String(id)
  reporter: string // uid of submitter
  type: string // 'Safety Concern' | 'Medical Emergency' | 'Suspicious Activity' | 'Property Damage' | 'Child Safety' | 'Other'
  loc: string // location description
  desc: string // incident description
  witness?: string // optional witness name/description
  attachment?: Attachment | null
  ts: number // Date.now() at submission
  ack: boolean // true = acknowledged / cleared
  ackNotes?: AckNote[]
}

export const REPORT_TYPES = [
  'Safety Concern',
  'Medical Emergency',
  'Suspicious Activity',
  'Property Damage',
  'Child Safety',
  'Other',
] as const
