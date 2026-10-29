import { create } from 'zustand'
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteField,
  arrayUnion,
  FieldPath,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { geocodeCity } from '@/lib/geocode'
import { allInstances } from '@/lib/events'
import { availKey, seriesAvailKey, getSeriesAvail, AVAIL_LABELS } from '@/lib/availability'
import { sameId } from '@/lib/ids'
import { nextId } from '@/lib/counters'
import { useAuthStore } from '@/stores/authStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useUsersStore } from '@/stores/usersStore'
import { isAdmin, isPublic } from '@/lib/roles'
import type { EventTemplate, EventInstance, AvailResponse, InAppNotif } from '@/types/events'
import type { UserProfile } from '@/types/user'
import {
  dressCodesOn,
  reportTimesFor,
  teamsOf,
  teamsSaid,
  type ReportTime,
} from '../../functions/src/miriam/data'
import {
  eventAccess,
  mergeEvent,
  splitFields,
  strays,
  withMoved,
} from '../../functions/src/eventPrivate'

interface EventsStore {
  templates: EventTemplate[]
  overrides: Record<string, Partial<EventTemplate>>
  avail: Record<string, Record<string, AvailResponse>>
  selectedInstanceKey: string | null
  selectedEvent: EventInstance | null
  loading: boolean
  /** The events as read, in order, and their private records by id (functions/src/eventPrivate). */
  _openDocs: [string, Doc][]
  _privateDocs: Record<string, Doc>
  _unsubTemplates: (() => void) | null
  _unsubPrivate: (() => void) | null
  _unsubAuth: (() => void) | null
  _unsubAvail: (() => void) | null
  _refCount: number
  // selectors
  instances: (from: string, to: string) => EventInstance[]
  getInstanceByKey: (instanceKey: string) => EventInstance | null
  myInstances: (uid: string, from: string, to: string) => EventInstance[]
  pendingAvailEvents: (uid: string) => EventInstance[]
  checkSeriesConflicts: (
    templateId: string | number,
    uid: string,
    newStatus: AvailResponse['status']
  ) => EventInstance[]
  // actions
  subscribe: () => void
  unsubscribe: () => void
  selectEvent: (key: string | null) => void
  setSelectedEvent: (ev: EventInstance | null) => void
  createEvent: (data: Omit<EventTemplate, 'id'>) => Promise<string | number>
  updateEvent: (id: string | number, patch: Partial<EventTemplate>) => Promise<void>
  deleteEvent: (id: string | number) => Promise<void>
  setOverride: (instanceKey: string, patch: Partial<EventTemplate>) => Promise<void>
  setAvail: (
    ev: EventInstance,
    uid: string,
    status: AvailResponse['status'] | null,
    note?: string
  ) => Promise<void>
  setSeriesAvail: (
    templateId: string | number,
    uid: string,
    status: AvailResponse['status'] | null,
    note: string,
    forceOverrideKeys?: string[]
  ) => Promise<void>
}

type Doc = Record<string, unknown>

/** The events as the app uses them: each one's private record over its own (functions/src/eventPrivate). */
function assemble(open: [string, Doc][], closed: Record<string, Doc>) {
  const templates: EventTemplate[] = []
  const overrides: Record<string, Partial<EventTemplate>> = {}
  for (const [id, data] of open) {
    const { overrides: docOverrides, ...tmpl } = mergeEvent(
      data,
      closed[id]
    ) as unknown as EventTemplate & {
      overrides?: Record<string, Partial<EventTemplate>>
    }
    templates.push({ ...tmpl, id })
    Object.assign(overrides, docOverrides ?? {})
  }
  return { templates, overrides }
}

/**
 * The private records this person may read: every one, for an admin; those
 * of the events they are on, for anyone else; none for a public account
 * (firestore.rules eventPrivate, which this query has to match).
 */
function privateRecords(profile: ReturnType<typeof useAuthStore.getState>['profile']) {
  if (!profile?.uid) return null
  if (isAdmin(profile)) return collection(db, 'eventPrivate')
  if (isPublic(profile)) return null
  return query(
    collection(db, 'eventPrivate'),
    where('access', 'array-contains', String(profile.uid))
  )
}

const groupsNow = () => useGroupsStore.getState().groups

/**
 * Fields and values for an update, as paths rather than dotted text: a
 * date's key is part of the path, and may hold a character dotted text can't.
 */
function fieldUpdates(entries: [string[], unknown][]): [FieldPath, unknown, ...unknown[]] {
  // Undefined left out, as the app's writes do (lib/firebase: ignoreUndefinedProperties).
  const [first, ...rest] = entries
    .filter(([, value]) => value !== undefined)
    .flatMap(([path, value]) => [new FieldPath(...path), value])
  return [first as FieldPath, rest[0], ...rest.slice(1)]
}

async function resolveGeo(city?: string, state?: string) {
  if (!city || !state) return {}
  const coords = await geocodeCity(city, state)
  if (!coords) return {}
  return { lat: coords.lat, lng: coords.lng, _geocodeLat: coords.lat, _geocodeLng: coords.lng }
}

// Fires whenever someone responds to an RSVP with anything other than
// "Available" — including their FIRST response, not just a change from a
// prior one. Routed through sendNotification (batched, rsvpNonAvailable) so
// it respects prefs and the shared batching window, unlike the old
// direct-to-notifs write this replaces.
async function notifyAssignedAdmins(
  ev: EventInstance,
  changerUid: string,
  newStatus: AvailResponse['status']
) {
  if (newStatus === 'yes') return

  const { users } = useUsersStore.getState()

  const assignedUids = resolveAssignedUids(ev)

  const changer = users.find((u) => sameId(u.uid, changerUid))
  const changerName = changer?.displayName || changer?.email || changerUid

  const adminsToNotify = users.filter(
    (u) =>
      u.roles?.includes('admin') &&
      String(u.uid) !== String(changerUid) &&
      assignedUids.has(String(u.uid))
  )

  if (adminsToNotify.length === 0) return

  const sendNotif = httpsCallable(functions, 'sendNotification')
  await Promise.all(
    adminsToNotify.map((u) =>
      sendNotif({
        uid: String(u.uid),
        type: 'rsvpNonAvailable',
        data: {
          userName: changerName,
          eventTitle: ev.title,
          statusLabel: AVAIL_LABELS[newStatus].toLowerCase(),
        },
      }).catch(() => {})
    )
  )
}

function getDCForUser(ev: EventTemplate, uid: string): string | null {
  if (!ev.dressCode?.length) return null
  const codes = dressCodesOn(ev.dressCode, teamsOf(ev, uid))
  return codes.length ? codes.join('; ') : null
}

async function notifyEventChanges(old: EventTemplate, updated: EventTemplate) {
  const notifications: { uid: string; msg: string }[] = []

  const teamUids = new Set([
    ...(old.teams ?? []).flatMap((t) => [...t.leaders, ...t.members].map(String)),
    ...(updated.teams ?? []).flatMap((t) => [...t.leaders, ...t.members].map(String)),
  ])
  for (const uid of teamUids) {
    // Someone can be on several teams: what changed among them.
    const was = teamsOf(old, uid)
    const now = teamsOf(updated, uid)
    const added = now.filter((t) => !was.some((w) => w.name === t.name))
    const taken = was.filter((t) => !now.some((n) => n.name === t.name))
    if (!added.length && !taken.length) continue
    const msg = !now.length
      ? `You've been removed from ${teamsSaid(taken)} for ${updated.title}`
      : added.length && taken.length
        ? `You've been moved to ${teamsSaid(now)} for ${updated.title}`
        : added.length
          ? `You've been added to ${teamsSaid(added)} for ${updated.title}`
          : `You've been taken off ${teamsSaid(taken)} for ${updated.title}`
    notifications.push({ uid, msg })
  }

  const assignedUids = new Set<string>([
    ...(updated.users ?? []).map(String),
    ...(updated.teams ?? []).flatMap((t) => [...t.leaders, ...t.members].map(String)),
  ])
  for (const uid of assignedUids) {
    if (notifications.some((n) => n.uid === uid)) continue
    const oldDC = getDCForUser(old, uid)
    const newDC = getDCForUser(updated, uid)
    if (newDC !== null && oldDC !== newDC) {
      notifications.push({ uid, msg: `Dress code update for ${updated.title}: ${newDC}` })
    }
  }

  if (notifications.length === 0) return
  await Promise.all(
    notifications.map(({ uid, msg }) => {
      const notif: InAppNotif = {
        id: `ev_upd_${Date.now()}_${uid}`,
        msg,
        ts: Date.now(),
        type: 'event_update',
        read: false,
        link: '/(app)/events',
      }
      return setDoc(doc(db, 'notifs', uid), { items: arrayUnion(notif) }, { merge: true })
    })
  )
}

/** Union of every uid assigned to an event via direct users, groups, or teams. */
export function resolveAssignedUids(t: EventTemplate): Set<string> {
  const { getMemberUids } = useGroupsStore.getState()
  const set = new Set<string>()
  ;(t.users ?? []).forEach((u) => set.add(String(u)))
  if (t.groups?.length) getMemberUids(t.groups).forEach((u) => set.add(String(u)))
  ;(t.teams ?? []).forEach((team) => {
    team.leaders.forEach((u) => set.add(String(u)))
    team.members.forEach((u) => set.add(String(u)))
  })
  return set
}

/**
 * The report times this person is shown for an event: theirs, if they are on
 * it; every one, for an admin; otherwise none (miriam/data reportTimesFor).
 */
export function reportTimesShown(ev: EventTemplate, profile: UserProfile | null): ReportTime[] {
  if (!profile?.uid) return []
  const uid = String(profile.uid)
  return reportTimesFor(ev, { uid, roles: profile.roles ?? [] }, resolveAssignedUids(ev).has(uid))
}

/**
 * Notifies uids newly added to (eventJoin, batched) or fully dropped from
 * (eventRemoved, immediate) an event's assignment (users/groups/teams),
 * comparing the before/after resolved uid sets. Routed through the
 * sendNotification callable (not a raw Firestore write) so these respect
 * notificationPrefs and participate in the batching engine.
 */
async function notifyEventJoinRemoval(old: EventTemplate, updated: EventTemplate) {
  const oldAssigned = resolveAssignedUids(old)
  const newAssigned = resolveAssignedUids(updated)
  const sendNotif = httpsCallable(functions, 'sendNotification')

  const joins = [...newAssigned].filter((uid) => !oldAssigned.has(uid))
  const removals = [...oldAssigned].filter((uid) => !newAssigned.has(uid))

  await Promise.all([
    ...joins.map((uid) =>
      sendNotif({ uid, type: 'eventJoin', data: { eventTitle: updated.title } }).catch(() => {})
    ),
    ...removals.map((uid) =>
      sendNotif({ uid, type: 'eventRemoved', data: { eventTitle: updated.title } }).catch(() => {})
    ),
  ])
}

export const useEventsStore = create<EventsStore>((set, get) => ({
  templates: [],
  overrides: {},
  avail: {},
  selectedInstanceKey: null,
  selectedEvent: null,
  loading: false,
  _openDocs: [],
  _privateDocs: {},
  _unsubTemplates: null,
  _unsubPrivate: null,
  _unsubAuth: null,
  _unsubAvail: null,
  _refCount: 0,

  instances: (from, to) => {
    const { templates, overrides } = get()
    return allInstances(templates, overrides, from, to)
  },

  getInstanceByKey: (instanceKey) => {
    const { templates, overrides } = get()
    const underscoreIdx = instanceKey.indexOf('_')
    if (underscoreIdx === -1) return null
    const templateId = instanceKey.substring(0, underscoreIdx)
    const date = instanceKey.substring(underscoreIdx + 1)
    const tmpl = templates.find((t) => String(t.id) === templateId)
    if (!tmpl) return null
    const hits = allInstances([tmpl], overrides, date, date)
    return hits.find((i) => i.instanceKey === instanceKey) ?? null
  },

  myInstances: (uid, from, to) => {
    const { templates, overrides } = get()
    const all = allInstances(templates, overrides, from, to)
    const { getMemberUids } = useGroupsStore.getState()
    return all.filter((ev) => {
      if (ev.users?.some((x) => sameId(x, uid))) return true
      if (ev.groups?.length && getMemberUids(ev.groups).some((gUid) => sameId(gUid, uid)))
        return true
      if (
        ev.teams?.some(
          (team) =>
            team.leaders.some((m) => sameId(m, uid)) || team.members.some((m) => sameId(m, uid))
        )
      )
        return true
      return false
    })
  },

  pendingAvailEvents: (uid) => {
    const today = new Date().toISOString().split('T')[0]
    const to = '9999-12-31'
    const { templates, overrides, avail } = get()
    const { getMemberUids } = useGroupsStore.getState()
    return allInstances(templates, overrides, today, to).filter((ev) => {
      const isAssigned =
        ev.users?.some((x) => sameId(x, uid)) ||
        (ev.groups?.length ? getMemberUids(ev.groups).some((gUid) => sameId(gUid, uid)) : false) ||
        (ev.teams?.some(
          (team) =>
            team.leaders.some((m) => sameId(m, uid)) || team.members.some((m) => sameId(m, uid))
        ) ??
          false)
      if (!isAssigned) return false

      // For recurring: check series response
      if (ev.isRec) {
        const seriesResp = getSeriesAvail(avail, ev.templateId ?? ev.id, uid)
        return !seriesResp || seriesResp.status === 'tbd'
      }
      // For one-time: check instance response
      const response = avail[availKey(ev)]?.[uid]
      return !response || response.status === 'tbd'
    })
  },

  checkSeriesConflicts: (templateId, uid, newStatus) => {
    const today = new Date().toISOString().split('T')[0]
    const { templates, overrides, avail } = get()
    const tmpl = templates.find((t) => sameId(t.id, templateId))
    if (!tmpl) return []

    return allInstances([tmpl], overrides, today, '9999-12-31').filter((ev) => {
      const existing = avail[availKey(ev)]?.[uid]
      if (!existing) return false
      // Treat no-source responses as manually set (pre-dates series system)
      const isManual = !existing.source || existing.source === 'instance'
      return isManual && existing.status !== newStatus
    })
  },

  subscribe: () => {
    const count = get()._refCount + 1
    set({ _refCount: count })
    if (count > 1) return

    set({ loading: true })

    const unsubTemplates = onSnapshot(collection(db, 'events'), (snap) => {
      const openDocs = snap.docs.map((d) => [d.id, d.data() as Doc] as [string, Doc])
      set({ _openDocs: openDocs, ...assemble(openDocs, get()._privateDocs), loading: false })
    })

    // Their private details (functions/src/eventPrivate): listened to as
    // whoever is signed in, and again if that, or their roles, change.
    let listeningAs: string | null = null
    const listenPrivate = () => {
      const profile = useAuthStore.getState().profile
      const as = profile ? `${profile.uid}|${isAdmin(profile)}|${isPublic(profile)}` : ''
      if (as === listeningAs) return
      listeningAs = as
      get()._unsubPrivate?.()
      set({ _unsubPrivate: null, _privateDocs: {}, ...assemble(get()._openDocs, {}) })
      const records = privateRecords(profile)
      if (!records) return
      const unsub = onSnapshot(
        records,
        (snap) => {
          const privateDocs = Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as Doc]))
          set({ _privateDocs: privateDocs, ...assemble(get()._openDocs, privateDocs) })
        },
        (err) => console.error('[EventsStore] private details:', err.code, err.message)
      )
      set({ _unsubPrivate: unsub })
    }
    listenPrivate()
    const unsubAuth = useAuthStore.subscribe(listenPrivate)

    const unsubAvail = onSnapshot(collection(db, 'avail'), (snap) => {
      const snapAvail: Record<string, Record<string, AvailResponse>> = {}
      snap.docs.forEach((d) => {
        const data = d.data() as { responses?: Record<string, AvailResponse> }
        snapAvail[d.id] = data.responses ?? {}
      })
      // Merge: keep local optimistic entries that are newer than what Firestore returned.
      set((s) => {
        const merged: Record<string, Record<string, AvailResponse>> = { ...snapAvail }
        Object.entries(s.avail).forEach(([docKey, responses]) => {
          Object.entries(responses).forEach(([respUid, local]) => {
            const server = snapAvail[docKey]?.[respUid]
            if (!server || local.ts > (server.ts ?? 0)) {
              merged[docKey] = { ...(merged[docKey] ?? {}), [respUid]: local }
            }
          })
        })
        return { avail: merged }
      })
    })

    set({ _unsubTemplates: unsubTemplates, _unsubAuth: unsubAuth, _unsubAvail: unsubAvail })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsubTemplates?.()
      get()._unsubPrivate?.()
      get()._unsubAuth?.()
      get()._unsubAvail?.()
      set({
        _unsubTemplates: null,
        _unsubPrivate: null,
        _unsubAuth: null,
        _unsubAvail: null,
        _openDocs: [],
        _privateDocs: {},
        templates: [],
        avail: {},
        overrides: {},
      })
    }
  },

  selectEvent: (key) => set({ selectedInstanceKey: key }),
  setSelectedEvent: (ev) => set({ selectedEvent: ev }),

  // Each event is two records (functions/src/eventPrivate): what anyone who
  // can see it reads, and its private details — written together.
  createEvent: async (data) => {
    const id = await nextId('nEv')
    const geoFields = await resolveGeo(data.city, data.state)
    const { open, closed } = splitFields(data as Doc)
    const batch = writeBatch(db)
    batch.set(doc(db, 'events', String(id)), {
      ...open,
      ...geoFields,
      id,
      _updatedAt: serverTimestamp(),
    })
    batch.set(doc(db, 'eventPrivate', String(id)), {
      ...closed,
      access: eventAccess(data as Doc, groupsNow()),
    })
    await batch.commit()
    return id
  },

  updateEvent: async (id, patch) => {
    const key = String(id)
    const old = get().templates.find((t) => sameId(t.id, id))
    const openNow = get()._openDocs.find(([k]) => k === key)?.[1] ?? {}
    const closedNow = get()._privateDocs[key] ?? {}
    const { open, closed } = splitFields(patch as Doc)
    // Any left in the event — from before, or by an app not yet updated —
    // moved across with this; what is set now wins over them.
    const { moved, cleared } = strays(openNow, closedNow)
    for (const k of Object.keys(closed)) delete moved[k]
    const openAfter = { ...openNow, ...open }
    const closedAfter = withMoved(withMoved(closedNow, moved), closed)
    const access = eventAccess(mergeEvent(openAfter, closedAfter), groupsNow())
    set((s) => {
      const openDocs = s._openDocs.map(([k, d]) => [k, k === key ? openAfter : d] as [string, Doc])
      const privateDocs = { ...s._privateDocs, [key]: { ...closedAfter, access } }
      return { _openDocs: openDocs, _privateDocs: privateDocs, ...assemble(openDocs, privateDocs) }
    })
    const geoFields = await resolveGeo(patch.city, patch.state)
    const batch = writeBatch(db)
    batch.update(
      doc(db, 'events', key),
      ...fieldUpdates([
        ...Object.entries({ ...open, ...geoFields }).map(
          ([k, v]) => [[k], v] as [string[], unknown]
        ),
        ...cleared.map((p) => [p, deleteField()] as [string[], unknown]),
        [['_updatedAt'], serverTimestamp()],
      ])
    )
    batch.set(doc(db, 'eventPrivate', key), { ...moved, ...closed, access }, { merge: true })
    await batch.commit()
    if (old && (patch.teams !== undefined || patch.dressCode !== undefined)) {
      notifyEventChanges(old, { ...old, ...patch }).catch(() => {})
    }
    if (
      old &&
      (patch.users !== undefined || patch.groups !== undefined || patch.teams !== undefined)
    ) {
      notifyEventJoinRemoval(old, { ...old, ...patch }).catch(() => {})
    }
  },

  deleteEvent: async (id) => {
    set((s) => ({ templates: s.templates.filter((t) => !sameId(t.id, id)) }))
    const batch = writeBatch(db)
    batch.delete(doc(db, 'events', String(id)))
    batch.delete(doc(db, 'eventPrivate', String(id)))
    await batch.commit()
  },

  setOverride: async (instanceKey, patch) => {
    const parts = instanceKey.split('_')
    const templateId = parts[0]
    // Snapshot the effective instance BEFORE writing, so join/removal can be
    // detected for changes scoped to a single occurrence (these previously
    // went undetected entirely — setOverride never checked for them).
    const before = get().getInstanceByKey(instanceKey)
    const openNow = get()._openDocs.find(([k]) => k === templateId)?.[1] ?? {}
    const closedNow = get()._privateDocs[templateId] ?? {}
    const { open, closed } = splitFields(patch as Doc)
    // Left in the event, moved across with this (as in updateEvent) — but
    // not this date's own: it is written afresh, in both records.
    const { moved, cleared } = strays(openNow, closedNow)
    const movedOverrides = moved.overrides as Record<string, Doc> | undefined
    if (movedOverrides) delete movedOverrides[instanceKey]
    const keep = cleared.filter((p) => !(p[0] === 'overrides' && p[1] === instanceKey))
    const overridesOf = (d: Doc) => (d.overrides ?? {}) as Record<string, Doc>
    const openAfter = { ...openNow, overrides: { ...overridesOf(openNow), [instanceKey]: open } }
    const closedMoved = withMoved(closedNow, moved)
    const closedAfter = {
      ...closedMoved,
      overrides: { ...overridesOf(closedMoved), [instanceKey]: closed },
    }
    const access = eventAccess(mergeEvent(openAfter, closedAfter), groupsNow())
    const batch = writeBatch(db)
    batch.update(
      doc(db, 'events', templateId),
      ...fieldUpdates([
        [['overrides', instanceKey], open],
        ...keep.map((p) => [p, deleteField()] as [string[], unknown]),
        [['_updatedAt'], serverTimestamp()],
      ])
    )
    const privateRef = doc(db, 'eventPrivate', templateId)
    batch.set(privateRef, { ...moved, access }, { merge: true })
    batch.update(privateRef, new FieldPath('overrides', instanceKey), closed)
    await batch.commit()
    if (
      before &&
      (patch.users !== undefined || patch.groups !== undefined || patch.teams !== undefined)
    ) {
      notifyEventJoinRemoval(before, { ...before, ...patch }).catch(() => {})
    }
  },

  setAvail: async (ev, uid, status, note = '') => {
    const key = availKey(ev).replace(/\//g, '_')
    const prevResponse = get().avail[key]?.[uid] ?? null

    if (!status) {
      set((s) => {
        const avail = { ...s.avail }
        if (avail[key]) {
          const { [uid]: _removed, ...rest } = avail[key]
          avail[key] = rest
        }
        return { avail }
      })
      await updateDoc(doc(db, 'avail', key), {
        [`responses.${uid}`]: null,
        updatedAt: serverTimestamp(),
      })
      return
    }

    const response: AvailResponse = { status, note, uid, ts: Date.now(), source: 'instance' }
    set((s) => ({
      avail: {
        ...s.avail,
        [key]: { ...(s.avail[key] ?? {}), [uid]: response },
      },
    }))
    await setDoc(
      doc(db, 'avail', key),
      { responses: { [uid]: response }, updatedAt: serverTimestamp() },
      { mergeFields: [`responses.${uid}`, 'updatedAt'] }
    )

    // Notify admins on any new or changed response (notifyAssignedAdmins
    // itself filters to non-"Available" statuses).
    if (!prevResponse || prevResponse.status !== status) {
      notifyAssignedAdmins(ev, uid, status).catch(() => {})
    }
  },

  setSeriesAvail: async (templateId, uid, status, note = '', forceOverrideKeys = []) => {
    const key = seriesAvailKey(templateId)
    // Capture prev BEFORE optimistic update so notification check is correct
    const prevSeriesResp = get().avail[key]?.[uid] ?? null

    if (!status) {
      set((s) => {
        const avail = { ...s.avail }
        if (avail[key]) {
          const { [uid]: _removed, ...rest } = avail[key]
          avail[key] = rest
        }
        return { avail }
      })
      await updateDoc(doc(db, 'avail', key), {
        [`responses.${uid}`]: null,
        updatedAt: serverTimestamp(),
      })
      return
    }

    const seriesResponse: AvailResponse = { status, note, uid, ts: Date.now(), source: 'series' }

    // Optimistic update for series
    set((s) => ({
      avail: {
        ...s.avail,
        [key]: { ...(s.avail[key] ?? {}), [uid]: seriesResponse },
      },
    }))

    await setDoc(
      doc(db, 'avail', key),
      { responses: { [uid]: seriesResponse }, updatedAt: serverTimestamp() },
      { mergeFields: [`responses.${uid}`, 'updatedAt'] }
    )

    // Delete confirmed override instance responses so they fall back to series
    const today = new Date().toISOString().split('T')[0]
    const { templates, overrides, avail: currentAvail } = get()
    const tmpl = templates.find((t) => sameId(t.id, templateId))

    if (tmpl) {
      const instances = allInstances([tmpl], overrides, today, '9999-12-31')

      if (forceOverrideKeys.length > 0) {
        const deletes: string[] = []
        for (const instanceKey of forceOverrideKeys) {
          if (currentAvail[instanceKey]?.[uid]) deletes.push(instanceKey)
        }

        if (deletes.length > 0) {
          set((s) => {
            const newAvail = { ...s.avail }
            deletes.forEach((instKey) => {
              if (newAvail[instKey]) {
                const { [uid]: _, ...rest } = newAvail[instKey]
                newAvail[instKey] = rest
              }
            })
            return { avail: newAvail }
          })

          await Promise.all(
            deletes.map((instKey) =>
              updateDoc(doc(db, 'avail', instKey), {
                [`responses.${uid}`]: deleteField(),
                updatedAt: serverTimestamp(),
              }).catch(() => {})
            )
          )
        }
      }

      // Notify assigned admins on any new or changed series response
      // (notifyAssignedAdmins itself filters to non-"Available" statuses).
      if ((!prevSeriesResp || prevSeriesResp.status !== status) && instances.length > 0) {
        notifyAssignedAdmins(instances[0], uid, status).catch(() => {})
      }
    }
  },
}))
