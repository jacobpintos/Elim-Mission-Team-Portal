export interface ThemeDoc {
  primary: string // e.g. "#e8624a"
  primaryDark: string // computed or admin-set
  accent: string // computed or admin-set
  dark: {
    background: string
    surface: string
    text: string
    textMuted: string
    border: string
  }
  light: {
    background: string
    surface: string
    text: string
    textMuted: string
    border: string
  }
  // Admin override; if null, derived from luminance
  onPrimaryOverride: string | null
  updatedAt: number
  updatedBy: string
  logoUrl?: string
  logoPath?: string
  logoBackup?: {
    url: string
    path: string
    expiresAt: number
  } | null
}
