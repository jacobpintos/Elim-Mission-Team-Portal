import { create } from 'zustand'
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { geocodeCity } from '@/lib/geocode'
import { allInstances } from '@/lib/events'
import { availKey } from '@/lib/availability'
import { sameId } from '@/lib/ids'
import { nextId } from '@/lib/counters'
import { useGroupsStore } from '@/stores/groupsStore'
import type { EventTemplate, EventInstance, AvailResponse } from '@/types/events'

interface EventsStore {
  templates: EventTemplate[]
  overrides: Record<string, Partial<EventTemplate>>
  avail: Record<string, Record<string, AvailResponse>>
  selectedInstanceKey: string | null
  loading: boolean
  _unsubTemplates: (() => void) | null
  _unsubAvail: (() => void) | null
  // selectors
  instances: (from: string, to: string) => EventInstance[]
  myInstances: (uid: string, from: string, to: string) => EventInstance[]
  pendingAvailEvents: (uid: string) => EventInstance[]
  // actions
  subscribe: () => void
  unsubscribe: () => void
  selectEvent: (key: string | null) => void
  createEvent: (data: Omit<EventTemplate, 'id'>) => Promise<void>
  updateEvent: (id: string | number, patch: Partial<EventTemplate>) => Promise<void>
  deleteEvent: (id: string | number) => Promise<void>
  setOverride: (instanceKey: string, patch: Partial<EventTemplate>) => Promise<void>
  setAvail: (
    ev: EventInstance,
    uid: string,
    status: AvailResponse['status'] | null,
    note?: string
  ) => Promise<void>
}

async function resolveGeo(city?: string, state?: string) {
  if (!city || !state) return {}
  const coords = await geocodeCity(city, state)
  if (!coords) return {}
  return { lat: coords.lat, lng: coords.lng, _geocodeLat: coords.lat, _geocodeLng: coords.lng }
}

export const useEventsStore = create<EventsStore>((set, get) => ({
  templates: [],
  overrides: {},
  avail: {},
  selectedInstanceKey: null,
  loading: false,
  _unsubTemplates: null,
  _unsubAvail: null,

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
      if (ev.groups?.length) return getMemberUids(ev.groups).some((gUid) => sameId(gUid, uid))
      return false
    })
  },

  pendingAvailEvents: (uid) => {
    const today = new Date().toISOString().split('T')[0]
    const in60 = new Date()
    in60.setDate(in60.getDate() + 60)
    const to = in60.toISOString().split('T')[0]
    const { templates, overrides, avail } = get()
    const { getMemberUids } = useGroupsStore.getState()
    return allInstances(templates, overrides, today, to).filter((ev) => {
      const isAssigned =
        ev.users?.some((x) => sameId(x, uid)) ||
        (ev.groups?.length ? getMemberUids(ev.groups).some((gUid) => sameId(gUid, uid)) : false)
      if (!isAssigned) return false
      const response = avail[availKey(ev)]?.[uid]
      return !response || response.status === 'tbd'
    })
  },

  subscribe: () => {
    if (get()._unsubTemplates) return

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
      const avail: Record<string, Record<string, AvailResponse>> = {}
      snap.docs.forEach((d) => {
        const data = d.data() as { responses?: Record<string, AvailResponse> }
        avail[d.id] = data.responses ?? {}
      })
      set({ avail })
    })

    set({ _unsubTemplates: unsubTemplates, _unsubAvail: unsubAvail })
  },

  unsubscribe: () => {
    get()._unsubTemplates?.()
    get()._unsubAvail?.()
    set({ _unsubTemplates: null, _unsubAvail: null, templates: [], avail: {}, overrides: {} })
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
  },

  updateEvent: async (id, patch) => {
    set((s) => ({
      templates: s.templates.map((t) => (sameId(t.id, id) ? { ...t, ...patch } : t)),
    }))
    const geoFields = await resolveGeo(patch.city, patch.state)
    await updateDoc(doc(db, 'events', String(id)), {
      ...patch,
      ...geoFields,
      _updatedAt: serverTimestamp(),
    })
  },

  deleteEvent: async (id) => {
    set((s) => ({ templates: s.templates.filter((t) => !sameId(t.id, id)) }))
    await deleteDoc(doc(db, 'events', String(id)))
  },

  setOverride: async (instanceKey, patch) => {
    // instanceKey = `${templateId}_${date}`, extract templateId
    const parts = instanceKey.split('_')
    const templateId = parts[0]
    await updateDoc(doc(db, 'events', templateId), {
      [`overrides.${instanceKey}`]: patch,
      _updatedAt: serverTimestamp(),
    })
  },

  setAvail: async (ev, uid, status, note = '') => {
    const key = availKey(ev).replace(/\//g, '_')
    if (!status) {
      // Remove availability — use FieldValue.delete() equivalent: set field to null
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
    const response: AvailResponse = { status, note, uid, ts: Date.now() }
    // Optimistic
    set((s) => ({
      avail: {
        ...s.avail,
        [key]: { ...(s.avail[key] ?? {}), [uid]: response },
      },
    }))
    await setDoc(
      doc(db, 'avail', key),
      { [`responses.${uid}`]: response, updatedAt: serverTimestamp() },
      { merge: true }
    )
  },
}))
