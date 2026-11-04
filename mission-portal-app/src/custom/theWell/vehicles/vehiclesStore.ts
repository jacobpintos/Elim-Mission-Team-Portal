import { create } from 'zustand'
import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { onSnapshot } from '@/lib/liveFirestore'
import { audit } from '@/lib/audit'
import { useAuthStore } from '@/stores/authStore'
import { ELIM_VAN_ID, withElimVan } from './elimVan'
import { vehicleData, vehicleFrom, type Vehicle } from './types'

/**
 * Custom: The Well. The vehicles (vehicles/{id}, admins only: firestore.rules),
 * listened to while a screen that needs them is open — Admin → Vehicles, the
 * carpool planner, Miriam — and changed through here, each change audited.
 */
interface VehiclesStore {
  vehicles: Vehicle[]
  loaded: boolean
  subscribe: () => void
  unsubscribe: () => void
  /** Added or changed, whole. */
  save: (vehicle: Vehicle) => Promise<void>
  remove: (vehicle: Vehicle) => Promise<void>
  _unsub: (() => void) | null
  _listeners: number
}

/** Who made a change, as the audit trail names them. */
const whoDid = () => useAuthStore.getState().profile?.displayName ?? ''

/** A new vehicle's id: from its name, made unique among those kept. */
export function newVehicleId(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'vehicle'
  let id = base
  for (let n = 2; taken.includes(id) || id === ELIM_VAN_ID; n++) id = `${base}-${n}`
  return id
}

export const useVehiclesStore = create<VehiclesStore>((set, get) => ({
  vehicles: withElimVan([]),
  loaded: false,
  _unsub: null,
  _listeners: 0,
  subscribe: () => {
    set((s) => ({ _listeners: s._listeners + 1 }))
    if (get()._unsub) return
    const unsub = onSnapshot(
      collection(db, 'vehicles'),
      (snap) => {
        const kept = snap.docs
          .map((d) => vehicleFrom(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => a.name.localeCompare(b.name))
        set({ vehicles: withElimVan(kept), loaded: true })
      },
      () => set({ loaded: true })
    )
    set({ _unsub: unsub })
  },
  unsubscribe: () => {
    const left = Math.max(0, get()._listeners - 1)
    set({ _listeners: left })
    if (left > 0) return
    get()._unsub?.()
    set({ _unsub: null })
  },
  save: async (vehicle) => {
    const isNew = !get().vehicles.some((v) => v.id === vehicle.id)
    await setDoc(doc(db, 'vehicles', vehicle.id), vehicleData(vehicle))
    await audit(
      isNew ? 'vehicles.added' : 'vehicles.updated',
      `${isNew ? 'Added' : 'Updated'} vehicle "${vehicle.name}" (${vehicle.seats} seats, ${vehicle.drivers.length} drivers)`,
      whoDid()
    ).catch(() => {})
  },
  remove: async (vehicle) => {
    if (vehicle.id === ELIM_VAN_ID) throw new Error('The Elim Van can be changed, not removed.')
    await deleteDoc(doc(db, 'vehicles', vehicle.id))
    await audit('vehicles.removed', `Removed vehicle "${vehicle.name}"`, whoDid()).catch(() => {})
  },
}))

/** The vehicles, read once (for Miriam): kept, or the Elim Van alone when none can be read. */
export async function readVehicles(): Promise<Vehicle[]> {
  const store = useVehiclesStore.getState()
  if (store.loaded) return store.vehicles
  store.subscribe()
  try {
    for (let i = 0; i < 40 && !useVehiclesStore.getState().loaded; i++) {
      await new Promise((r) => setTimeout(r, 100))
    }
    return useVehiclesStore.getState().vehicles
  } finally {
    useVehiclesStore.getState().unsubscribe()
  }
}
