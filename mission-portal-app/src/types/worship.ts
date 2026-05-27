export interface SetlistSong {
  song: string // song title (or episode title for podcasts)
  key?: string // music key: 'G', 'Bb', 'C#m', etc.
  link?: string // URL (YouTube, Spotify, etc.)
  notes?: string
}

export interface Setlist {
  id: number // Firestore doc ID = String(id)
  date: string // 'YYYY-MM-DD' (must be today or future — expired are pruned)
  eventId?: number | null // optional link to events/{id}
  songs: SetlistSong[]
  published: boolean // true = visible to all worship/admin users
}

export interface InputRow {
  input: string // channel label (e.g. "Lead Vocal", "Guitar L")
  output: string // destination (e.g. "FOH Ch 1", "IEM Mix 2")
}

export interface InputListsDoc {
  lists: {
    sunday: InputRow[] // 44 rows
    event: InputRow[] // 44 rows
    wh2: InputRow[] // 32 rows
  }
}

export const INPUT_LIST_SIZES = { sunday: 44, event: 44, wh2: 32 } as const
export type InputListKey = keyof typeof INPUT_LIST_SIZES
