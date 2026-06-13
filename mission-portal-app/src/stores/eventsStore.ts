import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { geocodeCity } from '@/lib/geocode'
import { allInstances } from '@/lib/events'
import { availKey, seriesAvailKey, getSeriesAvail } from '@/lib/availability'
import { AVAIL_LABELS } from '@/lib/availability'
import { sameId } from '@/lib/ids'
import { nextId } from '@/lib/counters'
import { useGroupsStore } from '@/stores/groupsStore'
import { useUsersStore } from '@/stores/usersStore'
import type { EventTemplate, EventInstance, AvailResponse, InAppNotif } from '@/types/events'

interface EventsStore {
  templates: EventTemplate[]
  overrides: Record<string, Partial<EventTemplate>>
  avail: Record<string, Record<string, AvailResponse>>
  selectedInstanceKey: string | null
  loading: boolean
  _unsubTemplates: (() => void) | null
  _unsubAvail: (() => void) | null
  _refCount: number
  // selectors
  instances: (from: string, to: string) => EventInstance[]
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

async function resolveGeo(city?: string, state?: string) {
  if (!city || !state) return {}
  const coords = await geocodeCity(city, state)
  if (!coords) return {}
  return { lat: coords.lat, lng: coords.lng, _geocodeLat: coords.lat, _geocodeLng: coords.lng }
}

async function notifyAssignedAdmins(
  ev: EventInstance,
  changerUid: string,
  newStatus: AvailResponse['status']
) {
  const { users } = useUsersStore.getState()
  const { groups } = useGroupsStore.getState()

  const assignedUids = new Set<string>()
  ev.users?.forEach((u) => assignedUids.add(String(u)))
  ev.groups?.forEach((gid) => {
    const grp = groups.find((g) => sameId(g.id, gid))
    grp?.members.forEach((m) => assignedUids.add(String(m)))
  })
  ev.teams?.forEach((team) => {
    team.leaders.forEach((m) => assignedUids.add(String(m)))
    team.members.forEach((m) => assignedUids.add(String(m)))
  })

  const changer = users.find((u) => sameId(u.uid, changerUid))
  const changerName = changer?.displayName || changer?.email || changerUid

  const adminsToNotify = users.filter(
    (u) =>
      u.roles?.includes('admin') &&
      String(u.uid) !== String(changerUid) &&
      assignedUids.has(u.uid)
  )

  if (adminsToNotify.length === 0) return

  const notif: InAppNotif = {
    id: `avail_${Date.now()}`,
    msg: `${changerName} is ${AVAIL_LABELS[newStatus].toLowerCase()} for ${ev.title}${ev.isRec ? ` (${ev.date})` : ''}`,
    ts: Date.now(),
    type: 'avail',
    read: false,
    link: '/(app)/events',
  }

  await Promise.all(
    adminsToNotify.map((u) =>
      setDoc(doc(db, 'notifs', String(u.uid)), { items: arrayUnion(notif) }, { merge: true })
    )
  )
}

function getDCForUser(ev: EventTemplate, uid: string): string | null {
  if (!ev.dressCode?.length) return null
  const myTeam = (ev.teams ?? []).find(
    (t) => t.leaders.some((m) => sameId(m, uid)) || t.members.some((m) => sameId(m, uid))
  )
  const groupName = myTeam?.name ?? 'Unassigned'
  const specific = ev.dressCode.find((e) => e.group === groupName)
  const remainder = ev.dressCode.find((e) => e.group === '_remainder_')
  return (specific ?? remainder)?.text ?? null
}

async function notifyEventChanges(old: EventTemplate, updated: EventTemplate) {
  const notifications: Array<{ uid: string; msg: string }> = []

  const teamUids = new Set([
    ...(old.teams ?? []).flatMap((t) => [...t.leaders, ...t.members].map(String)),
    ...(updated.teams ?? []).flatMap((t) => [...t.leaders, ...t.members].map(String)),
  ])
  for (const uid of teamUids) {
    const oldTeam = (old.teams ?? []).find(
      (t) => t.leaders.some((m) => sameId(m, uid)) || t.members.some((m) => sameId(m, uid))
    )
    const newTeam = (updated.teams ?? []).find(
      (t) => t.leaders.some((m) => sameId(m, uid)) || t.members.some((m) => sameId(m, uid))
    )
    if (oldTeam?.name !== newTeam?.name) {
      const msg = newTeam
        ? `You've been moved to the ${newTeam.name} team for ${updated.title}`
        : `You've been removed from the ${oldTeam!.name} team for ${updated.title}`
      notifications.push({ uid, msg })
    }
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

export const useEventsStore = create<EventsStore>((set, get) => ({
  templates: [],
  overrides: {},
  avail: {},
  selectedInstanceKey: null,
  loading: false,
  _unsubTemplates: null,
  _unsubAvail: null,
  _refCount: 0,

  instances: (from, to) => {
    const { templates, overrides } = get()
    return allInstances(templates, overrides, from, to)
  },

  myInstances: (uid, from, to) => {
    const { templates, overrides } = get()
    const all = allInstances(templates, overrides, from, to)
    const { getMemberUids } = useGroupsStore.getState()
    return all.filter((ev) => {
      if (ev.users?.some((x) => sameId(x, uid))) return true
      if (ev.groups?.length && getMemberUids(ev.groups).some((gUid) => sameId(gUid, uid))) return true
      if (ev.teams?.some((team) =>
        team.leaders.some((m) => sameId(m, uid)) ||
        team.members.some((m) => sameId(m, uid))
      )) return true
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
        (ev.teams?.some((team) =>
          team.leaders.some((m) => sameId(m, uid)) ||
          team.members.some((m) => sameId(m, uid))
        ) ?? false)
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
      const templates: EventTemplate[] = []
      const overrides: Record<string, Partial<EventTemplate>> = {}
      snap.docs.forEach((d) => {
        const data = d.data() as EventTemplate & {
          overrides?: Record<string, Partial<EventTemplate>>
        }
        const { overrides: docOverrides, ...tmpl } = data
        templates.push({ ...tmpl, id: d.id })
        if (docOverrides) {
          Object.entries(docOverrides).forEach(([key, val]) => {
            overrides[key] = val
          })
        }
      })
      set({ templates, overrides, loading: false })
    })

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

    set({ _unsubTemplates: unsubTemplates, _unsubAvail: unsubAvail })
  },

  unsubscribe: () => {
    const count = Math.max(0, get()._refCount - 1)
    set({ _refCount: count })
    if (count === 0) {
      get()._unsubTemplates?.()
      get()._unsubAvail?.()
      set({ _unsubTemplates: null, _unsubAvail: null, templates: [], avail: {}, overrides: {} })
    }
  },

  selectEvent: (key) => set({ selectedInstanceKey: key }),

  createEvent: async (data) => {
    const id = await nextId('nEv')
    const geoFields = await resolveGeo(data.city, data.state)
    await setDoc(doc(db, 'events', String(id)), {
      ...data,
      ...geoFields,
      id,
      _updatedAt: serverTimestamp(),
    })
    return id
  },

  updateEvent: async (id, patch) => {
    const old = get().templates.find((t) => sameId(t.id, id))
    set((s) => ({
      templates: s.templates.map((t) => (sameId(t.id, id) ? { ...t, ...patch } : t)),
    }))
    const geoFields = await resolveGeo(patch.city, patch.state)
    await updateDoc(doc(db, 'events', String(id)), {
      ...patch,
      ...geoFields,
      _updatedAt: serverTimestamp(),
    })
    if (old && (patch.teams !== undefined || patch.dressCode !== undefined)) {
      notifyEventChanges(old, { ...old, ...patch }).catch(() => {})
    }
  },

  deleteEvent: async (id) => {
    set((s) => ({ templates: s.templates.filter((t) => !sameId(t.id, id)) }))
    await deleteDoc(doc(db, 'events', String(id)))
  },

  setOverride: async (instanceKey, patch) => {
    const parts = instanceKey.split('_')
    const templateId = parts[0]
    await updateDoc(doc(db, 'events', templateId), {
      [`overrides.${instanceKey}`]: patch,
      _updatedAt: serverTimestamp(),
    })
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

    // Notify admins only when changing from a previously-set value
    if (prevResponse && prevResponse.status !== status) {
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

      // Notify assigned admins when changing from a previously-set series response
      if (prevSeriesResp && prevSeriesResp.status !== status && instances.length > 0) {
        notifyAssignedAdmins(instances[0], uid, status).catch(() => {})
      }
    }
  },
}))
