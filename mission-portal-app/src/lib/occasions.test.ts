import { describe, expect, it } from 'vitest'
import {
  nudgeSaid,
  occasionAnswer,
  occasionAsked,
  occasionDate,
  occasionFrom,
  occasionsBetween,
  occasionsSoon,
  occasionTitle,
  seesOccasions,
  type Occasion,
} from './occasions'

const today = '2026-10-26' // a Monday
const list: Occasion[] = [
  {
    id: 'w',
    kind: 'birthday',
    people: [{ name: 'Whitney Slattery', uid: 'whit' }],
    month: 11,
    day: 5,
  },
  {
    id: 'j',
    kind: 'birthday',
    people: [{ name: 'Josh Slattery', uid: 'josh' }],
    month: 10,
    day: 28,
  },
  {
    id: 'ws',
    kind: 'anniversary',
    people: [
      { name: 'Josh Slattery', uid: 'josh' },
      { name: 'Whitney Slattery', uid: 'whit' },
    ],
    month: 11,
    day: 21,
  },
  {
    id: 'lp',
    kind: 'anniversary',
    people: [{ name: 'Sam Lee' }, { name: 'Ann Park' }],
    month: 1,
    day: 9,
  },
  { id: 'leap', kind: 'birthday', people: [{ name: 'Leap Day' }], month: 2, day: 29 },
  { id: 'me', kind: 'birthday', people: [{ name: 'Jacob Pintos', uid: 'me' }], month: 10, day: 26 },
]
const ask = (text: string) => {
  const a = occasionAsked(text, today)
  return a ? occasionAnswer(a, list, today).text : null
}

describe('birthdays and anniversaries', () => {
  it('are seen by every account but a guest’s or a public one', () => {
    expect(seesOccasions(['regular'])).toBe(true)
    expect(seesOccasions(['admin'])).toBe(true)
    expect(seesOccasions(['worship'])).toBe(true)
    expect(seesOccasions(['guest'])).toBe(false)
    expect(seesOccasions(['public'])).toBe(false)
    expect(seesOccasions(undefined)).toBe(false)
  })

  it('fall on their day each year — the 28th for the 29th of February, in a year without one', () => {
    expect(occasionDate(list[4], 2027)).toBe('2027-02-28')
    expect(occasionDate(list[4], 2028)).toBe('2028-02-29')
    expect(
      occasionsBetween(list, '2026-12-25', '2027-01-15').map((f) => `${f.date} ${f.occasion.id}`)
    ).toEqual(['2027-01-09 lp'])
  })

  it('are named as a couple is called', () => {
    expect(occasionTitle(list[2])).toBe('Josh and Whitney Slattery’s anniversary')
    expect(occasionTitle(list[3])).toBe('Sam Lee and Ann Park’s anniversary')
    // Their account's name now, where they have one.
    expect(occasionTitle(list[0], new Map([['whit', 'Whitney Ray']]))).toBe(
      'Whitney Ray’s birthday'
    )
  })

  it('reads a stored one, and nothing that isn’t one', () => {
    expect(
      occasionFrom('x', { kind: 'birthday', people: [{ name: ' Ann ' }], month: 3, day: 4 })
    ).toEqual({ id: 'x', kind: 'birthday', people: [{ name: 'Ann' }], month: 3, day: 4 })
    expect(
      occasionFrom('x', { kind: 'party', people: [{ name: 'Ann' }], month: 3, day: 4 })
    ).toBeNull()
    expect(occasionFrom('x', { kind: 'birthday', people: [], month: 3, day: 4 })).toBeNull()
    expect(
      occasionFrom('x', { kind: 'birthday', people: [{ name: 'Ann' }], month: 13, day: 4 })
    ).toBeNull()
  })
})

describe('Miriam, asked about them', () => {
  it('says when someone’s is', () => {
    expect(ask('When is Whitney’s birthday?')).toBe(
      'Whitney Slattery’s birthday is Thursday, Nov 5.'
    )
    expect(ask('whens josh slatterys bday')).toBe('Josh Slattery’s birthday is Wednesday, Oct 28.')
    expect(ask('Whitney’s birthday?')).toBe('Whitney Slattery’s birthday is Thursday, Nov 5.')
  })

  it('finds a couple’s anniversary by either name first, or their last name', () => {
    const said = 'Josh and Whitney Slattery’s anniversary is Saturday, Nov 21.'
    expect(ask('When is Whitney and Josh’s anniversary?')).toBe(said)
    expect(ask('when is josh and whitney’s anniversary')).toBe(said)
    expect(ask('When is the Slattery’s anniversary?')).toBe(said)
    expect(ask('when is the slatterys anniversary')).toBe(said)
    expect(ask('when is the Slatterys’ anniversary')).toBe(said)
    expect(ask('when is Ann Park and Sam’s anniversary')).toBe(
      'Sam Lee and Ann Park’s anniversary is Saturday, Jan 9.'
    )
  })

  it('says so when it doesn’t have one', () => {
    expect(ask('when is Olivia’s birthday')).toBe('I don’t have a birthday for Olivia.')
    expect(ask('when is the Smiths’ anniversary')).toBe(
      'I don’t have an anniversary for the Smiths.'
    )
  })

  it('lists whose fall in a stretch of days', () => {
    expect(ask('Whose birthday is coming up next month?')).toBe(
      'Coming up next month: Whitney Slattery’s birthday, Thursday, Nov 5.'
    )
    expect(ask('who’s birthday is this week')).toBe(
      'Coming up this week: Jacob Pintos’s birthday, today; Josh Slattery’s birthday, Wednesday, Oct 28.'
    )
    expect(ask('any anniversaries in january')).toBe(
      'Coming up in January: Sam Lee and Ann Park’s anniversary, Saturday, Jan 9.'
    )
    expect(ask('is it anyone’s birthday today')).toBe('Today: Jacob Pintos’s birthday.')
    expect(ask('when is the next anniversary')).toBe(
      'The next anniversary: Josh and Whitney Slattery’s anniversary, Saturday, Nov 21.'
    )
    expect(ask('any anniversaries this week')).toBe('No anniversaries this week.')
    expect(ask('who has a birthday coming up')).toBe(
      'Coming up in the next 30 days: Jacob Pintos’s birthday, today; Josh Slattery’s birthday, Wednesday, Oct 28; Whitney Slattery’s birthday, Thursday, Nov 5.'
    )
  })

  it('leaves alone what isn’t asking about one', () => {
    expect(occasionAsked('when is youth night', today)).toBeNull()
    expect(occasionAsked('when is Josh’s birthday party', today)).toBeNull()
    expect(occasionAsked('happy birthday Miriam', today)).toBeNull()
    expect(occasionAsked('remind me to call Whitney on her birthday', today)).toBeNull()
    expect(occasionAsked('my birthday is May 9', today)).toBeNull()
  })
})

describe('the briefing', () => {
  it('reminds them to wish those whose day is this week — their own, only on the day', () => {
    const soon = occasionsSoon(list, today, 'me')
    expect(soon.map((n) => nudgeSaid(n, today))).toEqual([
      'Happy birthday!',
      'Josh Slattery’s birthday is Wednesday — wish Josh a happy birthday!',
    ])
    // Not Whitney's (Nov 5): more than a week away.
    expect(
      occasionsSoon(list, '2026-11-05', 'josh').map((n) => nudgeSaid(n, '2026-11-05'))
    ).toEqual(['Today is Whitney Slattery’s birthday — wish Whitney a happy birthday!'])
    // Their own, before the day: not said.
    expect(occasionsSoon(list, '2026-10-25', 'josh').map((n) => n.title)).toEqual([
      'Jacob Pintos’s birthday',
    ])
    expect(occasionsSoon(list, '2026-11-20', 'me').map((n) => nudgeSaid(n, '2026-11-20'))).toEqual([
      'Josh and Whitney Slattery’s anniversary is tomorrow — wish Josh and Whitney a happy anniversary!',
    ])
  })
})
