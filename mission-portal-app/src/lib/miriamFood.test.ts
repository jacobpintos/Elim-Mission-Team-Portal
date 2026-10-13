import { describe, expect, it } from 'vitest'
import {
  dateSaid,
  eventPicked,
  foodAsked,
  foodEventsFor,
  foodItemMatch,
  listed,
} from './miriamFood'
import type { QuickData } from './miriamQuick'

const today = '2026-10-13' // a Tuesday
const templates = [
  {
    id: 'pot',
    title: 'Fall Potluck',
    date: '2026-10-18', // Sunday
    users: ['me'],
    food: true,
    foodItems: ['Pot roast', 'Drinks', 'Dessert'],
  },
  {
    id: 'yth',
    title: 'Youth Night',
    date: '2026-10-25', // the Sunday after
    users: ['me'],
    food: true,
    foodItems: ['Pizza', 'Chips'],
  },
  { id: 'prac', title: 'Band Practice', date: '2026-10-18', users: ['me'] },
  {
    id: 'old',
    title: 'Summer Picnic',
    date: '2026-08-01',
    users: ['me'],
    food: true,
    foodItems: ['Ice'],
  },
]
const data: QuickData = {
  templates: templates as never,
  overrides: {},
  groups: [],
  viewer: { uid: 'me', roles: ['regular'] },
  names: new Map(),
  today,
}

describe('foodAsked', () => {
  it('reads the dish and the day', () => {
    expect(foodAsked("I'll make potroast for Sunday", today)).toEqual({
      item: 'potroast',
      date: '2026-10-18',
      name: '',
      surelyFood: true,
      suggested: false,
    })
  })

  it('reads the dish and the event', () => {
    expect(foodAsked('I can bring the drinks to the potluck', today)).toMatchObject({
      item: 'drinks',
      date: null,
      name: 'potluck',
    })
  })

  it('reads a date said as one', () => {
    expect(foodAsked('Sign me up to bring chips on October 25th', today)).toMatchObject({
      item: 'chips',
      date: '2026-10-25',
    })
  })

  it.each([
    ["I'll bring chips as suggested", 'chips'],
    ["Sure, I'll bring the chips you suggested", 'chips'],
    ["Okay I'll bring chips like you said", 'chips'],
    ["I'll bring what you suggested", ''],
    ["I'll take the suggested chips", 'chips'],
  ])('"%s" is what was suggested', (said, item) => {
    expect(foodAsked(said, today)).toMatchObject({ item, suggested: true, surelyFood: true })
  })

  it.each([
    ["I'll take the chips", 'chips'],
    ["I'll do dessert", 'dessert'],
    ["I'll handle the drinks for Sunday", 'drinks'],
    ["Yes, I'll bring the salsa", 'salsa'],
  ])('"%s" is a sign-up too', (said, item) => {
    expect(foodAsked(said, today)?.item).toBe(item)
  })

  it('someone else’s suggestion is not hers', () => {
    expect(foodAsked("I'll bring the dish Sarah suggested", today)?.suggested).toBe(false)
  })

  it('"I\'ll take care of the drinks"', () => {
    expect(foodAsked("I'll take care of the drinks", today)?.item).toBe('drinks')
  })

  it('takes a sign-up with no day', () => {
    expect(foodAsked("I'll bake cookies", today)).toMatchObject({
      item: 'cookies',
      date: null,
      name: '',
      surelyFood: true,
    })
  })

  it('is not sure "bring" alone is food', () => {
    expect(foodAsked("I'll bring my guitar", today)?.surelyFood).toBe(false)
  })

  it('is not sure "make" is food, unless a dish is said', () => {
    expect(foodAsked("I'll make the slides", today)?.surelyFood).toBe(false)
    expect(foodAsked("I'll make lasagna", today)?.surelyFood).toBe(true)
    expect(foodAsked("I'll make potroast", today)?.surelyFood).toBe(true)
    expect(foodAsked("I'll bring brownies", today)?.surelyFood).toBe(true)
  })

  it('leaves anything else alone', () => {
    expect(foodAsked('What should I bring Sunday?', today)).toBeNull()
    expect(foodAsked("What's the dress code today?", today)).toBeNull()
  })
})

describe('foodItemMatch', () => {
  const items = ['Pot roast', 'Roast vegetables', 'Drinks', 'Main dish']

  it('matches the same name however it is spaced', () => {
    expect(foodItemMatch(items, 'potroast')).toBe(0)
    expect(foodItemMatch(items, 'pot-roast')).toBe(0)
  })

  it('matches a plural, or a word inside', () => {
    expect(foodItemMatch(items, 'drink')).toBe(2)
    expect(foodItemMatch(items, 'the main dish')).toBe(3)
  })

  it('never guesses between near misses', () => {
    expect(foodItemMatch(items, 'roast')).toBe(-1)
    expect(foodItemMatch(items, 'lasagna')).toBe(-1)
  })
})

describe('dateSaid', () => {
  it('reads month and day, slashes, and "the 25th"', () => {
    expect(dateSaid('october 25', today)).toBe('2026-10-25')
    expect(dateSaid('10/25', today)).toBe('2026-10-25')
    expect(dateSaid('the 25th', today)).toBe('2026-10-25')
  })

  it('takes the next one', () => {
    expect(dateSaid('the 3rd', today)).toBe('2026-11-03')
    expect(dateSaid('jan 4', today)).toBe('2027-01-04')
  })

  it('is null for none, or a day that isn’t one', () => {
    expect(dateSaid('sunday', today)).toBeNull()
    expect(dateSaid('feb 30', today)).toBeNull()
  })
})

describe('foodEventsFor', () => {
  it('finds the event with a sheet on that day, not the one without', () => {
    expect(foodEventsFor({ date: '2026-10-18', name: '' }, data).map((e) => e.title)).toEqual([
      'Fall Potluck',
    ])
  })

  it('finds one by name', () => {
    expect(foodEventsFor({ date: null, name: 'youth' }, data)[0].title).toBe('Youth Night')
  })

  it('with nothing said: every upcoming one with a sheet, in date order', () => {
    expect(foodEventsFor({ date: null, name: '' }, data).map((e) => e.title)).toEqual([
      'Fall Potluck',
      'Youth Night',
    ])
  })
})

describe('eventPicked', () => {
  const events = foodEventsFor({ date: null, name: '' }, data)

  it('picks by name or by day', () => {
    expect(eventPicked('the youth one', events, today)?.title).toBe('Youth Night')
    expect(eventPicked('the 25th', events, today)?.title).toBe('Youth Night')
    expect(eventPicked('Sunday', events, today)?.title).toBe('Fall Potluck')
  })

  it('is null when it isn’t plainly one', () => {
    expect(eventPicked('the other one', events, today)).toBeNull()
  })
})

describe('listed', () => {
  it('reads as a list', () => {
    expect(listed(['Drinks'])).toBe('Drinks')
    expect(listed(['Pot roast', 'Drinks', 'Dessert'])).toBe('Pot roast, Drinks and Dessert')
  })
})
