import { describe, expect, it } from 'vitest'
import { availabilityReply, availabilitySaid } from './miriamAvailability'

const today = '2026-10-13' // a Tuesday

describe('availability, said', () => {
  it('reads an answer and the event it is for', () => {
    expect(availabilitySaid("I can't make it Friday", today)).toEqual({
      status: 'no',
      note: '',
      date: '2026-10-16',
      name: '',
    })
    expect(availabilitySaid('Count me in for the youth retreat', today)).toMatchObject({
      status: 'yes',
      name: 'youth retreat',
    })
    expect(availabilitySaid('I’ll be there Sunday', today)).toMatchObject({
      status: 'yes',
      date: '2026-10-18',
    })
    expect(availabilitySaid('I won’t be at band practice', today)).toMatchObject({
      status: 'no',
      name: 'band practice',
    })
  })

  it('hears running late, leaving early, or part of it, as partly available — with a note', () => {
    expect(availabilitySaid('I’ll be late to youth night because of work', today)).toEqual({
      status: 'partial',
      note: 'Arriving late — Because of work',
      date: null,
      name: 'youth night',
    })
    expect(availabilitySaid('I have to leave early on Sunday', today)).toMatchObject({
      status: 'partial',
      note: 'Leaving early',
      date: '2026-10-18',
    })
    expect(availabilitySaid('I can only come for part of the retreat', today)).toMatchObject({
      status: 'partial',
      note: 'Part of it',
      name: 'retreat',
    })
  })

  it('hears not knowing yet as TBD', () => {
    expect(availabilitySaid('Not sure about the potluck yet', today)).toMatchObject({
      status: 'tbd',
      name: 'potluck',
    })
    expect(availabilitySaid("I don't know if I can make Friday", today)).toMatchObject({
      status: 'tbd',
      date: '2026-10-16',
    })
  })

  it('keeps why, when they say', () => {
    expect(availabilitySaid("I can't make it Sunday because I'm out of town", today)?.note).toBe(
      'I’m out of town'.replace('’', "'")
    )
  })

  it('leaves the event unsaid when it was', () => {
    expect(availabilitySaid("I can't make it", today)).toEqual({
      status: 'no',
      note: '',
      date: null,
      name: '',
    })
  })

  it('isn’t a question, or anything not about them coming', () => {
    expect(availabilitySaid('Can I make it to the retreat?', today)).toBeNull()
    expect(availabilitySaid('Who is available Friday', today)).toBeNull()
    expect(availabilitySaid('I need to buy chips', today)).toBeNull()
    expect(availabilitySaid('Remind me to call Sam', today)).toBeNull()
    // "Can do it" is as likely a task as an event.
    expect(availabilitySaid('I can do it', today)).toBeNull()
  })
})

describe('her question about an event, answered', () => {
  const answer = (status: string, note = '') => ({ kind: 'answer', status, note })

  it('yes and no, with why', () => {
    expect(availabilityReply('yes')).toEqual(answer('yes'))
    expect(availabilityReply('Yep, I’ll be there')).toEqual(answer('yes'))
    expect(availabilityReply('no')).toEqual(answer('no'))
    expect(availabilityReply("No, I'm out of town")).toEqual(answer('no', "I'm out of town"))
    expect(availabilityReply("I can't, sorry")).toEqual(answer('no'))
  })

  it('late, early or part of it, even after a yes', () => {
    expect(availabilityReply('Yes but I’ll be a little late')).toEqual(
      answer('partial', 'Arriving late')
    )
    expect(availabilityReply('I have to leave early')).toEqual(answer('partial', 'Leaving early'))
  })

  it('not knowing yet, to be asked again', () => {
    for (const r of ["I don't know yet", 'not sure', 'maybe', 'ask me later', 'TBD']) {
      expect(availabilityReply(r), r).toEqual(answer('tbd'))
    }
  })

  it('a pass on this one, or no more questions', () => {
    expect(availabilityReply('skip')).toEqual({ kind: 'skip' })
    expect(availabilityReply('next one')).toEqual({ kind: 'skip' })
    expect(availabilityReply('never mind')).toEqual({ kind: 'stop' })
    expect(availabilityReply('not now')).toEqual({ kind: 'stop' })
    expect(availabilityReply("that's all")).toEqual({ kind: 'stop' })
  })

  it('isn’t an answer when it plainly isn’t one', () => {
    expect(availabilityReply('what time does it start')).toBeNull()
    expect(availabilityReply('')).toBeNull()
  })
})
