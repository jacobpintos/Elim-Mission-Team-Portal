import { describe, expect, it, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Lookups } from '../../functions/src/miriam/lookups'
import { embed } from '../../functions/src/miriam/own/encoder'
import { packVector } from '../../functions/src/miriam/own/vectors'
import { mentionsIn } from '../../functions/src/miriam/own/events'
import { notHers } from '../../functions/src/miriam/own/guards'
import { ownAnswer, sure, webOrFaith, type OwnInput } from '../../functions/src/miriam/own'
import {
  forget,
  forgetCaches,
  learn,
  learnedExamples,
  listLearned,
  teach,
  type OwnDb,
} from '../../functions/src/miriam/own/learn'
import { SEEDS, type Skill } from '../../functions/src/miriam/own/skills'
import { read, seedExamples } from '../../functions/src/miriam/own/understand'
import { dayIn, reminderIn, spanIn, statusIn } from '../../functions/src/miriam/own/when'
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
import {
  aboutScripture,
  DEFER,
  faithAnswer,
  LEADERSHIP,
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
  const examples = seedExamples()
  const { masked } = mentionsIn(text, TITLES)
  let r = read(embed(masked), examples)
  if (masked !== text && !sure(r)) {
    const r2 = read(embed(text), examples)
    if (sure(r2) || r2.score > r.score) r = r2
  }
  if (r.skill === 'other' || !sure(r) || notHers(text, r.skill)) return null
  return r.skill
}

// Her model runs here in plain JavaScript, as on the server: reading a site, or
// a conversation, is seconds of it — more on a busy machine than the default allows.
vi.setConfig({ testTimeout: 30_000 })

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
})

describe('what she takes as hers, of requests she has never seen', () => {
  const all = Object.entries(requests as Record<string, string[]>).flatMap(([want, list]) =>
    list.map((text) => ({ text, want }))
  )
  it('is never wrong, and is most of what is hers', async () => {
    const wrong: string[] = []
    let hers = 0
    let answered = 0
    for (const [i, { text, want }] of all.entries()) {
      // A breath now and then: a long run without one leaves the test runner unanswered.
      if (i % 20 === 0) await new Promise((done) => setImmediate(done))
      const got = taken(text)
      if (want !== 'other') hers++
      if (got === null) continue
      if (got === want) answered++
      else wrong.push(`${text} → ${got} (is ${want})`)
    }
    expect(wrong).toEqual([])
    // Handed to Claude when unsure: the rest. Most are hers.
    expect(answered / hers).toBeGreaterThan(0.75)
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
    expect(notHers("what's due this week", 'my_events')).toBeTruthy()
    expect(notHers('remind everyone to bring a Bible', 'reminder')).toBeTruthy()
    expect(notHers("who's coming to youth night", 'event_time')).toBeTruthy()
    expect(notHers('remind me at 4 to call mom', 'reminder')).toBeNull()
    expect(notHers('how many people live in Iowa', 'web')).toBeNull()
    expect(notHers('where is the picnic', 'event_place')).toBeNull()
    // Notes on days of their calendar are the app's (src/lib/dateNotes).
    expect(notHers('what are my notes for Friday', 'my_events')).toBeTruthy()
    expect(notHers('add a note to Friday to bring chairs', 'reminder')).toBeTruthy()
    expect(notHers("what's on my calendar this week", 'my_events')).toBeTruthy()
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

type Firestore = ConstructorParameters<typeof Lookups>[0]
function fakeDb(data: Record<string, Record<string, Record<string, unknown>>>): Firestore {
  const snap = (id: string, d: Record<string, unknown> | undefined) => ({
    id,
    exists: d !== undefined,
    data: () => d,
  })
  return {
    collection: (name: string) => ({
      get: async () => ({ docs: Object.entries(data[name] ?? {}).map(([id, d]) => snap(id, d)) }),
    }),
    doc: (path: string) => {
      const [name, id] = path.split('/')
      return { get: async () => snap(id, data[name]?.[id]) }
    },
  } as unknown as Firestore
}

/** Her own store, in memory: one document per path. */
function memoryOwnDb(): OwnDb & { docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>()
  const ref = (path: string) => ({
    get: async () => ({ data: () => docs.get(path) }),
    set: async (d: Record<string, unknown>, opts?: { merge: boolean }) => {
      docs.set(path, opts?.merge ? { ...(docs.get(path) ?? {}), ...d } : d)
    },
  })
  return {
    docs,
    doc: ref,
    runTransaction: async (fn) =>
      fn({ get: (r) => r.get(), set: (r, d) => (r as ReturnType<typeof ref>).set(d) }),
  }
}

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
      "Women's Retreat: Van (your car): driven by Jacob Pintos, riding: Sarah Lee. Cars meet at the church lot."
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
    expect((other.result as { text: string }).text).toBe(DEFER)
  })

  it('a question of faith not taught, nor on the church’s site: its leadership', async () => {
    const own = await ownAnswer(input('what does the Bible say about worry'))
    expect((own.result as { text: string }).text).toBe(DEFER)
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

  it('is kept, once for the same words, and forgotten when asked', async () => {
    const db = memoryOwnDb()
    const v = embed('when does the event get rolling')
    await learn(db, 'when does the event get rolling', 'event_time', v, 1)
    await learn(db, 'When does the event get rolling?', 'event_time', v, 2)
    expect(await listLearned(db)).toEqual([
      { text: 'When does the event get rolling?', skill: 'event_time', at: 2 },
    ])
    forgetCaches()
    expect((await learnedExamples(db)).map((e) => e.skill)).toEqual(['event_time'])
    await forget(db, 'when does the event get rolling')
    expect(await listLearned(db)).toEqual([])
  })

  it('makes the next one like it hers', async () => {
    const db = memoryOwnDb()
    const said = 'is the youth night thing still on for this friday'
    const before = await ownAnswer(input(said, { db }))
    // Learned from Claude's answer: it was when Youth Night is.
    if (before.read) await learn(db, before.read.masked, 'event_time', before.read.v)
    const after = await ownAnswer(input('is the youth night thing still on for friday', { db }))
    expect(after.read?.skill).toBe('event_time')
    expect(after.result).toMatchObject({ text: 'Youth Night is on Friday, October 16 at 7:00 PM.' })
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
      expect(own.result, text).toMatchObject({
        text: LEADERSHIP,
        open: { kind: 'link', url: 'https://thewellofiowa.com' },
      })
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
    expect((own.result as { text: string }).text).toBe(DEFER)
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
    expect(own.result).toMatchObject({ text: LEADERSHIP })
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
    expect((own.result as { text: string }).text).toBe(DEFER)
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
    expect(own.result).toMatchObject({ text: LEADERSHIP })
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
})
