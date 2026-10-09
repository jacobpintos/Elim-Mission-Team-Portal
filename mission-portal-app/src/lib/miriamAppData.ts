import type { Announcement, Room, Message } from '@/types/events'
import type { IssueReport, KaizenCard, PlanningBoard } from '@/types/operations'
import type { InventoryCategory, InventoryItem, ReorderItem } from '@/types/inventory'
import type { UserProfile } from '@/types/user'
import type { MusicItem } from '@/stores/musicStore'
import { notExpired } from './announcementImage'
import { isAdmin, isPublic } from './roles'

/**
 * What Miriam's app lookups hand back (features/miriam/appTools runs them):
 * the shaping and the finding, kept apart from the fetching so it can be
 * tested. Each takes only what this person's screen would show them.
 */

const SMALL = new Set(['the', 'a', 'an', 'of', 'and', 'for', 'in', 'on', 'to', 'my', 'is', 'from'])
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !SMALL.has(w))

/**
 * Whether text fits what was asked: any word asked for begins a word of it,
 * or the other way round ("serm" — "sermon", "sermons" — "sermon"). An empty
 * query fits everything. Loose on purpose: Claude reads what comes back.
 */
export function fits(text: string, query: string): boolean {
  const asked = words(query)
  if (asked.length === 0) return true
  const have = words(text)
  return asked.some((q) => have.some((w) => w.startsWith(q) || q.startsWith(w)))
}

const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

/** Content, newest first: what can be played, and its id to play it by. */
export function contentFound(items: MusicItem[], query: string, limit = 25) {
  return items
    .filter((m) =>
      fits([m.title, m.album, m.preacher, m.host, m.guest, m.type].filter(Boolean).join(' '), query)
    )
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.month ?? 0) - (a.month ?? 0))
    .slice(0, limit)
    .map((m) => ({
      id: m.id,
      kind: m.type,
      title: m.title,
      album: m.album || undefined,
      preacher: m.preacher || undefined,
      host: m.host || undefined,
      guest: m.guest || undefined,
      when: m.year
        ? m.month
          ? `${m.year}-${String(m.month).padStart(2, '0')}`
          : `${m.year}`
        : undefined,
    }))
}

/** The announcements this person's screen shows them (app/(app)/announce.tsx), newest first. */
export function announcementsShown(
  all: Announcement[],
  profile: UserProfile,
  today: string
): Announcement[] {
  const uid = String(profile.uid)
  const mine = isPublic(profile)
    ? all.filter((a) => a.isPublic)
    : isAdmin(profile)
      ? all
      : all.filter(
          (a) => !a.audience || a.audience.length === 0 || a.audience.some((x) => String(x) === uid)
        )
  const sorted = [...mine].sort((a, b) => b.ts - a.ts)
  return isAdmin(profile) ? sorted : notExpired(sorted, today)
}

export function announcementsFound(
  shown: Announcement[],
  names: ReadonlyMap<string, string>,
  query: string,
  limit = 12
) {
  return shown
    .filter((a) => fits(`${a.title} ${a.body}`, query))
    .slice(0, limit)
    .map((a) => ({
      title: a.title,
      text: a.body.length > 800 ? `${a.body.slice(0, 800)}…` : a.body,
      postedBy: names.get(String(a.by)) ?? 'someone',
      posted: when(a.ts),
      lastDay: a.expiresAt || undefined,
      hasAttachment: a.attachment ? a.attachment.type : undefined,
    }))
}

/** A conversation's name: its own, or else the other people in it. */
export function roomName(room: Room, uid: string, names: ReadonlyMap<string, string>): string {
  if (room.name?.trim()) return room.name
  const others = room.members.filter((m) => String(m) !== uid)
  return others.map((m) => names.get(String(m)) ?? 'someone').join(', ') || 'Just you'
}

/** The conversations that fit a name said: by their name, or a person in them. */
export function roomsFor(
  rooms: Room[],
  uid: string,
  names: ReadonlyMap<string, string>,
  said: string
): Room[] {
  return rooms.filter(
    (r) =>
      fits(roomName(r, uid, names), said) ||
      r.members.some((m) => String(m) !== uid && fits(names.get(String(m)) ?? '', said))
  )
}

export function messageLines(messages: Message[], uid: string, names: ReadonlyMap<string, string>) {
  return [...messages]
    .sort((a, b) => a.ts - b.ts)
    .map((m) => ({
      from: String(m.uid) === uid ? 'you' : (names.get(String(m.uid)) ?? 'someone'),
      sent: when(m.ts),
      text: m.text || (m.attachment ? `(${m.attachment.type})` : ''),
      readByYou: String(m.uid) === uid || !!m.readBy?.[uid],
    }))
}

export function issuesFound(
  issues: IssueReport[],
  names: ReadonlyMap<string, string>,
  query: string
) {
  return issues
    .filter((i) => fits(`${i.title} ${i.description} ${i.category}`, query))
    .slice(0, 25)
    .map((i) => ({
      title: i.title,
      status: i.status,
      category: i.category,
      description: i.description.slice(0, 400),
      reportedBy: names.get(String(i.reportedBy)) ?? 'someone',
      rootCause: i.rootCause || undefined,
      actions: (i.correctiveActions ?? []).length || undefined,
    }))
}

export function kaizenFound(
  cards: KaizenCard[],
  names: ReadonlyMap<string, string>,
  query: string
) {
  return cards
    .filter((c) => fits(`${c.title} ${c.description}`, query))
    .sort((a, b) => (b.upvotes?.length ?? 0) - (a.upvotes?.length ?? 0))
    .slice(0, 25)
    .map((c) => ({
      title: c.title,
      status: c.status,
      description: c.description.slice(0, 400),
      by: names.get(String(c.createdBy)) ?? 'someone',
      votes: c.upvotes?.length ?? 0,
    }))
}

export function planningFound(boards: PlanningBoard[], query: string) {
  return boards
    .filter((b) => fits(`${b.name} ${b.items.map((i) => i.content).join(' ')}`, query))
    .slice(0, 10)
    .map((b) => ({
      board: b.name,
      items: b.items
        .filter(
          (i) => ['note', 'goal', 'checklist', 'link', 'textbox'].includes(i.type) && i.content
        )
        .slice(0, 40)
        .map((i) => ({
          kind: i.type,
          text: i.content.slice(0, 200),
          done: i.type === 'checklist' || i.type === 'goal' ? !!i.completed : undefined,
          due: i.dueDate || undefined,
          link: i.url || undefined,
        })),
    }))
}

export function inventoryFound(
  categories: InventoryCategory[],
  items: InventoryItem[],
  reorder: ReorderItem[],
  query: string
) {
  const category = (id: InventoryItem['categoryId']) =>
    categories.find((c) => String(c.id) === String(id))?.name ?? 'Uncategorized'
  return {
    items: items
      .filter((i) => fits(`${i.name} ${category(i.categoryId)}`, query))
      .slice(0, 60)
      .map((i) => ({ name: i.name, category: category(i.categoryId), qty: i.qty, price: i.price })),
    toReorder: reorder
      .filter((r) => fits(r.name, query))
      .slice(0, 30)
      .map((r) => ({ name: r.name, price: r.price ?? undefined })),
  }
}

/** Their own settings, as the settings screen shows them. */
export function settingsShown(profile: UserProfile) {
  const prefs = (profile.notificationPrefs ?? {}) as unknown as Record<string, unknown>
  const notifications: Record<string, string> = {}
  for (const [k, v] of Object.entries(prefs)) {
    if (typeof v === 'boolean') notifications[k] = v ? 'on' : 'off'
    else if (v && typeof v === 'object') {
      const p = v as { push?: boolean; email?: boolean }
      notifications[k] = `push ${p.push ? 'on' : 'off'}, email ${p.email ? 'on' : 'off'}`
    }
  }
  return {
    name: profile.displayName,
    email: profile.email,
    title: profile.title || undefined,
    roles: profile.roles,
    nearbyEventsFrom: profile.locationPref
      ? `${profile.locationPref.city}, ${profile.locationPref.state} (within ${profile.locationPref.radius} miles)`
      : undefined,
    flightReminderHours: profile.flightReminderHours,
    notifications,
  }
}
