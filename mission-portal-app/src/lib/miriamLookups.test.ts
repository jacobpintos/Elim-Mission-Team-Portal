import { describe, expect, it } from 'vitest'
import { Lookups } from '../../functions/src/miriam/lookups'

type Firestore = ConstructorParameters<typeof Lookups>[0]

/** Just enough of Firestore for the lookups: collections, and documents by path. */
function fakeDb(data: Record<string, Record<string, Record<string, unknown>>>): Firestore {
  const snap = (id: string, d: Record<string, unknown> | undefined) => ({
    id,
    exists: d !== undefined,
    data: () => d,
  })
  return {
    collection: (name: string) => ({
      get: async () => ({
        docs: Object.entries(data[name] ?? {}).map(([id, d]) => snap(id, d)),
      }),
    }),
    doc: (path: string) => {
      const [name, id] = path.split('/')
      return { get: async () => snap(id, data[name]?.[id]) }
    },
  } as unknown as Firestore
}

const db = fakeDb({
  users: {
    sarah: { displayName: 'Sarah Lee', roles: ['regular'] },
    tom: { displayName: 'Tom Hart', roles: ['worship'] },
    boss: { displayName: 'Jacob Pintos', roles: ['admin'] },
  },
  groups: { gAll: { name: 'All', members: ['sarah', 'tom', 'boss'] } },
  events: {
    ev1: {
      title: 'Revival In The Heartland',
      date: '2026-10-25',
      city: 'Coralville',
      state: 'IA',
      address: '1 Main St',
      location: 'Coral Ridge Church',
      startTime: '9:00 PM',
      groups: ['gAll'],
      teams: [{ name: 'Worship', leaders: ['tom'], members: [] }],
      dressCode: [
        { group: 'Worship', text: 'All black' },
        { group: '_remainder_', text: 'Team shirt and jeans' },
      ],
      food: true,
      foodItems: ['Chips', 'Salsa'],
      carpool: true,
      carpoolCars: [{ id: 'c1', label: 'Van', driver: 'boss', riders: ['sarah'] }],
    },
    ev2: {
      title: 'Leaders Zoom',
      date: '2026-10-20',
      users: ['boss'],
      isVirtual: true,
      virtualLink: 'https://zoom.us/j/9',
    },
  },
  avail: {
    'ev1_2026-10-25': {
      responses: { sarah: { status: 'partial', note: 'Leaving at 10' }, tom: { status: 'no' } },
    },
  },
  foodSignups: {
    'ev1_2026-10-25': { signups: { '1': { uid: 'sarah', displayName: 'Sarah Lee' } } },
  },
  tasks: {
    t1: {
      title: 'Book sound tech',
      status: 'pending',
      assignees: ['tom'],
      evTemplateId: 'ev1',
      evDate: '2026-10-25',
    },
    t2: {
      title: 'Print programs',
      status: 'in_progress',
      assignees: ['sarah'],
      evTemplateId: 'ev1',
    },
  },
})
const today = '2026-10-09'
const as = (uid: string, roles: string[]) => new Lookups(db, { uid, roles }, today)

describe('what Miriam looks up, for whoever is asking', () => {
  it('finds an event by name, and not one the asker is not on', async () => {
    const found = await as('sarah', ['regular']).findEvents('revival heartland', '')
    expect(found.found).toEqual([
      expect.objectContaining({ key: 'ev1_2026-10-25', date: 'Sunday, 2026-10-25' }),
    ])
    expect((await as('sarah', ['regular']).findEvents('leaders zoom', '')).found).toEqual([])
  })

  it('gives an event’s details as the asker is shown them', async () => {
    const ev = await as('sarah', ['regular']).getEvent('ev1_2026-10-25')
    expect(ev).toMatchObject({
      venue: 'Coral Ridge Church',
      address: '1 Main St, Coralville, IA',
      dressCode: ['Team shirt and jeans'],
      food: { mine: ['Salsa'], sheet: ['Chips: nobody yet', 'Salsa: you'] },
      carpool: { cars: ['Van (your car): driven by Jacob Pintos, riding: Sarah Lee'] },
      yourAvailability: 'Partly available — “Leaving at 10”',
    })
    // Only her own task; Tom's is not hers to see.
    expect((ev as { tasks: { title: string }[] }).tasks.map((t) => t.title)).toEqual([
      'Print programs',
    ])
  })

  it('gives an admin every task for the event, with who has it', async () => {
    const ev = (await as('boss', ['admin']).getEvent('ev1_2026-10-25')) as {
      tasks: { title: string; status: string; assignedTo: string[] }[]
    }
    expect(ev.tasks).toEqual([
      { title: 'Book sound tech', status: 'Not started', assignedTo: ['Tom Hart'], due: undefined },
      { title: 'Print programs', status: 'In progress', assignedTo: ['Sarah Lee'], due: undefined },
    ])
  })

  it('reads the meeting link to someone on the meeting, and nothing to anyone else', async () => {
    expect(await as('boss', ['admin']).getEvent('ev2_2026-10-20')).toMatchObject({
      virtualMeetingLink: 'https://zoom.us/j/9',
    })
    expect(await as('sarah', ['regular']).getEvent('ev2_2026-10-20')).toEqual({
      error: 'No event this person can see has that key.',
    })
  })

  it('tells an admin who is not plainly available, and anyone else only their own', async () => {
    expect(await as('boss', ['admin']).availability('ev1_2026-10-25')).toMatchObject({
      everyone: {
        notAvailable: ['Tom Hart'],
        partly: ['Sarah Lee (“Leaving at 10”)'],
        notSure: [],
        noAnswer: ['Jacob Pintos'],
        available: 0,
        total: 3,
      },
    })
    expect(await as('sarah', ['regular']).availability('ev1_2026-10-25')).toEqual({
      event: 'Revival In The Heartland',
      yours: 'Partly available — “Leaving at 10”',
      note: 'Only admins can see other people’s availability.',
    })
  })

  it('finds tasks the asker can see', async () => {
    const mine = await as('sarah', ['regular']).findTasks('')
    expect(mine.found.map((t) => t.title)).toEqual(['Print programs'])
    expect((await as('sarah', ['regular']).findTasks('sound tech')).found).toEqual([])
  })
})
