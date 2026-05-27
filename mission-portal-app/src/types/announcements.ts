import type { Attachment } from './shared'

// Phase 3 Announcement type
export interface Announcement {
  id: number // Firestore doc ID = String(id)
  title: string
  body: string
  isPublic: boolean // true = visible to public users in pubhome
  audience: string[] // uid list; empty = broadcast to ALL authenticated users
  attachment?: Attachment | null
  by: string // uid of creator
  ts: number
}
