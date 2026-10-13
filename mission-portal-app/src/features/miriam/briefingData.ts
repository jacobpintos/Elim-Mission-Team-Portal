import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { getDoc, getDocs } from '@/lib/liveFirestore'
import { isAdmin, isGuest, isWorship } from '@/lib/roles'
import { announcementsShown, roomName } from '@/lib/miriamAppData'
import { buildBriefing, type AttentionItem, type Briefing, type FoodNudge } from '@/lib/briefing'
import { fetchWeather } from '@/lib/weather'
import { miriamHref } from '@/lib/miriam'
import { useAuthStore } from '@/stores/authStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useUsersStore } from '@/stores/usersStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useRemindersStore } from '@/stores/remindersStore'
import {
  assignedTo,
  canSeeEvent,
  effectiveResponse,
  instancesOf,
  shiftDate,
  type AvailResponse,
  type EventInstance,
  type EventTemplate,
  type Group,
} from '../../../functions/src/miriam/data'
import type { Announcement, Message, Room } from '@/types/events'
import type { SetList } from '@/types/worship'

/**
 * The daily briefing's data, gathered on the device as the person signed in
 * (lib/briefing puts it together): what is already loaded, and a few reads —
 * new announcements, unread messages, and for admins and the worship team,
 * what needs them. Each part on its own: one that can't be read is left out,
 * never the briefing.
 */

/** "New" in the briefing: since this long ago. */
const NEW_MS = 36 * 60 * 60 * 1000
/** Waited for a store to load, at most. */
const LOAD_WAIT_MS = 3000
/** A forecast waited for, at most. */
const WEATHER_WAIT_MS = 2500

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const within = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([
    p.catch(() => fallback),
    new Promise<T>((done) => setTimeout(() => done(fallback), ms)),
  ])
const quietly = async <T>(read: () => Promise<T>, fallback: T) => {
  try {
    return await read()
  } catch {
    return fallback
  }
}
const millis = (v: unknown): number => {
  if (typeof v === 'number') return v
  const t = v as { toMillis?: () => number; seconds?: number } | null
  if (t?.toMillis) return t.toMillis()
  if (typeof t?.seconds === 'number') return t.seconds * 1000
  return 0
}

/** A store's first load, waited for a moment; what it has by then is used. */
async function loaded(ready: () => boolean) {
  const until = Date.now() + LOAD_WAIT_MS
  while (!ready() && Date.now() < until) await new Promise((r) => setTimeout(r, 100))
}

export async function gatherBriefing(): Promise<Briefing | null> {
  const profile = useAuthStore.getState().profile
  if (!profile) return null
  const uid = String(profile.uid)
  const viewer = { uid, roles: profile.roles ?? [] }
  const now = new Date()
  const day = today()

  await Promise.all([
    loaded(() => useEventsStore.getState().templates.length > 0),
    loaded(() => !useTasksStore.getState().loading),
    loaded(() => useRemindersStore.getState().loaded),
  ])
  const { templates, overrides } = useEventsStore.getState()
  const groups = useGroupsStore.getState().groups as unknown as Group[]
  const names = new Map(useUsersStore.getState().users.map((u) => [String(u.uid), u.displayName]))
  const events = templates as unknown as EventTemplate[]
  const evOverrides = overrides as unknown as Record<string, Partial<EventTemplate>>

  // Guests are along for the trip, not asked to bring food (firestore.rules).
  const asked = !(isGuest(profile) && !isAdmin(profile))
  const [announcements, unread, attention, weather, food] = await Promise.all([
    quietly(async () => {
      const all = (await getDocs(collection(db, 'announcements'))).docs.map(
        (d) => ({ ...(d.data() as Announcement), id: d.id }) as Announcement
      )
      return announcementsShown(all, profile, day)
        .filter((a) => now.getTime() - a.ts < NEW_MS)
        .map((a) => ({ id: String(a.id), title: a.title, ts: a.ts }))
    }, []),
    quietly(() => unreadFor(uid, names), []),
    quietly(
      () =>
        attentionFor(
          isAdmin(profile),
          isWorship(profile),
          events,
          evOverrides,
          groups,
          viewer,
          day
        ),
      []
    ),
    quietly(() => forecasts(events, evOverrides, groups, viewer, day), {}),
    asked ? quietly(() => foodOpen(events, evOverrides, groups, uid, day), []) : [],
  ])

  return buildBriefing({
    now,
    firstName: (profile.displayName ?? '').split(' ')[0],
    viewer,
    groups,
    names,
    templates: events,
    overrides: evOverrides,
    tasks: useTasksStore.getState().tasks.map((t) => ({
      id: String(t.id),
      title: t.title,
      status: t.status,
      dueDate: t.projectedDate || t.dueDate,
      assignees: t.assignees,
    })),
    reminders: useRemindersStore.getState().reminders,
    announcements,
    unread,
    attention,
    weather,
    food,
  })
}

/** Unread messages in their conversations active this past week: by conversation. */
async function unreadFor(uid: string, names: Map<string, string>) {
  const rooms = (
    await getDocs(query(collection(db, 'rooms'), where('members', 'array-contains', uid)))
  ).docs.map((d) => ({ ...(d.data() as Room), id: d.id }))
  const recent = rooms.filter((r) => Date.now() - millis(r.updatedAt) < 7 * 86_400_000).slice(0, 15)
  const counts = await Promise.all(
    recent.map(async (room) => {
      const msgs = (
        await getDocs(
          query(
            collection(db, 'rooms', String(room.id), 'messages'),
            orderBy('ts', 'desc'),
            limit(20)
          )
        )
      ).docs.map((d) => d.data() as Message)
      const count = msgs.filter((m) => String(m.uid) !== uid && !m.readBy?.[uid]).length
      return { name: roomName(room, uid, names), count }
    })
  )
  return counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count)
}

/** Today's forecast for their events today that have a place. */
async function forecasts(
  templates: EventTemplate[],
  overrides: Record<string, Partial<EventTemplate>>,
  groups: Group[],
  viewer: { uid: string; roles: string[] },
  day: string
) {
  const todays = templates
    .filter((t) => canSeeEvent(t, viewer, groups))
    .flatMap((t) => instancesOf(t, day, day, overrides))
    .filter((ev) => !ev.isVirtual && typeof ev._geocodeLat === 'number')
    .slice(0, 4)
  const out: Record<string, { high: number; label: string }> = {}
  await Promise.all(
    todays.map(async (ev) => {
      const w = await within(
        fetchWeather(ev._geocodeLat as number, ev._geocodeLng as number, ev.date),
        WEATHER_WAIT_MS,
        null
      )
      if (w) out[ev.instanceKey] = { high: w.high, label: w.label }
    })
  )
  return out
}

/** What needs an admin, or the worship team, this week. */
async function attentionFor(
  admin: boolean,
  worship: boolean,
  templates: EventTemplate[],
  overrides: Record<string, Partial<EventTemplate>>,
  groups: Group[],
  viewer: { uid: string; roles: string[] },
  day: string
): Promise<AttentionItem[]> {
  if (!admin && !worship) return []
  const weekOut = shiftDate(day, 7)
  const upcoming = templates
    .filter((t) => canSeeEvent(t, viewer, groups))
    .flatMap((t) => instancesOf(t, day, weekOut, overrides))
    .sort((a, b) => a.date.localeCompare(b.date))
  const items: AttentionItem[] = []

  if (admin) {
    // Who hasn't answered availability, for the next few events this week.
    const unanswered = await Promise.all(upcoming.slice(0, 4).map((ev) => noAnswer(ev, groups)))
    upcoming.slice(0, 4).forEach((ev, i) => {
      const uids = unanswered[i]
      if (!uids.length) return
      const when = new Date(`${ev.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
      items.push({
        kind: 'availability',
        title: `${uids.length} ${uids.length === 1 ? 'hasn’t' : 'haven’t'} answered`,
        sub: `${ev.title} · ${ev.date === day ? 'today' : when}`,
        href: miriamHref({ kind: 'event', key: ev.instanceKey, section: 'availability' }),
        spoken: `${uids.length} ${uids.length === 1 ? 'person hasn’t' : 'people haven’t'} answered for ${ev.title}`,
        remind: { uids, eventTitle: ev.title, eventDate: ev.date, eventKey: ev.instanceKey },
      })
    })

    // Issues and ideas new these past days.
    const since = Date.now() - 3 * 86_400_000
    const [issues, ideas] = await Promise.all([
      quietly(
        async () =>
          (
            await getDocs(query(collection(db, 'issues'), where('status', '==', 'pending_review')))
          ).docs
            .map((d) => ({ id: d.id, ...(d.data() as { title?: string; createdAt?: unknown }) }))
            .filter((x) => millis(x.createdAt) > since),
        [] as { id: string; title?: string; createdAt?: unknown }[]
      ),
      quietly(
        async () =>
          (await getDocs(query(collection(db, 'kaizen'), where('status', '==', 'idea')))).docs
            .map((d) => ({ id: d.id, ...(d.data() as { title?: string; createdAt?: unknown }) }))
            .filter((x) => millis(x.createdAt) > since),
        [] as { id: string; title?: string; createdAt?: unknown }[]
      ),
    ])
    for (const issue of issues.slice(0, 2)) {
      items.push({
        kind: 'issue',
        title: `New issue: ${issue.title ?? 'untitled'}`,
        sub: 'Operations · waiting for review',
        href: `/issues/${encodeURIComponent(issue.id)}`,
        spoken: `a new issue, ${issue.title ?? 'untitled'}`,
      })
    }
    if (ideas.length) {
      items.push({
        kind: 'kaizen',
        title:
          ideas.length === 1
            ? `New kaizen idea: ${ideas[0].title ?? ''}`
            : `${ideas.length} new kaizen ideas`,
        sub: 'Operations · Kaizen',
        href: '/issues/kaizen',
        spoken: ideas.length === 1 ? 'a new kaizen idea' : `${ideas.length} new kaizen ideas`,
      })
    }
  }

  // Set lists this week with songs that have no chord sheet.
  const lists = await quietly(
    async () =>
      (await getDocs(collection(db, 'setLists'))).docs
        .map((d) => ({ ...(d.data() as SetList), id: d.id }))
        .filter((l) => !!l.eventDate && l.eventDate >= day && l.eventDate <= weekOut),
    [] as SetList[]
  )
  for (const list of lists.slice(0, 3)) {
    const missing = (list.songs ?? []).filter((s) => s.name && s.chordSheetId == null)
    if (!missing.length) continue
    items.push({
      kind: 'setlist',
      title:
        missing.length === 1
          ? `${missing[0].name} has no chord sheet`
          : `${missing.length} songs have no chord sheet`,
      sub: `${list.title} · ${(list.songs ?? []).length} songs`,
      href: '/worship',
      spoken:
        missing.length === 1
          ? `${missing[0].name} has no chord sheet on ${list.title}`
          : `${missing.length} songs on ${list.title} have no chord sheet`,
    })
  }
  return items
}

/** Their answer for an event's date — or, for a repeating one, for the series — if they gave one. */
export async function answered(ev: EventInstance, uid: string): Promise<AvailResponse | null> {
  const read = async (key: string) =>
    ((await getDoc(doc(db, 'avail', key))).data()?.responses ?? {}) as Record<string, AvailResponse>
  const [instance, series] = await Promise.all([
    quietly(() => read(ev.instanceKey.replace(/\//g, '_')), {}),
    ev.isRec ? quietly(() => read(`${String(ev.templateId).replace(/\//g, '_')}_series`), {}) : {},
  ])
  return effectiveResponse(ev, uid, instance, series)
}

/** Those on an event who haven't answered its availability, by uid. */
async function noAnswer(ev: EventInstance, groups: Group[]): Promise<string[]> {
  const read = async (key: string) =>
    ((await getDoc(doc(db, 'avail', key))).data()?.responses ?? {}) as Record<string, AvailResponse>
  const [instance, series] = await Promise.all([
    quietly(() => read(ev.instanceKey.replace(/\//g, '_')), {}),
    ev.isRec ? quietly(() => read(`${String(ev.templateId).replace(/\//g, '_')}_series`), {}) : {},
  ])
  return [...assignedTo(ev, groups)].filter((u) => !effectiveResponse(ev, u, instance, series))
}

/** Those who haven't answered, asked to: a push each (functions: availabilityNudge). */
export async function remindToAnswer(item: NonNullable<AttentionItem['remind']>) {
  const send = httpsCallable(functions, 'sendNotification')
  const date = new Date(`${item.eventDate}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
  await Promise.all(
    item.uids.map((uid) =>
      send({
        uid,
        type: 'availabilityNudge',
        data: {
          eventTitle: item.eventTitle,
          eventDate: date,
          link: miriamHref({ kind: 'event', key: item.eventKey, section: 'availability' }),
        },
      }).catch(() => {})
    )
  )
}

/** Food sign-ups looked at, a week ahead. */
const FOOD_DAYS = 7

/**
 * Their events this week with a food sign-up still open, where they haven't
 * signed up for anything: each with what is open, and one of those picked at
 * random to suggest.
 */
async function foodOpen(
  templates: EventTemplate[],
  overrides: Record<string, Partial<EventTemplate>>,
  groups: Group[],
  uid: string,
  day: string
): Promise<FoodNudge[]> {
  const theirs = templates
    .flatMap((t) => instancesOf(t, day, shiftDate(day, FOOD_DAYS), overrides))
    .filter((ev) => ev.food && (ev.foodItems ?? []).length > 0 && assignedTo(ev, groups).has(uid))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4)
  const found = await Promise.all(
    theirs.map(async (ev): Promise<FoodNudge | null> => {
      // One that can't be read is left out: never suggested to someone who may have signed up.
      const signups = await quietly(
        async () =>
          ((await getDoc(doc(db, 'foodSignups', `${ev.templateId}_${ev.date}`))).data()?.signups ??
            {}) as Record<string, { uid?: string }>,
        null
      )
      if (!signups) return null
      if (Object.values(signups).some((s) => String(s?.uid) === uid)) return null
      // Said they can't come: not asked to bring anything.
      if ((await answered(ev, uid))?.status === 'no') return null
      const open = (ev.foodItems ?? []).filter((item, i) => item && !signups[String(i)])
      if (open.length === 0) return null
      return {
        eventKey: ev.instanceKey,
        title: ev.title,
        date: ev.date,
        open,
        suggestion: open[Math.floor(Math.random() * open.length)],
      }
    })
  )
  return found.filter((f): f is FoodNudge => !!f)
}
