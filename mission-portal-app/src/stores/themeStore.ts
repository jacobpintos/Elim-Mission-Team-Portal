import { create } from 'zustand'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { defaults } from '@/theme/defaults'
import { autoTextColor } from '@/theme/contrast'
import type { ThemeDoc } from '@/types/theme'

type Mode = 'dark' | 'light'

interface ThemeStore {
  theme: ThemeDoc
  mode: Mode
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
  setMode: (mode: Mode) => void
  publishTheme: (patch: Partial<ThemeDoc>, uid: string) => Promise<void>
  setLogo: (blob: Blob, contentType: string, uid: string) => Promise<void>
  revertLogo: (uid: string) => Promise<void>
  onPrimary: () => string
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: defaults,
  mode: 'dark',
  loading: true,
  _unsub: null,

  subscribe: () => {
    if (get()._unsub) return
    const unsub = onSnapshot(doc(db, 'appSettings', 'theme'), (snap) => {
      const data = (snap.data() as ThemeDoc | undefined) ?? defaults
      set({ theme: data, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null })
  },

  setMode: (mode) => set({ mode }),

  publishTheme: async (patch, uid) => {
    await setDoc(
      doc(db, 'appSettings', 'theme'),
      { ...patch, updatedAt: serverTimestamp(), updatedBy: uid },
      { merge: true }
    )
  },

  setLogo: async (blob, contentType, uid) => {
    const theme = get().theme

    // Clean up expired backup from storage silently
    if (theme.logoBackup && theme.logoBackup.expiresAt < Date.now()) {
      try { await deleteObject(storageRef(storage, theme.logoBackup.path)) } catch {}
    }

    const path = `logos/logo_${Date.now()}`
    const sref = storageRef(storage, path)
    // uploadString cannot be used here: it decodes to a Uint8Array and hands
    // that to the Blob constructor, which React Native rejects.
    await uploadBytes(sref, blob, { contentType })
    const url = await getDownloadURL(sref)

    const backup =
      theme.logoUrl && theme.logoPath
        ? {
            url: theme.logoUrl,
            path: theme.logoPath,
            expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          }
        : null

    await setDoc(
      doc(db, 'appSettings', 'theme'),
      { logoUrl: url, logoPath: path, logoBackup: backup, updatedAt: serverTimestamp(), updatedBy: uid },
      { merge: true }
    )
  },

  revertLogo: async (uid) => {
    const theme = get().theme
    if (!theme.logoBackup) return

    // Delete the recently-uploaded logo being reverted away from
    if (theme.logoPath) {
      try { await deleteObject(storageRef(storage, theme.logoPath)) } catch {}
    }

    await setDoc(
      doc(db, 'appSettings', 'theme'),
      {
        logoUrl: theme.logoBackup.url,
        logoPath: theme.logoBackup.path,
        logoBackup: null,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      },
      { merge: true }
    )
  },

  onPrimary: () => {
    const t = get().theme
    return t.onPrimaryOverride ?? autoTextColor(t.primary)
  },
}))
