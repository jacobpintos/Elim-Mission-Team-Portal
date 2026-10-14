import { describe, expect, it } from 'vitest'
import { leadersNamed, meetingAsked } from './miriamMeeting'

describe('a meeting asked for', () => {
  it.each([
    [
      'I’d like to meet with Pastor Sam next Tuesday afternoon about baptism',
      { names: ['Sam'], availability: 'Next Tuesday afternoon', message: 'Baptism' },
    ],
    ['can I talk to a pastor?', { names: [], availability: '', message: '' }],
    [
      'I want to set up a meeting with Sam and Jacob Pintos, I’m free weekday evenings or Saturday morning',
      {
        names: ['Sam', 'Jacob Pintos'],
        availability: 'Weekday evenings, Saturday morning',
        message: '',
      },
    ],
    [
      'how do I meet with someone from leadership to talk about volunteering',
      { names: [], availability: '', message: 'Volunteering' },
    ],
    ['fill out the meeting form', { names: [], availability: '', message: '' }],
    [
      'I need to speak with Pastor Ana because we just moved here',
      { names: ['Ana'], availability: '', message: 'We just moved here' },
    ],
  ])('%s', (said, ask) => {
    expect(meetingAsked(said)).toEqual(ask)
  })

  it('is not a message, an event, or talking about something else', () => {
    for (const said of [
      'send a message to Pastor Sam',
      'when is the men’s meeting',
      'what time is the meeting tonight',
      'I want to talk about the picnic',
      'can I talk to Sam about the carpool',
    ]) {
      expect(meetingAsked(said), said).toBeNull()
    }
  })

  it('finds the leaders named, by any of their names', () => {
    const leaders = [
      { uid: 'a', displayName: 'Sam Hart' },
      { uid: 'b', displayName: 'Jacob Pintos' },
      { uid: 'c', displayName: 'Ana Ruiz' },
    ]
    expect(leadersNamed(['Sam', 'Jacob Pintos'], leaders).map((l) => l.uid)).toEqual(['a', 'b'])
    expect(leadersNamed(['Pintos'], leaders).map((l) => l.uid)).toEqual(['b'])
    expect(leadersNamed(['Tom'], leaders)).toEqual([])
  })
})
