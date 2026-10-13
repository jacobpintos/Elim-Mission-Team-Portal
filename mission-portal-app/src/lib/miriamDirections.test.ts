import { describe, expect, it } from 'vitest'
import { directionsAsked } from './miriamDirections'
import { directionsUrl, googleDirectionsUrl, placeOf } from './directions'

const today = '2026-10-13' // a Tuesday

describe('the way to an event, asked', () => {
  it('reads how it is asked, and the event — by day, by name, or both', () => {
    expect(directionsAsked('Give me directions to the event on Sunday', today)).toEqual({
      date: '2026-10-18',
      name: '',
    })
    expect(directionsAsked('Take me to youth night', today)).toEqual({
      date: null,
      name: 'youth night',
    })
    expect(directionsAsked('How do I get to the retreat?', today)).toEqual({
      date: null,
      name: 'retreat',
    })
    expect(directionsAsked('Navigate to Sunday Service', today)).toEqual({
      date: '2026-10-18',
      name: 'sunday service',
    })
    expect(directionsAsked('Can you open maps for the potluck', today)).toEqual({
      date: null,
      name: 'potluck',
    })
    expect(directionsAsked('directions to band practice tomorrow', today)).toEqual({
      date: '2026-10-14',
      name: 'band practice',
    })
    expect(directionsAsked('What’s the best way to the retreat', today)).toEqual({
      date: null,
      name: 'retreat',
    })
  })

  it('none named: "there", "please"', () => {
    expect(directionsAsked('Take me there', today)).toEqual({ date: null, name: '' })
    expect(directionsAsked('Directions, please', today)).toEqual({ date: null, name: '' })
  })

  it('isn’t one', () => {
    expect(directionsAsked('Where is the retreat?', today)).toBeNull()
    expect(directionsAsked('Take out the trash', today)).toBeNull()
    expect(directionsAsked('Take me home', today)).toBeNull()
    expect(directionsAsked('', today)).toBeNull()
  })
})

describe('the maps it opens in', () => {
  const place = placeOf({
    location: 'The Midnight Gem',
    address: '2613 Ders Drive NW',
    city: 'Swisher',
    state: 'IA',
  })

  it('names the place as maps find it', () => {
    expect(place).toBe('The Midnight Gem, 2613 Ders Drive NW, Swisher, IA')
    expect(placeOf({ city: 'Swisher', state: 'IA' })).toBe('Swisher, IA')
    expect(placeOf({})).toBe('')
  })

  it('a phone’s own maps; Google Maps in a browser', () => {
    const q = 'The%20Midnight%20Gem%2C%202613%20Ders%20Drive%20NW%2C%20Swisher%2C%20IA'
    expect(directionsUrl(place, 'ios')).toBe(`maps://?daddr=${q}`)
    expect(directionsUrl(place, 'android')).toBe(`geo:0,0?q=${q}`)
    expect(directionsUrl(place, 'web')).toBe(googleDirectionsUrl(place))
    expect(googleDirectionsUrl(place)).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${q}`
    )
  })
})
