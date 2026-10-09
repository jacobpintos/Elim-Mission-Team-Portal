import { collection, doc, query, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDoc, getDocs } from '@/lib/liveFirestore'
import { allInstances } from '@/lib/events'
import { AVAIL_LABELS } from '@/lib/availability'
import { isAdmin, isGuest } from '@/lib/roles'
import { roomName, roomsFor } from '@/lib/miriamAppData'
import { foodItemFor, notificationSwitch } from '@/lib/miriamActions'
import { FD } from '@/lib/format'
import { useAuthStore } from '@/stores/authStore'
import { useUsersStore } from '@/stores/usersStore'
import { sendMessageAs } from '@/stores/messagesStore'
import { useAnnounceStore } from '@/stores/announceStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useEventsStore } from '@/stores/eventsStore'
import type { AvailResponse, EventInstance, EventTemplate, Room, Task } from '@/types/events'
import type { UserProfile } from '@/types/user'

/**
 * Miriam's changes (functions/src/miriam/plan.ts: ACTIONS), made here as the
 * person signed in, through the same code as the screens that make them —
 * and only once confirmed: each is first worked out into exactly what will
 * be done, shown with a button to do it.
 */
export type Prepared =
  | {
      kind: 'ready'
      /** What will be done, as a question: "Send this to Jacob Pintos?" */
      title: string
      /** The details, each a line: the message itself, the date. */
      details: string[]
      confirm: string
      /** Does it; what to say when it is done. */
      run: () => Promise<string>
    }
  /** More than one fits: each to pick from, worked out in full. */
  | { kind: 'choose'; title: string; options: { label: string; input: Record<string, unknown> }[] }
  | { kind: 'cannot'; message: string }

const cannot = (message: string): Prepared => ({ kind: 'cannot', message })
const names = () =>
  new Map(useUsersStore.getState().users.map((u) => [String(u.uid), u.displayName]))
const day = (date: string) => FD(date, { weekday: true })

/** An event by its key, as its page shows it — read fresh, not from what is loaded. */
async function eventByKey(key: string): Promise<EventInstance | null> {
  const at = key.indexOf('_')
  if (at < 0) return null
  const snap = await getDoc(doc(db, 'events', key.slice(0, at)))
  if (!snap.exists()) return null
  const { overrides, ...tmpl } = snap.data() as EventTemplate & {
    overrides?: Record<string, Partial<EventTemplate>>
  }
  const date = key.slice(at + 1)
  return (
    allInstances([{ ...tmpl, id: snap.id }], overrides ?? {}, date, date).find(
      (i) => i.instanceKey === key
    ) ?? null
  )
}

async function sendMessage(profile: UserProfile, input: Record<string, unknown>) {
  const uid = String(profile.uid)
  const text = String(input.text ?? '').trim()
  if (!text) return cannot('There was no message to send.')
  const who = names()
  const rooms = (
    await getDocs(query(collection(db, 'rooms'), where('members', 'array-contains', uid)))
  ).docs.map((d) => ({ ...(d.data() as Room), id: d.id }))
  const found = input.room_id
    ? rooms.filter((r) => String(r.id) === String(input.room_id))
    : roomsFor(rooms, uid, who, String(input.conversation ?? ''))
  if (found.length === 0) {
    return cannot(`I couldn’t find a conversation with “${String(input.conversation ?? '')}”.`)
  }
  if (found.length > 1) {
    return {
      kind: 'choose',
      title: 'Which conversation?',
      options: found.slice(0, 4).map((r) => ({
        label: roomName(r, uid, who),
        input: { ...input, room_id: String(r.id) },
      })),
    } satisfies Prepared
  }
  const room = found[0]
  return {
    kind: 'ready',
    title: `Send this to ${roomName(room, uid, who)}?`,
    details: [text],
    confirm: 'Send',
    run: async () => {
      await sendMessageAs(room.id, uid, text)
      return 'Sent.'
    },
  } satisfies Prepared
}

async function postAnnouncement(profile: UserProfile, input: Record<string, unknown>) {
  if (!isAdmin(profile)) return cannot('Only admins post announcements.')
  const title = String(input.title ?? '').trim()
  const body = String(input.body ?? '').trim()
  const lastDay = String(input.last_day ?? '')
  if (!title || !body) return cannot('An announcement needs a title and what it says.')
  const until = /^\d{4}-\d{2}-\d{2}$/.test(lastDay) ? lastDay : ''
  return {
    kind: 'ready',
    title: 'Post this announcement to every member?',
    details: [title, body, ...(until ? [`Shown until ${day(until)}`] : [])],
    confirm: 'Post',
    run: async () => {
      await useAnnounceStore.getState().createAnnouncement({
        title,
        body,
        isPublic: false,
        audience: [],
        attachment: null,
        by: String(profile.uid),
        ts: Date.now(),
        ...(until ? { expiresAt: until } : {}),
      })
      return 'Posted.'
    },
  } satisfies Prepared
}

const TASK_WORDS: Record<string, string> = {
  pending: 'not started',
  in_progress: 'in progress',
  done: 'done',
}

async function setTaskStatus(profile: UserProfile, input: Record<string, unknown>) {
  const status = String(input.status ?? '')
  if (!(status in TASK_WORDS)) return cannot('That isn’t a status a task can have.')
  if (isGuest(profile) && !isAdmin(profile)) return cannot('Guests can’t change tasks.')
  const snap = await getDoc(doc(db, 'tasks', String(input.task_id ?? '')))
  if (!snap.exists()) return cannot('I couldn’t find that task.')
  const task = { ...(snap.data() as Task), id: snap.id }
  const uid = String(profile.uid)
  if (!isAdmin(profile) && !task.assignees.some((a) => String(a) === uid)) {
    return cannot('That task isn’t one of yours.')
  }
  if (task.status === status) return cannot(`“${task.title}” is already ${TASK_WORDS[status]}.`)
  return {
    kind: 'ready',
    title: `Mark “${task.title}” ${TASK_WORDS[status]}?`,
    details: task.dueDate ? [`Due ${day(task.dueDate)}`] : [],
    confirm: status === 'done' ? 'Mark done' : 'Change',
    run: async () => {
      await useTasksStore.getState().setStatus(task.id, status as Task['status'])
      return 'Done.'
    },
  } satisfies Prepared
}

async function setAvailability(profile: UserProfile, input: Record<string, unknown>) {
  const status = String(input.status ?? '') as AvailResponse['status']
  if (!(status in AVAIL_LABELS)) return cannot('That isn’t an answer availability takes.')
  const ev = await eventByKey(String(input.event_key ?? ''))
  if (!ev) return cannot('I couldn’t find that event.')
  const note = String(input.note ?? '').trim()
  return {
    kind: 'ready',
    title: `Answer “${AVAIL_LABELS[status]}” for ${ev.title}?`,
    details: [
      `${day(ev.date)}${ev.isRec ? ' — this date only' : ''}`,
      ...(note ? [`Note: ${note}`] : []),
    ],
    confirm: 'Answer',
    run: async () => {
      await useEventsStore.getState().setAvail(ev, String(profile.uid), status, note)
      return 'Done — your availability is in.'
    },
  } satisfies Prepared
}

async function signUpFood(profile: UserProfile, input: Record<string, unknown>) {
  // Guests are along for the trip, not asked to bring food (firestore.rules).
  if (isGuest(profile) && !isAdmin(profile)) return cannot('Guests aren’t asked to bring food.')
  const ev = await eventByKey(String(input.event_key ?? ''))
  if (!ev) return cannot('I couldn’t find that event.')
  const items = ev.food ? (ev.foodItems ?? []) : []
  if (items.length === 0) return cannot(`${ev.title} has no food sign-up.`)
  const index = foodItemFor(items, String(input.item ?? ''))
  if (index < 0) {
    return cannot(`I couldn’t tell which item you meant. The sheet has: ${items.join(', ')}.`)
  }
  const uid = String(profile.uid)
  const key = `${ev.templateId}_${ev.date}`
  const taken = async () =>
    ((await getDoc(doc(db, 'foodSignups', key))).data()?.signups ?? {}) as Record<
      string,
      { uid: string; displayName: string }
    >
  const now = (await taken())[String(index)]
  if (now) {
    return cannot(
      now.uid === uid
        ? `You’re already bringing ${items[index]}.`
        : `${now.displayName} is already bringing ${items[index]}.`
    )
  }
  return {
    kind: 'ready',
    title: `Sign you up to bring ${items[index]}?`,
    details: [`${ev.title} — ${day(ev.date)}`],
    confirm: 'Sign up',
    run: async () => {
      // Read again just before: someone may have taken it since.
      const signups = await taken()
      if (signups[String(index)]) return `Someone just signed up for ${items[index]}.`
      await setDoc(doc(db, 'foodSignups', key), {
        signups: { ...signups, [String(index)]: { uid, displayName: profile.displayName } },
      })
      return `You’re signed up to bring ${items[index]}.`
    },
  } satisfies Prepared
}

async function changeNotification(profile: UserProfile, input: Record<string, unknown>) {
  const channel = String(input.channel ?? '')
  if (!['push', 'email', 'both'].includes(channel)) return cannot('Push, email, or both?')
  const on = input.on === true
  const target = notificationSwitch(
    String(input.notification ?? ''),
    channel as 'push' | 'email' | 'both',
    isAdmin(profile)
  )
  if (!target) return cannot('That isn’t one of your notifications.')
  return {
    kind: 'ready',
    title: `Turn ${on ? 'on' : 'off'} “${target.label}”?`,
    details: [],
    confirm: on ? 'Turn on' : 'Turn off',
    run: async () => {
      await updateDoc(
        doc(db, 'users', String(profile.uid)),
        Object.fromEntries(target.paths.map((p) => [p, on]))
      )
      return `Turned ${on ? 'on' : 'off'}.`
    },
  } satisfies Prepared
}

const ACTIONS: Record<
  string,
  (profile: UserProfile, input: Record<string, unknown>) => Promise<Prepared>
> = {
  send_message: sendMessage,
  post_announcement: postAnnouncement,
  set_task_status: setTaskStatus,
  set_availability: setAvailability,
  sign_up_food: signUpFood,
  change_notification: changeNotification,
}

/** A change asked for, worked out into exactly what will be done. Never throws. */
export async function prepareAction(
  name: string,
  input: Record<string, unknown>
): Promise<Prepared> {
  const profile = useAuthStore.getState().profile
  const prepare = ACTIONS[name]
  if (!profile || !prepare) return cannot('That isn’t something I can do for you.')
  try {
    return await prepare(profile, input)
  } catch {
    return cannot('That couldn’t be worked out just now.')
  }
}
