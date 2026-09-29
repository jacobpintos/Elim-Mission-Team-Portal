export interface SetListSong {
  id: string
  name: string
  key: string
  link: string
  notes: string
  chordSheetId?: string | number | null
  /** Download URL of an uploaded reference track, played inside the app. */
  audioUrl?: string
  /** What the file was called when it was picked, shown next to the player. */
  audioName?: string
  /**
   * Where the file lives in Storage.
   *
   * Kept alongside the URL because deleting needs the object path, and a
   * download URL is not one. Everything that removes audio — replacing a
   * track, dropping a song, deleting the whole set list — reads this.
   */
  audioPath?: string
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
