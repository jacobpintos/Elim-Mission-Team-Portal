import { create } from 'zustand'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { PostsConfig, Post, PostPage, PostComment } from '@/types/events'

interface PostsStore {
  config: PostsConfig
  loading: boolean
  refreshConfig: () => Promise<void>
  addPost: (pageId: string, post: Post) => Promise<void>
  deletePost: (pageId: string, postId: string) => Promise<void>
  likePost: (pageId: string, postId: string, uid: string) => Promise<void>
  addComment: (pageId: string, postId: string, comment: PostComment) => Promise<void>
  addPage: (page: PostPage) => Promise<void>
  updatePage: (pageId: string, patch: Partial<PostPage>) => Promise<void>
  deletePage: (pageId: string) => Promise<void>
  /** @internal */
  _mutate: (updater: (pages: PostPage[]) => PostPage[]) => Promise<void>
}

export const usePostsStore = create<PostsStore>((set, get) => ({
  config: { pages: [] },
  loading: false,

  refreshConfig: async () => {
    set({ loading: true })
    const snap = await getDoc(doc(db, 'config', 'main'))
    const config = (snap.data()?.postsConfig as PostsConfig | undefined) ?? { pages: [] }
    set({ config, loading: false })
  },

  _mutate: async (updater: (pages: PostPage[]) => PostPage[]) => {
    const snap = await getDoc(doc(db, 'config', 'main'))
    const current = (snap.data()?.postsConfig as PostsConfig | undefined) ?? { pages: [] }
    const pages = updater([...current.pages])
    await updateDoc(doc(db, 'config', 'main'), { postsConfig: { ...current, pages } })
    set({ config: { ...current, pages } })
  },

  addPost: async (pageId, post) => {
    await get()._mutate((pages) => {
      const idx = pages.findIndex((p) => p.id === pageId)
      if (idx < 0) return pages
      pages[idx] = { ...pages[idx], posts: [post, ...pages[idx].posts] }
      return pages
    })
  },

  deletePost: async (pageId, postId) => {
    await get()._mutate((pages) => {
      const idx = pages.findIndex((p) => p.id === pageId)
      if (idx < 0) return pages
      pages[idx] = { ...pages[idx], posts: pages[idx].posts.filter((p) => p.id !== postId) }
      return pages
    })
  },

  likePost: async (pageId, postId, uid) => {
    // Optimistic
    set((s) => {
      const pages = s.config.pages.map((p) => {
        if (p.id !== pageId) return p
        return {
          ...p,
          posts: p.posts.map((post) => {
            if (post.id !== postId) return post
            const likes = { ...(post.likes ?? {}) }
            if (likes[uid]) {
              delete likes[uid]
            } else {
              likes[uid] = true
            }
            return { ...post, likes }
          }),
        }
      })
      return { config: { ...s.config, pages } }
    })
    // Persist
    await get()._mutate((pages) => {
      const idx = pages.findIndex((p) => p.id === pageId)
      if (idx < 0) return pages
      const posts = pages[idx].posts.map((post) => {
        if (post.id !== postId) return post
        const likes = { ...(post.likes ?? {}) }
        if (likes[uid]) delete likes[uid]
        else likes[uid] = true
        return { ...post, likes }
      })
      pages[idx] = { ...pages[idx], posts }
      return pages
    })
  },

  addComment: async (pageId, postId, comment) => {
    await get()._mutate((pages) => {
      const idx = pages.findIndex((p) => p.id === pageId)
      if (idx < 0) return pages
      const posts = pages[idx].posts.map((post) => {
        if (post.id !== postId) return post
        return { ...post, comments: [...(post.comments ?? []), comment] }
      })
      pages[idx] = { ...pages[idx], posts }
      return pages
    })
  },

  addPage: async (page) => {
    await get()._mutate((pages) => [...pages, page])
  },

  updatePage: async (pageId, patch) => {
    await get()._mutate((pages) => pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)))
  },

  deletePage: async (pageId) => {
    await get()._mutate((pages) => pages.filter((p) => p.id !== pageId))
  },
}))
