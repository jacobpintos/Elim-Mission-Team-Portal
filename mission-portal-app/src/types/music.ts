export interface MusicItem {
  id: number // numeric, used for keying in the array
  type: 'music' | 'podcast' | 'sermon'
  title: string
  youtubeUrl: string // full YouTube URL
  thumbnail?: string // auto-derived: https://img.youtube.com/vi/{videoId}/mqdefault.jpg
  album?: string // album, series, or podcast name
  year?: string // e.g. '2024'
  featured?: boolean // show in Featured row
  isNew?: boolean // show in 🔥 New row while newUntil > now
  newDays?: number // how many days from save to keep "new" badge (default 30)
  newUntil?: string // ISO date string (computed: now + newDays)
}

export interface MusicDoc {
  items: MusicItem[]
}
