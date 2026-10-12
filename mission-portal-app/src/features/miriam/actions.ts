import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { audit } from '@/lib/audit'
import { isOwner } from '@/lib/owner'
import { ALL_ROLES } from '@/features/admin/RoleCheckboxes'
import { useMiriamStore } from '@/stores/miriamStore'
import { getDoc, getDocs } from '@/lib/liveFirestore'
import { allInstances } from '@/lib/events'
import { AVAIL_LABELS } from '@/lib/availability'
import { isAdmin, isGuest, isWorship, visibleTabs } from '@/lib/roles'
import { roomName, roomsFor } from '@/lib/miriamAppData'
import {
  foodItemFor,
  membersAfter,
  notificationSwitch,
  rolesAfter,
  setListKey,
  teamsAfter,
  templateDue,
  templateFrom,
  type TemplateAsked,
} from '@/lib/miriamActions'
import { closestTitles, parseSongRequest } from '@/lib/songRequest'
import { matchContentByTitle } from '@/lib/contentMatch'
import { keyLabel } from '@/lib/nashvilleNumbers'
import { notifyAssignees } from '@/lib/taskNotifications'
import { useGroupsStore } from '@/stores/groupsStore'
import { useChordSheetsStore } from '@/stores/chordSheetsStore'
import { useMusicStore } from '@/stores/musicStore'
import { useWorshipStore } from '@/stores/worshipStore'
import { useIssuesStore } from '@/stores/issuesStore'
import { useKaizenStore } from '@/stores/kaizenStore'
import type { ChordSheet } from '@/types/chordSheet'
import type { SetList, SetListSong } from '@/types/worship'
import type { IssueCategory, KaizenCard } from '@/types/operations'
import { FD } from '@/lib/format'
import { useAuthStore } from '@/stores/authStore'
import { useUsersStore } from '@/stores/usersStore'
import { sendMessageAs } from '@/stores/messagesStore'
import { useAnnounceStore } from '@/stores/announceStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useEventsStore } from '@/stores/eventsStore'
import type {
  AvailResponse,
  CommonTeam,
  EventInstance,
  EventTemplate,
  Room,
  Task,
} from '@/types/events'
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
      /** Deleting: shown in red. */
      destructive?: boolean
      /** Does it; what to say when it is done. */
      run: () => Promise<string>
    }
  /** Changes nothing — opens a form to finish — so done straight away. */
  | { kind: 'open'; run: () => Promise<string> }
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

// --- Admins' changes: each as its admin screen makes it, audit entry and all.

const adminOnly = (profile: UserProfile) =>
  isAdmin(profile) ? null : cannot('Only admins can do that.')
const by = (profile: UserProfile) => profile.displayName ?? ''
const idList = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])
const ROLE_SET = new Set<string>(ALL_ROLES)

async function personById(id: string): Promise<UserProfile | null> {
  if (!id) return null
  const snap = await getDoc(doc(db, 'users', id))
  return snap.exists() ? ({ ...(snap.data() as UserProfile), uid: snap.id } as UserProfile) : null
}
const listNames = (uids: string[]) => {
  const who = names()
  return uids.map((u) => who.get(u) ?? 'someone').join(', ')
}

async function createUser(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const roles = idList(input.roles).filter((r) => ROLE_SET.has(r))
  return {
    kind: 'open',
    run: async () => {
      useMiriamStore.getState().offerUserForm({
        name: String(input.name ?? '').trim(),
        email: String(input.email ?? '').trim(),
        roles,
      })
      return 'Here’s the form, filled in — give them a first password, then save.'
    },
  } satisfies Prepared
}

async function updateUser(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const user = await personById(String(input.person_id ?? ''))
  if (!user) return cannot('I couldn’t find that person.')
  if (isOwner(user) && !isOwner(profile)) return cannot('The owner’s account is theirs to change.')
  const name = String(input.name ?? '').trim() || user.displayName
  const email = String(input.email ?? '').trim() || user.email
  const add = idList(input.add_roles).filter((r) => ROLE_SET.has(r))
  const remove = idList(input.remove_roles)
  const roles = rolesAfter(user.roles ?? [], add, remove, ALL_ROLES)
  if (roles.length === 0) return cannot('Everyone needs at least one role.')
  if (String(user.uid) === String(profile.uid) && !roles.includes('admin')) {
    return cannot('Taking away your own admin role is done on the screen.')
  }
  const emailChanged = email.toLowerCase() !== (user.email ?? '').toLowerCase()
  const details = [
    ...(name !== user.displayName ? [`Name: ${user.displayName} → ${name}`] : []),
    ...(emailChanged ? [`Email: ${user.email} → ${email}`] : []),
    ...(roles.join() !== (user.roles ?? []).join() ? [`Roles: ${roles.join(', ')}`] : []),
  ]
  if (details.length === 0) return cannot(`${user.displayName} already has that.`)
  return {
    kind: 'ready',
    title: `Change ${user.displayName}’s account?`,
    details,
    confirm: 'Save',
    run: async () => {
      if (emailChanged) {
        await httpsCallable(functions, 'updateUserEmail')({ uid: user.uid, newEmail: email })
      }
      await updateDoc(doc(db, 'users', user.uid), { displayName: name, email, roles })
      await audit(
        'user.updated',
        `Updated user ${user.email} → name: ${name}, email: ${email}, roles: ${roles.join(', ')}`,
        by(profile)
      )
      return 'Saved.'
    },
  } satisfies Prepared
}

async function resetPassword(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const user = await personById(String(input.person_id ?? ''))
  if (!user) return cannot('I couldn’t find that person.')
  // As EditUserSheet: the owner's, by no one but the owner.
  if (isOwner(user) && String(user.uid) !== String(profile.uid)) {
    return cannot('The owner’s password can only be reset by the owner.')
  }
  return {
    kind: 'ready',
    title: `Reset ${user.displayName}’s password?`,
    details: ['It will be the temporary one, 12345678, until they change it.'],
    confirm: 'Reset',
    destructive: true,
    run: async () => {
      await httpsCallable(functions, 'resetUserPassword')({ uid: user.uid })
      await audit('user.passwordReset', `Reset password for ${user.email}`, by(profile))
      return 'Done — their password is reset to the temporary one.'
    },
  } satisfies Prepared
}

async function deleteUser(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const user = await personById(String(input.person_id ?? ''))
  if (!user) return cannot('I couldn’t find that person.')
  if (String(user.uid) === String(profile.uid))
    return cannot('You can’t delete your own account here.')
  if (isOwner(user)) return cannot('The owner’s account can’t be deleted.')
  const config = doc(db, 'config', 'main')
  const pending = async () =>
    ((await getDoc(config)).data()?.pendingDel ?? []) as {
      uid: string
      name: string
      requestedBy: string
      approvals: string[]
      totalAdmins: number
    }[]
  const remove = async () => {
    // As the User Management screen: the profile, and out of every group.
    const batch = writeBatch(db)
    batch.delete(doc(db, 'users', user.uid))
    for (const g of (await getDocs(collection(db, 'groups'))).docs) {
      const members: string[] = g.data().members ?? []
      if (members.includes(user.uid)) {
        batch.update(g.ref, { members: members.filter((m) => m !== user.uid) })
      }
    }
    await batch.commit()
    await updateDoc(config, { pendingDel: (await pending()).filter((d) => d.uid !== user.uid) })
    await audit('user.deleted', `Deleted user ${user.email}`, by(profile))
  }
  if (!user.roles?.includes('admin')) {
    return {
      kind: 'ready',
      title: `Delete ${user.displayName}’s account?`,
      details: [`${user.email} — this can’t be undone.`],
      confirm: 'Delete',
      destructive: true,
      run: async () => {
        await remove()
        return `${user.displayName} is deleted.`
      },
    } satisfies Prepared
  }
  // An admin: the other admins approve it first, as on the screen.
  const otherAdmins = (
    await getDocs(query(collection(db, 'users'), where('roles', 'array-contains', 'admin')))
  ).docs.filter((d) => d.id !== user.uid).length
  const needed = Math.max(otherAdmins, 1)
  if ((await pending()).some((d) => d.uid === user.uid)) {
    return cannot(`A request to delete ${user.displayName} is already waiting for approval.`)
  }
  return {
    kind: 'ready',
    title: `Ask the admins to approve deleting ${user.displayName}?`,
    details: [
      `${user.displayName} is an admin: ${needed} admin approval${needed === 1 ? '' : 's'} needed, yours counted.`,
    ],
    confirm: 'Ask',
    destructive: true,
    run: async () => {
      const request = {
        uid: user.uid,
        name: user.displayName,
        requestedBy: by(profile),
        approvals: [String(profile.uid)],
        totalAdmins: needed,
      }
      await updateDoc(config, { pendingDel: [...(await pending()), request] })
      await audit(
        'user.deletionRequested',
        `Requested deletion of admin ${user.email}`,
        by(profile)
      )
      if (request.approvals.length >= needed) {
        await remove()
        return `${user.displayName} is deleted.`
      }
      return 'The request is in, for the other admins to approve.'
    },
  } satisfies Prepared
}

async function createGroup(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const name = String(input.name ?? '').trim()
  if (!name) return cannot('A group needs a name.')
  const members = idList(input.people_ids)
  return {
    kind: 'ready',
    title: `Make the group “${name}”?`,
    details: members.length ? [listNames(members)] : ['No one in it yet.'],
    confirm: 'Make it',
    run: async () => {
      await addDoc(collection(db, 'groups'), { name, members, createdAt: new Date() })
      await audit(
        'group.created',
        `Created group "${name}" with ${members.length} members`,
        by(profile)
      )
      return 'Made.'
    },
  } satisfies Prepared
}

async function updateGroup(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const snap = await getDoc(doc(db, 'groups', String(input.group_id ?? '') || '-'))
  if (!snap.exists()) return cannot('I couldn’t find that group.')
  const group = snap.data() as { name: string; members?: string[] }
  const name = String(input.new_name ?? '').trim() || group.name
  if (group.name === 'All' && name !== 'All') return cannot('The All group keeps its name.')
  const add = idList(input.add_people_ids)
  const remove = idList(input.remove_people_ids)
  const before = (group.members ?? []).map(String)
  const members = membersAfter(before, add, remove)
  const added = members.filter((m) => !before.includes(m))
  const taken = before.filter((m) => !members.includes(m))
  const details = [
    ...(name !== group.name ? [`Name: ${group.name} → ${name}`] : []),
    ...(added.length ? [`Add: ${listNames(added)}`] : []),
    ...(taken.length ? [`Take out: ${listNames(taken)}`] : []),
  ]
  if (details.length === 0) return cannot('The group already has that.')
  return {
    kind: 'ready',
    title: `Change the group “${group.name}”?`,
    details,
    confirm: 'Save',
    run: async () => {
      await updateDoc(snap.ref, { name, members, updatedAt: new Date() })
      await audit(
        'group.updated',
        `Updated group "${group.name}" → "${name}", ${members.length} members`,
        by(profile)
      )
      return 'Saved.'
    },
  } satisfies Prepared
}

async function deleteGroup(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const snap = await getDoc(doc(db, 'groups', String(input.group_id ?? '') || '-'))
  if (!snap.exists()) return cannot('I couldn’t find that group.')
  const group = snap.data() as { name: string; members?: string[] }
  if (group.name === 'All') return cannot('The All group can’t be deleted.')
  return {
    kind: 'ready',
    title: `Delete the group “${group.name}”?`,
    details: [`${(group.members ?? []).length} people are in it — this can’t be undone.`],
    confirm: 'Delete',
    destructive: true,
    run: async () => {
      await deleteDoc(snap.ref)
      await audit('group.deleted', `Deleted group "${group.name}"`, by(profile))
      return 'Deleted.'
    },
  } satisfies Prepared
}

/** The common teams, and a change to them saved as the Common Teams screen saves it. */
async function teamsChange(
  profile: UserProfile,
  change: (teams: CommonTeam[]) => CommonTeam[] | string,
  title: string,
  details: string[],
  confirm: string,
  destructive = false
): Promise<Prepared> {
  const no = adminOnly(profile)
  if (no) return no
  const config = doc(db, 'config', 'main')
  const current = async () => ((await getDoc(config)).data()?.COMMON_TEAMS ?? []) as CommonTeam[]
  const checked = change(await current())
  if (typeof checked === 'string') return cannot(checked)
  return {
    kind: 'ready',
    title,
    details,
    confirm,
    destructive,
    run: async () => {
      // Worked out again from what is saved now, in case it changed since.
      const next = change(await current())
      if (typeof next === 'string') return next
      await updateDoc(config, { COMMON_TEAMS: next })
      await audit(
        'teams.updated',
        `Updated common teams: ${next.map((t) => t.name).join(', ')}`,
        by(profile)
      )
      return 'Saved.'
    },
  }
}
async function createTeam(profile: UserProfile, input: Record<string, unknown>) {
  const name = String(input.name ?? '').trim()
  const members = idList(input.people_ids)
  if (!name) return cannot('A team needs a name.')
  return teamsChange(
    profile,
    (teams) => teamsAfter(teams, { kind: 'add', name, members }),
    `Add the team “${name}”?`,
    members.length ? [listNames(members)] : ['No one on it yet.'],
    'Add it'
  )
}

async function updateTeam(profile: UserProfile, input: Record<string, unknown>) {
  const team = String(input.team ?? '')
  const newName = String(input.new_name ?? '').trim()
  const add = idList(input.add_people_ids)
  const remove = idList(input.remove_people_ids)
  const details = [
    ...(newName ? [`Name: ${team} → ${newName}`] : []),
    ...(add.length ? [`Add: ${listNames(add)}`] : []),
    ...(remove.length ? [`Take off: ${listNames(remove)}`] : []),
  ]
  if (details.length === 0) return cannot('Nothing to change on it.')
  return teamsChange(
    profile,
    (teams) => teamsAfter(teams, { kind: 'update', team, newName, add, remove }),
    `Change the team “${team}”?`,
    details,
    'Save'
  )
}

async function deleteTeam(profile: UserProfile, input: Record<string, unknown>) {
  const team = String(input.team ?? '')
  return teamsChange(
    profile,
    (teams) => teamsAfter(teams, { kind: 'remove', team }),
    `Remove the team “${team}”?`,
    ['This can’t be undone.'],
    'Remove',
    true
  )
}

async function deleteTaskTemplate(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const snap = await getDoc(doc(db, 'taskTemplates', String(input.template_id ?? '') || '-'))
  if (!snap.exists()) return cannot('I couldn’t find that task template.')
  const name = String(snap.data()?.name ?? 'that template')
  return {
    kind: 'ready',
    title: `Delete the task template “${name}”?`,
    details: ['This can’t be undone.'],
    confirm: 'Delete',
    destructive: true,
    run: async () => {
      await deleteDoc(snap.ref)
      await audit('taskTemplate.deleted', `Deleted task template "${name}"`, by(profile))
      return 'Deleted.'
    },
  } satisfies Prepared
}

// --- Tasks and task templates: admins' -------------------------------------------

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const groupNames = () =>
  new Map(useGroupsStore.getState().groups.map((g) => [String(g.id), g.name]))

async function createTaskTemplate(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const made = templateFrom(input as unknown as TemplateAsked)
  if (typeof made === 'string') return cannot(made)
  const groups = groupNames()
  const who = (t: (typeof made.tasks)[number]) =>
    [
      ...t.assignees.map((u) => names().get(u) ?? 'someone'),
      ...t.assigneeGroups.map((g) => groups.get(g) ?? 'a group'),
    ].join(', ') || 'no one yet'
  return {
    kind: 'ready',
    title: `Make the task template “${made.name}”?`,
    details: made.sections.map(
      (s) =>
        `${s.label}: ${made.tasks
          .filter((t) => t.section === s.id)
          .map((t) => `${t.title} (${who(t)}; ${templateDue(t)})`)
          .join('; ')}`
    ),
    confirm: 'Make it',
    run: async () => {
      await addDoc(collection(db, 'taskTemplates'), {
        ...made,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await audit('taskTemplate.created', `Created task template "${made.name}"`, by(profile))
      return `Done — the task template “${made.name}” is made.`
    },
  } satisfies Prepared
}

/** The most tasks assigned at once. */
const MAX_TASKS = 30

async function createTasks(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const asked = (Array.isArray(input.tasks) ? input.tasks : []).slice(0, MAX_TASKS) as Record<
    string,
    unknown
  >[]
  const tasks: {
    title: string
    assignees: string[]
    lead: string | null
    dueDate: string | null
    event: EventInstance | null
  }[] = []
  for (const t of asked) {
    const title = String(t.title ?? '').trim()
    if (!title) continue
    const group = String(t.group_id ?? '')
    const members = group
      ? (((await getDoc(doc(db, 'groups', group))).data()?.members ?? []) as unknown[]).map(String)
      : []
    const assignees = [...new Set([...idList(t.people_ids), ...members])]
    const leadAsked = String(t.lead_id ?? '')
    const event = t.event_key ? await eventByKey(String(t.event_key)) : null
    tasks.push({
      title,
      assignees,
      lead: assignees.includes(leadAsked) ? leadAsked : (assignees[0] ?? null),
      dueDate: isDate(t.due_date) ? t.due_date : null,
      event,
    })
  }
  if (tasks.length === 0) return cannot('There were no tasks to assign.')
  const uid = String(profile.uid)
  return {
    kind: 'ready',
    title:
      tasks.length === 1 ? `Assign “${tasks[0].title}”?` : `Assign these ${tasks.length} tasks?`,
    details: tasks.map(
      (t) =>
        `${t.title} — ${t.assignees.length ? listNames(t.assignees) : 'no one yet'}${t.dueDate ? `; due ${day(t.dueDate)}` : ''}${t.event ? `; for ${t.event.title}` : ''}`
    ),
    confirm: 'Assign',
    run: async () => {
      for (const t of tasks) {
        const id = await useTasksStore.getState().createTask({
          title: t.title,
          assignees: t.assignees,
          lead: t.lead,
          by: uid,
          status: 'pending',
          dueDate: t.dueDate,
          ...(t.event ? { evTemplateId: t.event.templateId, evDate: t.event.date } : {}),
        })
        notifyAssignees(t.assignees, t.title, id)
      }
      return tasks.length === 1 ? 'Assigned.' : `Done — ${tasks.length} tasks assigned.`
    },
  } satisfies Prepared
}

async function taskById(id: string): Promise<Task | null> {
  if (!id) return null
  const snap = await getDoc(doc(db, 'tasks', id))
  return snap.exists() ? { ...(snap.data() as Task), id: snap.id } : null
}

async function updateTask(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const task = await taskById(String(input.task_id ?? ''))
  if (!task) return cannot('I couldn’t find that task.')
  const before = task.assignees.map(String)
  const title = String(input.title ?? '').trim()
  const due = String(input.due_date ?? '').trim()
  const leadAsked = String(input.lead_id ?? '')
  let assignees = membersAfter(
    before,
    idList(input.add_people_ids),
    idList(input.remove_people_ids)
  )
  if (leadAsked && !assignees.includes(leadAsked)) assignees = [...assignees, leadAsked]
  const added = assignees.filter((a) => !before.includes(a))
  const removed = before.filter((a) => !assignees.includes(a))
  const oldLead = task.lead == null ? null : String(task.lead)
  const lead =
    leadAsked || (oldLead && assignees.includes(oldLead) ? oldLead : (assignees[0] ?? null))
  const patch: Partial<Task> = {}
  const details: string[] = []
  if (title && title !== task.title) {
    patch.title = title
    details.push(`Name: ${task.title} → ${title}`)
  }
  if (due === 'none' && task.dueDate) {
    patch.dueDate = null
    details.push('No due date')
  } else if (isDate(due) && due !== task.dueDate) {
    patch.dueDate = due
    details.push(`Due: ${task.dueDate ? `${day(task.dueDate)} → ` : ''}${day(due)}`)
  }
  if (added.length || removed.length) {
    patch.assignees = assignees
    if (added.length) details.push(`Give to: ${listNames(added)}`)
    if (removed.length) details.push(`Take off: ${listNames(removed)}`)
  }
  if (lead !== oldLead) {
    patch.lead = lead
    if (lead) details.push(`Lead: ${listNames([lead])}`)
  }
  if (details.length === 0) return cannot(`Nothing to change on “${task.title}”.`)
  return {
    kind: 'ready',
    title: `Change the task “${task.title}”?`,
    details,
    confirm: 'Save',
    run: async () => {
      await useTasksStore.getState().updateTask(task.id, patch)
      if (added.length) notifyAssignees(added, patch.title ?? task.title, task.id)
      return 'Saved.'
    },
  } satisfies Prepared
}

async function deleteTask(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const task = await taskById(String(input.task_id ?? ''))
  if (!task) return cannot('I couldn’t find that task.')
  return {
    kind: 'ready',
    title: `Delete the task “${task.title}”?`,
    details: [
      `${task.assignees.length ? listNames(task.assignees.map(String)) : 'No one'}${task.dueDate ? ` — due ${day(task.dueDate)}` : ''}`,
      'This can’t be undone.',
    ],
    confirm: 'Delete',
    destructive: true,
    run: async () => {
      await useTasksStore.getState().deleteTask(task.id)
      return 'Deleted.'
    },
  } satisfies Prepared
}

/** An event's cars for one date, set as its page sets them (EventDetailModal: CarpoolPanel). */
async function setCarpool(profile: UserProfile, input: Record<string, unknown>) {
  const no = adminOnly(profile)
  if (no) return no
  const ev = await eventByKey(String(input.event_key ?? ''))
  if (!ev) return cannot('I couldn’t find that event.')
  if (!ev.carpool) return cannot(`${ev.title} has no carpool — turn it on in its form first.`)
  if (ev.carpoolCars?.length) {
    return cannot(`${ev.title}’s cars are set in its form — ask me to change the event instead.`)
  }
  const cars = (Array.isArray(input.cars) ? input.cars : []).slice(0, 30).map((c, i) => {
    const car = (c ?? {}) as Record<string, unknown>
    const driver = String(car.driver_id ?? '')
    return {
      id: `${Date.now()}${i}`,
      label: String(car.label ?? '').trim(),
      driver,
      riders: idList(car.rider_ids).filter((r) => r !== driver),
    }
  })
  const ref = doc(db, 'carpool', `${ev.templateId}_${ev.date}`)
  const had = (((await getDoc(ref)).data()?.cars ?? []) as unknown[]).length
  return {
    kind: 'ready',
    title: `Set the cars for ${ev.title}?`,
    details: [
      `${day(ev.date)}${ev.isRec ? ' — this date only' : ''}${had ? ` — instead of the ${had} there now` : ''}`,
      ...(cars.length
        ? cars.map(
            (c, i) =>
              `${c.label || `Car ${i + 1}`}: ${c.driver ? `${listNames([c.driver])} driving` : 'no driver yet'}${c.riders.length ? `; ${listNames(c.riders)}` : ''}`
          )
        : ['No cars.']),
    ],
    confirm: 'Save',
    run: async () => {
      await setDoc(ref, { cars })
      return 'Saved.'
    },
  } satisfies Prepared
}

// --- Operations ---------------------------------------------------------------------

/** Anyone with Operations may report there; a guest only reads. */
const operations = (profile: UserProfile) =>
  !visibleTabs(profile).includes('issues') || (isGuest(profile) && !isAdmin(profile))
    ? cannot('You can’t report in Operations.')
    : null

const CATEGORIES: IssueCategory[] = ['equipment', 'safety', 'facility', 'logistics', 'other']

async function reportIssue(profile: UserProfile, input: Record<string, unknown>) {
  const no = operations(profile)
  if (no) return no
  const title = String(input.title ?? '').trim()
  const description = String(input.description ?? '').trim()
  const suggested = String(input.suggested_action ?? '').trim()
  const category = CATEGORIES.includes(input.category as IssueCategory)
    ? (input.category as IssueCategory)
    : 'other'
  if (!title) return cannot('An issue needs a name.')
  return {
    kind: 'ready',
    title: `Report this issue?`,
    details: [
      title,
      ...(description ? [description] : []),
      `Kind: ${category}`,
      ...(suggested ? [`Suggested: ${suggested}`] : []),
    ],
    confirm: 'Report',
    run: async () => {
      await useIssuesStore.getState().createIssue({
        title,
        description: description || title,
        category,
        suggestedAction: suggested,
        reportedBy: String(profile.uid),
      })
      return 'Reported — thank you.'
    },
  } satisfies Prepared
}

async function submitKaizen(profile: UserProfile, input: Record<string, unknown>) {
  const no = operations(profile)
  if (no) return no
  const title = String(input.title ?? '').trim()
  const description = String(input.description ?? '').trim()
  if (!title) return cannot('An idea needs a name.')
  return {
    kind: 'ready',
    title: 'Submit this kaizen idea?',
    details: [title, ...(description ? [description] : [])],
    confirm: 'Submit',
    run: async () => {
      await useKaizenStore.getState().addCard({
        title,
        description: description || title,
        createdBy: String(profile.uid),
      })
      return 'Submitted — thank you.'
    },
  } satisfies Prepared
}

async function voteKaizen(profile: UserProfile, input: Record<string, unknown>) {
  const no = operations(profile)
  if (no) return no
  const snap = await getDoc(doc(db, 'kaizen', String(input.kaizen_id ?? '') || '-'))
  if (!snap.exists()) return cannot('I couldn’t find that idea.')
  const card = snap.data() as KaizenCard
  const uid = String(profile.uid)
  const voted = (card.upvotes ?? []).some((u) => String(u) === uid)
  const vote = input.vote !== false
  if (vote === voted) {
    return cannot(
      vote ? `You’ve already voted for “${card.title}”.` : `You haven’t voted for “${card.title}”.`
    )
  }
  return {
    kind: 'ready',
    title: vote ? `Vote for “${card.title}”?` : `Take back your vote for “${card.title}”?`,
    details: [`${(card.upvotes ?? []).length} votes now`],
    confirm: vote ? 'Vote' : 'Take it back',
    run: async () => {
      // Read again, so another vote cast meanwhile is kept.
      const now = (((await getDoc(snap.ref)).data()?.upvotes ?? []) as (string | number)[]).filter(
        (u) => String(u) !== uid
      )
      await updateDoc(snap.ref, {
        upvotes: vote ? [...now, uid] : now,
        updatedAt: serverTimestamp(),
      })
      return vote ? 'Voted.' : 'Your vote is taken back.'
    },
  } satisfies Prepared
}

// --- Set lists: the worship team's and admins' -------------------------------------

/** The chord sheets, loaded if the screens haven't. */
async function chordSheets(): Promise<ChordSheet[]> {
  const loaded = useChordSheetsStore.getState().chordSheets
  if (loaded.length) return loaded
  return (await getDocs(collection(db, 'chordSheets'))).docs.map(
    (d) => ({ ...(d.data() as ChordSheet), id: d.id }) as ChordSheet
  )
}

/** Songs as asked for, as a set list holds them: each with its chord sheet and video where one fits. */
async function songsFor(asked: unknown): Promise<SetListSong[]> {
  const sheets = await chordSheets()
  const music = useMusicStore.getState()
  if (music.items.length === 0) await music.load()
  const items = useMusicStore.getState().items
  return (Array.isArray(asked) ? asked : []).slice(0, 30).flatMap((a, i) => {
    const said = String((a as Record<string, unknown>)?.title ?? '').trim()
    if (!said) return []
    const exact = sheets.filter((c) => c.title.trim().toLowerCase() === said.toLowerCase())
    const near = closestTitles(sheets, said, 2)
    const sheet =
      (exact.length === 1 ? exact[0] : null) ??
      parseSongRequest(sheets, said)?.sheet ??
      (near.length === 1 ? near[0] : null)
    const name = sheet?.title ?? said
    return [
      {
        id: String(Date.now() + i + Math.random()),
        name,
        key: setListKey(String((a as Record<string, unknown>)?.key ?? '')),
        link: matchContentByTitle(name, items)?.youtubeUrl ?? '',
        notes: '',
        chordSheetId: sheet ? sheet.id : null,
      },
    ]
  })
}

const songLine = (s: SetListSong, n: number) =>
  `${n}. ${s.name}${s.key ? ` in ${keyLabel(s.key)}` : ''}${s.chordSheetId == null ? ' (no chord sheet found)' : ''}`

const worshipOnly = (profile: UserProfile) =>
  isWorship(profile) ? null : cannot('Only the worship team and admins change set lists.')

async function addToSetList(profile: UserProfile, input: Record<string, unknown>) {
  const no = worshipOnly(profile)
  if (no) return no
  const ref = doc(db, 'setLists', String(input.set_list_id ?? '') || '-')
  const snap = await getDoc(ref)
  if (!snap.exists()) return cannot('I couldn’t find that set list.')
  const list = snap.data() as SetList
  const songs = await songsFor(input.songs)
  if (songs.length === 0) return cannot('There were no songs to add.')
  const pos = Math.round(Number(input.position))
  // Where the first goes: 1 the opener; past the end, or 0, the end.
  const at = pos > 0 ? Math.min(pos - 1, (list.songs ?? []).length) : (list.songs ?? []).length
  return {
    kind: 'ready',
    title: `Add to “${list.title}”?`,
    details: [
      ...(list.eventDate ? [day(list.eventDate)] : []),
      ...songs.map((s, i) => songLine(s, at + i + 1)),
    ],
    confirm: 'Add',
    run: async () => {
      // Added to the set as it is now, in case it changed meanwhile.
      const now = (((await getDoc(ref)).data()?.songs ?? []) as SetListSong[]).slice()
      now.splice(Math.min(at, now.length), 0, ...songs)
      await useWorshipStore.getState().updateSetList(snap.id, { songs: now })
      return 'Added.'
    },
  } satisfies Prepared
}

async function createSetList(profile: UserProfile, input: Record<string, unknown>) {
  const no = worshipOnly(profile)
  if (no) return no
  const ev = input.event_key ? await eventByKey(String(input.event_key)) : null
  if (input.event_key && !ev) return cannot('I couldn’t find that event.')
  const title = String(input.title ?? '').trim() || ev?.title || ''
  if (!title) return cannot('A set list needs a name, or an event.')
  const songs = await songsFor(input.songs)
  return {
    kind: 'ready',
    title: `Make the set list “${title}”?`,
    details: [
      ...(ev ? [`For ${ev.title}, ${day(ev.date)}`] : []),
      ...(songs.length ? songs.map((s, i) => songLine(s, i + 1)) : ['No songs yet.']),
    ],
    confirm: 'Make it',
    run: async () => {
      await useWorshipStore.getState().createSetList({
        title,
        eventTemplateId: ev?.templateId ?? null,
        eventDate: ev?.date ?? null,
        songs,
        createdBy: String(profile.uid),
      })
      return `Done — the set list “${title}” is made.`
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
  create_user: createUser,
  update_user: updateUser,
  reset_user_password: resetPassword,
  delete_user: deleteUser,
  create_group: createGroup,
  update_group: updateGroup,
  delete_group: deleteGroup,
  create_team: createTeam,
  update_team: updateTeam,
  delete_team: deleteTeam,
  delete_task_template: deleteTaskTemplate,
  create_task_template: createTaskTemplate,
  create_tasks: createTasks,
  update_task: updateTask,
  delete_task: deleteTask,
  set_carpool: setCarpool,
  report_issue: reportIssue,
  submit_kaizen: submitKaizen,
  vote_kaizen: voteKaizen,
  add_to_set_list: addToSetList,
  create_set_list: createSetList,
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
