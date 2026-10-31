import { create } from 'zustand'
import {
  collection,
  query,
  orderBy,
  limit,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  startAfter,
  where,
} from 'firebase/firestore'
import { onSnapshot, getDocs, getDoc } from '@/lib/liveFirestore'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { db } from '@/lib/firebase'
import { MESSAGES_PAGE_SIZE } from '@/lib/messages'
import { directWith, dmId } from '@/lib/rooms'
import type { Room, Message, MessageAttachment } from '@/types/events'

interface MessagesStore {
  rooms: Room[]
  /** Set when the rooms listener is rejected, so the UI can say so. */
  roomsError: string | null
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
  _refCount: number
  subscribe: (uid: string, admin?: boolean) => void
  unsubscribe: () => void
  /**
   * A conversation started by `creator`: with one other person, a direct
   * message — the one they have already, if so; with more, a group chat,
   * which needs a name. Its id.
   */
  startChat: (creator: string, others: string[], name?: string) => Promise<string>
  openRoom: (roomId: string | number) => void
  closeRoom: () => void
  loadMore: () => Promise<void>
  sendMessage: (text: string, attachment?: MessageAttachment | null) => Promise<void>
  markRead: (uid: string) => Promise<void>
}

export const useMessagesStore = create<MessagesStore>((set, get) => ({
  rooms: [],
  _refCount: 0,
  roomsError: null,
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

  subscribe: (uid) => {
    // Reference counted. Messages and Moderation are two subtabs of the same
    // Inbox tab and both want the room list, so moving between them subscribes
    // again before the screen being left unsubscribes — and an unconditional
    // teardown there closed the listener for the screen just opened, leaving
    // it with an empty room list and no way to notice.
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return
    if (!uid) {
      set({ _refCount: count - 1 })
      return
    }
    set({ loading: true, roomsError: null })

    // Only the conversations they are in — admins too: what is said in a
    // chat is for those in it (firestore.rules rooms). One reported to the
    // admins is reached from Moderation instead (stores/moderationStore).
    // Firestore refuses any query it cannot prove is safe, so the query
    // asks by membership, as the rule does.
    const q = query(collection(db, 'rooms'), where('members', 'array-contains', uid))

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rooms = snap.docs.map((d) => ({ ...(d.data() as Room), id: d.id }))
        set({ rooms, loading: false, roomsError: null })
      },
      (err) => {
        // Previously absent, so a denied query left `loading` stuck true and the
        // screen claiming the user was in no rooms at all.
        console.warn('rooms listener failed', err)
        set({ loading: false, roomsError: err.message })
      }
    )
    set({ _unsubRooms: unsub })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count > 0) return
    get()._unsubRooms?.()
    get()._unsubMessages?.()
    set({
      _unsubRooms: null,
      _unsubMessages: null,
      rooms: [],
      roomsError: null,
      messages: [],
      activeRoomId: null,
    })
  },

  startChat: async (creator, others, name = '') => {
    const people = [...new Set(others.map(String))].filter((p) => p && p !== String(creator))
    if (people.length === 0) throw new Error('Choose who to message.')
    const fresh = {
      call: false,
      reviewers: [],
      reported: false,
      createdBy: String(creator),
      updatedAt: serverTimestamp(),
    }
    if (people.length === 1) {
      const known = directWith(get().rooms, creator, people[0])
      if (known) return String(known.id)
      // Started by the other person, and not listed here yet: theirs. A room
      // that isn't there can't be read, so a refusal is "not there".
      const id = dmId(creator, people[0])
      const there = await getDoc(doc(db, 'rooms', id))
        .then((d) => d.exists())
        .catch(() => false)
      if (!there) {
        await setDoc(doc(db, 'rooms', id), {
          ...fresh,
          kind: 'dm',
          members: [String(creator), people[0]],
        })
      }
      return id
    }
    if (!name.trim()) throw new Error('A group chat needs a name.')
    const ref = await addDoc(collection(db, 'rooms'), {
      ...fresh,
      kind: 'group',
      name: name.trim(),
      members: [String(creator), ...people],
    })
    return ref.id
  },

  openRoom: (roomId) => {
    get()._unsubMessages?.()
    set({ activeRoomId: roomId, messages: [], msgLoading: true, hasMore: false, _oldestTs: null })

    const q = query(
      collection(db, 'rooms', String(roomId), 'messages'),
      orderBy('ts', 'desc'),
      limit(MESSAGES_PAGE_SIZE)
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs.map((d) => d.data() as Message).reverse()
        const hasMore = snap.docs.length >= MESSAGES_PAGE_SIZE
        const oldestTs = msgs.length > 0 ? msgs[0].ts : null
        set({ messages: msgs, msgLoading: false, hasMore, _oldestTs: oldestTs })
      },
      // Refused — a conversation they aren't in, or one whose report was
      // cleared: none shown, not the copy this device kept from before.
      () => set({ messages: [], msgLoading: false, hasMore: false, _oldestTs: null })
    )

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
