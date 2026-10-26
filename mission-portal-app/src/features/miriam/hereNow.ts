import { doc } from 'firebase/firestore'
import { effectiveAvail } from '@/lib/availability'
import type { FoodNudge } from '@/lib/briefing'
import { localToday, todayStr } from '@/lib/events'
import { db } from '@/lib/firebase'
import { getDoc } from '@/lib/liveFirestore'
import { announcementsShown } from '@/lib/miriamAppData'
import { quickAnswer, type QuickData } from '@/lib/miriamQuick'
import { useAuthStore } from '@/stores/authStore'
import { useDateNotesStore } from '@/stores/dateNotesStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { usePostsStore } from '@/stores/postsStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useUsersStore } from '@/stores/usersStore'
import type { CarpoolCarData } from '@/types/events'
import { appToolsFor } from './appTools'
import {
  allAnnouncements,
  foodSheet,
  latestMessages,
  myRooms,
  nextOpenFood,
  openFood,
} from './localData'
import type { Here } from './localTalk'

/**
 * What Miriam answers from on the phone, without asking Claude: what the app
 * has already loaded, as this person may see it.
 */

/** How long an answer to her availability questions is waited on before it is taken as kept for a signal. */
const ANSWER_WAIT_MS = 4000

/**
 * A question answered from what the app has loaded — the same events and
 * rules the server would use (lib/miriamQuick) — or null, to ask Claude.
 */
export function quickFromApp(said: string) {
  const data = appData()
  return data ? quickAnswer(said, data) : null
}

/** The events, groups and people the app has loaded, as lib/miriamQuick reads them; null before the events are in. */
export function appData(): QuickData | null {
  const profile = useAuthStore.getState().profile
  const { templates, overrides } = useEventsStore.getState()
  if (!profile || templates.length === 0) return null
  return {
    templates: templates as never,
    overrides: overrides as never,
    groups: useGroupsStore.getState().groups,
    viewer: { uid: String(profile.uid), roles: profile.roles ?? [] },
    names: new Map(useUsersStore.getState().users.map((u) => [String(u.uid), u.displayName])),
    // Their own day, as the server is told it (./askMiriam: localToday).
    today: localToday(),
  }
}

/**
 * The events as appData gives them — read for a moment first, where this
 * screen hasn't loaded them (Home and Events do). Null with none to see.
 */
export async function eventsLoaded(): Promise<QuickData | null> {
  const ready = appData()
  if (ready) return ready
  useEventsStore.getState().subscribe()
  try {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150))
      if (appData() || !useEventsStore.getState().loading) break
    }
    return appData()
  } finally {
    useEventsStore.getState().unsubscribe()
  }
}

/** What the conversations worked out here can see, as this person. */
export function hereNow(briefedFoodRef: {
  current: { day: string; food: FoodNudge[] } | null
}): Here {
  const profile = useAuthStore.getState().profile
  const uid = String(profile?.uid ?? '')
  return {
    data: appData(),
    profile,
    tools: appToolsFor(profile),
    tasks: () => {
      const tasks = useTasksStore.getState()
      return { ready: tasks._refCount > 0 && !tasks.loading, mine: uid ? tasks.myTasks(uid) : [] }
    },
    openFood,
    foodSheet,
    nextOpenFood,
    announcements: async () =>
      profile ? announcementsShown(await allAnnouncements(), profile, todayStr()) : [],
    names: () => new Map(useUsersStore.getState().users.map((u) => [String(u.uid), u.displayName])),
    rooms: () => myRooms(uid),
    latest: (room, n) => latestMessages(room, n, profile),
    now: () => Date.now(),
    briefedFood: () =>
      briefedFoodRef.current?.day === localToday() ? briefedFoodRef.current.food : [],
    answerOf: (ev) => {
      const r = effectiveAvail(useEventsStore.getState().avail, ev as never, uid)
      return r ? { status: r.status, note: r.note ?? '', ts: r.ts ?? 0 } : null
    },
    // As the event's page saves it. Not waited on past a moment: with no
    // signal it is kept on the phone and sent when there is one.
    answer: async (ev, status, note) => {
      const saving = useEventsStore.getState().setAvail(ev as never, uid, status, note)
      // Failing after the wait is past: nothing more to say about it then.
      saving.catch(() => {})
      try {
        await Promise.race([saving, new Promise((done) => setTimeout(done, ANSWER_WAIT_MS))])
        return true
      } catch {
        return false
      }
    },
    // The church's post pages, read fresh, as the Posts screen reads them.
    posts: async () => {
      try {
        await usePostsStore.getState().refreshConfig()
        return usePostsStore.getState().config.pages
      } catch {
        return null
      }
    },
    // Loaded while her panel is open (above): waited for a moment if not yet.
    notes: async () => {
      const until = Date.now() + 3000
      while (!useDateNotesStore.getState().loaded && Date.now() < until) {
        await new Promise((r) => setTimeout(r, 100))
      }
      const store = useDateNotesStore.getState()
      return { ready: store.loaded, all: store.notes }
    },
    carsFor: async (ev) => {
      if (ev.carpoolCars?.length) return ev.carpoolCars as unknown as CarpoolCarData[]
      if (!ev.carpool) return []
      try {
        const saved = ((await getDoc(doc(db, 'carpool', `${ev.templateId}_${ev.date}`))).data()
          ?.cars ?? []) as Partial<CarpoolCarData>[]
        return saved.map((c, i) => ({
          ...c,
          id: c.id ?? String(i),
          label: c.label ?? '',
          driver: c.driver ?? '',
          riders: c.riders ?? [],
        }))
      } catch {
        return null
      }
    },
  }
}
