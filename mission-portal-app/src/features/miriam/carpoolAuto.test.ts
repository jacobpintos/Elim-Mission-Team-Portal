import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGroupsStore } from '@/stores/groupsStore'
import { useUsersStore } from '@/stores/usersStore'
import type { EventDraft } from '@/lib/miriam'
import { withCarsFilled } from './carpoolAuto'

// Hoisted above the imports by vitest: the memory as read, and no Firebase.
vi.mock('@/lib/carpoolMemoryDb', () => ({
  readCarpoolMemory: async () => ({
    cars: { andy_s_van: { label: 'Andy’s van', seats: 3, at: 1 } },
    rides: {},
  }),
}))
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, functions: {}, storage: {} }))

const blank: EventDraft = {
  title: 'Retreat',
  date: '',
  startTime: '',
  location: '',
  address: '',
  city: '',
  state: '',
}

describe('carpools Miriam fills in', () => {
  beforeEach(() => {
    useUsersStore.setState({
      users: [
        { uid: 'andy', displayName: 'Andy', sex: 'male' },
        { uid: 'sam', displayName: 'Sam', sex: 'male' },
        { uid: 'ben', displayName: 'Ben', sex: 'male' },
        { uid: 'cal', displayName: 'Cal', sex: 'male' },
        { uid: 'dee', displayName: 'Dee', sex: 'female' },
      ] as never,
    })
    useGroupsStore.setState({
      groups: [{ id: 'gMen', name: 'Men', members: ['andy', 'sam', 'ben', 'cal'] }] as never,
    })
  })

  it('puts everyone on the event in the cars said, a car’s size as remembered', async () => {
    const { draft, notes } = await withCarsFilled({
      ...blank,
      groups: ['gMen'],
      users: ['dee'],
      carsAuto: true,
      notRiding: ['cal'],
      cars: [
        { label: 'Andy’s van', driver: 'andy', riders: [] },
        { label: 'Sam’s car', seats: 5, driver: 'sam', riders: [] },
      ],
    })
    const riders = draft.cars!.flatMap((c) => c.riders).sort()
    // Cal isn't riding; the drivers drive.
    expect(riders).toEqual(['ben', 'dee'])
    // Andy's van holds 3, as remembered.
    expect(draft.cars![0].seats).toBe(3)
    expect(notes).toEqual([])
  })

  it('says who didn’t fit', async () => {
    const { notes } = await withCarsFilled({
      ...blank,
      groups: ['gMen'],
      users: ['dee'],
      carsAuto: true,
      cars: [{ label: 'Tiny', seats: 2, driver: 'andy', riders: [] }],
    })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatch(/didn’t fit in the cars/)
  })

  it('leaves a form whose riders were said as it is', async () => {
    const draft = { ...blank, cars: [{ label: 'Van', driver: 'andy', riders: ['ben'] }] }
    expect((await withCarsFilled(draft)).draft).toBe(draft)
  })
})
