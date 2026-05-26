import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  startAfter,
} from 'firebase/firestore'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { db } from '@/lib/firebase'
import { MESSAGES_PAGE_SIZE } from '@/lib/messages'
import type { Room, Message, MessageAttachment } from '@/types/events'

interface MessagesStore {
  rooms: Room[]
  activeRoomId: string | number | null
  messages: Message[]
  loading: boolean
  msgLoading: boolean
  hasMore: boolean
  _unsubRooms: (() => void) | null
  _unsubMessages: (() => void) | null
  _oldestTs: number | null
  // selectors
  unreadCount: (uid: string) => number
  roomById: (id: string | number) => Room | undefined
  // actions
  subscribe: () => void
  unsubscribe: () => void
  openRoom: (roomId: string | number) => void
  closeRoom: () => void
  loadMore: () => Promise<void>
  sendMessage: (text: string, attachment?: MessageAttachment | null) => Promise<void>
  markRead: (uid: string) => Promise<void>
}

export const useMessagesStore = create<MessagesStore>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  messages: [],
  loading: false,
  msgLoading: false,
  hasMore: false,
  _unsubRooms: null,
  _unsubMessages: null,
  _oldestTs: null,

  unreadCount: (uid) => {
    const { messages, activeRoomId } = get()
    // Count messages in active room sent by others that user hasn't read
    if (!activeRoomId) return 0
    return messages.filter((m) => !sameId(m.uid, uid) && !m.readBy?.[uid]).length
  },

  roomById: (id) => get().rooms.find((r) => sameId(r.id, id)),

  subscribe: () => {
    if (get()._unsubRooms) return
    set({ loading: true })
    const unsub = onSnapshot(collection(db, 'rooms'), (snap) => {
      const rooms = snap.docs.map((d) => ({ ...(d.data() as Room), id: d.id }))
      set({ rooms, loading: false })
    })
    set({ _unsubRooms: unsub })
  },

  unsubscribe: () => {
    get()._unsubRooms?.()
    get()._unsubMessages?.()
    set({ _unsubRooms: null, _unsubMessages: null, rooms: [], messages: [], activeRoomId: null })
  },

  openRoom: (roomId) => {
    get()._unsubMessages?.()
    set({ activeRoomId: roomId, messages: [], msgLoading: true, hasMore: false, _oldestTs: null })

    const q = query(
      collection(db, 'rooms', String(roomId), 'messages'),
      orderBy('ts', 'desc'),
      limit(MESSAGES_PAGE_SIZE)
    )

    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => d.data() as Message).reverse()
      const hasMore = snap.docs.length >= MESSAGES_PAGE_SIZE
      const oldestTs = msgs.length > 0 ? msgs[0].ts : null
      set({ messages: msgs, msgLoading: false, hasMore, _oldestTs: oldestTs })
    })

    set({ _unsubMessages: unsub })

    // Persist last-opened timestamp
    AsyncStorage.setItem(`room_opened_${String(roomId)}`, String(Date.now())).catch(() => {})
  },

  closeRoom: () => {
    get()._unsubMessages?.()
    set({ _unsubMessages: null, activeRoomId: null, messages: [], hasMore: false, _oldestTs: null })
  },

  loadMore: async () => {
    const { activeRoomId, _oldestTs } = get()
    if (!activeRoomId || !_oldestTs) return
    set({ msgLoading: true })
    const q = query(
      collection(db, 'rooms', String(activeRoomId), 'messages'),
      orderBy('ts', 'desc'),
      startAfter(_oldestTs),
      limit(MESSAGES_PAGE_SIZE)
    )
    const snap = await getDocs(q)
    const older = snap.docs.map((d) => d.data() as Message).reverse()
    const hasMore = snap.docs.length >= MESSAGES_PAGE_SIZE
    set((s) => ({
      messages: [...older, ...s.messages],
      msgLoading: false,
      hasMore,
      _oldestTs: older.length > 0 ? older[0].ts : s._oldestTs,
    }))
  },

  sendMessage: async (_text, _attachment = null) => {
    // uid comes from authStore — caller should use sendMessageAs(roomId, uid, text, attachment) instead
    throw new Error('sendMessage: call sendMessageAs(uid, text, attachment) instead')
  },

  markRead: async (uid) => {
    const { activeRoomId, messages } = get()
    if (!activeRoomId) return
    const unread = messages.filter((m) => !sameId(m.uid, uid) && !m.readBy?.[uid])
    await Promise.all(
      unread.map((m) => {
        const msgId = `${m.ts}_${m.uid}`
        return updateDoc(doc(db, 'rooms', String(activeRoomId), 'messages', msgId), {
          [`readBy.${uid}`]: true,
        })
      })
    )
  },
}))

// Standalone send so we can pass uid from authStore
export async function sendMessageAs(
  roomId: string | number,
  uid: string,
  text: string,
  attachment: MessageAttachment | null = null
): Promise<void> {
  const ts = Date.now()
  const msgId = `${ts}_${uid}`
  const msgRef = doc(db, 'rooms', String(roomId), 'messages', msgId)
  await setDoc(msgRef, {
    uid,
    text: text.trim(),
    attachment,
    ts,
    readBy: { [uid]: true },
  } satisfies Message)
  // Update room updatedAt
  await updateDoc(doc(db, 'rooms', String(roomId)), {
    updatedAt: serverTimestamp(),
  })
}

function sameId(a: unknown, b: unknown): boolean {
  return String(a) === String(b)
}
