export interface PhotoItem {
  url: string
  /**
   * A small copy for the grid, when the app stored the photo itself.
   *
   * Absent on a photo added by pasting an address, and on anything added
   * before uploading existed — the grid falls back to `url` in both cases.
   */
  thumbUrl?: string
  caption?: string
}

export interface PhotoAlbum {
  id: string
  title: string
  coverImageUrl: string
  city: string
  state: string
  date: string // e.g. "March 2024" or "Jan 2024 - Mar 2024"
  description?: string
  photos: PhotoItem[]
  category: 'general' | 'baptisms'
  createdAt: number
}
