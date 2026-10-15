import { beforeAll, describe, expect, it } from 'vitest'
import { Lookups } from '../../functions/src/miriam/lookups'
import { ownAnswer, type Own, type OwnInput } from '../../functions/src/miriam/own'
import { dishIn } from '../../functions/src/miriam/own/food'
import { forgetCaches } from '../../functions/src/miriam/own/learn'
import { SEEDS } from '../../functions/src/miriam/own/skills'
import { foodAsked } from './miriamFood'
import { fakeDb, memoryOwnDb } from './__fixtures__/miriamOwnDb'
import corpus from './__fixtures__/miriamFoodSignups.json'

/**
 * Food sign-ups as Miriam works them out on the server (functions/src/miriam/
 * own/signup), measured on requests she has never seen: what she takes for
 * one, and the sign-up she would offer — never a wrong one.
 */

const TODAY = '2026-10-13' // a Tuesday

/** A church calendar with food sign-ups: weekly, several days long, items taken. */
const CHURCH: Record<string, Record<string, Record<string, unknown>>> = {
  users: {
    sarah: { displayName: 'Sarah Lee', roles: ['regular'] },
    boss: { displayName: 'Jacob Pintos', roles: ['admin'] },
  },
  groups: { gAll: { name: 'All', members: ['sarah', 'boss'] } },
  events: {
    pot: {
      title: 'Fall Potluck',
      date: '2026-10-18',
      groups: ['gAll'],
      food: true,
      foodItems: ['Pot roast', 'Roast vegetables', 'Drinks', 'Dessert'],
    },
    band: { title: 'Band Practice', date: '2026-10-18', groups: ['gAll'] },
    yn: {
      title: 'Youth Night',
      date: '2026-10-25',
      groups: ['gAll'],
      food: true,
      foodItems: ['Pizza', 'Chips'],
    },
    ret: {
      title: 'Youth Retreat',
      date: '2026-10-30',
      extraDays: [{ date: '2026-10-31' }],
      groups: ['gAll'],
      food: true,
      foodItems: ['Trail mix'],
    },
    pic: {
      title: 'Church Picnic',
      date: '2026-11-01',
      groups: ['gAll'],
      food: true,
      foodItems: ['Salad', 'Cookies', 'Plates', 'Lemonade', 'Napkins'],
    },
    bs: {
      title: 'Bible Study',
      isRec: true,
      recur: 'weekly',
      recDay: 3,
      date: '2026-09-02',
      groups: ['gAll'],
      food: true,
      foodItems: ['Coffee', 'Snacks'],
    },
    fest: {
      title: 'Fall Festival',
      date: '2026-11-07',
      groups: ['gAll'],
      food: true,
      foodItems: ['Main', 'Ice', 'Sides'],
    },
  },
  foodSignups: {
    'pic_2026-11-01': {
      signups: {
        '2': { uid: 'boss', displayName: 'Jacob Pintos' },
        '3': { uid: 'sarah', displayName: 'Sarah Lee' },
      },
    },
  },
}
const church = fakeDb(CHURCH)
const sarah = { uid: 'sarah', roles: ['regular'] }

function input(text: string, extra: Partial<OwnInput> = {}): OwnInput {
  return {
    text,
    today: TODAY,
    now: '14:30',
    history: [],
    appTools: ['set_availability', 'create_reminder', 'sign_up_food'],
    can: ['link'],
    viewer: sarah,
    lookups: new Lookups(church, sarah, TODAY),
    db: memoryOwnDb(),
    foodLive: true,
    ...extra,
  }
}

type Line = [text: string, want: string, from: string]
const LINES: Line[] = [...(corpus.signups as Line[]), ...(corpus.not as Line[])]

/** Read for this test: lowercase, plain apostrophes, no event braces. */
const plainly = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[{}]/g, '').trim()

describe('her food sign-ups', () => {
  it('are measured on requests she has never seen', () => {
    const seeds = new Set(Object.values(SEEDS).flat().map(plainly))
    expect(LINES.filter(([t]) => seeds.has(plainly(t))).map(([t]) => t)).toEqual([])
    expect(LINES.filter(([, , from]) => !from).map(([t]) => t)).toEqual([])
  })

  describe('read, and worked out', () => {
    const got = new Map<string, Own>()
    beforeAll(async () => {
      forgetCaches()
      for (const [i, [text]] of LINES.entries()) {
        // A breath now and then: a long run without one leaves the test runner unanswered.
        if (i % 10 === 0) await new Promise((done) => setImmediate(done))
        got.set(text, await ownAnswer(input(text)))
      }
    }, 180_000)

    /** Taken for a food sign-up, past her guards: worked out, whatever came of it. */
    const taken = (own: Own) => own.why.startsWith('food_signup:')

    it('never offers a wrong one', () => {
      const wrong: string[] = []
      for (const [text, want] of LINES) {
        const own = got.get(text)!
        const w = own.would
        const r = own.result
        const offered =
          r?.kind === 'confirm' && r.name === 'sign_up_food'
            ? `${r.input.event_key}/${r.input.item}`
            : null
        // What she would do, acted on or not, is what it should be — or nothing.
        const would = w
          ? `${w.kind === 'confirm' ? '' : `${w.kind}:`}${w.event_key}/${w.item}`
          : null
        if (would && would !== want) wrong.push(`${text} → would ${would} (want ${want})`)
        if (offered && offered !== want) wrong.push(`${text} → offered ${offered} (want ${want})`)
        // Nothing else is changed for a food sign-up she read.
        if (taken(own) && r?.kind === 'confirm' && r.name !== 'sign_up_food') {
          wrong.push(`${text} → ${r.name}`)
        }
      }
      expect(wrong).toEqual([])
    })

    it('takes what is one, and leaves what isn’t', () => {
      let tp = 0
      let fn = 0
      let fp = 0
      const missed: string[] = []
      const extra: string[] = []
      for (const [text, want] of LINES) {
        // The briefing's suggestion is the app's alone to know.
        if (want === 'phone') continue
        const yes = taken(got.get(text)!)
        if (want !== '-') {
          if (yes) tp++
          else {
            fn++
            missed.push(`${text} (${got.get(text)!.why})`)
          }
        } else if (yes) {
          fp++
          extra.push(`${text} (${got.get(text)!.why})`)
        }
      }
      const recall = tp / (tp + fn)
      const precision = tp / (tp + fp)
      // Raise these as she gets better; lower them only on purpose.
      // Measured: 0.81 and 0.94, of 63 sign-ups and 55 that aren't (6 of 10 unseen ones taken).
      expect({ recall: recall >= 0.8, precision: precision >= 0.9, missed, extra }).toMatchObject({
        recall: true,
        precision: true,
      })
    })

    it('offers the sign-up when it is plain, and says so when it is taken', () => {
      const plain = LINES.filter(([, want]) =>
        /^(?:taken:|theirs:)?[a-z]+_\d{4}-\d\d-\d\d\//.test(want)
      )
      const worked = plain.filter(([text]) => got.get(text)!.would)
      // Told by the event's name or the day (acted on), or only by the dish (not yet).
      const byName = worked.filter(([text]) => got.get(text)!.would?.rule !== 'uniqueDish')
      expect(worked.length / plain.length).toBeGreaterThanOrEqual(0.75)
      expect(byName.length).toBeGreaterThanOrEqual(24)
      expect(got.get('I can bring the drinks to the potluck')!.result).toEqual({
        kind: 'confirm',
        name: 'sign_up_food',
        input: { event_key: 'pot_2026-10-18', item: 'Drinks' },
        more: false,
      })
      expect(got.get("I'll bring the plates to the picnic")!.result).toMatchObject({
        kind: 'answer',
        text: 'Jacob Pintos is already bringing Plates for Church Picnic. Still open: Salad, Cookies, Napkins.',
        open: { kind: 'event', key: 'pic_2026-11-01', section: 'food' },
      })
      expect(got.get("I'll bring lemonade to the picnic")!.result).toMatchObject({
        kind: 'answer',
        text: 'You’re already bringing Lemonade for Church Picnic.',
      })
      // Told only by the dish: worked out, left to Claude for now.
      expect(got.get("I'm bringing chips")!).toMatchObject({
        result: null,
        would: { kind: 'confirm', rule: 'uniqueDish', event_key: 'yn_2026-10-25', item: 'Chips' },
      })
    })

    it('against the phone’s own patterns', () => {
      // What the phone takes for a sign-up today (src/features/miriam/localTalk:
      // foodHere), beside what she does: the phone's go first; hers are those it misses.
      const table = { both: 0, phoneOnly: [] as string[], hersOnly: [] as string[], neither: 0 }
      for (const [text, want] of LINES) {
        if (want === '-' || want === 'phone') continue
        const phone = !!foodAsked(text, TODAY)
        const hers = taken(got.get(text)!)
        if (phone && hers) table.both++
        else if (phone) table.phoneOnly.push(text)
        else if (hers) table.hersOnly.push(text)
        else table.neither++
      }
      // Hers catch most of what the phone misses.
      expect(table.hersOnly.length).toBeGreaterThan(table.neither)
      expect(table.both).toBeGreaterThan(0)
    })
  })

  it('is left to Claude, and only logged, until she is live', async () => {
    forgetCaches()
    const own = await ownAnswer(input('I can bring the drinks to the potluck', { foodLive: false }))
    expect(own).toMatchObject({
      result: null,
      why: 'food_signup: confirm (not acted on)',
      would: { kind: 'confirm', rule: 'named', event_key: 'pot_2026-10-18', item: 'Drinks' },
    })
  })

  it('is nothing she offers someone who can’t sign up', async () => {
    forgetCaches()
    const own = await ownAnswer(
      input('I can bring the drinks to the potluck', { appTools: ['set_availability'] })
    )
    expect(own).toMatchObject({ result: null, would: null, why: 'food_signup: no tool' })
  })
})

describe('the dish said', () => {
  it.each([
    ["I'll bring chips to the event", 'chips'],
    ['sign me up to bring the pot roast for the event on Sunday', 'pot roast'],
    ["I've got dessert covered for the event", 'dessert'],
    ['count me in for napkins', 'napkins'],
    ["I'm in for drinks at the event", 'drinks'],
    ['Hey Miriam, could you put me down for chips please', 'chips'],
    ["I'll bring my famous potroast", 'famous potroast'],
    ["I'll make it to the event", null],
    ['sign me up for the event', null],
    ["I'll take that", null],
    ['what time is the event', null],
  ])('%s', (said, dish) => {
    expect(dishIn(said)).toBe(dish)
  })
})
