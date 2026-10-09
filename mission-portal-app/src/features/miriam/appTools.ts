import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDocs } from '@/lib/liveFirestore'
import { canUseMessages, isAdmin, visibleTabs } from '@/lib/roles'
import { todayStr } from '@/lib/events'
import {
  announcementsFound,
  announcementsShown,
  contentFound,
  inventoryFound,
  issuesFound,
  kaizenFound,
  messageLines,
  planningFound,
  roomName,
  roomsFor,
  settingsShown,
} from '@/lib/miriamAppData'
import { useAuthStore } from '@/stores/authStore'
import { useUsersStore } from '@/stores/usersStore'
import { useMusicStore } from '@/stores/musicStore'
import type { UserProfile } from '@/types/user'
import type { Announcement, Message, Room } from '@/types/events'
import type { IssueReport, KaizenCard, PlanningBoard } from '@/types/operations'
import type { InventoryCategory, InventoryItem, ReorderItem } from '@/types/inventory'

/**
 * Miriam's lookups that run here, in the app, as the person signed in
 * (functions/src/miriam/plan.ts: APP_TOOLS): read with their own access, so
 * the database's rules decide what comes back, as they do for the screens —
 * and offered only where this person has the screen it comes from.
 */
export type AppToolName =
  | 'find_content'
  | 'read_announcements'
  | 'read_messages'
  | 'read_operations'
  | 'read_settings'

/** The lookups this person's screens allow. */
export function appToolsFor(profile: UserProfile | null): AppToolName[] {
  if (!profile) return []
  const tabs = visibleTabs(profile)
  const tools: AppToolName[] = ['read_settings']
  if (tabs.includes('music')) tools.push('find_content')
  if (tabs.includes('announce')) tools.push('read_announcements')
  if (canUseMessages(profile)) tools.push('read_messages')
  if (tabs.includes('issues')) tools.push('read_operations')
  return tools
}

const all = async <T>(name: string): Promise<T[]> =>
  (await getDocs(collection(db, name))).docs.map((d) => ({ ...(d.data() as T), id: d.id }))

function names(): Map<string, string> {
  return new Map(useUsersStore.getState().users.map((u) => [String(u.uid), u.displayName]))
}

async function readMessages(profile: UserProfile, said: string) {
  const uid = String(profile.uid)
  const who = names()
  // Their own conversations — an admin's too, not every room they could open.
  const rooms = (
    await getDocs(query(collection(db, 'rooms'), where('members', 'array-contains', uid)))
  ).docs.map((d) => ({ ...(d.data() as Room), id: d.id }))
  const latest = async (room: Room, n: number) =>
    (
      await getDocs(
        query(collection(db, 'rooms', String(room.id), 'messages'), orderBy('ts', 'desc'), limit(n))
      )
    ).docs.map((d) => d.data() as Message)

  if (said.trim()) {
    const found = roomsFor(rooms, uid, who, said).slice(0, 3)
    if (found.length === 0) return { found: [], note: 'No conversation of theirs is called that.' }
    return {
      found: await Promise.all(
        found.map(async (r) => ({
          conversation: roomName(r, uid, who),
          messages: messageLines(await latest(r, 15), uid, who),
        }))
      ),
    }
  }
  const recent = await Promise.all(
    rooms.slice(0, 25).map(async (r) => {
      const [last] = messageLines(await latest(r, 1), uid, who)
      return { conversation: roomName(r, uid, who), last }
    })
  )
  return {
    conversations: recent
      .filter((r) => r.last)
      .sort(
        (a, b) =>
          Number(a.last!.readByYou) - Number(b.last!.readByYou) ||
          b.last!.sent.localeCompare(a.last!.sent)
      ),
  }
}

async function readOperations(profile: UserProfile, area: string, q: string) {
  const who = names()
  // Planning and inventory are admins' tabs (app/(app)/issues/_layout.tsx).
  if ((area === 'planning' || area === 'inventory') && !isAdmin(profile)) {
    return { note: 'Only admins can see that.' }
  }
  if (area === 'issues') return { issues: issuesFound(await all<IssueReport>('issues'), who, q) }
  if (area === 'kaizen') return { kaizen: kaizenFound(await all<KaizenCard>('kaizen'), who, q) }
  if (area === 'planning')
    return { boards: planningFound(await all<PlanningBoard>('planningBoards'), q) }
  if (area === 'inventory') {
    const [categories, items, reorder] = await Promise.all([
      all<InventoryCategory>('inventoryCategories'),
      all<InventoryItem>('inventoryItems'),
      all<ReorderItem>('reorderItems'),
    ])
    return inventoryFound(categories, items, reorder, q)
  }
  return { error: 'No such part of Operations.' }
}

/** One lookup, run: what it found, as text for Claude. Never throws. */
export async function runAppTool(name: string, input: Record<string, unknown>): Promise<string> {
  const profile = useAuthStore.getState().profile
  if (!profile || !appToolsFor(profile).includes(name as AppToolName)) {
    return JSON.stringify({ error: 'That is not something this person can look at.' })
  }
  const q = typeof input.query === 'string' ? input.query : ''
  try {
    let result: unknown
    if (name === 'find_content') {
      const music = useMusicStore.getState()
      if (music.items.length === 0) await music.load()
      const found = contentFound(useMusicStore.getState().items, q)
      result = found.length ? { found } : { found: [], note: 'Nothing in Content fits that.' }
    } else if (name === 'read_announcements') {
      const shown = announcementsShown(
        await all<Announcement>('announcements'),
        profile,
        todayStr()
      )
      result = { announcements: announcementsFound(shown, names(), q) }
    } else if (name === 'read_messages') {
      result = await readMessages(profile, String(input.conversation ?? ''))
    } else if (name === 'read_operations') {
      result = await readOperations(profile, String(input.area ?? ''), q)
    } else {
      result = settingsShown(profile)
    }
    return JSON.stringify(result)
  } catch {
    return JSON.stringify({ error: 'That could not be looked up just now.' })
  }
}
