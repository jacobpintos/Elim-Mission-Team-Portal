export interface SetListSong {
  id: string
  name: string
  key: string
  link: string
  notes: string
  chordSheetId?: string | number | null
}

export interface SetList {
  id: string | number
  title: string
  eventTemplateId?: string | number | null
  eventDate?: string | null
  songs: SetListSong[]
  createdBy: string | number
  createdAt: unknown
  updatedAt?: unknown
}
