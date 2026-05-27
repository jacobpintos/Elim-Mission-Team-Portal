# Phase 2 — Daily-Use Core (Implementation Brief)

> **Read this entire document before writing any code.** Read
> `docs/migration/OVERVIEW.md` first for architectural context. The
> architecture is locked — if something here seems wrong, ask the user
> before changing it.
>
> **Phase 1 must be fully signed off before starting Phase 2.** Every
> component you build in Phase 2 must use Tamagui theme tokens (no
> hardcoded colors), Zustand stores from `src/stores/`, and the
> `src/components/ui/` primitives built in Phase 1.

---

## What Phase 2 Covers

Seven screens (plus supporting modals and shared components):

1. **Dashboard** — admin-only; event health, alerts, notifications
2. **Home** — non-admin authenticated users; my events, my tasks, announcements
3. **Public Home** — public-role users; events near me, public announcements
4. **Events** — monthly calendar, event detail, create/edit (admin), RSVP,
   ICS export
5. **Assignments** — task list for current user, grouped by status/event
6. **Messages** — room list, real-time thread view, send message, load history
7. **Posts** — page tabs, post feed with unseen badge, admin build mode

Supporting Cloud Function work: `sendNotification` called on assignment
create, message send, and event RSVP confirmation.

---

## 1. Existing Firestore Schema (match exactly — data is live)

The existing app writes these collections. The new app reads/writes the
**same documents and fields**. Do not rename collections or add required
fields without a migration.

### `events/{id}` (called `S.templates` in the old app)

```ts
interface EventTemplate {
  id: string | number            // numeric in existing data (e.g. 1, 2)
  title: string
  date?: string                  // 'YYYY-MM-DD' — set on non-recurring or overrides
  isRec: boolean                 // is recurring
  recur?: 'weekly' | 'biweekly' | 'monthly'
  recDay?: number                // 0=Sunday … 6=Saturday
  recEnd?: string | null         // 'YYYY-MM-DD' end date for recurrence, null = forever
  location?: string
  city?: string
  state?: string
  address?: string
  isVirtual?: boolean
  signUpLink?: string
  startTime?: string             // '10:00 AM'
  rtp?: string                   // report time production
  rtm?: string                   // report time mission
  dcw?: string                   // dress code (women)
  dcm?: string                   // dress code (men)
  users?: (string | number)[]    // assigned user IDs
  food?: boolean
  carpool?: boolean
  foodItems?: string[]
  carpoolLoc?: string
  vehicles?: any[]
  teams?: EventTeam[]
  isPublic?: boolean             // visible on Public Home
  taskTemplateId?: string        // links to taskTemplates/{id}
  extraDays?: ExtraDay[]         // additional dates for multi-day events
  overrides?: Record<string, Partial<EventTemplate>>  // keyed by instanceKey
  _geocodeLat?: number
  _geocodeLng?: number
  _updatedAt?: any               // Firestore server timestamp (written by db layer)
}

interface EventTeam {
  name: string
  leaders: (string | number)[]
  members: (string | number)[]
}

interface ExtraDay {
  date: string          // 'YYYY-MM-DD'
  startTime?: string
  location?: string
}
```

### Event instance (generated in memory — never stored as its own doc)

```ts
interface EventInstance extends EventTemplate {
  date: string            // resolved date for this instance
  instanceKey: string     // `${templateId}_${date}` e.g. '1_2026-04-06'
  templateId: string | number
  _dayIndex?: number      // 0 for main day, 1+ for extra days
  _dayLabel?: string      // 'Day 1', 'Day 2', …
  _isExtraDay?: boolean
}
```

### `avail/{instanceKey}` (RSVP / availability)

Document ID = instanceKey (e.g. `'1_2026-04-06'`).

```ts
interface AvailDoc {
  responses: Record<string, AvailResponse>  // keyed by uid
  updatedAt: any
}

interface AvailResponse {
  status: 'yes' | 'no' | 'partial' | 'tbd'
  note: string
  uid: string
  ts: number
}
```

Write individual user responses with:

```ts
updateDoc(doc(db, 'avail', instanceKey), {
  [`responses.${uid}`]: { status, note, uid, ts: Date.now() },
  updatedAt: serverTimestamp()
})
```

### `tasks/{id}`

```ts
interface Task {
  id: string | number
  assignees: (string | number)[]
  lead: string | number | null
  by: string | number                    // creator uid
  title: string
  status: 'pending' | 'done' | 'behind'
  evId?: string | number | null          // linked event template id
  evDate?: string | null
  evTemplateId?: string | number | null  // same as evId, newer field name
  dueDate?: string | null                // 'YYYY-MM-DD'
  projectedDate?: string | null
  overdueNotified?: boolean
  _updatedAt?: any
}
```

### `rooms/{id}` and subcollection `rooms/{id}/messages/{msgId}`

```ts
interface Room {
  id: string | number
  name: string
  members: (string | number)[]
  call: boolean
  reviewers: (string | number)[]
  updatedAt?: any
}

interface Message {
  uid: string | number
  text: string
  attachment: MessageAttachment | null
  ts: number                   // ms since epoch — also used as part of doc ID
  readBy: Record<string, boolean>
}

interface MessageAttachment {
  type: 'image' | 'file'
  url: string
  name?: string
  size?: number
}
```

Message doc ID = `${ts}_${uid}` (e.g. `'1714000000000_abc123'`).
To load/send, use the helpers in `src/lib/messages.ts` (see §5).

### `announcements/{id}`

```ts
interface Announcement {
  id: string | number
  title: string
  body: string
  isPublic: boolean           // if true, visible on Public Home
  audience: (string | number)[]  // empty array = all users; specific UIDs = targeted
  attachment: AnnouncementAttachment | null
  by: string | number         // creator uid
  ts: number
}
```

### `config/main`

```ts
interface ConfigMain {
  calY: number
  calM: number                // 1-indexed (1=January)
  COMMON_TEAMS: string[]
  connectConfig: { socialLinks: any[]; leadershipTeam: any[] }
  publicPages: Record<string, PublicPage>
  postsConfig: PostsConfig
  lastSeenPosts: Record<string, number>  // `${uid}_${pageId}` → timestamp ms
  nEv: number
  nTask: number
  nGroup: number
  nRoom: number
  nReport: number
  nNotif: number
  updatedAt: any
}

interface PostsConfig {
  pages: PostPage[]
}

interface PostPage {
  id: string
  label: string
  bgImage?: string
  fbUrl?: string
  desc?: string
  posts: Post[]
}

interface Post {
  id: string
  ts: number
  author: string | number
  body: string
  images?: string[]
  likes?: Record<string, boolean>
  comments?: PostComment[]
}

interface PostComment {
  id: string
  uid: string | number
  body: string
  ts: number
}
```

### `notifs/{uid}`

```ts
interface NotifDoc {
  items: InAppNotif[]
  updatedAt?: any
}

interface InAppNotif {
  id: string
  msg: string
  ts: number
  type: string    // 'assign' | 'announce' | 'message' | etc.
  read: boolean
  link?: string   // optional deep link
}
```

---

## 2. Critical Logic to Port: `getInstances` / `allInstances`

This is the most important function in Phase 2. It generates event instances
from recurring templates. Port it exactly as a pure TypeScript function.

**Create `src/lib/events.ts`:**

```ts
import type { EventTemplate, EventInstance } from '@/types/events'

export const TASK_SECTIONS = [
  { id: 'production', label: 'Production', color: '#e8624a' },
  { id: 'teamcare',   label: 'Team Care',  color: '#2980b9' },
  { id: 'merch',      label: 'Merch',      color: '#8e44ad' },
  { id: 'network',    label: 'Network',    color: '#27ae60' },
  { id: 'media',      label: 'Media',      color: '#e67e22' },
] as const

export type TaskSectionId = (typeof TASK_SECTIONS)[number]['id']

export function getInstances(
  tmpl: EventTemplate,
  from: string,   // 'YYYY-MM-DD'
  to: string,
  overrides: Record<string, Partial<EventTemplate>> = {}
): EventInstance[] {
  const list: EventInstance[] = []

  if (!tmpl.isRec) {
    // Single / non-recurring event
    if (tmpl.date && tmpl.date >= from && tmpl.date <= to) {
      const baseKey = `${tmpl.id}_${tmpl.date}`
      const ov = overrides[baseKey] ?? {}
      if (!(ov as any).deleted) {
        list.push({ ...tmpl, ...ov, instanceKey: baseKey, templateId: tmpl.id, _dayIndex: 0, _dayLabel: 'Day 1' })
      }
    }
    // Extra days for multi-day events
    ;(tmpl.extraDays ?? []).forEach((ed, di) => {
      if (ed.date >= from && ed.date <= to) {
        const edKey = `${tmpl.id}_${ed.date}_d${di + 2}`
        const edOv = overrides[edKey] ?? {}
        if (!(edOv as any).deleted) {
          list.push({
            ...tmpl,
            date: ed.date,
            startTime: ed.startTime ?? tmpl.startTime,
            location: ed.location ?? tmpl.location,
            ...edOv,
            instanceKey: edKey,
            templateId: tmpl.id,
            _dayIndex: di + 1,
            _dayLabel: `Day ${di + 2}`,
            _isExtraDay: true,
          })
        }
      }
    })
    return list
  }

  // Recurring event
  const fDate = new Date(`${from}T12:00:00`)
  const tDate = new Date(`${to}T12:00:00`)
  const cap = tmpl.recEnd ? new Date(`${tmpl.recEnd}T12:00:00`) : tDate
  const capDate = cap < tDate ? cap : tDate

  const cur = new Date(fDate)
  // Advance to first occurrence on the correct day of week
  while (cur.getDay() !== (tmpl.recDay ?? 0)) cur.setDate(cur.getDate() + 1)

  let n = 0
  while (cur <= capDate && n < 104) {
    const ds = cur.toISOString().split('T')[0]
    const key = `${tmpl.id}_${ds}`
    const ov = overrides[key] ?? {}
    if (!(ov as any).deleted) {
      const inst: EventInstance = { ...tmpl, ...ov, date: ds, instanceKey: key, templateId: tmpl.id }
      if (!inst.teams) inst.teams = []
      list.push(inst)
    }
    const step = tmpl.recur === 'biweekly' ? 14 : tmpl.recur === 'monthly' ? 30 : 7
    cur.setDate(cur.getDate() + step)
    n++
  }
  return list
}

export function allInstances(
  templates: EventTemplate[],
  overrides: Record<string, Partial<EventTemplate>>,
  from: string,
  to: string
): EventInstance[] {
  return templates
    .flatMap((t) => getInstances(t, from, to, overrides))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function dateStr(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().split('T')[0]
}
```

**Also in `src/lib/events.ts` — ICS builder (ported from index.html):**

```ts
export function buildICS(ev: EventInstance): string {
  const dtStart = icsDate(ev.date, ev.startTime)
  let dtEnd = dtStart
  if (dtStart.includes('T')) {
    const h2 = parseInt(dtStart.slice(9, 11)) + 2
    dtEnd = dtStart.slice(0, 9) + String(h2 % 24).padStart(2, '0') + dtStart.slice(11)
  }
  const uid_val = `thewell-${ev.id}${ev.instanceKey ?? ev.date ?? ''}-${Date.now()}@missionportal`
  const desc: string[] = []
  if (ev.rtp) desc.push(`Report Time (Production): ${ev.rtp}`)
  if (ev.rtm) desc.push(`Report Time (Mission): ${ev.rtm}`)
  if (ev.dcw) desc.push(`Dress Code (Worship): ${ev.dcw}`)
  if (ev.dcm) desc.push(`Dress Code (Mission): ${ev.dcm}`)
  if (ev.teams?.length) desc.push(`Teams: ${ev.teams.map((t) => t.name).join(', ')}`)

  const esc = (s: string) =>
    (s ?? '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')

  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//The Well of Iowa//Mission Portal//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid_val}`,
    `DTSTAMP:${icsDate(new Date().toISOString().split('T')[0])}`,
    `DTSTART${dtStart.includes('T') ? '' : ';VALUE=DATE'}:${dtStart}`,
    `DTEND${dtEnd.includes('T') ? '' : ';VALUE=DATE'}:${dtEnd}`,
    `SUMMARY:${esc(ev.title + (ev.isRec ? ' (Recurring)' : ''))}`,
    `LOCATION:${esc(ev.location ?? '')}`,
    `DESCRIPTION:${esc(desc.join('\\n') || 'The Well of Iowa Mission Event')}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

function icsDate(dateStr?: string, timeStr?: string): string {
  if (!dateStr) return ''
  const d = dateStr.replace(/-/g, '')
  if (!timeStr) return d
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return d
  let h = parseInt(m[1]), mn = parseInt(m[2])
  const ampm = (m[3] ?? '').toUpperCase()
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return `${d}T${String(h).padStart(2, '0')}${String(mn).padStart(2, '0')}00`
}
```

---

## 3. Availability helpers

**In `src/lib/availability.ts`:**

```ts
import type { EventInstance, AvailResponse } from '@/types/events'

export function availKey(ev: EventInstance): string {
  return ev.instanceKey ?? `${ev.id}_${ev.date}`
}

export function getAvail(
  avail: Record<string, Record<string, AvailResponse>>,
  ev: EventInstance,
  uid: string
): AvailResponse | null {
  const key = availKey(ev)
  return avail[key]?.[uid] ?? null
}

export const AVAIL_COLORS = {
  yes: '#27ae60', no: '#c0392b', partial: '#e67e22', tbd: '#2980b9',
} as const

export const AVAIL_LABELS = {
  yes: 'Available', no: 'Not Available', partial: 'Partial', tbd: 'TBD',
} as const

export function isOverdue(task: { dueDate?: string | null; status?: string }): boolean {
  return !!(
    task.dueDate &&
    task.status !== 'done' &&
    task.dueDate < todayStr()
  )
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
```

---

## 4. ID counter helper

The existing app uses numeric counters (`nEv`, `nTask`, etc.) from
`config/main` to generate IDs. The new app must continue this pattern to
avoid ID collisions with existing data.

**In `src/lib/counters.ts`:**

```ts
import { doc, runTransaction } from 'firebase/firestore'
import { db } from '@/lib/firebase'

type CounterKey = 'nEv' | 'nTask' | 'nGroup' | 'nRoom' | 'nReport' | 'nNotif'

export async function nextId(key: CounterKey): Promise<number> {
  const ref = doc(db, 'config', 'main')
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const current = (snap.data()?.[key] ?? 1) as number
    tx.update(ref, { [key]: current + 1 })
    return current
  })
}
```

Use `await nextId('nEv')` to get the next event ID, etc.

---

## 5. Zustand stores to implement

Fill in the skeletons created in Phase 1. For each store, implement
`subscribe()`, `unsubscribe()`, and all actions.

### `eventsStore.ts`

Subscribes to:
- `events` collection (templates)
- `avail` collection

Actions: `createEvent`, `updateEvent`, `deleteEvent`, `setOverride`,
`setAvail`, `selectEvent`.

```ts
interface EventsStore {
  templates: EventTemplate[]
  overrides: Record<string, Partial<EventTemplate>>
  avail: Record<string, Record<string, AvailResponse>>  // instanceKey → uid → response
  selectedInstanceKey: string | null
  loading: boolean
  // computed selectors (use outside: const instances = useEventsStore(s => s.instances(...)))
  instances: (from: string, to: string) => EventInstance[]
  myInstances: (uid: string, from: string, to: string) => EventInstance[]
  pendingAvailEvents: (uid: string) => EventInstance[]
  // actions
  subscribe: () => void
  unsubscribe: () => void
  createEvent: (data: Omit<EventTemplate, 'id'>) => Promise<void>
  updateEvent: (id: string | number, patch: Partial<EventTemplate>) => Promise<void>
  deleteEvent: (id: string | number) => Promise<void>
  setOverride: (instanceKey: string, patch: Partial<EventTemplate>) => Promise<void>
  setAvail: (ev: EventInstance, uid: string, status: AvailResponse['status'] | null, note?: string) => Promise<void>
}
```

### `tasksStore.ts`

Subscribes to `tasks` collection.

Actions: `createTask`, `updateTask`, `deleteTask`, `completeTask`,
`setStatus`.

```ts
interface TasksStore {
  tasks: Task[]
  loading: boolean
  subscribe: () => void
  unsubscribe: () => void
  myTasks: (uid: string) => Task[]
  eventTasks: (templateId: string | number) => Task[]
  overdueTasks: (uid: string) => Task[]
  createTask: (data: Omit<Task, 'id'>) => Promise<void>
  updateTask: (id: string | number, patch: Partial<Task>) => Promise<void>
  deleteTask: (id: string | number) => Promise<void>
  completeTask: (id: string | number) => Promise<void>
}
```

### `messagesStore.ts`

Subscribes to `rooms` collection metadata. Message content is loaded
per-room on demand (not global subscription).

```ts
interface MessagesStore {
  rooms: Room[]
  activeRoomId: string | number | null
  messages: Message[]         // messages for activeRoomId, in chronological order
  loading: boolean
  msgLoading: boolean
  hasMore: boolean
  subscribe: () => void
  unsubscribe: () => void
  openRoom: (roomId: string | number) => void     // starts per-room message listener
  closeRoom: () => void                            // tears down message listener
  loadMore: () => Promise<void>                    // paginate back in history
  sendMessage: (text: string, attachment?: MessageAttachment) => Promise<void>
  markRead: (ts: number) => Promise<void>
  unreadCount: (uid: string) => number
}
```

Message listener (per-room, not global):

```ts
// Inside openRoom():
const unsub = onSnapshot(
  query(
    collection(db, 'rooms', String(roomId), 'messages'),
    orderBy('ts', 'desc'),
    limit(50)
  ),
  (snap) => {
    const msgs = snap.docs.map((d) => d.data() as Message).reverse()
    set({ messages: msgs })
  }
)
```

### `postsStore.ts`

Uses TanStack Query (not `onSnapshot`) since posts are lower urgency.

```ts
// src/features/posts/hooks/usePosts.ts
export function usePostsConfig() {
  return useQuery({
    queryKey: ['postsConfig'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'config', 'main'))
      return (snap.data()?.postsConfig ?? { pages: [] }) as PostsConfig
    },
  })
}
```

Posts mutations (add post, like, comment, mark seen) use `updateDoc` with
Firestore field paths:
- Add post: `updateDoc(ref, { [`postsConfig.pages.${pageIndex}.posts`]: arrayUnion(newPost) })`

  Actually, since `postsConfig` is a nested object, the cleanest approach is
  to read the doc, mutate locally, then set the full `postsConfig` field:

  ```ts
  const snap = await getDoc(ref)
  const config = snap.data()!
  const pages = [...config.postsConfig.pages]
  const idx = pages.findIndex((p) => p.id === pageId)
  pages[idx] = { ...pages[idx], posts: [...pages[idx].posts, newPost] }
  await updateDoc(ref, { postsConfig: { pages } })
  ```

### `configStore.ts`

Subscribes to `config/main` for calendar state and counters.

```ts
interface ConfigStore {
  calY: number
  calM: number
  commonTeams: string[]
  loading: boolean
  subscribe: () => void
  unsubscribe: () => void
  setCalMonth: (y: number, m: number) => void
}
```

### `announceStore.ts`

Subscribes to `announcements` collection.

```ts
interface AnnounceStore {
  announcements: Announcement[]
  loading: boolean
  subscribe: () => void
  unsubscribe: () => void
  publicAnnouncements: () => Announcement[]
  myAnnouncements: (uid: string) => Announcement[]
}
```

### `notifsStore.ts`

Subscribes to `notifs/{uid}` for the current user only.

```ts
interface NotifsStore {
  items: InAppNotif[]
  unreadCount: number
  loading: boolean
  subscribe: (uid: string) => void
  unsubscribe: () => void
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}
```

---

## 6. Screen Specs

### 6.1 Dashboard (`app/(app)/dashboard.tsx`)

Admin-only. Role gate in `app/(app)/_layout.tsx` redirects non-admins to
`home`.

**Layout (two columns on web/tablet, single on mobile):**

```
┌─────────────────────────────────────────────────────────┐
│ Good [morning/afternoon/evening], [first name]!         │
│ [weekday], [month] [day]                                │
├──────────────────────────┬──────────────────────────────┤
│ Upcoming Events (7 Days) │ Alerts                       │
│                          │  • N pending security reports│
│ [EventCard]              │  • N chat rooms for review   │
│ [EventCard]              │  — or —                      │
│                          │  ✓ No alerts                 │
│                          │                              │
│                          │ Notifications (unread)       │
│                          │  [notif row]                 │
│                          │  [notif row]                 │
├──────────────────────────┴──────────────────────────────┤
│ Event Task Health (Next 60 Days)                        │
│ [HealthCard] [HealthCard] [HealthCard]                  │
└─────────────────────────────────────────────────────────┘
```

**Upcoming events (7 days):**
- Call `allInstances(today, today+7)` from `eventsStore`
- Show unique template IDs only (dedupe by `templateId`)
- Sort ascending by `date`
- Each card shows: title, `FD(date) · startTime`, location link, and two
  action buttons: 📄 (open detail modal) and ✓ Avail (open RSVP modal)
- If event has task template: show mini health bars (see §6.4 Event Health)

**Alerts column:**
- `pendingReports` = `reports` where `!r.ack` — navigates to Security tab
- `reportedRooms` = `rooms` where `reviewers` includes current user uid —
  navigates to Messages tab
- If neither: green ✓ No alerts card

**Notifications:**
- `notifsStore.items` filtered to `!read`, sorted desc by ts, capped at 6
- Each row: date chip + message text

**Event Task Health (60 days):**
- Call `allInstances(today, today+60)` filtered to events with `taskTemplateId`
- For each, compute `buildSectionHealth()` (see §6.4)
- Cards have green/red border based on `anyBehind`

### 6.2 Home (`app/(app)/home.tsx`)

Non-admin team members (roles: `regular`, `security`, `worship`, `merch`).

**Layout (two columns on wide, single column on mobile):**

```
┌─────────────────────────────────────────────────────────┐
│ Good [time], [first name]!                              │
│ [weekday], [month] [day]                                │
├──────────────────────────┬──────────────────────────────┤
│ My Upcoming Events       │ Recent Announcements         │
│  [EventCard + avail]     │  [AnnCard]                   │
│                          │                              │
│ My Tasks                 │ Upcoming Setlists (worship)  │
│  ⚠ N Overdue             │  [SetlistCard]               │
│  ⏰ N Behind              │                              │
│  → N Due This Week       │                              │
└──────────────────────────┴──────────────────────────────┘
```

**My Upcoming Events (7 days):**
- `allInstances(today, today+7)` filtered to events where
  `ev.users?.some(x => sameId(x, myUid))`
- Dedupe by templateId
- Each card: title, date · time, location, my teams on event (small text),
  availability badge (shows status or "Set Avail" button)

**My Tasks:**
- Overdue: `dueDate < today && status !== 'done'` → red banner
- Behind: `status === 'behind'` → orange banner
- Due this week: `dueDate in [today, today+7] && status === 'pending'` →
  neutral list
- Each task row: title + due date + status chip

**Recent Announcements:**
- Last 3 from `announceStore.myAnnouncements(uid)` (audience empty or includes uid)
- Sorted desc by ts

**Upcoming Setlists** (worship users only):
- Read from `setlists` collection via `useQuery` (not live — pull on open)
- Show next 3 setlists with date + set count

### 6.3 Public Home (`app/(app)/home.tsx` for public role, or `app/(app)/pubhome.tsx`)

**Routing:** in `app/(app)/_layout.tsx`, detect `isPublic(profile)` and
redirect to `pubhome` when `tab === 'home'` (matches existing behavior).

**Content:**

1. **Welcome card** — "Welcome, [first name]! The Well of Iowa · Together for Jesus"
2. **Events Near Me** card:
   - Location preference stored on user profile (`locationPref: { city, state, radius, lat, lng }`)
   - "Set Location" expander → city + state + radius inputs → geocode via
     OpenStreetMap Nominatim API (free, no key required):
     `https://nominatim.openstreetmap.org/search?city=${city}&state=${state}&country=US&format=json`
   - Haversine distance filter (lat/lng on event vs user's lat/lng)
   - Events shown: `isPublic: true`, date >= today, date <= today+60
   - Virtual events always shown if within the Public events list
3. **Public Announcements** — `announceStore.publicAnnouncements()` sorted desc
4. **All Public Events** (60 days) — cards with title, date, location

**Geocode helper** (`src/lib/geocode.ts`):

```ts
export async function geocodeCity(city: string, state: string): Promise<{lat: number; lng: number} | null> {
  const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&country=US&format=json&limit=1`
  const res = await fetch(url, { headers: { 'User-Agent': 'mission-portal/2.0' } })
  const data = await res.json()
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 0.621371
}
```

### 6.4 Events (`app/(app)/events/index.tsx`)

**Monthly calendar view:**

- Header: `[< Prev]  [April 2026]  [Next >]` (controlled by `configStore.calY` / `calM`)
  - Admin: `setCalMonth` writes to Firestore `config/main` so all clients
    see the same month (matches existing behavior)
  - Non-admin: local state only
- Grid: 7 columns (Sun–Sat), 5–6 rows
- Each day cell shows dot badges for events on that day (colored by role/type)
- Tap day: show events for that day in a bottom sheet (mobile) or popover (web)
- Each event chip in the cell is tappable → opens Event Detail modal

**List/upcoming view** (toggle): same data as calendar, list format, useful
for small screens.

**Create event button** (admin only): opens Create/Edit modal.

**Event Detail modal** (`src/features/events/EventDetailModal.tsx`):

Fields shown:
- Title, date, time (start, rtp, rtm)
- Location (tappable link to maps: `https://maps.google.com/?q=${encodeURIComponent(location)}`)
- Dress codes (dcw, dcm)
- Teams (each team: name, leaders, members with avatars)
- Food / carpool info
- Availability section (user's own status + RSVP buttons)
- Tasks section (if event has taskTemplateId — show mini health bars)
- ICS export button

**RSVP flow:**
- Four buttons: Available / Unavailable / Partial / TBD
- Optional note field
- Calls `eventsStore.setAvail(ev, uid, status, note)`
- Optimistic update

**ICS export (cross-platform):**

```ts
// src/lib/icsExport.ts
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { buildICS } from '@/lib/events'
import type { EventInstance } from '@/types/events'

export async function downloadICS(ev: EventInstance): Promise<void> {
  const content = buildICS(ev)
  const filename = `${(ev.title ?? 'event').replace(/[^a-zA-Z0-9_\- ]/g, '_')}_${(ev.date ?? '').replace(/-/g, '')}.ics`

  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 500)
  } else {
    const path = `${FileSystem.cacheDirectory}${filename}`
    await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 })
    await Sharing.shareAsync(path, { mimeType: 'text/calendar', dialogTitle: 'Add to Calendar' })
  }
}
```

**Create/Edit event modal** (admin only):

Full form with all `EventTemplate` fields. On save:
- New event: `await nextId('nEv')` → `setDoc(doc(db, 'events', String(id)), data)`
- Edit: `updateDoc(doc(db, 'events', String(id)), patch)`
- Optimistic update in store

**Event Health** (`src/features/events/buildSectionHealth.ts`):

```ts
export function buildSectionHealth(tmpl: EventTemplate, evTasks: Task[]): SectionHealth[] {
  const td = todayStr()
  return TASK_SECTIONS.map((sec) => {
    const tpl = taskTemplates.find((tt) => String(tt.id) === String(tmpl.taskTemplateId))
    if (!tpl) return null
    const secTasks = evTasks.filter((t) =>
      (tpl.items ?? []).some((i: any) => i.title === t.title && i.section === sec.id)
    )
    if (!secTasks.length) return null
    const total = secTasks.length
    const done = secTasks.filter((t) => t.status === 'done').length
    const overdue = secTasks.filter((t) => isOverdue(t)).length
    const behind = secTasks.filter((t) => t.status === 'behind').length
    const exp = secTasks.filter((t) => t.dueDate && t.dueDate < td).length
    const expPct = total ? Math.round((exp / total) * 100) : 0
    const actPct = total ? Math.round((done / total) * 100) : 0
    return {
      sec, total, done, overdue, behind,
      expectedPct: expPct, actualPct: actPct,
      isLagging: actPct < expPct || overdue > 0,
      tasks: secTasks,
    }
  }).filter(Boolean) as SectionHealth[]
}
```

`buildSectionHealth` needs `taskTemplates` from `tasksStore`. Pass them
in as a parameter or import from the store inside the component.

**Mini health bars component** (`src/components/ui/MiniHealthBars.tsx`):
- One bar per section that has tasks
- Bar shows expected progress (grey) vs actual progress (colored)
- Overdue count badge if > 0

### 6.5 Assignments (`app/(app)/assignments.tsx`)

Task list for the current user.

**Filters:**
- All / Pending / Done / Behind / Overdue
- Search by title
- Filter by event (dropdown of events with tasks)

**Groups (three columns on wide, tabs on mobile):**
- **Overdue** — red header
- **Behind** — orange header
- **Upcoming** (due ≤ 7 days) — blue header
- **All pending** — default header
- **Done** — collapsed by default

Each task card shows: title, assignee avatars (if team), due date chip,
status chip, event link (if `evTemplateId` set), and a ✓ complete button.

Marking complete: `tasksStore.completeTask(id)` — optimistic update, write
`{ status: 'done' }` to Firestore. Also calls
`sendNotification(task.by, 'taskComplete', { taskId, taskTitle })` if `by ≠ uid`.

**Create task** button (admin only) — opens task form modal.

### 6.6 Messages (`app/(app)/messages/index.tsx` + `[threadId].tsx`)

**Room list** (`index.tsx`):
- Shows rooms where `room.members` includes current user uid
- Each row: room name, last message preview, unread count badge
- Unread = messages where `!msg.readBy[uid]` that were sent after the last
  time user opened the room (store the open timestamp in `AsyncStorage`)
- Tap room → navigates to `messages/[threadId]` with the room id

**Thread view** (`[threadId].tsx`):
- `messagesStore.openRoom(roomId)` on mount → `messagesStore.closeRoom()` on unmount
- Renders messages in `FlashList` (inverted, newest at bottom)
- Each bubble: avatar, name, text/attachment, timestamp, read receipts (small)
- **Load More** button at top → `messagesStore.loadMore()` (paginates back 50)
- Text input + send button at bottom (sticky, above keyboard)
- On send: `messagesStore.sendMessage(text)` — optimistic (add to local list
  immediately, write to Firestore in background)
- Attachments: `expo-image-picker` for images, `expo-document-picker` for
  files → upload to Storage `rooms/{roomId}/attachments/{filename}` → send
  message with attachment object

**Mark read:** on mount and when new messages arrive, call `messagesStore.markRead`
for messages sent by others.

**Room flagging for review:** if current user is admin and a message is flagged,
the room appears in the dashboard Alerts (covered in 6.1). The flag mechanism
is: `updateDoc(roomRef, { reviewers: arrayUnion(reviewerUid) })`. Add a "Flag
for Review" button in the room header (admin only).

### 6.7 Posts (`app/(app)/posts.tsx`)

**Page tabs:**
- Horizontal scrollable tab row at the top
- Each tab = a `PostPage` from `postsConfig.pages`
- Unseen badge (dot) on tabs with new posts since last seen

**Post feed:**
- Cards sorted desc by `ts`
- Each card: author name + avatar, body text, images (if any), like count +
  like button, comment count + expand comments button, timestamp
- Like: `updateDoc` toggling `post.likes[uid]`
- Comment: inline expand → add comment form

**Mark seen:** when user opens a page tab, call `markPageSeen(pageId)` which
writes to `config/main`:

```ts
await updateDoc(doc(db, 'config', 'main'), {
  [`lastSeenPosts.${uid}_${pageId}`]: Date.now()
})
```

**Admin build mode:**
- Toggle button in top bar (admin only)
- In build mode: add page, rename page, delete page, drag-reorder pages,
  add post (rich text), delete post, set page background image, set Facebook
  URL embed (optional), set page description

---

## 7. Shared components to build in Phase 2

These are used across multiple Phase 2 screens:

- `EventCard` — title, date, time, location link, availability badge,
  action buttons
- `TaskCard` — title, assignees, due date, status chip, complete button
- `AvailBadge` — colored chip (Available / Not Available / Partial / TBD)
- `MiniHealthBars` — section progress bars for event task health
- `MessageBubble` — chat message with avatar, text, attachment, read receipt
- `NotificationRow` — in-app notif item (date + message)
- `AnnouncementCard` — title, body, date, attachment
- `DateDisplay` (`FD` in the old app) — pretty date format helper

**`FD` port** (`src/lib/format.ts`):

The old app uses `FD(dateStr)` to format `'YYYY-MM-DD'` strings to e.g.
`'Apr 6'` or `'Sun, Apr 6'`. Port it:

```ts
export function FD(dateStr?: string | null, opts?: { weekday?: boolean }): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (opts?.weekday) options.weekday = 'short'
  return date.toLocaleDateString('en-US', options)
}
```

**`sameId` helper** (`src/lib/ids.ts`):

```ts
export function sameId(a: any, b: any): boolean {
  return String(a) === String(b)
}
```

**Location link helper** (`src/lib/location.ts`):

```ts
import { Linking, Platform } from 'react-native'

export function openLocationInMaps(location: string) {
  const url = Platform.OS === 'ios'
    ? `maps:?q=${encodeURIComponent(location)}`
    : `https://maps.google.com/?q=${encodeURIComponent(location)}`
  Linking.openURL(url)
}
```

---

## 8. Notifications during Phase 2

Call `sendNotification` from the Cloud Function at these events:

| Event | Target | Type |
|---|---|---|
| Task assigned to user | assignee uid | `'newAssignment'` |
| Event RSVP confirmed | creator/admin uid | `'eventRsvp'` |

Add `'eventRsvp'` and `'taskComplete'` to `NotificationType` in
`functions/src/notify.ts`. Also write to `notifs/{uid}` (in-app notif)
from within the Cloud Function so the badge updates live:

```ts
await admin.firestore().doc(`notifs/${uid}`).set(
  { items: admin.firestore.FieldValue.arrayUnion({ id: nanoid(), msg, ts: Date.now(), type, read: false }) },
  { merge: true }
)
```

---

## 9. Firestore security rules additions

Add to `firestore.rules` (append below the existing rules):

```
match /events/{id} {
  allow read: if isSignedIn();
  allow write: if isAdmin();
}

match /avail/{key} {
  allow read: if isSignedIn();
  allow write: if isSignedIn();  // any user can write their own avail
}

match /tasks/{id} {
  allow read: if isSignedIn();
  allow write: if isAdmin() ||
    (isSignedIn() &&
     request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['status', 'overdueNotified', '_updatedAt']));
}

match /rooms/{id} {
  allow read: if isSignedIn() && (isAdmin() ||
    resource.data.members.hasAny([request.auth.uid]));
  allow write: if isAdmin();
  allow update: if isSignedIn() &&
    resource.data.members.hasAny([request.auth.uid]) &&
    request.resource.data.diff(resource.data).affectedKeys()
      .hasOnly(['reviewers', 'updatedAt']);

  match /messages/{msgId} {
    allow read: if isSignedIn() &&
      get(/databases/$(database)/documents/rooms/$(id)).data.members
        .hasAny([request.auth.uid]);
    allow create: if isSignedIn() &&
      get(/databases/$(database)/documents/rooms/$(id)).data.members
        .hasAny([request.auth.uid]);
    allow update: if isSignedIn() &&  // only allow updating readBy
      request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['readBy']);
    allow delete: if isAdmin();
  }
}

match /announcements/{id} {
  allow read: if isSignedIn();
  allow write: if isAdmin();
}

match /notifs/{uid} {
  allow read: if isSelf(uid) || isAdmin();
  allow write: if isSelf(uid) || isAdmin();
}

match /config/main {
  allow read: if isSignedIn();
  allow write: if isAdmin() ||
    // non-admin can update their own lastSeenPosts and locationPref
    (isSignedIn() &&
     request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['lastSeenPosts']));
}
```

---

## 10. Acceptance Criteria (Phase 2 Definition of Done)

Verify each manually on web + iOS simulator before signing off:

**Dashboard (admin)**
- [ ] Greeting shows correct time of day + first name
- [ ] Upcoming events (7 days) shows correct events, each with correct date/time
- [ ] Editing `appSettings/theme` during testing still re-skins immediately
- [ ] Clicking ✓ Avail on a dashboard event card opens RSVP modal
- [ ] Setting availability updates the badge on the card immediately (optimistic)
- [ ] Alerts section shows red card when there are pending security reports
- [ ] Event Task Health section appears for events with task templates, shows correct green/red state

**Home (non-admin)**
- [ ] Only events where the user is in `users[]` appear in My Events
- [ ] Overdue tasks appear in the red banner
- [ ] Announcements section shows last 3 announcements for the user's audience

**Public Home**
- [ ] Public users see this screen (not the admin dashboard or team home)
- [ ] Setting city/state/radius geocodes and saves to user profile
- [ ] Only `isPublic: true` events appear
- [ ] Virtual events always appear in the public events list

**Events**
- [ ] Monthly calendar renders correct days for current month
- [ ] Events appear on correct calendar dates
- [ ] Prev/Next month navigation works (admin: syncs via Firestore; non-admin: local)
- [ ] Tapping a day shows event list for that day
- [ ] Event detail modal shows all fields (title, date, time, location, teams, RSVP)
- [ ] Location link opens maps app (native) or Google Maps (web)
- [ ] ICS export: web downloads a `.ics` file; native opens share sheet
- [ ] Admin can create a new event and it appears on the calendar immediately
- [ ] Recurring event generates correct instances (weekly → every 7 days, biweekly → 14)

**Assignments**
- [ ] Only tasks where current user is in `assignees[]` appear
- [ ] Overdue tasks appear with red chip
- [ ] Completing a task removes it from the Pending group and shows in Done
- [ ] Admin sees all tasks, not just their own

**Messages**
- [ ] Room list shows only rooms user is a member of
- [ ] Unread count badge appears correctly
- [ ] Sending a message appears instantly (optimistic), persists on reload
- [ ] Load More loads 50 earlier messages
- [ ] Image attachment: picker → upload → renders in bubble

**Posts**
- [ ] Correct pages appear as tabs
- [ ] Unseen badge appears on tabs with new posts
- [ ] Badge clears when tab is opened (mark seen fires)
- [ ] Liking a post increments the count immediately (optimistic)
- [ ] Admin can add a post, delete a post, add/delete a page

**General**
- [ ] `npm run typecheck` passes zero errors
- [ ] `npm run lint` passes zero errors
- [ ] Web bundle initial JS still ≤ 200 KB compressed after Phase 2
- [ ] No Firestore security rule violations in the Firebase console logs

---

## 11. Common Pitfalls

1. **`S.templates` → Firestore `events` collection.** The old app called
   events "templates". Firestore collection is named `events`. Don't create
   a new `templates` collection.

2. **Override storage location.** Overrides are stored on the event doc
   itself (`events/{id}.overrides['templateId_date']`), not in a separate
   collection. Read them out of the event snapshot and fold into the `overrides`
   map in `eventsStore`.

3. **Numeric IDs in existing data.** Existing events, tasks, rooms use
   numeric IDs (1, 2, 3…). `String(id)` every comparison — never do
   `id === 1`, always `String(id) === '1'`. Use `sameId()` helper.

4. **Calendar month is 1-indexed in `config/main`.** `calM: 3` = March.
   JavaScript's `Date` is 0-indexed. Always convert: `new Date(calY, calM - 1, 1)`.

5. **`lastSeenPosts` key format.** Key is `${uid}_${pageId}` not `${pageId}_${uid}`.
   Use exact format or "unseen" logic breaks.

6. **Message pagination direction.** Firestore query is `orderBy('ts', 'desc') + limit(50)`.
   The result is newest-first. Reverse the array before rendering so messages
   appear oldest-at-top, newest-at-bottom (standard chat). On "Load More",
   use `startAfter(oldestTs)` with the same descending query.

7. **`avail` doc keys with slashes.** If any instanceKey contains a `/`
   (unusual, but possible in migrated data), Firestore doc IDs cannot contain
   `/`. The old app replaced `/` with `_`. Do the same:
   `instanceKey.replace(/\//g, '_')`.

8. **Posts in `config/main` — 1 MB Firestore doc limit.** If a page
   accumulates hundreds of posts with images, the doc approaches limits.
   For Phase 2 this is fine (unlikely to hit in practice). Phase 5 admin
   work should add a "migrate posts to subcollection" option if needed.

9. **allInstances performance.** Calling `allInstances(today, today+365)`
   with a large template list can generate thousands of instances. Always
   bound the range to what you need (7 days for home, 60 days for dashboard
   health). Never call without a `to` date.

10. **Sending messages while offline.** The Firebase JS SDK does not queue
    writes when offline on native (no IndexedDB persistence on native). Show
    an error toast if `sendMessage` throws, and let the user retry. Don't
    assume writes succeed silently.
