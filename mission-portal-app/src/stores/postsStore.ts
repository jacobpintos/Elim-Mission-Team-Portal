// Phase 3 Posts store — Facebook link aggregator
import { create } from 'zustand'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Post, PostPage, PostsConfig } from '@/types/posts'

let _seenTimer: ReturnType<typeof setTimeout> | null = null
let _pendingSeen: Record<string, string> = {}

interface PostsStore {
  pages: PostPage[]
  lastSeen: Record<string, string> // pageId → 'YYYY-MM-DD'
  loading: boolean

  loadPosts: () => Promise<void>
  markPageSeen: (pageId: string, latestDate: string) => Promise<void>
  hasUnseenPost: (pageId: string) => boolean

  addPage: (page: Omit<PostPage, 'id' | 'posts'>) => Promise<void>
  updatePage: (pageId: string, patch: Partial<PostPage>) => Promise<void>
  deletePage: (pageId: string) => Promise<void>
  addPost: (pageId: string, post: Omit<Post, 'id'>) => Promise<void>
  deletePost: (pageId: string, postId: string) => Promise<void>

  _mutate: (updater: (pages: PostPage[]) => PostPage[]) => Promise<void>
}

export const usePostsStore = create<PostsStore>((set, get) => ({
  pages: [],
  lastSeen: {},
  loading: false,

  loadPosts: async () => {
    set({ loading: true })
    const snap = await getDoc(doc(db, 'config', 'main'))
    const data = snap.data() ?? {}
    const postsConfig = (data.postsConfig as PostsConfig | undefined) ?? { pages: [] }
    const lastSeen = (data.lastSeenPosts as Record<string, string> | undefined) ?? {}
    set({ pages: postsConfig.pages, lastSeen, loading: false })
  },

  markPageSeen: async (pageId, latestDate) => {
    set((s) => ({ lastSeen: { ...s.lastSeen, [pageId]: latestDate } }))
    _pendingSeen[pageId] = latestDate
    if (_seenTimer) clearTimeout(_seenTimer)
    _seenTimer = setTimeout(async () => {
      const snapshot = _pendingSeen
      _pendingSeen = {}
      try {
        const updates: Record<string, string> = {}
        for (const [pid, date] of Object.entries(snapshot)) {
          updates[`lastSeenPosts.${pid}`] = date
        }
        await updateDoc(doc(db, 'config', 'main'), updates)
      } catch { /* non-fatal */ }
    }, 1000)
  },

  hasUnseenPost: (pageId) => {
    const { pages, lastSeen } = get()
    const page = pages.find((p) => p.id === pageId)
    if (!page || page.posts.length === 0) return false
    return page.posts.some((p) => p.date > (lastSeen[pageId] ?? ''))
  },

  _mutate: async (updater) => {
    const snap = await getDoc(doc(db, 'config', 'main'))
    const current = (snap.data()?.postsConfig as PostsConfig | undefined) ?? { pages: [] }
    const pages = updater([...current.pages])
    await updateDoc(doc(db, 'config', 'main'), { postsConfig: { pages } })
    set({ pages })
  },

  addPage: async (pageData) => {
    const id = `page_${Date.now()}`
    const page: PostPage = { id, posts: [], ...pageData }
    await get()._mutate((pages) => [...pages, page])
  },

  updatePage: async (pageId, patch) => {
    await get()._mutate((pages) => pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)))
  },

  deletePage: async (pageId) => {
    await get()._mutate((pages) => pages.filter((p) => p.id !== pageId))
  },

  addPost: async (pageId, postData) => {
    const id = `post_${Date.now()}`
    const post: Post = { id, ...postData }
    await get()._mutate((pages) =>
      pages.map((p) => {
        if (p.id !== pageId) return p
        const posts = [post, ...p.posts].sort((a, b) => b.date.localeCompare(a.date))
        return { ...p, posts }
      })
    )
  },

  deletePost: async (pageId, postId) => {
    await get()._mutate((pages) =>
      pages.map((p) => {
        if (p.id !== pageId) return p
        return { ...p, posts: p.posts.filter((post) => post.id !== postId) }
      })
    )
  },
}))
