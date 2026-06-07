export interface PhotoItem {
  url: string
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
