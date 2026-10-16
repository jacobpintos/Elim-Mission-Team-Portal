import { describe, expect, it } from 'vitest'
import {
  FOOD_READY_AT,
  outcomeOf,
  ownTag,
  summarize,
  type MiriamEvent,
} from '../../functions/src/miriam/stats'

/**
 * How Miriam is doing (functions/src/miriam/stats): what each record says,
 * and how a stretch of them is summed up for Admin → Miriam.
 */

describe('a request’s outcome', () => {
  it('is how the result ended', () => {
    expect(outcomeOf({ kind: 'answer', followUp: false })).toBe('answered')
    expect(outcomeOf({ kind: 'answer', followUp: true })).toBe('askedBack')
    expect(outcomeOf({ kind: 'confirm' })).toBe('change')
    expect(outcomeOf({ kind: 'eventForm' })).toBe('change')
    expect(outcomeOf({ kind: 'taskForm' })).toBe('change')
    expect(outcomeOf({ kind: 'reply' })).toBe('couldnt')
  })
})

describe('what her own answer was', () => {
  it('is a word of her own, never anything said', () => {
    expect(ownTag('taught', undefined)).toBe('taught')
    expect(ownTag('names: elim', undefined)).toBe('names')
    expect(ownTag('event_time', 'event_time')).toBe('event_time')
    expect(ownTag('food_signup: confirm (not acted on)', 'food_signup')).toBe('food_signup')
    // From the event's own page, however she read it; her offer of maps, answered.
    expect(ownTag('schedule item', 'other')).toBe('event_page')
    expect(ownTag('someone’s travel', undefined)).toBe('event_page')
    expect(ownTag('maps declined', undefined)).toBe('maps')
    // Hers, whatever else: never "other" (Claude's).
    expect(ownTag('some new reason', 'other')).toBe('her_own')
    expect(ownTag('some new reason', 'event_time')).toBe('event_time')
  })
})

const turn = (tier: 'phone' | 'own' | 'public' | 'claude', outcome?: string, skill?: string) =>
  ({
    kind: 'turn',
    tier,
    ...(outcome ? { outcome } : {}),
    ...(skill ? { skill } : {}),
  }) as MiriamEvent
const food = (claude: string, same: boolean | null, rule = 'named', would = 'confirm') =>
  ({ kind: 'food', would, rule, claude, same }) as MiriamEvent

describe('a stretch of days, summed up', () => {
  it('counts where requests were handled, and how they ended', () => {
    const s = summarize(
      [
        turn('phone', 'handled'),
        turn('phone', 'handled'),
        turn('own', 'answered', 'event_time'),
        turn('own', 'change', 'availability'),
        turn('own', 'answered', 'event_time'),
        turn('public', 'couldnt', 'public'),
        turn('claude', 'answered'),
        turn('claude', 'askedBack'),
        turn('claude', 'limited'),
        { kind: 'card', outcome: 'confirmed' },
        { kind: 'card', outcome: 'cancelled' },
        { kind: 'card', outcome: 'confirmed' },
      ],
      30
    )
    expect(s.turns).toEqual({ phone: 2, own: 3, public: 1, claude: 3, none: 0, total: 9 })
    expect(s.outcomes).toEqual({
      answered: 3,
      askedBack: 1,
      change: 1,
      couldnt: 1,
      error: 0,
      limited: 1,
    })
    expect(s.ownBy).toEqual([
      { skill: 'event_time', n: 2 },
      { skill: 'availability', n: 1 },
      { skill: 'public', n: 1 },
    ])
    expect(s.cards).toEqual({ confirmed: 2, cancelled: 1 })
    expect(s.capped).toBe(false)
  })

  it('compares her readings with Claude’s, most-confused first', () => {
    const s = summarize(
      [
        { kind: 'label', label: 'event_time', read: 'event_time', sure: false },
        { kind: 'label', label: 'other', read: 'availability', sure: true },
        { kind: 'label', label: 'other', read: 'availability', sure: false },
        { kind: 'label', label: 'reminder', read: 'event_time', sure: false },
      ],
      7
    )
    expect(s.labels).toEqual({
      agreed: 1,
      differed: 3,
      differences: [
        { read: 'availability', label: 'other', n: 2 },
        { read: 'event_time', label: 'reminder', n: 1 },
      ],
    })
  })

  it('passes over anything malformed', () => {
    const s = summarize(
      [null, 1, 'x', { kind: 'turn', tier: 'nowhere' }, { kind: 'card', outcome: 'maybe' }, {}],
      30
    )
    expect(s.turns.total).toBe(0)
    expect(s.cards).toEqual({ confirmed: 0, cancelled: 0 })
  })
})

describe('answers of hers said not to be what was meant', () => {
  it('are counted by what Claude then read them as — never the words', () => {
    const c = (read: string, label: string, learned = false): MiriamEvent => ({
      kind: 'correction',
      read,
      label,
      learned,
    })
    const s = summarize(
      [
        c('event_dress', 'event_time', true),
        c('event_dress', 'event_time'),
        c('event_place', 'event_place'),
        c('event_page', 'asked back'),
        c('web', 'none'),
        {
          kind: 'correction',
          read: 'event_page',
          label: 'event_time',
          learned: false,
          byReading: false,
        },
        { kind: 'correction', read: 'x' },
        { kind: 'correction', label: 'y' },
      ],
      30
    )
    expect(s.corrections).toEqual({
      total: 6,
      readSame: 1,
      readOtherwise: 2,
      askedBack: 1,
      fromLearned: 1,
      notByReading: 1,
      differences: [{ read: 'event_dress', label: 'event_time', n: 2 }],
    })
    expect(summarize([], 30).corrections.total).toBe(0)
  })
})

describe('her food sign-ups beside Claude’s', () => {
  it('are ready to switch on only after agreeing enough, and never not', () => {
    const agreeing = Array.from({ length: FOOD_READY_AT }, () => food('sign_up_food', true))
    expect(summarize(agreeing, 30).food.ready).toBe(true)
    expect(summarize(agreeing.slice(1), 30).food.ready).toBe(false)
    // One other event or item, or Claude doing something else, holds her back.
    expect(summarize([...agreeing, food('sign_up_food', false)], 30).food.ready).toBe(false)
    expect(summarize([...agreeing, food('answer: other', null)], 30).food.ready).toBe(false)
    // Claude asking something first doesn't.
    expect(summarize([...agreeing, food('asked back', null)], 30).food.ready).toBe(true)
  })

  it('are ready only by all of them since counting began, not the days looked at', () => {
    const agreeing = Array.from({ length: FOOD_READY_AT }, () => food('sign_up_food', true))
    // The days looked at hold only agreement; an older disagreement is outside them.
    const span = summarize(agreeing, 30, false, [...agreeing, food('sign_up_food', false)])
    expect(span.food.ready).toBe(false)
    expect(span.food.allTime).toBe(true)
    expect(span.food.offered.different).toBe(1)
    // Food sign-ups in the days looked at are not counted twice.
    expect(summarize(agreeing, 30, false, agreeing).food.offered.same).toBe(FOOD_READY_AT)
  })

  it('keeps those told only by the dish apart: not offered, so not counted for or against', () => {
    const agreeing = Array.from({ length: FOOD_READY_AT }, () => food('sign_up_food', true))
    const s = summarize(
      [
        ...agreeing,
        food('sign_up_food', false, 'uniqueDish'),
        food('sign_up_food', true, 'uniqueDish'),
      ],
      30
    )
    expect(s.food.ready).toBe(true)
    expect(s.food.dishOnly).toEqual({ same: 1, different: 1, askedBack: 0, otherwise: 0 })
    expect(s.food.worked).toBe(FOOD_READY_AT + 2)
  })

  it('counts “already yours” and “taken” as worked out, but not as sign-ups offered', () => {
    const s = summarize([food('sign_up_food', true, 'named', 'taken')], 30)
    expect(s.food.worked).toBe(1)
    expect(s.food.offered).toEqual({ same: 0, different: 0, askedBack: 0, otherwise: 0 })
  })
})
