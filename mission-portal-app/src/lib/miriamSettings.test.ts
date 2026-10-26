import { describe, expect, it } from 'vitest'
import { accountAsked, locationAsked, nameChangeAsked, placeIn, themeAsked } from './miriamSettings'

describe('light or dark, asked of Miriam', () => {
  it('hears the mode asked for', () => {
    const cases: [string, 'light' | 'dark'][] = [
      ['change to light mode', 'light'],
      ['Switch to dark mode', 'dark'],
      ['dark theme please', 'dark'],
      ['light mode', 'light'],
      ['turn on dark mode', 'dark'],
      ['turn off dark mode', 'light'],
      ['turn dark mode off', 'light'],
      ['can you put it in light mode?', 'light'],
      ['make the app dark', 'dark'],
      ['switch it back to light', 'light'],
      ['I want light-mode', 'light'],
      ['how do I change to dark mode', 'dark'],
    ]
    for (const [said, mode] of cases) expect(themeAsked(said), said).toBe(mode)
  })

  it('leaves everything else', () => {
    for (const said of [
      'is dark mode on?',
      'what is light mode',
      'turn on the lights',
      'when is the light show',
      'the dark night of the soul sermon',
      'play light of the world',
    ]) {
      expect(themeAsked(said), said).toBeNull()
    }
  })
})

describe('their name', () => {
  it('hears the new name', () => {
    expect(nameChangeAsked('Change my name to Sam Lee')).toBe('Sam Lee')
    expect(nameChangeAsked('change my name to sam lee')).toBe('Sam Lee')
    expect(nameChangeAsked('could you set my display name to “Sammy”?')).toBe('Sammy')
    expect(nameChangeAsked('what is my name')).toBeNull()
    expect(nameChangeAsked('change the event name to Revival')).toBeNull()
  })
})

describe('their location', () => {
  it('reads a city and its state', () => {
    expect(placeIn('North Liberty, Iowa')).toEqual({ city: 'North Liberty', state: 'IA' })
    expect(placeIn('iowa city ia')).toEqual({ city: 'Iowa City', state: 'IA' })
    expect(placeIn('Austin, TX')).toEqual({ city: 'Austin', state: 'TX' })
    expect(placeIn('Rapid City South Dakota')).toEqual({ city: 'Rapid City', state: 'SD' })
  })

  it('hears where to, and how far', () => {
    expect(locationAsked('Set my location to North Liberty, Iowa')).toEqual({
      city: 'North Liberty',
      state: 'IA',
      radius: null,
    })
    expect(locationAsked('change my location to Iowa City IA within 30 miles')).toEqual({
      city: 'Iowa City',
      state: 'IA',
      radius: 30,
    })
    expect(locationAsked('I live in Austin, TX')).toEqual({
      city: 'Austin',
      state: 'TX',
      radius: null,
    })
    expect(locationAsked('change my radius to 25 miles')).toEqual({
      city: '',
      state: '',
      radius: 25,
    })
    expect(locationAsked('where is the retreat')).toBeNull()
    expect(locationAsked('I live in fear')).toEqual({ city: 'Fear', state: '', radius: null })
  })
})

describe('the rest of their account', () => {
  it('hears email, password and photo', () => {
    expect(accountAsked('change my email')).toBe('email')
    expect(accountAsked('I forgot my password')).toBe('password')
    expect(accountAsked('reset my password please')).toBe('password')
    expect(accountAsked('change my profile picture')).toBe('photo')
    expect(accountAsked('turn off my email notifications')).toBeNull()
    expect(accountAsked('what is my email')).toBeNull()
    expect(accountAsked('how do I add a profile picture')).toBe('photo')
    expect(accountAsked('how do I upload a photo')).toBe('photo')
    expect(accountAsked('how do I reset the password')).toBe('password')
    expect(accountAsked('write a new email to Sam')).toBeNull()
    expect(accountAsked('send a new email to the team')).toBeNull()
    expect(accountAsked('add a photo to the event')).toBeNull()
    expect(accountAsked('add a photo to my profile')).toBe('photo')
  })
})
