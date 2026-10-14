import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDocs } from '@/lib/liveFirestore'
import {
  canUseMessages,
  isAdmin,
  isGuest,
  isPublicFollower,
  isWorship,
  visibleTabs,
} from '@/lib/roles'
import { localToday, todayStr } from '@/lib/events'
import { canKeepDateNotes, isDay, notesBetween } from '@/lib/dateNotes'
import { useDateNotesStore } from '@/stores/dateNotesStore'
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
  setListsFound,
  settingsShown,
} from '@/lib/miriamAppData'
import { useEventsStore } from '@/stores/eventsStore'
import type { SetList } from '@/types/worship'
import type { MeetingRequest } from '@/types/meeting'
import { tourFor, tourNames } from '@/features/tour/flows'
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
  | 'app_guide'
  | 'read_set_lists'
  | 'read_meeting_requests'
  | 'read_date_notes'
  // Changes: offered as these are, made only once confirmed (./actions.ts).
  | 'send_message'
  | 'post_announcement'
  | 'set_task_status'
  | 'set_availability'
  | 'sign_up_food'
  | 'change_notification'
  | 'create_user'
  | 'update_user'
  | 'reset_user_password'
  | 'delete_user'
  | 'create_group'
  | 'update_group'
  | 'delete_group'
  | 'create_team'
  | 'update_team'
  | 'delete_team'
  | 'delete_task_template'
  | 'create_task_template'
  | 'create_tasks'
  | 'update_task'
  | 'delete_task'
  | 'set_carpool'
  | 'report_issue'
  | 'submit_kaizen'
  | 'vote_kaizen'
  | 'add_to_set_list'
  | 'create_set_list'
  | 'create_reminder'
  | 'report_security'
  | 'delete_event'
  | 'set_availability_range'
  | 'edit_set_list'
  | 'notify_set_list'
  | 'start_chat'
  | 'post_livestream'
  | 'take_down_livestream'
  | 'meeting_request'
  | 'change_my_name'
  | 'add_date_note'
  | 'remove_date_note'

/** Admins' changes: offered to admins only (./actions.ts checks again). */
const ADMIN_ACTIONS: AppToolName[] = [
  'create_user',
  'update_user',
  'reset_user_password',
  'delete_user',
  'create_group',
  'update_group',
  'delete_group',
  'create_team',
  'update_team',
  'delete_team',
  'delete_task_template',
  'create_task_template',
  'create_tasks',
  'update_task',
  'delete_task',
  'set_carpool',
  'delete_event',
  'start_chat',
  'post_livestream',
  'take_down_livestream',
]

/** The lookups — and changes — this person's screens allow. */
export function appToolsFor(profile: UserProfile | null): AppToolName[] {
  if (!profile) return []
  const tabs = visibleTabs(profile)
  const tools: AppToolName[] = ['read_settings', 'app_guide']
  if (tabs.includes('music')) tools.push('find_content')
  if (tabs.includes('announce')) tools.push('read_announcements')
  // A public follower looks things up — and changes nothing (the meeting form
  // is filled in for them to send themselves: MiriamButton).
  if (isPublicFollower(profile)) return tools
  if (canUseMessages(profile)) tools.push('read_messages')
  if (tabs.includes('issues')) tools.push('read_operations')
  // The same people the screens let make each change.
  const admin = isAdmin(profile)
  const guest = isGuest(profile) && !admin
  if (canUseMessages(profile)) tools.push('send_message')
  if (admin) tools.push('post_announcement', ...ADMIN_ACTIONS)
  if (tabs.includes('assignments') && !guest) tools.push('set_task_status')
  if (tabs.includes('events')) tools.push('set_availability')
  if (tabs.includes('events') && !guest) tools.push('sign_up_food')
  if (tabs.includes('settings')) tools.push('change_notification')
  // Reminders are their own, for anyone with tasks (the Tasks tab shows them).
  if (tabs.includes('assignments')) tools.push('create_reminder')
  // Operations: anyone there may report an issue or put forward an idea — not a guest, who only reads.
  if (tabs.includes('issues') && !guest) tools.push('report_issue', 'submit_kaizen', 'vote_kaizen')
  // Set lists: read where Worship is; built by the worship team and admins (firestore.rules).
  if (tabs.includes('worship')) tools.push('read_set_lists')
  if (isWorship(profile))
    tools.push('add_to_set_list', 'create_set_list', 'edit_set_list', 'notify_set_list')
  // A concern for security: anyone, as the drawer's Report a Concern is.
  tools.push('report_security')
  if (tabs.includes('events')) tools.push('set_availability_range')
  // Meeting requests are sent to leaders by name; anyone but a guest may be one.
  if (!guest) tools.push('read_meeting_requests', 'meeting_request')
  if (tabs.includes('settings')) tools.push('change_my_name')
  // Notes on days of their own calendar: anyone but a public account (lib/dateNotes).
  if (canKeepDateNotes(profile)) tools.push('read_date_notes', 'add_date_note', 'remove_date_note')
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

/**
 * How to use a part of the app, as this person can: the steps of its tour
 * (features/tour), only those their role sees — what the tour shows, as text.
 */
function guideFor(profile: UserProfile, tab: string) {
  const tour = tourFor(tab, profile)
  if (!tour) {
    return {
      note: `There is no ${tab} for this person. They can be shown: ${tourNames(profile).join(', ')}.`,
    }
  }
  return {
    tour: tour.title,
    steps: tour.steps
      .filter((s) => s.id !== 'welcome')
      .map((s) => ({ title: s.title, about: s.body, ...(s.bullets ? { points: s.bullets } : {}) })),
  }
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
    } else if (name === 'read_settings') {
      result = settingsShown(profile)
    } else if (name === 'app_guide') {
      result = guideFor(profile, String(input.tab ?? ''))
    } else if (name === 'read_meeting_requests') {
      const snap = await getDocs(
        query(
          collection(db, 'meetingRequests'),
          where('leaders', 'array-contains', String(profile.uid))
        )
      )
      const requests = snap.docs
        .map((d) => ({ ...(d.data() as MeetingRequest), id: d.id }))
        .filter((r) => r.status !== 'handled')
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10)
        .map((r) => ({
          id: r.id,
          from: r.fromName,
          message: r.message.slice(0, 400),
          free: r.availability || undefined,
          asked: new Date(r.createdAt).toISOString().slice(0, 10),
          answering: r.claimedByName || undefined,
        }))
      result = requests.length
        ? { requests }
        : { requests: [], note: 'No open meeting requests for them.' }
    } else if (name === 'read_date_notes') {
      // Their own, as loaded with her panel open (MiriamButton); else read now.
      const store = useDateNotesStore.getState()
      const reading = !store.loaded
      if (reading) {
        store.subscribe(String(profile.uid))
        const until = Date.now() + 3000
        while (!useDateNotesStore.getState().loaded && Date.now() < until) {
          await new Promise((r) => setTimeout(r, 100))
        }
      }
      const today = localToday()
      const from = isDay(input.from) ? input.from : today
      const to = isDay(input.to) ? input.to : from
      const notes = notesBetween(useDateNotesStore.getState().notes, from, to)
        .slice(0, 50)
        .map((n) => ({ id: n.id, date: n.date, text: n.text }))
      if (reading) store.unsubscribe()
      result = notes.length ? { notes } : { notes: [], note: 'No notes of theirs on those days.' }
    } else if (name === 'read_set_lists') {
      const lists = await all<SetList>('setLists')
      const templates = useEventsStore.getState().templates
      const eventTitle = (l: SetList) =>
        templates.find((t) => String(t.id) === String(l.eventTemplateId ?? ''))?.title ?? ''
      const date = typeof input.date === 'string' ? input.date : ''
      const found = setListsFound(lists, eventTitle, q, date, todayStr())
      result = found.length ? { setLists: found } : { setLists: [], note: 'No set list fits that.' }
    } else {
      // A change is never run from here: it is confirmed first (./actions.ts).
      result = { error: 'That is not a lookup.' }
    }
    return JSON.stringify(result)
  } catch {
    return JSON.stringify({ error: 'That could not be looked up just now.' })
  }
}
