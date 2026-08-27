import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { PhotoAlbum, PhotoItem } from '@/types/photos'

interface PhotoAlbumsStore {
  albums: PhotoAlbum[]
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
  createAlbum: (data: Omit<PhotoAlbum, 'id' | 'createdAt'>) => Promise<string>
  updateAlbum: (id: string, patch: Partial<Omit<PhotoAlbum, 'id'>>) => Promise<void>
  deleteAlbum: (id: string) => Promise<void>
  addPhoto: (albumId: string, photo: PhotoItem) => Promise<void>
  addPhotos: (albumId: string, photos: PhotoItem[]) => Promise<void>
  removePhoto: (albumId: string, photo: PhotoItem) => Promise<void>
}

export const usePhotoAlbumsStore = create<PhotoAlbumsStore>((set, get) => ({
  albums: [],
  loading: false,
  _unsub: null,

  subscribe: () => {
    if (get()._unsub) return
    set({ loading: true })
    const unsub = onSnapshot(
      collection(db, 'photoAlbums'),
      (snap) => {
        const albums = snap.docs
          .map((d) => ({ ...(d.data() as Omit<PhotoAlbum, 'id'>), id: d.id }))
          .sort((a, b) => b.createdAt - a.createdAt)
        set({ albums, loading: false })
      },
      () => set({ loading: false })
    )
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null, albums: [] })
  },

  createAlbum: async (data) => {
    const ref = await addDoc(collection(db, 'photoAlbums'), {
      ...data,
      photos: data.photos ?? [],
      createdAt: Date.now(),
    })
    return ref.id
  },

  updateAlbum: async (id, patch) => {
    await updateDoc(doc(db, 'photoAlbums', id), patch)
  },

  deleteAlbum: async (id) => {
    await deleteDoc(doc(db, 'photoAlbums', id))
  },

  addPhoto: async (albumId, photo) => {
    await updateDoc(doc(db, 'photoAlbums', albumId), {
      photos: arrayUnion(photo),
    })
  },

  /**
   * Add several photos in one write.
   *
   * Calling addPhoto in a loop is a document rewrite per photo, and Firestore
   * sustains about one write a second to a single document — so fifty photos
   * became a minute of watching a spinner, with the whole growing array sent
   * back each time.
   */
  addPhotos: async (albumId, photos) => {
    if (photos.length === 0) return
    await updateDoc(doc(db, 'photoAlbums', albumId), {
      photos: arrayUnion(...photos),
    })
  },

  removePhoto: async (albumId, photo) => {
    await updateDoc(doc(db, 'photoAlbums', albumId), {
      photos: arrayRemove(photo),
    })
  },
}))
