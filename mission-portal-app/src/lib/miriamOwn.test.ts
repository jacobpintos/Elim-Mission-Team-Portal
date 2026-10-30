import { describe, expect, it, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Lookups } from '../../functions/src/miriam/lookups'
import { embed, similarity } from '../../functions/src/miriam/own/encoder'
import { packVector } from '../../functions/src/miriam/own/vectors'
import { mentionsIn } from '../../functions/src/miriam/own/events'
import { notHers } from '../../functions/src/miriam/own/guards'
import {
  ownAnswer,
  publicAnswer,
  readFor,
  readRequest,
  sure,
  webOrFaith,
  type OwnInput,
} from '../../functions/src/miriam/own'
import { PUBLIC_NOT_HERS } from '../../functions/src/miriam/plan'
import {
  CONFIRM_GAP_MS,
  corrected,
  SAME_REQUEST,
  forget,
  forgetCaches,
  learn,
  LEARNED_DOC,
  learnedExamples,
  listLearning,
  sameKey,
  taughtAnswers,
  listTaught,
  retaught,
  teach,
} from '../../functions/src/miriam/own/learn'
import { SEEDS, type Skill } from '../../functions/src/miriam/own/skills'
import { skillOfAction } from '../../functions/src/miriam/own/labels'
import { fakeDb, memoryOwnDb } from './__fixtures__/miriamOwnDb'
import { seedExamples } from '../../functions/src/miriam/own/understand'
import { dayIn, reminderIn, spanIn, spanLead, statusIn } from '../../functions/src/miriam/own/when'
import { shiftDate } from '../../functions/src/miriam/data'
import {
  bestPassage,
  braveSearch,
  passagesOf,
  queryOf,
  webAnswer,
  weatherPlace,
  wikipediaSearch,
} from '../../functions/src/miriam/own/web'
import requests from './__fixtures__/miriamRequests.json'
import casual from './__fixtures__/miriamCasual.json'
import { STORY_BLOCKS } from './__fixtures__/ourStory'
import {
  aboutScripture,
  DEFER,
  DEFER_MEETING,
  faithAnswer,
  isFaithReply,
  LEADERSHIP,
  LEADERSHIP_MEETING,
  TO_THE_FORM,
} from '../../functions/src/miriam/own/faith'
import {
  ELIM_ANSWER,
  elimAsked,
  MIRIAM_ANSWER,
  miriamNameAsked,
} from '../../functions/src/miriam/own/names'
import {
  forgetSite,
  linksOf,
  pageKey,
  readSite,
  sitemapUrls,
  storeSite,
} from '../../functions/src/miriam/own/site'

/**
 * Miriam on her own (functions/src/miriam/own): what she understands, and
 * what she answers without Claude.
 */

// --- What she understands -----------------------------------------------------

const TITLES = [
  'Youth Night',
  'Revival in the Heartland',
  'Sunday Service',
  'Church Picnic',
  "Women's Retreat",
  'Christmas Concert',
  'Summer Camp',
  'Community Outreach',
  'Bible Study',
  'Worship Practice',
  'Fall Banquet',
  "Men's Breakfast",
  'Leadership Conference',
  'Mission Trip',
  'Thanksgiving Potluck',
  'Gala',
]

/** As she reads one (functions/src/miriam/own/index): names masked, as said if that isn't plain, then her guards. */
function taken(text: string): Skill | null {
  const r = readRequest(text, TITLES, seedExamples()).reading
  if (r.skill === 'other' || !sure(r) || notHers(text, r.skill)) return null
  return r.skill
}

// Her model runs here in plain JavaScript, as on the server: reading a site, or
// a conversation, is seconds of it — more on a busy machine than the default allows.
vi.setConfig({ testTimeout: 30_000 })
// And a breath before each test: a minute of them run without one leaves the
// test runner unanswered ("Timeout calling onTaskUpdate").
beforeEach(() => new Promise<void>((done) => setImmediate(done)))

describe('her examples', () => {
  it('each has its meaning worked out (else run scripts/miriam-model/seeds.js)', () => {
    const stored = JSON.parse(
      readFileSync(join(__dirname, '../../functions/models/minilm/seedVectors.json'), 'utf8')
    ) as Record<string, string>
    const missing = Object.values(SEEDS)
      .flat()
      .filter((t) => !stored[t])
    expect(missing).toEqual([])
  })

  it('are none of the casual requests she is measured on', () => {
    const plainly = (s: string) =>
      s
        .toLowerCase()
        .replace(/[{}]/g, '')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    const measured = new Set(
      Object.values(casual as Record<string, string[]>)
        .flat()
        .map(plainly)
    )
    expect(
      Object.values(SEEDS)
        .flat()
        .filter((t) => measured.has(plainly(t)))
    ).toEqual([])
  })
})

describe('what she takes as hers, of requests she has never seen', () => {
  const all = Object.entries(requests as Record<string, string[]>).flatMap(([want, list]) =>
    list.map((text) => ({ text, want }))
  )
  /**
   * How many of each skill she answers. A new skill or example can take
   * another's answers while the total still looks fine: each is held to what
   * it answers now. Raise them as she gets better; lower one only on purpose.
   */
  const ANSWERS: Partial<Record<Skill, number>> = {
    event_time: 28,
    event_place: 20,
    event_dress: 14,
    event_schedule: 9,
    event_team: 7,
    event_car: 9,
    event_lodging: 8,
    event_flight: 7,
    event_weather: 7,
    my_events: 21,
    availability: 22,
    reminder: 16,
    food_signup: 2,
    web: 12,
    faith: 9,
  }

  it('is never wrong, and is most of what is hers', async () => {
    const wrong: string[] = []
    const per: Partial<Record<string, number>> = {}
    let hers = 0
    let answered = 0
    for (const [i, { text, want }] of all.entries()) {
      // A breath now and then: a long run without one leaves the test runner unanswered.
      if (i % 20 === 0) await new Promise((done) => setImmediate(done))
      const got = taken(text)
      if (want !== 'other') hers++
      if (got === null) continue
      if (got === want) {
        answered++
        per[want] = (per[want] ?? 0) + 1
      } else wrong.push(`${text} → ${got} (is ${want})`)
    }
    expect(wrong).toEqual([])
    // Handed to Claude when unsure: the rest. Most are hers.
    expect(answered / hers).toBeGreaterThan(0.75)
    const fewer = Object.entries(ANSWERS)
      .filter(([skill, n]) => (per[skill] ?? 0) < n!)
      .map(([skill, n]) => `${skill}: ${per[skill] ?? 0} of ${n}`)
    expect(fewer).toEqual([])
  }, 180_000)
})

describe('what she takes as hers, of casual requests she has never seen', () => {
  // Said as people talk to a phone: lowercase, run together, half a sentence.
  const all = Object.entries(casual as Record<string, string[]>).flatMap(([want, list]) =>
    list.map((text) => ({ text, want }))
  )
  /** As many as she answers now; raise them as she gets better. */
  const ANSWERS: Partial<Record<Skill, number>> = {
    event_time: 12,
    event_place: 11,
    event_dress: 12,
    event_schedule: 4,
    event_team: 5,
    event_car: 10,
    event_lodging: 5,
    event_flight: 6,
    event_weather: 10,
    my_events: 17,
    availability: 13,
    reminder: 16,
    food_signup: 5,
    web: 10,
    faith: 9,
  }
  /**
   * Read wrongly already, before casual examples were added — to put right,
   * one by one; none more. Most never reach anyone as they are: with no
   * plain answer, she hands them on (a flight changed, someone else's team).
   */
  const KNOWN_WRONG = [
    'is there free time at camp in the afternoon → event_time',
    'what time are the breakout sessions at the leadership conference → event_time',
    'when does the auction start at the gala → event_time',
    "where am i crashing at the women's retreat → event_place",
    'sign me up for sweet tea at the picnic → availability',
    'is it gonna rain in kansas city tomorrow → event_weather',
    'ask jen if she can drive to camp → event_car',
    'switch my flight to the later one → event_flight',
    'which team is sam on for the outreach → event_team',
    'go to the carpool page → event_car',
  ]

  it('is wrong no more than it was, and answers three in four', async () => {
    const wrong: string[] = []
    const per: Partial<Record<string, number>> = {}
    let hers = 0
    let answered = 0
    for (const [i, { text, want }] of all.entries()) {
      if (i % 20 === 0) await new Promise((done) => setImmediate(done))
      const got = taken(text)
      if (want !== 'other') hers++
      if (got === null) continue
      if (got === want) {
        answered++
        per[want] = (per[want] ?? 0) + 1
      } else wrong.push(`${text} → ${got}`)
    }
    expect(wrong.filter((w) => !KNOWN_WRONG.includes(w))).toEqual([])
    expect(answered / hers).toBeGreaterThanOrEqual(0.75)
    const fewer = Object.entries(ANSWERS)
      .filter(([skill, n]) => (per[skill] ?? 0) < n!)
      .map(([skill, n]) => `${skill}: ${per[skill] ?? 0} of ${n}`)
    expect(fewer).toEqual([])
  }, 180_000)
})

describe('names in a request', () => {
  it('are found, and read as "the event"', () => {
    expect(mentionsIn('where are we having the picnic', TITLES).masked).toBe(
      'where are we having the event'
    )
    expect(mentionsIn("what's the dress code for Sunday's service?", TITLES).masked).toBe(
      "what's the dress code for the event?"
    )
    expect(mentionsIn('when is revival in the hard land', TITLES).mentions[0].titles).toEqual([
      'Revival in the Heartland',
    ])
  })

  it('never from an ordinary word, a pronoun, a day or a kind of event alone', () => {
    for (const text of [
      'who is picking me up',
      'thanks so much',
      'what can you help with',
      'do I have anything Sunday',
      'what does the bible say about worry',
      'how do I become a christian',
      'I might be able to come tonight',
      "what's my next church thing",
    ]) {
      expect(mentionsIn(text, TITLES).mentions, text).toEqual([])
    }
  })
})

describe('the guards', () => {
  it('hand on commands and others’ business, not her own', () => {
    expect(notHers('change the picnic location to the park', 'event_place')).toBeTruthy()
    expect(notHers('set up the cars for camp', 'event_car')).toBeTruthy()
    expect(notHers("I'll bring cookies to the potluck", 'availability')).toBeTruthy()
    // Someone else's flight or lodging: not the event's time or place, nor theirs.
    const flight = 'For the new years eve event, what time is Guest User’s flight arriving'
    expect(notHers(flight, 'event_time')).toBeTruthy()
    expect(notHers(flight, 'event_flight')).toBeTruthy()
    expect(notHers('where is guest user staying for new years eve', 'event_place')).toBeTruthy()
    expect(notHers('where is guest user staying for new years eve', 'event_lodging')).toBeTruthy()
    // Birthdays and anniversaries are the calendar's own; a birthday party is an event.
    expect(notHers('when is Whitney’s birthday', 'event_time')).toBeTruthy()
    expect(notHers('when is the Slatterys anniversary', 'event_time')).toBeTruthy()
    expect(notHers('when is Josh’s birthday party', 'event_time')).toBeNull()
    // Their own still are.
    expect(notHers('where am I staying for the retreat', 'event_lodging')).toBeNull()
    expect(notHers('when does my flight land', 'event_flight')).toBeNull()
    expect(notHers('where is the retreat', 'event_place')).toBeNull()
    // Where an event is, asked with a word for a place.
    expect(notHers('what is family gathering', 'event_place')).toBeTruthy()
    expect(notHers('what’s the address for revival', 'event_place')).toBeNull()
    expect(notHers("what's due this week", 'my_events')).toBeTruthy()
    expect(notHers('remind everyone to bring a Bible', 'reminder')).toBeTruthy()
    expect(notHers("who's coming to youth night", 'event_time')).toBeTruthy()
    expect(notHers('remind me at 4 to call mom', 'reminder')).toBeNull()
    expect(notHers('how many people live in Iowa', 'web')).toBeNull()
    expect(notHers('where is the picnic', 'event_place')).toBeNull()
    // The Elim Store is the app's, not the web's: "what is the Elim Store" found nothing online.
    expect(notHers('what is the elim store', 'web')).toBeTruthy()
    expect(notHers('is anything on sale for the elim store', 'web')).toBeTruthy()
    expect(notHers('what merch do you have', 'web')).toBeTruthy()
    expect(notHers('what is on sale at costco', 'web')).toBeNull()
    // Notes on days of their calendar are the app's (src/lib/dateNotes).
    expect(notHers('what are my notes for Friday', 'my_events')).toBeTruthy()
    expect(notHers('add a note to Friday to bring chairs', 'reminder')).toBeTruthy()
    expect(notHers("what's on my calendar this week", 'my_events')).toBeTruthy()
    // Someone else's: reminded, or coming.
    expect(notHers('remind Sarah at 5 to call mom', 'reminder')).toBeTruthy()
    expect(notHers('remind myself at 5 to call mom', 'reminder')).toBeNull()
    expect(notHers("my wife can't come to youth night", 'availability')).toBeTruthy()
    expect(notHers("Miriam, she won't make the picnic", 'availability')).toBeTruthy()
    expect(notHers("I can't make the picnic", 'availability')).toBeNull()
    expect(notHers('my family and I are in for the picnic', 'availability')).toBeNull()
  })

  it('take a food sign-up only as their own offer, now', () => {
    const offer = (t: string) => notHers(t, 'food_signup')
    for (const t of [
      "I'll bring chips to youth night",
      'I’m bringing drinks',
      'sign me up to bring napkins',
      // Asked of her, or offered as a question: still an offer.
      'Can I bring chips to youth night?',
      'could we bring dessert',
      'Hey Miriam, could you sign me up for chips?',
      'can you put me down for drinks',
      'My husband and I will bring drinks',
      "I'll bring my mom's cookies",
    ]) {
      expect([t, offer(t)]).toEqual([t, null])
    }
    for (const [t, why] of [
      ['who is bringing drinks to the potluck', 'a question'],
      ['what can I bring to the potluck', 'a question'],
      ['should I bring chips', 'a question'],
      ["I'll bring chips?", 'a question'],
      ['remind me to bring chips', 'a reminder'],
      ["I'll bring chips as you suggested", 'the briefing’s suggestion'],
      ['is anyone bringing dessert', 'a question'],
      ['Sarah is bringing chips to youth night', 'someone else’s'],
      ["Bob's bringing the drinks", 'someone else’s'],
      ["I can't bring the chips anymore", 'a change'],
      ["I'll take the drinks off the list", 'a change'],
      ['I brought chips last time', 'not an offer now'],
      ["I'll bring chips if I have time", 'not an offer now'],
      ['tell everyone to bring chips', 'a command'],
      ['add drinks to the picnic food list', 'a command'],
      ['add a note to bring chips', 'a command'],
      ["I'll bring snacks for my task", 'about something else'],
      // No, or not now.
      ["I don't want to bring chips to youth night", 'a change'],
      ["I'm too busy to bring dessert to the potluck", 'a change'],
      ['I wish I could bring chips', 'a change'],
      ['I might bring chips to youth night', 'not an offer now'],
      ["I'll probably bring dessert", 'not an offer now'],
      ['I was going to bring chips', 'not an offer now'],
      // Asking whether they are, not offering.
      ['Um I’m bringing dessert to the potluck?', 'a question'],
      ["Can you check whether I'm bringing chips", 'a question'],
      ["I'm supposed to bring chips to youth night right", 'a question'],
      // Someone else's, though said with "my".
      ['My neighbor will bring chips to youth night', 'someone else’s'],
      ['Ask my husband to bring the drinks', 'someone else’s'],
      // Eating, or the menu, put as a question: not an offer.
      ['Can I grab some pizza at youth night', 'a question'],
      ['Could we do pizza for youth night', 'a question'],
      ['ping me at 6 to cook dinner', 'a reminder'],
    ]) {
      expect([t, offer(t)]).toEqual([t, why])
    }
  })
})

// --- Days and times --------------------------------------------------------------

const TODAY = '2026-10-14' // a Wednesday

describe('days said', () => {
  it.each([
    ['tonight', '2026-10-14'],
    ['tomorrow', '2026-10-15'],
    ["Friday's", '2026-10-16'],
    ['next wednesday', '2026-10-21'],
    ['October 20th', '2026-10-20'],
    ['10/31', '2026-10-31'],
    ['the 2nd', '2026-11-02'],
    ['jan 5', '2027-01-05'],
  ])('%s is %s', (said, date) => {
    expect(dayIn(`what time is it ${said}`, TODAY)).toBe(date)
  })

  it('spans for "what do I have"', () => {
    expect(spanIn('what do I have this weekend', TODAY)).toMatchObject({
      from: '2026-10-17',
      to: '2026-10-18',
    })
    expect(spanIn('what do I have next week', TODAY)).toMatchObject({
      from: '2026-10-18',
      to: '2026-10-24',
    })
    expect(spanIn("what's next", TODAY).next).toBe(true)
    // A stretch said is a list, "next" or "coming up" in it or not.
    expect(spanIn('what is coming up in the next 30 days', TODAY)).toMatchObject({
      from: TODAY,
      to: shiftDate(TODAY, 29),
      said: 'in the next 30 days',
      next: false,
    })
    expect(spanIn("what's coming up", TODAY)).toMatchObject({
      next: false,
      to: shiftDate(TODAY, 29),
    })
    expect(spanIn('what does my month ahead look like', TODAY)).toMatchObject({
      said: 'in the month ahead',
      next: false,
    })
    expect(spanIn('my next event', TODAY).next).toBe(true)
    expect(spanLead('on Friday')).toBe('On Friday')
    expect(spanLead('this week')).toBe('On this week')
    expect(spanLead('in the next 30 days')).toBe('In the next 30 days')
    expect(spanIn('what do I have', TODAY)).toMatchObject({ from: TODAY, to: '2026-10-17' })
  })
})

describe('reminders said', () => {
  it.each([
    ['remind me at 3:50 to start Claude', 'Start Claude', '2026-10-14T15:50', 'none'],
    ['ping me tomorrow at 9 to send the email', 'Send the email', '2026-10-15T09:00', 'none'],
    [
      'can you remind me in 20 minutes to check the oven',
      'Check the oven',
      '2026-10-14T14:50',
      'none',
    ],
    ['set a reminder for 5 to pick up the kids', 'Pick up the kids', '2026-10-14T17:00', 'none'],
    ['remind me at 1 to eat lunch', 'Eat lunch', '2026-10-15T13:00', 'none'],
    ['remind me every Sunday at 8 to set up chairs', 'Set up chairs', '2026-10-18T08:00', 'weekly'],
    ['nudge me tonight at 9 to pack', 'Pack', '2026-10-14T21:00', 'none'],
  ])('%s', (said, text, when, repeat) => {
    expect(reminderIn(said, TODAY, '14:30')).toEqual({ text, when, repeat })
  })

  it('left to Claude when it can’t be told', () => {
    expect(reminderIn('remind me at 2:15', TODAY, '14:30')).toBeNull() // what for?
    expect(reminderIn('remind me to pray an hour before every event', TODAY, '14:30')).toBeNull()
    expect(reminderIn('remind me in 10 minutes to stretch', TODAY, null)).toBeNull() // no clock
  })
})

describe('availability said', () => {
  it.each([
    ["I can't make it to youth night", 'no'],
    ['count me out for the retreat', 'no'],
    ["I'm a maybe for the picnic", 'tbd'],
    ["I'll be a little late to bible study", 'partial'],
    ['I can come to the gala', 'yes'],
    ["I'm going, no problem", 'yes'],
  ])('%s → %s', (said, status) => {
    expect(statusIn(said)).toBe(status)
  })
})

// --- Her answers ---------------------------------------------------------------

/** The church's database, as her tests read it. */
const CHURCH: Record<string, Record<string, Record<string, unknown>>> = {
  users: {
    sarah: { displayName: 'Sarah Lee', roles: ['regular'] },
    boss: { displayName: 'Jacob Pintos', roles: ['admin'] },
  },
  groups: { gAll: { name: 'All', members: ['sarah', 'boss'] } },
  events: {
    yn: {
      title: 'Youth Night',
      isRec: true,
      recur: 'weekly',
      recDay: 5,
      date: '2026-09-04',
      startTime: '7:00 PM',
      location: 'Elim Church',
      address: '100 Main St',
      city: 'Des Moines',
      state: 'IA',
      groups: ['gAll'],
      dressCode: [{ group: '_remainder_', text: 'Casual — jeans are fine' }],
    },
    pic: {
      title: 'Church Picnic',
      date: '2026-10-17',
      startTime: '12:00 PM',
      location: 'Greenwood Park',
      city: 'Des Moines',
      state: 'IA',
      groups: ['gAll'],
    },
    pray: {
      title: 'Prayer Night',
      date: '2026-10-14',
      startTime: '8:00 PM',
      location: 'The Chapel',
      address: '5 Oak St',
      groups: ['gAll'],
    },
    ret: {
      title: "Women's Retreat",
      date: '2026-10-23',
      startTime: '5:00 PM',
      groups: ['gAll'],
      carpool: true,
      carpoolCars: [{ id: 'c1', label: 'Van', driver: 'boss', riders: ['sarah'] }],
      carpoolLoc: 'the church lot',
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
    appTools: ['set_availability', 'create_reminder'],
    can: ['link'],
    viewer: sarah,
    lookups: new Lookups(church, sarah, TODAY),
    db: memoryOwnDb(),
    ...extra,
  }
}

describe('her answers', () => {
  beforeEach(() => forgetCaches())

  it('when an event is, however it is asked', async () => {
    const own = await ownAnswer(input('when does youth night kick off'))
    expect(own.result).toMatchObject({
      kind: 'answer',
      text: 'Youth Night is on Friday, October 16 at 7:00 PM.',
      open: { kind: 'event', key: 'yn_2026-10-16' },
    })
  })

  it('where, with maps offered on its day — and opened when they say yes', async () => {
    const own = await ownAnswer(input('where is prayer night'))
    expect(own.result).toMatchObject({
      text: 'Prayer Night is at The Chapel, 5 Oak St. Want me to open maps for it?',
      followUp: true,
    })
    const yes = await ownAnswer(
      input('yes', {
        history: [{ said: 'where is prayer night', reply: (own.result as { text: string }).text }],
      })
    )
    expect(yes.result).toMatchObject({ open: { kind: 'directions', key: 'pray_2026-10-14' } })
  })

  it('what to wear', async () => {
    const own = await ownAnswer(input('what should I wear to youth night'))
    expect(own.result).toMatchObject({
      text: 'The dress code for Youth Night is Casual — jeans are fine.',
      open: { section: 'dress_code' },
    })
  })

  it('their car', async () => {
    const own = await ownAnswer(input("who's driving me to the retreat"))
    expect((own.result as { text: string }).text).toBe(
      "Women's Retreat: Van (your car): driven by Jacob Pintos, riding: you. Cars meet at the church lot."
    )
  })

  it('what they have on', async () => {
    const own = await ownAnswer(input('what have I got going on this weekend'))
    expect(own.result).toMatchObject({
      text: 'On this weekend: Church Picnic, Saturday at 12:00 PM.',
    })
  })

  it('what they have on, with their own notes on those days', async () => {
    const db = fakeDb({
      ...CHURCH,
      dateNotes: {
        sarah: {
          n1: { date: '2026-10-17', text: 'Bring the blanket', at: 1 },
          n2: { date: '2026-10-18', text: 'Call Mom.', at: 2 },
          n3: { date: '2026-10-30', text: 'Not this weekend', at: 3 },
        },
        boss: { n4: { date: '2026-10-17', text: 'Someone else’s', at: 4 } },
      },
    })
    const own = await ownAnswer(
      input('what have I got going on this weekend', { lookups: new Lookups(db, sarah, TODAY) })
    )
    expect(own.result).toMatchObject({
      text: 'On this weekend: Church Picnic, Saturday at 12:00 PM. Your notes: Saturday — Bring the blanket. Sunday — Call Mom.',
    })
    // Made a public follower since: their calendar shows no notes, kept from before or not.
    const now = { uid: 'sarah', roles: ['public'] }
    expect(await new Lookups(db, now, TODAY).notesBetween('2026-10-17', '2026-10-18')).toEqual([])
  })

  it('their answer for an event, to confirm', async () => {
    const own = await ownAnswer(input("I won't be able to make the picnic"))
    expect(own.result).toEqual({
      kind: 'confirm',
      name: 'set_availability',
      input: { event_key: 'pic_2026-10-17', status: 'no', note: '' },
      more: false,
    })
  })

  it('not their answer, when “sign me up” names an event with a food sign-up', async () => {
    const fed = fakeDb({
      ...CHURCH,
      events: { ...CHURCH.events, pic: { ...CHURCH.events.pic, food: true, foodItems: ['Chips'] } },
    })
    const tools: OwnInput['appTools'] = ['set_availability', 'create_reminder', 'sign_up_food']
    const at = (text: string, appTools = tools) =>
      ownAnswer(input(text, { lookups: new Lookups(fed, sarah, TODAY), appTools }))
    // Bringing something, as likely as coming: Claude asks.
    expect((await at('sign me up for the picnic')).result).toBeNull()
    expect((await at('put me down for the picnic')).result).toBeNull()
    // Said plainly as coming, it is still their answer.
    expect((await at('sign me up as available for the picnic')).result).toMatchObject({
      kind: 'confirm',
      name: 'set_availability',
    })
    // A maybe or a no is no food sign-up.
    expect((await at('put me down for a maybe for the picnic')).result).toMatchObject({
      name: 'set_availability',
      input: { status: 'tbd' },
    })
    // Nor for someone who can't sign up for food (a guest): their answer.
    expect(
      (await at('sign me up for the picnic', ['set_availability', 'create_reminder'])).result
    ).toMatchObject({ kind: 'confirm', name: 'set_availability' })
    // With no food sign-up, it is their answer.
    expect((await ownAnswer(input('sign me up for the picnic'))).result).toMatchObject({
      kind: 'confirm',
      name: 'set_availability',
      input: { event_key: 'pic_2026-10-17' },
    })
  })

  it('not their answer, when it is someone else coming or not', async () => {
    for (const said of [
      "Jacob can't make the picnic",
      "Hey Miriam, Jacob won't make the picnic",
      "Miriam, my wife can't come to the picnic",
      "she won't make it to the picnic",
    ]) {
      expect([said, (await ownAnswer(input(said))).result]).toEqual([said, null])
    }
    // Their own still is, however it begins.
    expect((await ownAnswer(input("Miriam, I can't make the picnic"))).result).toMatchObject({
      name: 'set_availability',
      input: { status: 'no' },
    })
  })

  it('a reminder, set from their clock', async () => {
    const own = await ownAnswer(input('could you ping me at 3:50 to start Claude'))
    expect(own.result).toMatchObject({
      kind: 'confirm',
      name: 'create_reminder',
      input: { text: 'Start Claude', when: '2026-10-14T15:50', repeat: 'none', every_event: false },
    })
  })

  it('hands on what isn’t hers, or isn’t plain', async () => {
    for (const text of [
      'create an event called Game Night next Friday',
      'change the picnic to 2 pm',
      'who is coming to youth night',
      'what time is it', // no event named
    ]) {
      const own = await ownAnswer(input(text))
      expect(own.result, text).toBeNull()
    }
  })

  it('an answer taught, said as written', async () => {
    const db = memoryOwnDb()
    await teach(db, {
      q: 'Where do I park on Sunday?',
      a: 'Park in the north lot — the south lot is for guests.',
      v: embed('Where do I park on Sunday?'),
      by: 'boss',
    })
    const own = await ownAnswer(input('where should I park on sundays', { db }))
    expect(own.result).toMatchObject({
      text: 'Park in the north lot — the south lot is for guests.',
    })
  })

  it('an answer taught, changed: said the new way, asked the new way', async () => {
    const db = memoryOwnDb()
    const id = await teach(db, {
      q: 'Where do I park on Sunday?',
      a: 'Park in the north lot.',
      v: embed('Where do I park on Sunday?'),
      by: 'boss',
    })
    const changed = {
      q: 'Where do I park for youth night?',
      a: 'Park behind the gym — the north lot is closed on Wednesdays.',
      by: 'boss',
    }
    expect(await retaught(db, id, { ...changed, v: embed(changed.q) })).toBe(true)
    const own = await ownAnswer(input('where should I park for youth night', { db }))
    expect(own.result).toMatchObject({ text: changed.a })
    expect((await listTaught(db)).map((t) => [t.id, t.q])).toEqual([[id, changed.q]])
    // Taken away meanwhile: nothing changed.
    expect(await retaught(db, 'gone', { ...changed, v: embed(changed.q) })).toBe(false)
  })

  it('a question of faith, taught in other words: her answer', async () => {
    const db = memoryOwnDb()
    await teach(db, {
      q: 'What do we believe about baptism?',
      a: 'We baptize believers by immersion, as a public step of faith.',
      v: embed('What do we believe about baptism?'),
      by: 'boss',
    })
    const own = await ownAnswer(input('how does the church do baptisms', { db }))
    expect(own.result).toMatchObject({
      text: 'We baptize believers by immersion, as a public step of faith.',
    })
    // Another subject altogether: the church's leadership's.
    forgetCaches()
    const other = await ownAnswer(input('what do we believe about communion', { db }))
    expect((other.result as { text: string }).text).toBe(DEFER_MEETING)
  })

  it('a question of faith not taught, nor on the church’s site: its leadership', async () => {
    const own = await ownAnswer(input('what does the Bible say about worry'))
    expect((own.result as { text: string }).text).toBe(DEFER_MEETING)
  })

  it('the web, saying where from, with its page to open', async () => {
    const own = await ownAnswer(
      input('look up who invented the telephone', {
        web: async () => ({
          text: 'Alexander Graham Bell was granted the first US patent for the telephone in 1876.',
          url: 'https://en.wikipedia.org/wiki/Telephone',
          source: 'Wikipedia',
        }),
      })
    )
    expect(own.result).toMatchObject({
      text: 'Alexander Graham Bell was granted the first US patent for the telephone in 1876. (from Wikipedia)',
      open: { kind: 'link', url: 'https://en.wikipedia.org/wiki/Telephone', label: 'Wikipedia' },
    })
    // An older app, without the button: the words alone.
    const older = await ownAnswer(
      input('google who invented the telephone', {
        can: [],
        web: async () => ({ text: 'Bell.', url: 'https://x.org', source: 'x.org' }),
      })
    )
    expect(older.result).toMatchObject({ text: 'Bell. (from x.org)', open: null })
  })

  it('what Claude saw was hers — the web, or faith — answered by her', async () => {
    const web = async () => ({ text: 'Bell, in 1876.', url: null, source: 'Wikipedia' })
    expect(
      await webOrFaith('web', 'who invented the telephone', {
        db: memoryOwnDb(),
        today: TODAY,
        can: ['link'],
        web,
      })
    ).toMatchObject({
      kind: 'answer',
      text: 'Bell, in 1876. (from Wikipedia)',
      open: null,
    })
    expect(
      (
        (await webOrFaith('faith', 'why did Jesus die', {
          db: memoryOwnDb(),
          today: TODAY,
          can: [],
        })) as { text: string }
      ).text
    ).toBe(DEFER)
    expect(
      await webOrFaith('event_time', 'x', { db: memoryOwnDb(), today: TODAY, can: [] })
    ).toBeNull()
  })

  it('a question of faith not hers: would they like to meet with the leadership?', async () => {
    const asked = 'what does the Bible say about worry'
    // A member, and a public follower: asked, and listened to for the answer.
    const visitor = { uid: 'v', roles: ['public'] }
    for (const extra of [{}, { viewer: visitor, lookups: new Lookups(church, visitor, TODAY) }]) {
      expect((await ownAnswer(input(asked, extra))).result).toMatchObject({
        text: DEFER_MEETING,
        open: null,
        followUp: true,
      })
    }
    // A guest, who has no form to ask with: the website, as before.
    const guest = { uid: 'g', roles: ['guest'] }
    expect(
      (await ownAnswer(input(asked, { viewer: guest, lookups: new Lookups(church, guest, TODAY) })))
        .result
    ).toMatchObject({ text: DEFER, open: { kind: 'link' }, followUp: false })
    // And more asked after it is the leadership's, asked the same.
    const more = await ownAnswer(
      input('but why?', {
        viewer: visitor,
        lookups: new Lookups(church, visitor, TODAY),
        history: [{ said: asked, reply: DEFER_MEETING }],
      })
    )
    expect(more.result).toMatchObject({ text: LEADERSHIP_MEETING, followUp: true })
    expect(isFaithReply(DEFER_MEETING) && isFaithReply(LEADERSHIP_MEETING)).toBe(true)
  })

  it('a meeting offered: yes, the form to ask for one; no, okay', async () => {
    const asked = 'what does the Bible say about worry'
    for (const yes of ['yes', 'yes please', 'sure', 'I’d like that', 'that would be great']) {
      const own = await ownAnswer(input(yes, { history: [{ said: asked, reply: DEFER_MEETING }] }))
      expect(own.result, yes).toMatchObject({
        text: TO_THE_FORM,
        open: { kind: 'screen', id: 'connect', section: 'meeting' },
      })
    }
    for (const no of ['no', 'no thanks', 'not really']) {
      const own = await ownAnswer(
        input(no, { history: [{ said: 'but why?', reply: LEADERSHIP_MEETING }] })
      )
      expect(own.result, no).toMatchObject({ text: 'Okay.', open: null })
    }
  })

  it('who she is: an AI, what she can do — not a question of faith', async () => {
    const own = await ownAnswer(input('Who are you?'))
    expect(own.why).toBe('self')
    expect((own.result as { text: string }).text).toMatch(
      /^I’m Miriam, the assistant in this app — an AI language model, not a person\..*Claude, an AI model from Anthropic/
    )
    const visitor = { uid: 'v', roles: ['public'] }
    const theirs = await ownAnswer(
      input('what can you do', { viewer: visitor, lookups: new Lookups(church, visitor, TODAY) })
    )
    expect((theirs.result as { text: string }).text).toMatch(/ask to meet with our leadership/)
    expect((theirs.result as { text: string }).text).not.toMatch(/Claude|Anthropic/)
    // Where her name comes from is still the church's to tell.
    expect((await ownAnswer(input('why are you called Miriam'))).why).toMatch(/^names/)
  })

  it('leaves a conversation under way to Claude', async () => {
    const own = await ownAnswer(
      input('at 5', {
        history: [{ said: 'remind me to call Sam', reply: 'When should I remind you?' }],
      })
    )
    expect(own.result).toBeNull()
  })
})

// --- What she learns -------------------------------------------------------------

describe('what she learns', () => {
  beforeEach(() => forgetCaches())

  it('is kept, once for the same words, used once read so twice, and forgotten when asked', async () => {
    const db = memoryOwnDb()
    const v = embed('when does the event get rolling')
    await learn(db, 'when does the event get rolling', 'event_time', v, 1)
    await learn(db, 'When does the event get rolling?', 'event_time', v, 2)
    expect((await listLearning(db)).waiting).toMatchObject([
      { text: 'when does the event get rolling', skill: 'event_time', y: 1 },
    ])
    expect(await learnedExamples(db, 3)).toEqual([])
    await learn(db, 'when does the event get rolling', 'event_time', v, 2 + CONFIRM_GAP_MS)
    forgetCaches()
    expect((await learnedExamples(db)).map((e) => e.skill)).toEqual(['event_time'])
    await forget(db, { key: sameKey('when does the event get rolling') })
    forgetCaches()
    expect(await learnedExamples(db)).toEqual([])
    expect((await listLearning(db)).retired).toMatchObject([{ why: 'admin' }])
  })

  it('keeps what a newer version of her learned, though it can’t read it', async () => {
    const db = memoryOwnDb()
    const v = packVector(embed('I’ll bring the event'))
    // Learned by a version with a skill this one doesn’t know (a deploy, a rollback).
    db.docs.set(LEARNED_DOC, {
      examples: [{ t: 'I’ll bring the event', s: 'a_newer_skill', v, at: 1, by: 'claude' }],
    })
    expect(await learnedExamples(db)).toEqual([])
    expect((await listLearning(db)).inUse).toEqual([])
    await learn(
      db,
      'when does the event start',
      'event_time',
      embed('when does the event start'),
      2
    )
    await forget(db, { key: sameKey('something never learned') })
    // Still kept, for the newer version to read.
    expect((db.docs.get(LEARNED_DOC)?.examples as { s: string }[]).map((e) => e.s)).toEqual([
      'a_newer_skill',
    ])
  })

  it('takes requests for the same only when they are, by her own meanings', () => {
    const near = (a: string, b: string) => similarity(embed(a), embed(b))
    // The same request, in other words: confirms.
    expect(
      near(
        'is the youth night thing still on for this friday',
        'is the youth night thing still on for friday'
      )
    ).toBeGreaterThanOrEqual(SAME_REQUEST)
    // Of different skills, however alike: never.
    expect(near("when's the event this year", "where's the event at this year")).toBeLessThan(
      SAME_REQUEST
    )
    expect(near('what time is the event', 'what is the dress code for the event')).toBeLessThan(
      SAME_REQUEST
    )
  })

  it('learns from the changes Claude makes that are hers', () => {
    expect(skillOfAction('set_availability', { event_key: 'k', status: 'yes' })).toBe(
      'availability'
    )
    expect(skillOfAction('create_reminder', { text: 'call Sam', when: 'x' })).toBe('reminder')
    // Before an event, or every event: Claude’s to set.
    expect(skillOfAction('create_reminder', { text: 'x', event_key: 'k' })).toBeNull()
    expect(skillOfAction('create_reminder', { text: 'x', every_event: true })).toBeNull()
    expect(skillOfAction('send_message', {})).toBeNull()
  })

  it('makes the next one like it hers — once Claude has read it so twice', async () => {
    const db = memoryOwnDb()
    // Not hers from her starting examples: when Youth Night is, she isn't sure.
    const said = 'is the youth night thing still on for friday'
    const before = await ownAnswer(input(said, { db }))
    expect(before.result).toBeNull()
    // Learned from Claude's answer: it was when Youth Night is. Once isn't enough.
    await learn(db, before.read!.masked, 'event_time', before.read!.v, 0)
    forgetCaches()
    expect((await ownAnswer(input(said, { db }))).result).toBeNull()
    // Read so again, in another conversation: hers.
    await learn(db, before.read!.masked, 'event_time', before.read!.v, CONFIRM_GAP_MS)
    forgetCaches()
    const after = await ownAnswer(input(said, { db }))
    expect(after.read?.skill).toBe('event_time')
    expect(after.result).toMatchObject({ text: 'Youth Night is on Friday, October 16 at 7:00 PM.' })
  })

  it('hands on the words someone said an answer of hers wasn’t what they meant', async () => {
    const db = memoryOwnDb()
    const said = 'is the youth night thing still on for friday'
    const first = await ownAnswer(input(said, { db }))
    await learn(db, first.read!.masked, 'event_time', first.read!.v, 0)
    await learn(db, first.read!.masked, 'event_time', first.read!.v, CONFIRM_GAP_MS)
    forgetCaches()
    expect((await ownAnswer(input(said, { db }))).result).not.toBeNull()
    db.docs.set('miriamOwn/learning', {
      ...(db.docs.get('miriamOwn/learning') ?? {}),
      handOn: [{ k: sameKey(first.read!.masked), at: Date.now() }],
    })
    forgetCaches()
    expect(await ownAnswer(input(said, { db }))).toMatchObject({
      result: null,
      why: 'corrected before',
    })
  })
})

// --- Not what they meant -------------------------------------------------------

describe('when someone says her answer wasn’t what they meant', () => {
  beforeEach(() => forgetCaches())
  const said = 'is the youth night thing still on for friday'

  it('accounts for the lessons that led her, and learns better from Claude', async () => {
    const db = memoryOwnDb()
    // Claude read requests like it wrongly, each twice: what to wear — enough to lead her.
    const lessons = []
    for (const t of [
      said,
      'is the youth night thing still on friday',
      'is youth night still on for friday',
    ]) {
      const r = (await ownAnswer(input(t, { db }))).read!
      lessons.push({
        t: r.masked,
        s: 'event_dress',
        v: packVector(r.v),
        at: 0,
        by: 'claude',
        y: 2,
        last: 0,
      })
    }
    db.docs.set(LEARNED_DOC, { examples: lessons })
    forgetCaches()
    const wrong = await ownAnswer(input(said, { db }))
    expect(wrong).toMatchObject({
      result: { text: 'The dress code for Youth Night is Casual — jeans are fine.' },
      byReading: true,
    })
    // "That's not what I meant": her reading again, and the lessons that led her.
    const { own, from } = await readFor(input(said, { db }), 'event_dress')
    expect(from).toContain(sameKey(own.masked))
    await corrected(db, { key: sameKey(own.masked), from })
    forgetCaches()
    expect(await ownAnswer(input(said, { db }))).toMatchObject({
      result: null,
      why: 'corrected before',
    })
    // Claude read it as when Youth Night is: those lessons wait again, and she no longer reads it so.
    const learned = await learn(db, own.masked, 'event_time', own.v, CONFIRM_GAP_MS, {
      corrected: { read: 'event_dress', from },
    })
    expect(learned).toMatchObject({ demoted: from.length })
    forgetCaches()
    expect((await ownAnswer(input(said, { db }))).read?.skill).not.toBe('event_dress')
  })

  it('blames nothing she learned for an answer that didn’t come of her reading', async () => {
    const db = memoryOwnDb()
    await teach(db, {
      q: 'where do I park',
      a: 'Park in the north lot.',
      v: embed('where do I park'),
      by: 'admin',
    })
    const taught = await ownAnswer(input('where do I park', { db }))
    expect(taught).toMatchObject({ why: 'taught' })
    expect(taught.byReading).toBeUndefined()
    expect((await readFor(input('where do I park', { db }), null)).from).toEqual([])
  })
})

// --- The web ----------------------------------------------------------------------

/** A meaning for tests: the words a text has. */
const words = (s: string) => {
  const v = new Float32Array(64)
  for (const w of s.toLowerCase().split(/\W+/).filter(Boolean)) {
    let h = 0
    for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 64
    v[h] += 1
  }
  const n = Math.hypot(...v) || 1
  return v.map((x) => x / n)
}

const respond = (body: unknown, type = 'application/json') =>
  ({
    ok: true,
    headers: { get: () => type },
    json: async () => body,
    text: async () => String(body),
  }) as unknown as Response

describe('the web', () => {
  it('searches for the question, without the asking', () => {
    expect(queryOf('hey Miriam, can you look up Costco hours please')).toBe('Costco hours')
    expect(queryOf('google how to fix a leaky faucet')).toBe('how to fix a leaky faucet')
    expect(queryOf('who invented the telephone?')).toBe('who invented the telephone')
  })

  it('reads a page’s text, not its scripts and menus', () => {
    const html =
      '<html><head><title>x</title><script>var a = "Mon-Fri 9am"</script></head><body><nav>Home About Contact Shop</nav>' +
      '<p>Warehouse hours are Monday through Friday, 10:00 a.m. to 8:30 p.m. &amp; weekends 9:30 to 6.</p>' +
      '<footer>Copyright 2026 all rights reserved here</footer></body></html>'
    expect(passagesOf(html)).toEqual([
      'Warehouse hours are Monday through Friday, 10:00 a.m. to 8:30 p.m. & weekends 9:30 to 6.',
    ])
  })

  it('answers with the passage that answers best', () => {
    const best = bestPassage(
      'what are costco warehouse hours',
      [
        {
          text: 'Costco Wholesale is a membership warehouse club.',
          url: 'u1',
          source: 'costco.com',
        },
        {
          text: 'Costco warehouse hours are Monday through Friday, 10 a.m. to 8:30 p.m.',
          url: 'u2',
          source: 'costco.com',
        },
        { text: 'Unrelated text about something else entirely here.', url: 'u3', source: 'x.com' },
      ],
      words
    )
    expect(best).toMatchObject({ url: 'u2' })
  })

  it('reads Brave’s results and Wikipedia’s', async () => {
    const brave = await braveSearch('costco hours', 'KEY', (async (
      url: string,
      init: RequestInit
    ) => {
      expect(url).toContain('q=costco+hours')
      expect((init.headers as Record<string, string>)['X-Subscription-Token']).toBe('KEY')
      return respond({
        web: {
          results: [
            {
              title: 'Costco <strong>Hours</strong>',
              url: 'https://costco.com/hours',
              description: 'Open <strong>10am</strong>',
              extra_snippets: ['Closes 8:30pm'],
            },
            { title: 'Bad', url: 'javascript:alert(1)', description: 'no' },
          ],
        },
      })
    }) as typeof fetch)
    expect(brave).toEqual([
      { title: 'Costco Hours', url: 'https://costco.com/hours', text: 'Open 10am Closes 8:30pm' },
    ])

    const wiki = await wikipediaSearch('telephone', (async (url: string) =>
      url.includes('list=search')
        ? respond({ query: { search: [{ title: 'Telephone' }] } })
        : respond({
            extract: 'A telephone is a device. Bell patented it in 1876.',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Telephone' } },
          })) as typeof fetch)
    expect(wiki).toEqual([
      {
        title: 'Telephone',
        url: 'https://en.wikipedia.org/wiki/Telephone',
        text: 'A telephone is a device. Bell patented it in 1876.',
      },
    ])
  })

  it('answers from Wikipedia without a key', async () => {
    const fetchFn = (async (url: string) =>
      url.includes('list=search')
        ? respond({ query: { search: [{ title: 'Telephone' }] } })
        : respond({
            extract:
              'A telephone is a device for talking at a distance. Alexander Graham Bell patented the telephone in 1876.',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Telephone' } },
          })) as typeof fetch
    const found = await webAnswer('who patented the telephone', {
      braveKey: null,
      today: TODAY,
      fetchFn,
      meaning: words,
    })
    expect(found).toEqual({
      text: 'Alexander Graham Bell patented the telephone in 1876.',
      url: 'https://en.wikipedia.org/wiki/Telephone',
      source: 'Wikipedia',
    })
  })

  it('knows a place’s weather is asked', () => {
    expect(weatherPlace("what's the weather in Chicago tomorrow")).toBe('Chicago')
    expect(weatherPlace('is it going to rain in Des Moines this weekend')).toBe('Des Moines')
    expect(weatherPlace('who won the game')).toBeNull()
  })
})

// --- Questions of faith ----------------------------------------------------------

/** A sample church site, written for tests — not The Well's own words. */
const BELIEFS = readFileSync(join(__dirname, '__fixtures__/sampleBeliefsPage.html'), 'utf8')
const FRAME =
  '<nav><a href="/">Home</a> <a href="/about">About Us</a> <a href="/beliefs">What We Believe</a> <a href="/give">Give Online Today</a></nav>' +
  '<div>Join us Sunday mornings at 9:00 and 10:45 am at 123 Main Street</div>'
const SITE: Record<string, { type: string; body: string }> = {
  'https://example.org/': {
    type: 'text/html',
    body: `<html><head><title>Home | Sample</title></head><body>${FRAME}<p>Welcome home to a church family that loves God and loves our neighbors.</p><a href="https://elsewhere.com/x">Elsewhere</a><a href="/files/bulletin.pdf">Bulletin</a></body></html>`,
  },
  'https://example.org/sitemap.xml': {
    type: 'application/xml',
    body: '<urlset><url><loc>https://example.org/beliefs</loc></url><url><loc>https://www.example.org/give</loc></url></urlset>',
  },
  'https://example.org/beliefs': {
    type: 'text/html; charset=utf-8',
    body: BELIEFS.replace('<nav>', FRAME + '<nav>'),
  },
  'https://example.org/about': {
    type: 'text/html',
    body: `<html><head><title>About Us</title></head><body>${FRAME}<p>We started meeting in a living room in 2009 and have grown into a family of many ages.</p></body></html>`,
  },
  'https://www.example.org/give': {
    type: 'text/html',
    body: `<html><head><title>Give</title></head><body>${FRAME}<p>Your generosity helps us serve our neighbors and support missions around the world.</p></body></html>`,
  },
}
const siteFetch = (async (url: string) => {
  const page = SITE[url] ?? SITE[url.replace(/\/$/, '')] ?? SITE[`${url}/`]
  return page
    ? ({
        ok: true,
        headers: { get: () => page.type },
        text: async () => page.body,
      } as unknown as Response)
    : ({ ok: false, headers: { get: () => '' }, text: async () => '' } as unknown as Response)
}) as typeof fetch

describe('the church’s website', () => {
  it('finds its pages by its links and its sitemap, not files or other sites', () => {
    expect(
      linksOf(SITE['https://example.org/'].body, 'https://example.org/', 'https://example.org')
    ).toEqual([
      'https://example.org/',
      'https://example.org/about',
      'https://example.org/beliefs',
      'https://example.org/give',
    ])
    expect(sitemapUrls(SITE['https://example.org/sitemap.xml'].body)).toEqual([
      'https://example.org/beliefs',
      'https://www.example.org/give',
    ])
    expect(pageKey('https://www.example.org/give/?a=1#x')).toBe('https://example.org/give')
  })

  it('is read for what it says, without what every page repeats', async () => {
    const read = await readSite(siteFetch, embed, 'https://example.org', 7)
    expect(read.pages.map((p) => p.title).sort()).toEqual([
      'About Us',
      'Give',
      'Home | Sample',
      'What We Believe | Sample Church',
    ])
    const said = read.passages.map((p) => p.t)
    expect(said).toContain(
      'We practice baptism by immersion as a public declaration of faith for those who have trusted Christ.'
    )
    expect(said.some((t) => /Join us Sunday mornings/.test(t))).toBe(false) // on every page
    expect(said.some((t) => /scripts/.test(t))).toBe(false)
    // What it says it believes, first.
    expect(read.passages[0].u).toBe('https://example.org/beliefs')
  })

  it('reads what it believes from the foot of every page, once — but not its fine print', async () => {
    // As a site builder's accordion has it, in the footer of every page.
    const scriptures =
      'We believe the Bible is the written Word of God, inspired by the Holy Spirit. It is infallible in its original manuscripts, and it is trustworthy pertaining to all matters on which it teaches.'
    const footer = `<footer><h2>What We Believe</h2><ul class="accordion-items-container"><li class="accordion-item"><h3 class="accordion-item__title-wrapper"><button class="accordion-item__click-target" aria-expanded="false"><span class="accordion-item__title">Scriptures</span></button></h3><div class="accordion-item__dropdown" role="region"><div class="accordion-item__description"><p>${scriptures}</p></div></div></li></ul><p>© 2026 The Well Church. All rights reserved.</p></footer>`
    const withFooters = (async (url: string) => {
      const res = await siteFetch(url)
      if (!res.ok) return res
      const body = (await res.text()).replace('</body>', `${footer}</body>`)
      return { ok: true, headers: res.headers, text: async () => body } as unknown as Response
    }) as typeof fetch
    const read = await readSite(withFooters, embed, 'https://example.org', 7)
    const said = read.passages.map((p) => p.t)
    expect(
      said.filter((t) => t.startsWith('We believe the Bible is the written Word of God'))
    ).toHaveLength(1)
    // The fine print every page repeats is the site's frame.
    expect(said.some((t) => /The Well Church\. All rights reserved/.test(t))).toBe(false)

    forgetSite()
    const db = memoryOwnDb()
    await storeSite(db, read)
    const f = await faithAnswer('What is your view on the scriptures?', db)
    expect(f.from).toBe('site')
    expect(f.text).toMatch(/^We believe the Bible is the written Word of God/)
  })
})

describe('a question of faith', () => {
  beforeEach(() => {
    forgetCaches()
    forgetSite()
  })

  const withSite = async () => {
    const db = memoryOwnDb()
    await storeSite(db, await readSite(siteFetch, embed, 'https://example.org'))
    return db
  }

  it('the church’s own words first, with the page to read it on', async () => {
    const f = await faithAnswer('what do we believe about baptism', await withSite())
    expect(f).toEqual({
      text: 'We practice baptism by immersion as a public declaration of faith for those who have trusted Christ. (from example.org)',
      link: { url: 'https://example.org/beliefs', label: 'example.org' },
      from: 'site',
    })
  })

  it('and nothing else: nothing built in, nothing from elsewhere', async () => {
    // What the site says, it says…
    const rose = await faithAnswer('did Jesus rise from the dead', await withSite())
    expect(rose.from).toBe('site')
    expect(rose.text).toMatch(/rose bodily from the dead/)
    // …and without it, however plain the question, she doesn't answer it.
    forgetSite()
    for (const q of ['did Jesus rise from the dead', 'is God good', 'who is Jesus']) {
      const f = await faithAnswer(q, memoryOwnDb())
      expect(f.from, q).toBe('leadership')
      expect(f.text).toBe(DEFER)
    }
  })

  it('what the site doesn’t say, or not plainly enough: the church’s leadership, and the website', async () => {
    const db = await withSite()
    for (const q of [
      'is it a sin to drink alcohol',
      'can you lose your salvation',
      'should babies be baptized',
      'is God good even when bad things happen',
      'will my dog go to heaven',
      'do you have to be baptized to be saved',
    ]) {
      const f = await faithAnswer(q, db)
      expect(f.from, q).toBe('leadership')
      expect(f.link).toEqual({ url: 'https://thewellofiowa.com', label: 'thewellofiowa.com' })
    }
  })

  it('an admin’s answer above all', async () => {
    const db = await withSite()
    await teach(db, {
      q: 'What do we believe about baptism?',
      a: 'Talk with Pastor Sam about being baptized — we would love to celebrate with you.',
      v: embed('What do we believe about baptism?'),
      by: 'boss',
    })
    expect((await faithAnswer('what do we believe about baptism', db)).from).toBe('taught')
  })

  it('comes to her as a question of faith, with the page to open', async () => {
    const db = await withSite()
    const own = await ownAnswer(input('what do we believe about baptism', { db }))
    expect(own.result).toMatchObject({
      kind: 'answer',
      open: { kind: 'link', url: 'https://example.org/beliefs', label: 'example.org' },
    })
  })
})

describe('more asked about an answer on faith', () => {
  beforeEach(() => forgetCaches())
  // Her answer to "is God good", with nothing taught nor on the site.
  const godIsGood = DEFER

  it('is never discussed: the church’s leadership', async () => {
    for (const text of [
      'why?',
      'what do you mean by that',
      'but what about people who suffer',
      'tell me more',
      'is that true',
      'and the trinity?',
      'what about baptism',
    ]) {
      const own = await ownAnswer(
        input(text, { history: [{ said: 'is God good', reply: godIsGood }] })
      )
      expect(own.result, text).toMatchObject({ text: LEADERSHIP_MEETING, followUp: true })
    }
  })

  it('nor when Claude sees it', async () => {
    const f = await webOrFaith('faith', 'so what about the end times', {
      db: memoryOwnDb(),
      today: TODAY,
      can: [],
      history: [
        {
          said: 'will Jesus come back',
          reply: 'We believe Jesus will return. (from thewellofiowa.com)',
        },
      ],
    })
    expect(f).toMatchObject({ text: LEADERSHIP, open: null })
  })

  it('but something else asked is answered as ever', async () => {
    const own = await ownAnswer(
      input('what should I wear to youth night', {
        history: [{ said: 'is God good', reply: godIsGood }],
      })
    )
    expect(own.result).toMatchObject({
      text: 'The dress code for Youth Night is Casual — jeans are fine.',
    })
    // However short, and "thanks" isn't more asked.
    for (const text of [
      'who’s driving',
      'what’s my schedule',
      'when is youth night',
      'and Sunday?',
      'thanks',
      'thank you so much',
      'amen',
      'ok',
    ]) {
      const own = await ownAnswer(
        input(text, { history: [{ said: 'is God good', reply: godIsGood }] })
      )
      expect(own.why, text).not.toBe('faith: more asked')
    }
  })

  it('looked up, a question of faith is still one', async () => {
    const own = await ownAnswer(
      input('look up what the bible says about divorce', {
        web: async () => {
          throw new Error('not the web')
        },
      })
    )
    expect(own.why).toBe('faith')
    expect((own.result as { text: string }).text).toBe(DEFER_MEETING)
  })

  it('after an answer she was taught on faith, too', async () => {
    const db = memoryOwnDb()
    const a = 'We baptize believers by immersion, as a public step of faith.'
    await teach(db, {
      q: 'What do we believe about baptism?',
      a,
      v: embed('What do we believe about baptism?'),
      by: 'boss',
    })
    const own = await ownAnswer(
      input('why by immersion', {
        db,
        history: [{ said: 'what do we believe about baptism', reply: a }],
      })
    )
    expect(own.result).toMatchObject({ text: LEADERSHIP_MEETING })
    // But an answer taught on something else is talked about as ever.
    forgetCaches()
    const parking = await ownAnswer(
      input('why is that', {
        history: [{ said: 'where do I park', reply: 'Park in the north lot.' }],
      })
    )
    expect(parking.why).not.toBe('faith: more asked')
  })
})

describe('a question taught, asked in other words', () => {
  beforeEach(() => forgetCaches())
  // As an admin taught it (Admin → Miriam).
  const BIBLE_Q = 'What is your view on the scriptures or the bible'
  const BIBLE_A =
    'We believe the Bible is the written Word of God, inspired by the Holy Spirit. It is infallible in its original manuscripts, and it is trustworthy pertaining to all matters on which it teaches. It is unrivaled in its authority over life and faith, and the sovereign director of our worldview. Because it was inspired by God, the Bible is truth without any mixture of error and is completely relevant to our daily lives (2 Tim. 3:16-17, 2 Peter 1:21).'
  const GOD_A = 'We believe in one God, eternally existing in three persons.'
  const YOUTH_A = 'Youth group meets Wednesdays at 7pm.'
  const taught = async (more: { q: string; a: string }[] = []) => {
    const db = memoryOwnDb()
    for (const t of [{ q: BIBLE_Q, a: BIBLE_A }, ...more]) {
      await teach(db, { ...t, v: embed(t.q), by: 'boss' })
    }
    return db
  }
  const said = (own: { result: unknown }) => (own.result as { text: string } | null)?.text

  it('is answered as taught, however it is worded', async () => {
    const db = await taught()
    for (const q of [
      'What is your viewpoint on the authority of the bible',
      'what do you believe about the bible',
      'Is the Bible true?',
      'is the bible inerrant',
      'can I trust the bible',
      'is the bible the word of god',
      'what does the well believe about scripture',
    ]) {
      expect(said(await ownAnswer(input(q, { db }))), q).toBe(BIBLE_A)
    }
  })

  it('just after it was asked, or after another answer on faith, too', async () => {
    const db = await taught()
    for (const history of [
      [{ said: BIBLE_Q, reply: BIBLE_A }],
      [{ said: 'is God good', reply: DEFER }],
      [
        {
          said: 'what do we believe about baptism',
          reply: 'We baptize believers by immersion. (from thewellofiowa.com)',
        },
      ],
    ]) {
      const own = await ownAnswer(
        input('What is your viewpoint on the authority of the bible', { db, history })
      )
      expect(said(own), history[0].said).toBe(BIBLE_A)
    }
    // And handed back by Claude as a question of faith.
    const fromClaude = await webOrFaith(
      'faith',
      'What is your viewpoint on the authority of the bible',
      { db, today: TODAY, can: [], history: [{ said: 'is God good', reply: DEFER }] }
    )
    expect(fromClaude).toMatchObject({ text: BIBLE_A })
  })

  it('but more asked about it is still the leadership’s', async () => {
    const db = await taught()
    for (const q of [
      'why is it infallible?',
      'what do you mean by that',
      'but what about the contradictions in it',
    ]) {
      const own = await ownAnswer(input(q, { db, history: [{ said: BIBLE_Q, reply: BIBLE_A }] }))
      expect(said(own), q).toBe(LEADERSHIP_MEETING)
    }
  })

  it('never for what only sounds like it', async () => {
    const db = await taught([
      { q: 'What do you believe about God?', a: GOD_A },
      { q: 'When is youth group?', a: YOUTH_A },
    ])
    for (const q of [
      'do you take the bible literally',
      'what bible translation do you use',
      'what does the bible say about divorce',
      'what do you believe about faith',
      'what do you believe about Jesus',
      'where is youth group',
      'what is youth group',
    ]) {
      expect([BIBLE_A, GOD_A, YOUTH_A], q).not.toContain(said(await ownAnswer(input(q, { db }))))
    }
    // The same question, though, however it is asked.
    expect(said(await ownAnswer(input('what time does youth group start', { db })))).toBe(YOUTH_A)
    expect(said(await ownAnswer(input('is God real', { db })))).toBe(GOD_A)
  })

  it('for a public follower, too — and a question of faith she can’t read plainly is still the church’s', async () => {
    const db = await taught()
    const visitor = { db, today: TODAY, can: ['link'] }
    expect(await publicAnswer('is the bible without error?', visitor)).toMatchObject({
      text: BIBLE_A,
    })
    // Its leadership's to answer: would they like to meet with them?
    expect(await publicAnswer('do y’all think the bible has mistakes?', visitor)).toMatchObject({
      text: DEFER_MEETING,
      followUp: true,
    })
    // Not asked: said back as ever.
    expect(await publicAnswer('thanks, God bless', visitor)).toMatchObject({
      text: 'You’re welcome!',
    })
    expect(await publicAnswer('God is so good', visitor)).toMatchObject({ text: PUBLIC_NOT_HERS })
    expect(await publicAnswer('what’s the wifi password', visitor)).toMatchObject({
      text: PUBLIC_NOT_HERS,
    })
  })
})

describe('answered from the event itself', () => {
  beforeEach(() => forgetCaches())
  const db = fakeDb({
    users: {
      jacob: { displayName: 'Jacob Pintos', roles: ['admin'] },
      mitch: { displayName: 'Mitch Moylan', roles: ['regular'] },
      glenn: { displayName: 'Glenn Pettit', roles: ['regular'] },
      guest: { displayName: 'Guest User', roles: ['guest'] },
      // Shares the end of Guest User's name, and has no flight or room.
      mira: { displayName: 'Mira User', roles: ['regular'] },
      dana: { displayName: 'Dana Fox', roles: ['public'] },
    },
    groups: {},
    events: {
      nye: {
        title: 'New Years Eve',
        date: '2026-12-31',
        startTime: '10:30 PM',
        location: 'Elim Church',
        users: ['jacob', 'mitch', 'glenn', 'guest', 'mira', 'dana'],
        teams: [{ name: 'Production - Audio', leaders: [], members: ['jacob', 'dana'] }],
        carpool: true,
        carpoolCars: [
          { id: 'c1', label: 'Jacob’s Rouge', driver: 'jacob', riders: ['mitch', 'glenn'] },
        ],
        schedule: [
          { id: 's1', time: '3:00 PM', title: 'Setup' },
          { id: 's2', time: '4:00 PM', endTime: '6:00 PM', title: 'Sound check' },
          { id: 's3', time: '5:00 PM', title: 'Courtney and Olivia arrive' },
          { id: 's4', time: '10:30 PM', title: 'Worship' },
          { id: 's5', time: '11:15 PM', title: 'Sermon' },
          { id: 's6', time: '11:50 PM', title: 'Countdown & communion' },
        ],
        flights: true,
        flightEntries: [
          {
            uid: 'guest',
            outDate: '2026-12-30',
            outTime: '5 PM',
            outAirport: 'Nashville, TN',
            outAirline: 'American Airlines',
            outFlight: '1234',
            outArrival: '7 PM',
          },
        ],
        lodging: true,
        lodgingEntries: [
          {
            name: 'Marmot House',
            address: '55 Marmot Ct, North Liberty, IA',
            assignees: ['guest'],
          },
        ],
      },
      fam: {
        title: 'Family Gathering',
        date: '2026-11-01',
        startTime: '5:00 PM',
        location: 'Elim Church',
        users: ['jacob'],
        teams: [{ name: 'Hospitality', leaders: [], members: ['jacob'] }],
        schedule: [
          { id: 'f1', time: '5:00 PM', title: 'Dinner' },
          { id: 'f2', time: '6:00 PM', title: 'Games' },
        ],
      },
    },
  })
  const as = (uid: string, roles: string[]) => {
    const viewer = { uid, roles }
    return (text: string) =>
      ownAnswer(input(text, { viewer, lookups: new Lookups(db, viewer, TODAY) }))
  }
  const jacob = as('jacob', ['admin'])
  const said = async (q: string, ask = jacob) =>
    ((await ask(q)).result as { text: string } | null)?.text

  it('something on its schedule, by any of its words', async () => {
    // "Courtney and Olivia arrive", asked for Olivia alone.
    expect(await said('When does Olivia arrive for New Years Eve')).toBe(
      'On the New Years Eve schedule, “Courtney and Olivia arrive” is at 5:00 PM.'
    )
    expect(await said('when do courtney and olivia arrive for new years eve')).toMatch(
      /“Courtney and Olivia arrive” is at 5:00 PM/
    )
    expect(await said('what time is the sermon on new years eve')).toBe(
      'On the New Years Eve schedule, “Sermon” is at 11:15 PM.'
    )
    expect(await said('what comes after the sermon on new years eve')).toBe(
      'After “Sermon” (11:15 PM) comes “Countdown & communion” at 11:50 PM, on the New Years Eve schedule.'
    )
    expect(await said('when is sound check on new years eve')).toBe(
      'On the New Years Eve schedule, “Sound check” is 4:00–6:00 PM.'
    )
    // Words run together, or apart.
    expect(await said('when is set up on new years eve')).toBe(
      'On the New Years Eve schedule, “Setup” is at 3:00 PM.'
    )
    expect(await said('when’s soundcheck on new years eve')).toBe(
      'On the New Years Eve schedule, “Sound check” is 4:00–6:00 PM.'
    )
    expect(await said('what time is Olivia getting here for new years eve')).toBe(
      'On the New Years Eve schedule, “Courtney and Olivia arrive” is at 5:00 PM.'
    )
    expect(await said('what’s right before the sermon on new years eve')).toBe(
      'Before “Sermon” (11:15 PM) comes “Worship” at 10:30 PM, on the New Years Eve schedule.'
    )
    expect(await said('what comes after setup on new years eve')).toBe(
      'After “Setup” (3:00 PM) comes “Sound check” (4:00–6:00 PM), on the New Years Eve schedule.'
    )
    // Not named: the next of theirs whose schedule has it — months off, too.
    expect(await said('when is dinner')).toBe(
      'On the Family Gathering schedule, “Dinner” is at 5:00 PM.'
    )
    expect(await said('when does olivia arrive')).toBe(
      'On the New Years Eve schedule, “Courtney and Olivia arrive” is at 5:00 PM.'
    )
  })

  it('none of its schedule to a public follower, as its page shows them none', async () => {
    const dana = as('dana', ['public'])
    expect((await said('When does Olivia arrive for New Years Eve', dana)) ?? '').not.toMatch(
      /schedule/
    )
    expect(await said('what’s the schedule for new years eve', dana)).toBe(
      'Sorry, I can’t help with that one — but I can tell you when and where New Years Eve is.'
    )
    const overview = await said('what is new years eve', dana)
    expect(overview).toMatch(/^New Years Eve is /)
    expect(overview).not.toMatch(/schedule/)
    expect(await said('what is new years eve')).toMatch(/On its schedule: 3:00 PM Setup/)
  })

  it('all that is theirs at it, their car among it', async () => {
    expect(await said('what are my responsibilities for new years eve')).toBe(
      'For New Years Eve, you’re on the Production - Audio team; and you’re driving Jacob’s Rouge, with Mitch Moylan, Glenn Pettit. It starts on Thursday, December 31 at 10:30 PM.'
    )
  })

  it('someone’s flight or room, by name — for an admin', async () => {
    expect(
      await said('For the new years eve event, what time is Guest User’s flight arriving')
    ).toBe(
      'Guest User’s flight is expected to arrive at 7 PM on Wednesday, Dec 30 — leaving Wednesday, Dec 30 at 5 PM, from Nashville, TN, American Airlines 1234.'
    )
    expect(await said('where is guest user staying for new years eve')).toBe(
      'Guest User is staying at Marmot House, 55 Marmot Ct, North Liberty, IA for New Years Eve.'
    )
    // Anyone else: their own only — and never whether someone else has one.
    const mitch = as('mitch', ['regular'])
    expect(await said('what time is Guest User’s flight arriving for new years eve', mitch)).toBe(
      'Only admins can see others’ flights.'
    )
    expect(await said('where is glenn staying for new years eve', mitch)).toBe(
      'Only admins can see where others are staying.'
    )
    const guest = as('guest', ['regular'])
    expect(await said('where is guest user staying for new years eve', guest)).toBe(
      'You’re staying at Marmot House, 55 Marmot Ct, North Liberty, IA for New Years Eve.'
    )
  })

  it('someone’s teams, by name — never the asker’s own', async () => {
    const mitch = as('mitch', ['regular'])
    // At each coming event they can see: Family Gathering is not Mitch's to see.
    expect(await said('what team is jacob on', mitch)).toBe(
      'Jacob Pintos is on the Production - Audio team for New Years Eve (Thursday, Dec 31).'
    )
    expect(await said('which team is jacob on for new years eve', mitch)).toBe(
      'Jacob Pintos is on the Production - Audio team for New Years Eve.'
    )
    expect(await said('what team is glenn on')).toBe(
      'Glenn Pettit isn’t on a team for anything coming up.'
    )
    // Their own is still theirs.
    expect(await said('what team am i on for new years eve')).toBe(
      'You’re on the Production - Audio team for New Years Eve.'
    )
    // No one by that name: never the asker's own team in its place.
    expect(await said('what team is nobody on')).toBeUndefined()
    expect(notHers('what team is sunny on', 'event_team')).toBeTruthy()
  })

  it('never someone else’s for one who has none, though their names end alike', async () => {
    // Mira User has no flight or room; Guest User has both.
    const mira = as('mira', ['regular'])
    expect(await said('where is mira user staying for new years eve', mira)).toBe(
      'You haven’t been given a room for New Years Eve yet.'
    )
    expect(await said('when does mira user arrive for new years eve', mira)).toBe(
      'You have no flight for New Years Eve yet.'
    )
    for (const q of [
      'where are guest and mira user staying for new years eve',
      'what is mira user’s flight for new years eve',
    ]) {
      expect(await said(q, mira)).not.toMatch(/Marmot|Nashville|1234|7 PM/)
    }
  })

  it('none of the team’s side to a public follower on it, as its page shows them none', async () => {
    // Dana was a member, put on the team, then made a public follower: still on the event.
    const dana = as('dana', ['public'])
    expect(await said('what team am I on for new years eve', dana)).toBe(
      'Sorry, I can’t help with that one — but I can tell you when and where New Years Eve is.'
    )
    expect(await said('who am I riding with to new years eve', dana)).toBe(
      'Sorry, I can’t help with that one — but I can tell you when and where New Years Eve is.'
    )
    // Handed on (to the public reply), never told.
    expect((await said('what are my responsibilities for new years eve', dana)) ?? '').not.toMatch(
      /Production|Audio|Rouge/
    )
    // When and where, as its page shows anyone who can open it.
    expect(await said('when is new years eve', dana)).toMatch(/December 31 at 10:30 PM/)
    // No event named: the one found by its carpool goes unsaid.
    expect(await said('who am I riding with on december 31', dana)).toBe(
      'Sorry, I can’t help with that one — but I can tell you when and where events are.'
    )
  })

  it('none of it to one holding a member’s or a guest’s role beside the public one, as its page shows them none', async () => {
    const tools: OwnInput['appTools'] = ['set_availability', 'sign_up_food']
    const asking = (uid: string, roles: string[]) => {
      const viewer = { uid, roles }
      return async (text: string) =>
        (
          await ownAnswer(
            input(text, { viewer, lookups: new Lookups(db, viewer, TODAY), appTools: tools })
          )
        ).result as { text?: string; kind?: string } | null
    }
    // Whatever tools an app says it has.
    for (const [uid, roles] of [
      ['dana', ['regular', 'public']],
      ['guest', ['guest', 'public']],
    ] as const) {
      const ask = asking(uid, [...roles])
      expect(await ask('I can’t make it to new years eve')).toBeNull()
      expect((await ask('where am I staying for new years eve'))?.text ?? '').not.toMatch(/Marmot/)
      expect((await ask('what team am I on for new years eve'))?.text).toBe(
        'Sorry, I can’t help with that one — but I can tell you when and where New Years Eve is.'
      )
    }
  })

  it('all of it to an admin, as their event form holds it, whatever else they hold', async () => {
    const boss = as('jacob', ['admin', 'public'])
    expect(await said('who is riding with jacob to new years eve', boss)).not.toMatch(
      /team members/
    )
    expect(await said('where is guest user staying for new years eve', boss)).toMatch(
      /Marmot House/
    )
  })

  it('what an event is', async () => {
    expect(await said('what is family gathering')).toBe(
      'Family Gathering is on Sunday, November 1 at 5:00 PM, at Elim Church. On its schedule: 5:00 PM Dinner; 6:00 PM Games.'
    )
  })

  it('and nothing that isn’t on it', async () => {
    for (const q of [
      'when does Costco close',
      'what time is it',
      'when does Olivia leave for new years eve',
      // Their week, not one event's.
      'what am I doing this weekend',
      'what do I have to do this week',
    ]) {
      const own = await jacob(q)
      expect(['schedule item', 'theirs at it', 'someone’s travel', 'what it is'], q).not.toContain(
        own.why
      )
    }
  })
})

describe('the church’s beliefs, as taught, asked other ways', () => {
  beforeEach(() => forgetCaches())
  // As taught in Admin → Miriam, from the church's "What we believe".
  const ABORTION =
    'We believe that human life is sacred from conception to its natural end; and that we must have concern for the physical and spiritual needs of our fellow humans (Psalm 139:13; Isaiah 49:1; Jer. 1:5, Matt 22:37-39; Romans 12:20-21; Gal. 6:10).'
  const GIFTS =
    'The baptism of the Holy Spirit empowers the believer to exercise spiritual gifts, and the evidence of this baptism shall be followed with signs and wonders. The spiritual gifts are given by grace from the Holy Spirit, in accordance with the faith of each believer. The gifts of the Holy Spirit are for the edification of the church, to strengthen and embolden it for the work of God to the glory of God. Because Jesus Christ is the same yesterday, today, and forever, we believe all the gifts of the Spirit are still operational even today (Mark 16:17, 1 Cor. 12:12-13, 2 Cor. 3:17, Rom 8:9-11, 1 John 5:12, 2 Cor 3:18, 12:4-5, Heb. 13:8). We believe in the reality of spiritual gifts as imparted by the Resurrected Christ through His Holy Spirit to all those who have taken faith in Christ, and that those gifts are for the building up of the church unto holiness and grace. We believe in the continuing five-fold ministry given by Christ - apostles, prophets, evangelists, pastors and teachers - for the edification and equipping of the church for the ministry of God’s kingdom. For each individual church to be functionally complete and whole, it must compass all of the five-fold ministries (Romans 12:6-8, 1 Cor. 12:1-11, Eph. 4:11-16).'
  const MARRIAGE =
    'We believe God’s plan for legitimate marriage is the joining of one genetic man and one genetic woman. God has commanded us to have no sexual activity outside the boundaries of marriage. The best representation of marriage is the marriage of Jesus Christ to His bride - the body of Christ, the church (Genesis 2:24; Matthew 19:5-6; Mark 10:6-9; Romans 1:26-27; 1 Cor. 6:9).'
  const JUDGMENT =
    'Except God the Father, no one knows when Christ will return in all His glory. We believe in the ultimate judgment of God, when Christ will return to judge the both the living and the dead, and all will stand before God to give account for the life lived in the body (John 3:3, 18; Heb. 9:27; 2 Cor 5:10; Rev 20:12, 15).'
  // How an answer on God might be taught.
  const GOD =
    'We believe in one God, eternally existing in three persons: the Father, the Son and the Holy Spirit (Deut. 6:4, Matt. 28:19, 2 Cor. 13:14).'
  const taught = async () => {
    const db = memoryOwnDb()
    for (const [q, a] of [
      ['What is your view on abortion?', ABORTION],
      ['Gifts of the Spirit, Cessationism, Continuationism, Spiritual gifts', GIFTS],
      ['What is biblical marriage? Is homosexual marriage sinful?', MARRIAGE],
      ['Second coming of Christ and judgment. Heaven and Hell.', JUDGMENT],
      ['What is the nature of God? The Trinity', GOD],
      ['Where do I park on Sunday?', 'Park in the north lot.'],
    ]) {
      await teach(db, { q, a, v: embed(q), by: 'boss' })
    }
    return db
  }
  const answered = (own: { result: unknown }) =>
    own.result as { text: string; stay?: boolean } | null

  it('is answered as taught, asked yes or no, or by what it is about', async () => {
    const db = await taught()
    for (const [q, a] of [
      ['Is abortion a sin', ABORTION],
      ['are the gifts of the spirit active', GIFTS],
      ['is The Well cessationist', GIFTS],
      ['Is the Well cessasionist', GIFTS],
      ['Is God good', GOD],
      ['When will Jesus return', JUDGMENT],
      ['is hell real', JUDGMENT],
      ['is homosexuality a sin', MARRIAGE],
    ]) {
      expect(answered(await ownAnswer(input(q, { db })))?.text, q).toBe(a)
    }
  })

  it('never for what it doesn’t say, nor what is theirs to talk over', async () => {
    const db = await taught()
    for (const q of [
      'is divorce a sin',
      'is it a sin to get a tattoo',
      'can I lose my salvation',
      'is god angry with me',
    ]) {
      const t = answered(await ownAnswer(input(q, { db })))?.text
      expect([ABORTION, GIFTS, MARRIAGE, JUDGMENT, GOD], q).not.toContain(t)
    }
  })

  it('stays open to be read — but not sending them to leadership, nor about parking', async () => {
    const db = await taught()
    expect(answered(await ownAnswer(input('is The Well cessationist', { db })))?.stay).toBe(true)
    const deferred = answered(await ownAnswer(input('what does the Bible say about worry', { db })))
    expect(deferred?.text).toBe(DEFER_MEETING)
    expect(deferred?.stay).toBeUndefined()
    const parking = answered(await ownAnswer(input('where should I park on sundays', { db })))
    expect(parking?.text).toBe('Park in the north lot.')
    expect(parking?.stay).toBeUndefined()
    const more = answered(
      await ownAnswer(input('why?', { db, history: [{ said: 'is God good', reply: GOD }] }))
    )
    expect(more?.text).toBe(LEADERSHIP_MEETING)
    expect(more?.stay).toBeUndefined()
  })

  it('kept whole, however long', async () => {
    const db = memoryOwnDb()
    const long = `${GIFTS} ${GIFTS}`.slice(0, 2400)
    await teach(db, { q: 'What or who is the Holy Spirit?', a: long, v: embed('x'), by: 'boss' })
    expect(((await taughtAnswers(db))[0].a as string).length).toBe(2400)
  })
})

describe('scripture, never from the web', () => {
  beforeEach(() => forgetCaches())
  const noWeb = async () => {
    throw new Error('not the web')
  }

  it('knows it by its words', () => {
    for (const t of [
      'look up John 3:16',
      'who wrote the book of Romans',
      'what does Psalm 23 say',
      'what is 1 Corinthians 13:4 about',
      'google what the Bible says about money',
      'search online for who Jesus was',
    ]) {
      expect(aboutScripture(t), t).toBe(true)
    }
    for (const t of [
      'look up the weather at 10:30',
      'look up Costco hours',
      'when does the Mark 2 come out',
      'Godzilla showtimes',
      'who invented the telephone',
    ]) {
      expect(aboutScripture(t), t).toBe(false)
    }
  })

  it('asked of her, or of Claude, it is the church’s to answer', async () => {
    const own = await ownAnswer(input('look up John 3:16', { web: noWeb }))
    expect((own.result as { text: string }).text).toBe(DEFER_MEETING)
    const fromClaude = await webOrFaith('web', 'who wrote the book of Romans', {
      db: memoryOwnDb(),
      today: TODAY,
      can: [],
      web: noWeb,
    })
    expect(fromClaude).toMatchObject({ text: DEFER })
  })

  it('and the app’s own things are the app’s, not the web’s', async () => {
    for (const text of ['look up my tasks', 'look up the set list for Sunday']) {
      const own = await ownAnswer(input(text, { web: noWeb }))
      expect(own.why, text).not.toBe('web')
    }
  })
})

describe('the names Elim and Miriam', () => {
  beforeEach(() => {
    forgetCaches()
    forgetSite()
  })

  it('knows when either is asked about — and when only Elim, the place, is', () => {
    for (const q of [
      'where does the name Elim come from',
      'what does Elim mean?',
      'how do you pronounce Elim',
      'why is the church called Elim',
      'what is the Elim arrival',
      "what's the meaning of Elim",
      'tell me about the name Elim',
    ]) {
      expect(elimAsked(q), q).toBe(true)
    }
    for (const q of [
      'where is Elim church',
      'what time is the Elim arrival',
      'when does the Elim mission team leave',
      'what does the Bible say about worry',
    ]) {
      expect(elimAsked(q), q).toBe(false)
    }
    for (const q of [
      'why are you called Miriam?',
      'where does your name come from',
      'who are you named after',
      'what does your name mean',
      'who was Miriam in the Bible',
      'why Miriam',
    ]) {
      expect(miriamNameAsked(q), q).toBe(true)
    }
    for (const q of [
      "what's your name",
      'Miriam, what time is youth night',
      'why, Miriam, is youth night cancelled',
    ]) {
      expect(miriamNameAsked(q), q).toBe(false)
    }
  })

  it('Elim, in the church’s own words, with the page that tells it', async () => {
    const own = await ownAnswer(input('where does the name Elim come from?'))
    expect(own.result).toMatchObject({
      text: ELIM_ANSWER,
      open: { kind: 'link', url: 'https://thewellofiowa.com', label: 'thewellofiowa.com' },
    })
    expect(ELIM_ANSWER).toMatch(/Exodus 15:26–27/)
    // Once she has read the site: the page itself.
    const db = memoryOwnDb()
    await storeSite(db, {
      site: 'https://thewellofiowa.com',
      readAt: 1,
      pages: [{ url: 'https://thewellofiowa.com/elim', title: 'Elim' }],
      passages: [
        {
          t: 'ELIM is synonymous with the phrase ‘a place of rest’ and comes from Exodus 15:26-27.',
          u: 'https://thewellofiowa.com/elim',
          v: packVector(embed('ELIM is a place of rest')),
        },
      ],
    })
    const read = await ownAnswer(input('what does Elim mean', { db }))
    expect(read.result).toMatchObject({
      text: ELIM_ANSWER,
      open: { kind: 'link', url: 'https://thewellofiowa.com/elim' },
    })
  })

  it('her own name: Exodus 15:20–21, on the way to Elim — whatever came before', async () => {
    const own = await ownAnswer(
      input('why are you called Miriam', {
        history: [{ said: 'is God good', reply: DEFER }],
      })
    )
    expect((own.result as { text: string }).text).toBe(MIRIAM_ANSWER)
    expect(MIRIAM_ANSWER).toMatch(/Exodus 15:20–21/)
    expect(MIRIAM_ANSWER).toMatch(/Elim/)
    expect(MIRIAM_ANSWER).toMatch(/rest found in the name and presence of Jesus/)
    // Claude, seeing it as a question of faith, hands it to her the same.
    const fromClaude = await webOrFaith('faith', 'who was Miriam in the Bible', {
      db: memoryOwnDb(),
      today: TODAY,
      can: [],
    })
    expect(fromClaude).toMatchObject({ text: MIRIAM_ANSWER })
  })

  it('an admin’s own answer instead, if they teach one', async () => {
    const db = memoryOwnDb()
    await teach(db, {
      q: 'Where does the name Elim come from?',
      a: 'Ask Pastor Sam — he loves telling that story.',
      v: embed('Where does the name Elim come from?'),
      by: 'boss',
    })
    const own = await ownAnswer(input('where does the name Elim come from', { db }))
    expect((own.result as { text: string }).text).toBe(
      'Ask Pastor Sam — he loves telling that story.'
    )
  })

  it('more asked about them is the leadership’s', async () => {
    const own = await ownAnswer(
      input('why did she use a tambourine', {
        history: [{ said: 'why are you called Miriam', reply: MIRIAM_ANSWER }],
      })
    )
    expect(own.result).toMatchObject({ text: LEADERSHIP_MEETING })
  })
})

describe('report times', () => {
  beforeEach(() => forgetCaches())
  const db = fakeDb({
    ...CHURCH,
    users: { ...CHURCH.users, kim: { displayName: 'Kim Park', roles: ['regular'] } },
    events: {
      ...CHURCH.events,
      gala: {
        title: 'Fall Gala',
        date: '2026-10-24',
        startTime: '6:00 PM',
        isPublic: true,
        users: ['sarah'],
        teams: [{ name: 'Worship', leaders: [], members: ['sarah'] }],
        reportTimes: [
          { group: 'Worship', time: '4:00 PM' },
          { group: '_remainder_', time: '5:00 PM' },
        ],
      },
    },
  })
  const kim = { uid: 'kim', roles: ['regular'] }
  const boss = { uid: 'boss', roles: ['admin'] }
  const ask = (text: string, viewer = sarah) =>
    ownAnswer(input(text, { viewer, lookups: new Lookups(db, viewer, TODAY) })).then(
      (o) => (o.result as { text: string } | null)?.text ?? ''
    )

  it('gives those on the event theirs, and an admin every one', async () => {
    expect(await ask('what time do I report for the fall gala')).toBe(
      'Report for Fall Gala on Saturday, October 24 at 4:00 PM. It starts at 6:00 PM.'
    )
    expect(await ask('when is call time for the fall gala', boss)).toBe(
      'Report times for Fall Gala on Saturday, October 24: Worship: 4:00 PM; Everyone else: 5:00 PM. It starts at 6:00 PM.'
    )
  })

  it('tells someone who can see it, but isn’t on it, only when it starts', async () => {
    expect(await ask('what time do I report for the fall gala', kim)).toBe(
      'Fall Gala is on Saturday, October 24 at 6:00 PM.'
    )
    const theirs = await new Lookups(db, kim, TODAY).getEvent('gala_2026-10-24')
    expect((theirs as Record<string, unknown>).reportTimes).toBeUndefined()
    const hers = await new Lookups(db, sarah, TODAY).getEvent('gala_2026-10-24')
    expect((hers as Record<string, unknown>).reportTimes).toBe('4:00 PM')
  })
})

describe('an event’s private record', () => {
  beforeEach(() => forgetCaches())
  // As the server keeps it: the event, and apart from it what only those on it read.
  const db = fakeDb({
    ...CHURCH,
    users: { ...CHURCH.users, kim: { displayName: 'Kim Park', roles: ['regular'] } },
    events: {
      ...CHURCH.events,
      gala: { title: 'Fall Gala', date: '2026-10-24', startTime: '6:00 PM', isPublic: true },
    },
    eventPrivate: {
      gala: {
        teams: [{ name: 'Worship', leaders: [], members: ['sarah'] }],
        dressCode: [{ group: '_remainder_', text: 'All black' }],
        reportTimes: [{ group: '_remainder_', time: '4:00 PM' }],
        access: ['sarah'],
      },
    },
  })
  const kim = { uid: 'kim', roles: ['regular'] }
  const boss = { uid: 'boss', roles: ['admin'] }
  const ask = (text: string, viewer = sarah) =>
    ownAnswer(input(text, { viewer, lookups: new Lookups(db, viewer, TODAY) })).then(
      (o) => (o.result as { text: string } | null)?.text ?? ''
    )

  it('gives those on the event its details from it', async () => {
    expect(await ask('what should I wear to the fall gala')).toBe(
      'The dress code for Fall Gala is All black.'
    )
    expect(await ask('what team am I on for the fall gala')).toBe(
      'You’re on the Worship team for Fall Gala.'
    )
    expect(await ask('what should I wear to the fall gala', boss)).toBe(
      'The dress code for Fall Gala is Everyone else: All black.'
    )
  })

  it('tells someone who can see the event, but isn’t on it, none of them', async () => {
    expect(await ask('what should I wear to the fall gala', kim)).toBe(
      'That’s only for those on Fall Gala — but I can tell you when and where it is.'
    )
    expect(await ask('what team am I on for the fall gala', kim)).toBe('You’re not on Fall Gala.')
    expect(await ask('when is the fall gala', kim)).toMatch(/October 24 at 6:00 PM/)
    // Nor are they given to Claude for them.
    const details = (await new Lookups(db, kim, TODAY).getEvent('gala_2026-10-24')) as Record<
      string,
      unknown
    >
    for (const k of ['yourTeams', 'dressCode', 'reportTimes', 'schedule']) {
      expect([k, details[k]]).toEqual([k, undefined])
    }
    expect(details.privateDetails).toMatch(/only for those on it/)
  })
})

describe('a public follower', () => {
  beforeEach(() => forgetCaches())
  const visitor = { uid: 'pub', roles: ['public'] }
  const db = fakeDb({
    ...CHURCH,
    events: {
      ...CHURCH.events,
      fest: {
        title: 'Fall Festival',
        date: '2026-10-24',
        startTime: '4:00 PM',
        location: 'Greenwood Park',
        isPublic: true,
      },
    },
  })
  const asked = (text: string) =>
    ownAnswer(
      input(text, {
        viewer: visitor,
        lookups: new Lookups(db, visitor, TODAY),
        appTools: [],
      })
    )

  it('is answered about public events, by her alone', async () => {
    const own = await asked('when is the fall festival')
    expect((own.result as { text: string }).text).toMatch(
      /^Fall Festival is on Saturday, October 24/
    )
  })

  it('never about the team’s own', async () => {
    const own = await asked('when is youth night')
    expect((own.result as { text: string } | null)?.text ?? '').not.toMatch(/Youth Night/)
  })

  it('and changes nothing — not even their availability', async () => {
    const own = await asked("I can't make the fall festival")
    expect(own.result).toBeNull()
  })

  it('is told nothing of an event’s team side: its page shows them none', async () => {
    const pub = fakeDb({
      ...CHURCH,
      events: {
        ...CHURCH.events,
        fest: {
          title: 'Fall Festival',
          date: '2026-10-24',
          startTime: '4:00 PM',
          location: 'Greenwood Park',
          isPublic: true,
          rtp: '2:00 PM',
          rtm: '2:30 PM',
          dcw: 'All black',
          dressCode: [{ group: '_remainder_', text: 'Red shirts' }],
          carpool: true,
        },
      },
    })
    const ask = (text: string) =>
      ownAnswer(
        input(text, { viewer: visitor, lookups: new Lookups(pub, visitor, TODAY), appTools: [] })
      ).then((o) => (o.result as { text: string } | null)?.text ?? '')
    expect(await ask('what should I wear to the fall festival')).toBe(
      'Sorry, I can’t help with that one — but I can tell you when and where Fall Festival is.'
    )
    expect(await ask('when do I need to show up for the fall festival')).not.toMatch(/2:00|2:30/)
    expect(await ask('who am I riding with to the fall festival')).not.toMatch(/car/i)
    expect(await ask('what time is the fall festival')).toMatch(/October 24 at 4:00 PM/)
    // Its team side, not given to Claude's lookups either.
    const details = await new Lookups(pub, visitor, TODAY).getEvent('fest_2026-10-24')
    expect(details).toMatchObject({ title: 'Fall Festival', venue: 'Greenwood Park' })
    for (const k of ['reportTimes', 'dressCode', 'carpool', 'yours', 'yourAvailability']) {
      expect([k, (details as Record<string, unknown>)[k]]).toEqual([k, undefined])
    }
  })
})

describe('the church’s leaders, from Our Story', () => {
  beforeEach(() => forgetCaches())

  const withStory = () => {
    const db = memoryOwnDb()
    db.docs.set('config/main', { publicPages: { ourstory: { blocks: STORY_BLOCKS } } })
    return db
  }

  it('answers who the pastor is in the page’s words, kept open to read', async () => {
    const own = await ownAnswer(input('Who is the pastor?', { db: withStory() }))
    expect(own.why).toBe('leaders: pastor')
    expect(own.result).toMatchObject({
      kind: 'answer',
      text: 'From Our Story: Pastor Amy Lee has led The Well since 2019. She grew up in Cedar Rapids and studied at Moody. Amy loves teaching through whole books of the Bible.',
      stay: true,
    })
  })

  it('answers someone by name', async () => {
    const own = await ownAnswer(input('who is Mark Chen', { db: withStory() }))
    expect(own.result).toMatchObject({ text: expect.stringContaining('Mark Chen and Tom Reyes') })
  })

  it('leaves a question of faith to the church’s beliefs, even with a page that names Jesus', async () => {
    const db = withStory()
    db.docs.set('config/main', {
      publicPages: {
        ourstory: {
          blocks: [{ type: 'text', data: { heading: 'Jesus', content: 'Jesus is Lord.' } }],
        },
      },
    })
    const own = await ownAnswer(input('who is Jesus', { db }))
    expect(own.why).not.toMatch(/^leaders/)
  })

  it('says nothing from the page when there is no page, or it does not say', async () => {
    expect((await ownAnswer(input('who is the pastor'))).why).not.toMatch(/^leaders/)
    expect((await ownAnswer(input('who are the deacons', { db: withStory() }))).why).not.toMatch(
      /^leaders/
    )
  })

  it('still answers the app’s own questions about people as before', async () => {
    const own = await ownAnswer(input("who's driving me to the retreat", { db: withStory() }))
    expect(own.why).not.toMatch(/^leaders/)
  })
})
