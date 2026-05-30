export type SecurityReportStatus = 'open' | 'responding' | 'resolved'

export interface SecurityReport {
  id: string | number
  description: string
  location: string
  witnesses: string
  photoURL: string | null
  reportedBy: string
  reporterName: string
  status: SecurityReportStatus
  responderId: string | null
  responderName: string | null
  resolution: string | null
  completedAt: number | null
  deleteAt: number | null
  createdAt: unknown
  updatedAt?: unknown
}
