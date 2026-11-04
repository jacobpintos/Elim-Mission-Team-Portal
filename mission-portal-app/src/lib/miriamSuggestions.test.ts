import { describe, expect, it } from 'vitest'
import {
  finishedBy,
  MOST_SUGGESTED,
  NEW_EVENT,
  newEventAsked,
  suggestionsFor,
} from './miriamSuggestions'
import type { UserProfile } from '@/types/user'

const person = (...roles: string[]) =>
  ({ uid: 'u1', displayName: 'Sam', email: 's@x.org', roles }) as unknown as UserProfile
const labels = (path: string, p: UserProfile | null) => suggestionsFor(path, p).map((s) => s.label)

describe('what her bar offers to tap', () => {
  it('offers an admin “Create an event” on Events, begun as a conversation', () => {
    const offered = suggestionsFor('/events', person('admin'))
    expect(offered[0]).toEqual({ label: 'Create an event', starter: NEW_EVENT })
    expect(NEW_EVENT.ask).toBe('Ok, tell me more about it.')
    expect(NEW_EVENT.describing).toBe('event')
  })

  it('never offers what someone can’t do', () => {
    expect(labels('/events', person('regular'))).not.toContain('Create an event')
    expect(labels('/dashboard', person('regular'))).not.toContain('Create an event')
    expect(labels('/worship', person('regular'))).not.toContain('What’s on Sunday’s set list?')
    expect(labels('/worship', person('worship'))).toContain('What’s on Sunday’s set list?')
    // A public follower changes nothing, and has no team side.
    const visitor = labels('/events', person('public'))
    expect(visitor).not.toContain('Create an event')
    expect(visitor).not.toContain('Block off dates')
    expect(visitor).toContain('What’s happening this weekend?')
  })

  it('offers a few, for the screen first, each once', () => {
    for (const path of ['/events', '/dashboard', '/assignments', '/announce', '/issues', '/x']) {
      const offered = labels(path, person('admin'))
      expect(offered.length).toBeLessThanOrEqual(MOST_SUGGESTED)
      expect(new Set(offered).size).toBe(offered.length)
    }
    expect(labels('/assignments', person('regular'))[0]).toBe('What’s due this week?')
    expect(labels('/dashboard', person('regular'))[0]).toBe('What do I need to know today?')
    expect(suggestionsFor('/events', null)).toEqual([])
  })
})

describe('“create an event”, said with nothing more', () => {
  it('is heard however it is asked', () => {
    for (const said of [
      'Create an event',
      'create a new event.',
      'Can you create an event for me?',
      'I want to make an event',
      "Let's set up an event",
      'okay, schedule an event please',
      'add an event',
    ]) {
      expect(newEventAsked(said), said).toBe(true)
    }
  })

  it('is not one with the event said with it, or a question about one', () => {
    for (const said of [
      'Create an event called Revive Me',
      'create an event on Friday at 5',
      'when is the event',
      'what event is next',
      'cancel the event',
    ]) {
      expect(newEventAsked(said), said).toBe(false)
    }
  })
})

describe('a reply to what she asked, as the request it finishes', () => {
  it('is put after the words it finishes, not said twice', () => {
    const reminder = { ask: 'What should I remind you of, and when?', then: 'Remind me' }
    expect(finishedBy(reminder, 'to call Sam at 5')).toBe('Remind me to call Sam at 5')
    expect(finishedBy(reminder, 'Remind me to call Sam at 5')).toBe('Remind me to call Sam at 5')
    expect(finishedBy(NEW_EVENT, ' It starts at 5. ')).toBe('It starts at 5.')
  })
})
