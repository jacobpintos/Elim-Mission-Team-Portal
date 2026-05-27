// Shared types used across Phase 3 features

export interface Attachment {
  name: string
  url: string // Firebase Storage download URL
  type: string // MIME type, e.g. 'image/jpeg', 'application/pdf'
}
