import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUsersStore } from '@/stores/usersStore'
import type { UserProfile } from '@/types/user'
import { ELIM_VAN } from './vehicles/elimVan'
import { useVehiclesStore } from './vehicles/vehiclesStore'
import { usePersonRulesStore } from './people/personRulesStore'
import { addVehicle, removeVehicle, updateVehicle, vehiclesForMiriam } from './miriam'

// Hoisted above the imports by vitest: no Firebase, and saves kept here.
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, functions: {}, storage: {} }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: { getState: () => ({ profile: null }) } }))

const admin = { uid: 'a1', displayName: 'Admin', roles: ['admin'] } as unknown as UserProfile
const member = { uid: 'm1', displayName: 'Member', roles: ['regular'] } as unknown as UserProfile
const odyssey = {
  id: 'odyssey',
  name: 'Andy’s Odyssey',
  seats: 7,
  drivers: ['andy'],
  trailer: 'small' as const,
}
const saved: unknown[] = []

describe('Miriam and the vehicles', () => {
  beforeEach(() => {
    saved.length = 0
    useUsersStore.setState({
      users: [
        { uid: 'andy', displayName: 'Andy Cole' },
        { uid: 'tom', displayName: 'Tom Reyes' },
      ] as never,
    })
    usePersonRulesStore.setState({ loaded: true, rules: [{ uid: 'tom', noTrailer: true }] })
    useVehiclesStore.setState({
      vehicles: [ELIM_VAN, odyssey],
      loaded: true,
      save: async (v) => void saved.push(v),
      remove: async (v) => void saved.push({ removed: v.id }),
    })
  })

  it('reads the list, the Elim Van’s drivers said as they are', async () => {
    const { vehicles } = await vehiclesForMiriam()
    expect(vehicles[0]).toMatchObject({
      name: 'Elim Van',
      seats: 15,
      drivers: ['anyone who may drive another vehicle'],
      asked_each_time: true,
    })
    expect(vehicles[1]).toMatchObject({
      name: 'Andy’s Odyssey',
      drivers: ['Andy Cole'],
      trailer: 'small',
    })
    const { special_rules_for_people: rules } = await vehiclesForMiriam()
    expect(rules).toEqual([{ name: 'Tom Reyes', rules: ['can’t pull a trailer'] }])
  })

  it('adds one for an admin, to confirm, and no one else', async () => {
    expect((await addVehicle(member, { name: 'Bus' })).kind).toBe('cannot')
    const prepared = await addVehicle(admin, {
      name: 'Sam’s F-150',
      seats: 5,
      trailer: 'both',
      driver_ids: ['tom', 'nobody'],
      notes: '',
    })
    expect(prepared.kind).toBe('ready')
    if (prepared.kind !== 'ready') return
    expect(prepared.details[0]).toBe(
      'Sam’s F-150 · 5 seats · Small or big trailer · Drivers: Tom Reyes'
    )
    await prepared.run()
    expect(saved[0]).toMatchObject({ id: 'sam-s-f-150', drivers: ['tom'], trailer: 'both' })
  })

  it('changes one: drivers added and taken off, a trailer, said as changes', async () => {
    const prepared = await updateVehicle(admin, {
      vehicle: 'odyssey',
      new_name: '',
      seats: 8,
      trailer: 'both',
      add_driver_ids: ['tom'],
      remove_driver_ids: ['andy'],
      notes: '',
    })
    if (prepared.kind !== 'ready') throw new Error(prepared.kind)
    expect(prepared.details).toEqual([
      '8 seats (was 7)',
      'Small or big trailer (was small trailer only)',
      'May drive it now: Tom Reyes',
      'No longer drives it: Andy Cole',
    ])
    await prepared.run()
    expect(saved[0]).toMatchObject({ seats: 8, trailer: 'both', drivers: ['tom'] })
    await prepared.undo!()
    expect(saved[1]).toEqual(odyssey)
  })

  it('removes one, but never the Elim Van', async () => {
    expect(await removeVehicle(admin, { vehicle: 'Elim Van' })).toEqual({
      kind: 'cannot',
      message: 'The Elim Van can be changed, but not taken off the list.',
    })
    const prepared = await removeVehicle(admin, { vehicle: 'Andy’s Odyssey' })
    expect(prepared.kind === 'ready' && prepared.destructive).toBe(true)
    expect((await removeVehicle(admin, { vehicle: 'the bus' })).kind).toBe('cannot')
  })
})
