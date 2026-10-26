import { describe, expect, it } from 'vitest'
import { comingAsked, comingSaid, eventsThere } from './miriamComing'
import type { EventInstance } from '../../functions/src/miriam/data'

describe('when Elim is coming, asked', () => {
  it('hears "my area" as where they are', () => {
    for (const said of [
      'when is Elim coming to my area',
      'When is Elim coming to my area?',
      'is elim coming near me anytime soon',
      'when will you guys be in my city',
      'any events near me?',
      'what’s happening around here',
      'are y’all coming to town',
    ]) {
      expect(comingAsked(said), said).toEqual({ near: true })
    }
  })

  it('hears a city named', () => {
    expect(comingAsked('when is Elim coming to Des Moines')).toEqual({
      near: false,
      place: 'des moines',
    })
    expect(comingAsked('Will the tour be in Iowa City, IA this year?')).toEqual({
      near: false,
      place: 'iowa city, ia',
    })
    expect(comingAsked('any events in Austin TX')).toEqual({ near: false, place: 'austin tx' })
  })

  it('leaves what isn’t that', () => {
    for (const said of [
      'is anything in the store on sale',
      'when is Sunday service',
      'what’s happening this weekend',
      'where is the retreat',
      'any events on my calendar',
      'when is the retreat coming to an end',
    ]) {
      expect(comingAsked(said), said).toBeNull()
    }
  })
})

const ev = (o: Partial<EventInstance>): EventInstance =>
  ({ id: o.templateId, instanceKey: `${o.templateId}_${o.date}`, ...o }) as EventInstance
const northLiberty = { lat: 41.7494, lng: -91.5979 }
const events = [
  ev({
    templateId: 'sun',
    title: 'Sunday Service',
    date: '2026-11-01',
    startTime: '10:00 AM',
    isRec: true,
    recur: 'weekly',
    location: 'The Midnight Gem',
    city: 'Swisher',
    state: 'IA',
    _geocodeLat: 41.84,
    _geocodeLng: -91.69,
  }),
  ev({ templateId: 'online', title: 'Prayer Night', date: '2026-11-03', isVirtual: true }),
  ev({
    templateId: 'sun',
    title: 'Sunday Service',
    date: '2026-11-08',
    startTime: '10:00 AM',
    isRec: true,
    recur: 'weekly',
    location: 'The Midnight Gem',
    city: 'Swisher',
    state: 'IA',
    _geocodeLat: 41.84,
    _geocodeLng: -91.69,
  }),
  ev({
    templateId: 'dsm',
    title: 'Revival',
    date: '2026-11-20',
    startTime: '7:00 PM',
    location: 'Wells Fargo Arena',
    city: 'Des Moines',
    state: 'IA',
    _geocodeLat: 41.59,
    _geocodeLng: -93.62,
  }),
]

describe('what’s coming there', () => {
  it('near them: within their distance, in person, each event once', () => {
    const found = eventsThere(events, { ...northLiberty, miles: 30 })
    expect(found.map((e) => e.instanceKey)).toEqual(['sun_2026-11-01'])
    expect(comingSaid(found, 'near you')).toBe(
      'Coming up near you: Sunday Service, every week — next on Sunday, November 1 at 10:00 AM, The Midnight Gem, Swisher.'
    )
    expect(eventsThere(events, { ...northLiberty, miles: 150 }).map((e) => e.title)).toEqual([
      'Sunday Service',
      'Revival',
    ])
  })

  it('in a city named: by its name, or around it on the map', () => {
    expect(
      eventsThere(events, null, { city: 'Des Moines', state: 'IA' }).map((e) => e.title)
    ).toEqual(['Revival'])
    expect(eventsThere(events, { lat: 41.6, lng: -93.6, miles: 25 }).map((e) => e.title)).toEqual([
      'Revival',
    ])
    expect(
      comingSaid(eventsThere(events, null, { city: 'des moines', state: '' }), 'in Des Moines')
    ).toBe(
      'Coming up in Des Moines: Revival on Friday, November 20 at 7:00 PM, Wells Fargo Arena, Des Moines.'
    )
  })

  it('none there: nothing upcoming at the moment, and who to ask', () => {
    const none = eventsThere(events, null, { city: 'Omaha', state: 'NE' })
    expect(none).toEqual([])
    expect(comingSaid(none, 'in Omaha')).toBe(
      'There’s nothing upcoming in Omaha at the moment — but you can contact our leadership team to ask for Elim to come. Here’s the form to reach them.'
    )
  })
})
