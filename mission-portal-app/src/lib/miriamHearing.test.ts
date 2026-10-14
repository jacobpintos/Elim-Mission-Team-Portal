import { describe, expect, it } from 'vitest'
import { heardRight } from '../../functions/src/miriam/hearing'

/** What speech recognition wrote down, put right where it is plainly a mishearing (functions/src/miriam/hearing). */
const fix = (s: string, learned: { heard: string; meant: string }[] = []) =>
  heardRight(s, learned).text

describe('mishearings put right', () => {
  it.each([
    ['create an even name Worship Gathering', 'create an event named Worship Gathering'],
    ['Create an even called Game Night on Friday', 'Create an event called Game Night on Friday'],
    ['make a new even for the 20th', 'make a new event for the 20th'],
    ["what's the even on Friday", "what's the event on Friday"],
    ['what are my evens this week', 'what are my events this week'],
    ['cue Above All', 'queue Above All'],
    ['Cue up Way Maker in D', 'Queue up Way Maker in D'],
    ['add Holy Forever to the cue', 'add Holy Forever to the queue'],
    ['open the cord sheet for Above All', 'open the chord sheet for Above All'],
    ['show me the court sheets', 'show me the chord sheets'],
    ['trans pose it to D', 'transpose it to D'],
    ['open Above All in see', 'open Above All in C'],
    ['play it in the key of be flat', 'play it in the key of B flat'],
    ['put the cape oh on 2', 'put the capo on 2'],
    ["what's on the warship set list", "what's on the worship set list"],
    ['add Bob to the sad list', 'add Bob to the set list'],
    ['set a remainder for 5 to call Sam', 'set a reminder for 5 to call Sam'],
    ["who's in my car pool for the retreat", "who's in my carpool for the retreat"],
    ['what time is youth knight', 'what time is youth night'],
    ["what's the dress cold for Sunday", "what's the dress code for Sunday"],
    ['submit a kai zen idea', 'submit a kaizen idea'],
    ["when's the next even?", "when's the next event?"],
    ['remainder to call Sam at 5', 'reminder to call Sam at 5'],
    ['delete my remainder', 'delete my reminder'],
    ['who leads warship team Sunday', 'who leads worship team Sunday'],
    ['see you at warship', 'see you at worship'],
    ['is there a dress coat', 'is there a dress code'],
    ['cue Above All in see', 'queue Above All in C'],
  ])('%s', (heard, meant) => {
    expect(fix(heard)).toBe(meant)
  })

  it.each([
    "I can't even make it Friday",
    'make it even better',
    'I need to be sharp tonight',
    'the remainder of the day',
    'see you at the event',
    'what event is next',
    'we will be in DC',
    'plan an even bigger party next year',
    'can we start even earlier',
    'what even is a capo',
    'I can do that even on weekends',
    'look up the biggest warship ever built',
    'my carpal tunnel is acting up',
    'should I wear a dress coat',
    'que hora es la reunión',
    'the remainder for the trip is $50',
    'divide it with a remainder of 3',
    'count me in eh',
    'I will see you in see',
    'make the event name shorter',
    'add the event name to the list',
  ])('leaves “%s” as it is', (said) => {
    expect(fix(said)).toBe(said)
  })

  it('says what it put right', () => {
    expect(heardRight('create an even name Worship Gathering').fixed).toEqual([
      { heard: 'create an even', meant: 'create an event' },
      { heard: 'create an event name', meant: 'create an event named' },
    ])
  })

  it('uses what this device has learned it mishears — but never an everyday word', () => {
    const learned = [
      { heard: 'hard land', meant: 'Heartland' },
      { heard: 'even', meant: 'event' },
      { heard: 'colton', meant: 'Kolton' },
    ]
    expect(fix('when is revival in the hard land', learned)).toBe(
      'when is revival in the Heartland'
    )
    expect(fix('ask colton to drive', learned)).toBe('ask Kolton to drive')
    expect(fix("I can't even", learned)).toBe("I can't even")
  })
})
