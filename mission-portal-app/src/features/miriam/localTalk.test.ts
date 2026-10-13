import { describe, expect, it } from 'vitest'
import { askAvailability, talkHere, type Here, type Reply, type Talk } from './localTalk'
import { notificationKeysFor } from '@/lib/miriamNotifications'
import type { QuickData } from '@/lib/miriamQuick'
import type { Announcement, Message, Room, Task } from '@/types/events'
import type { UserProfile } from '@/types/user'
import type { EventInstance } from '../../../functions/src/miriam/data'

/**
 * Miriam's on-device conversations, played through: what is said to her, and
 * what she says, asks, shows to confirm or does — as MiriamButton would carry
 * them, with a reply she can't use taken as a request of its own.
 */

const today = '2026-10-13' // a Tuesday
const NOW = new Date(`${today}T15:00:00`).getTime()
const H = 3_600_000

const templates = [
  {
    id: 'pot',
    title: 'Fall Potluck',
    date: '2026-10-18',
    users: ['me'],
    food: true,
    foodItems: ['Pot roast', 'Roast vegetables', 'Drinks', 'Dessert'],
  },
  {
    id: 'yth',
    title: 'Youth Night',
    date: '2026-10-25',
    startTime: '7 PM',
    users: ['me'],
    food: true,
    foodItems: ['Pizza', 'Chips'],
  },
  { id: 'prac', title: 'Band Practice', date: '2026-10-18', users: ['me'] },
  {
    id: 'ret',
    title: 'Youth Retreat',
    date: '2026-10-30',
    users: ['me', 's1', 'b'],
    carpool: true,
    carpoolCars: [
      { id: 'v1', label: 'Van 1', driver: 'me', riders: [] },
      { id: 'tr', label: 'Andy’s Truck', driver: '', riders: ['b'] },
    ],
  },
]

const tasks = [
  { id: 1, title: 'Sound check', status: 'pending', dueDate: '2026-10-25' },
  { id: 2, title: 'Sound check', status: 'pending', dueDate: '2026-10-18' },
  { id: 3, title: 'Print flyers', status: 'in_progress', dueDate: '2026-10-15' },
  { id: 4, title: 'Hand out flyers', status: 'pending' },
  { id: 5, title: 'Book the bus', status: 'pending', dueDate: '2026-10-20' },
] as unknown as Task[]

const names = new Map([
  ['me', 'Jacob Pintos'],
  ['s1', 'Sarah Kim'],
  ['s2', 'Sarah Miller'],
  ['b', 'Bob Lee'],
  ['pj', 'Pastor John'],
])

const room = (id: string, members: string[], name = ''): Room =>
  ({ id, name, members, call: false, reviewers: [] }) as Room
const msg = (from: string, text: string, ago: number, read = false): Message => ({
  uid: from,
  text,
  attachment: null,
  ts: NOW - ago,
  readBy: read ? { me: true } : {},
})

const ALL_TOOLS = [
  'sign_up_food',
  'set_task_status',
  'change_notification',
  'read_announcements',
  'read_messages',
]

interface Setup {
  tools?: string[]
  /** What today's briefing showed open, and suggested. */
  briefed?: { eventKey: string; suggestion: string; open: string[] }[]
  tasksReady?: boolean
  rooms?: Room[]
  messages?: Record<string, Message[]>
  open?: Record<string, string[]>
  profile?: UserProfile
  /** Their availability answers, by event key. */
  answers?: Record<string, { status: 'yes' | 'no' | 'partial' | 'tbd'; note: string; ts: number }>
  /** An answer that won't save. */
  failAnswers?: boolean
  /** Events of its own, in place of those above. */
  events?: Record<string, unknown>[]
}

/** A person talking to her: each line said, and what came of it. */
function conversation(setup: Setup = {}) {
  const log: string[] = []
  let waiting: Reply | null = null
  const talk: Talk = {
    say: (text, sheet) => log.push(`say: ${text}${sheet ? ` [sheet ${sheet.instanceKey}]` : ''}`),
    ask: (text, onReply) => {
      log.push(`ask: ${text}`)
      waiting = onReply
    },
    offer: async (name, input) => {
      log.push(`offer ${name} ${JSON.stringify(input)}`)
    },
    doNow: async (name, input) => {
      log.push(`do ${name} ${JSON.stringify(input)}`)
    },
    thinking: () => {},
    remind: async (text, at, spoken, extra) => {
      log.push(
        `remind ${JSON.stringify({ text, at: at.toString().slice(0, 21), spoken, ...(extra ?? {}) })}`
      )
    },
    directions: (ev) => log.push(`directions ${ev.instanceKey}`),
    remindBeforeEach: async (text, spoken, before, relation, first) => {
      log.push(
        `before each ${JSON.stringify({
          text,
          spoken,
          before,
          relation,
          first: first && { key: first.ev.instanceKey, at: first.at.toString().slice(0, 21) },
        })}`
      )
    },
  }
  const data: QuickData = {
    templates: (setup.events ?? templates) as never,
    overrides: {},
    groups: [],
    viewer: { uid: 'me', roles: ['regular'] },
    names,
    today,
  }
  const profile =
    setup.profile ??
    ({ uid: 'me', roles: ['regular'], notificationPrefs: {} } as unknown as UserProfile)
  const rooms = setup.rooms ?? []
  const here: Here = {
    data,
    profile,
    tools: setup.tools ?? ALL_TOOLS,
    tasks: () => ({ ready: setup.tasksReady ?? true, mine: tasks }),
    openFood: async (ev) => setup.open?.[ev.templateId as string] ?? ev.foodItems ?? [],
    // What isn't open has been taken by Sam.
    foodSheet: async (ev) => {
      const open = setup.open?.[ev.templateId as string]
      if (!open) return {}
      return Object.fromEntries(
        (ev.foodItems ?? [])
          .map((item, i) => [String(i), item] as const)
          .filter(([, item]) => !open.includes(item))
          .map(([i]) => [i, { uid: 'sam', displayName: 'Sam' }])
      )
    },
    nextOpenFood: async (events) => {
      const ev = events[0] as EventInstance | undefined
      return ev ? { ev, open: setup.open?.[ev.templateId as string] ?? ev.foodItems ?? [] } : null
    },
    announcements: async () =>
      [
        {
          id: 1,
          title: 'Retreat packing list',
          body: 'Bring a sleeping bag.',
          by: 'pj',
          ts: NOW - 2 * H,
          isPublic: false,
          audience: [],
          attachment: null,
        },
      ] as Announcement[],
    names: () => names,
    rooms: async () => rooms,
    latest: async (r) => setup.messages?.[String(r.id)] ?? [],
    now: () => NOW,
    briefedFood: () => setup.briefed ?? [],
    answerOf: (ev) => setup.answers?.[ev.instanceKey] ?? null,
    answer: async (ev, status, note) => {
      if (setup.failAnswers) return false
      log.push(`saved ${ev.instanceKey} ${status}${note ? ` (${note})` : ''}`)
      return true
    },
    carsFor: async (ev) => (ev.carpoolCars ?? []) as never,
  }
  const say = async (said: string): Promise<string[]> => {
    log.length = 0
    if (waiting) {
      const onReply: Reply = waiting
      waiting = null
      if (await onReply(said, talk)) return [...log]
      log.push('(not an answer: a request of its own)')
    }
    if (!(await talkHere(said, here, talk))) log.push('(to Claude)')
    return [...log]
  }
  /** A conversation she starts herself — her questions after the briefing. */
  const begin = async (start: (here: Here, talk: Talk) => void): Promise<string[]> => {
    log.length = 0
    start(here, talk)
    return [...log]
  }
  return Object.assign(say, { begin })
}

/** A sign-up as offered; `shown_open`: they were shown it open, so taken since is "just signed up". */
const signUp = (event_key: string, item: string, shown_open = false) =>
  `sign_up_food ${JSON.stringify({ event_key, item, shown_open })}`
const status = (task_id: number, s: string) =>
  `set_task_status ${JSON.stringify({ task_id: String(task_id), status: s })}`
const notifs = (keys: string[], on = false) =>
  `change_notifications ${JSON.stringify({ notifications: keys, on })}`

describe('food sign-ups', () => {
  it('a dish plainly on the sheet: shown to confirm', async () => {
    const say = conversation()
    expect(await say("I'll make potroast for Sunday")).toEqual([
      `offer ${signUp('pot_2026-10-18', 'Pot roast')}`,
    ])
  })

  it('a dish nearly on it: asked about, and done on a yes', async () => {
    const say = conversation()
    expect(await say("I'll bring pot rose to the potluck")).toEqual([
      'ask: Did you mean Pot roast? If so, I’ll sign you up to bring it to Fall Potluck on Sun, Oct 18.',
    ])
    expect(await say('yes')).toEqual([`do ${signUp('pot_2026-10-18', 'Pot roast')}`])
  })

  it('a dish that fits two: asked which', async () => {
    const say = conversation()
    expect(await say("I'll bring the roast to the potluck")).toEqual([
      'ask: Which did you mean: Pot roast or Roast vegetables?',
    ])
    expect(await say('the vegetables')).toEqual([
      `offer ${signUp('pot_2026-10-18', 'Roast vegetables')}`,
    ])
  })

  it('no day said: the next event offered, another named, and what is open asked', async () => {
    const say = conversation()
    expect(await say("I'll bake cookies")).toEqual([
      'ask: Do you mean Fall Potluck on Sun, Oct 18?',
    ])
    expect(await say('No, youth night')).toEqual([
      'ask: I didn’t see cookies on the sheet. Youth Night on Sun, Oct 25 still needs Pizza and Chips. Which one will you bring?',
    ])
    // Listed as open just now.
    expect(await say('chips')).toEqual([`offer ${signUp('yth_2026-10-25', 'Chips', true)}`])
  })

  it('a no, then the date asked for', async () => {
    const say = conversation()
    await say("I'll bring brownies")
    expect(await say('no')).toEqual(['ask: Which date or event do you mean?'])
    expect(await say('October 25')).toEqual([
      'ask: I didn’t see brownies on the sheet. Youth Night on Sun, Oct 25 still needs Pizza and Chips. Which one will you bring?',
    ])
  })

  it('a reply that is a request of its own is taken as one', async () => {
    const say = conversation()
    await say("I'll bring brownies to youth night")
    expect(await say('what time does it start')).toEqual([
      '(not an answer: a request of its own)',
      '(to Claude)',
    ])
  })

  it('never mind', async () => {
    const say = conversation()
    await say("I'll bring brownies to youth night")
    expect(await say('never mind')).toEqual(['say: Okay — nothing was changed.'])
  })

  it('not food at all is left to Claude', async () => {
    const say = conversation()
    expect(await say("I'll bring the projector to youth night")).toEqual(['(to Claude)'])
    expect(await say("I'll make the slides")).toEqual(['(to Claude)'])
    // As likely their availability as food.
    expect(await say('Put me down for Sunday')).toEqual(['(to Claude)'])
  })

  it('coming, or someone else coming, is not a dish', async () => {
    const say = conversation()
    expect(await say("I'll make it to the potluck")).toEqual(['(to Claude)'])
    expect(await say('I can bring a friend to the potluck')).toEqual(['(to Claude)'])
  })

  it('"sign me up for the potluck": the event, and what is open there', async () => {
    const say = conversation({ open: { pot: ['Drinks', 'Dessert'] } })
    expect(await say('Sign me up for the potluck')).toEqual([
      'ask: Fall Potluck on Sun, Oct 18 still needs Drinks and Dessert. Which one will you bring?',
    ])
    expect(await say('dessert')).toEqual([`offer ${signUp('pot_2026-10-18', 'Dessert', true)}`])
  })

  it('"I mean yes" is a yes', async () => {
    const say = conversation()
    await say("I'll bring pot rose to the potluck")
    expect(await say('I mean yes')).toEqual([`do ${signUp('pot_2026-10-18', 'Pot roast')}`])
  })

  it('everything taken: said so', async () => {
    const say = conversation({ open: { yth: [] } })
    expect(await say("I'll bring lasagna to youth night")).toEqual([
      'say: Everything on the food sheet for Youth Night is already taken.',
    ])
  })
})

describe('after the briefing suggested a dish', () => {
  // The briefing showed Fall Potluck with these open, and suggested Drinks;
  // since then someone has taken Drinks.
  const briefed = [
    {
      eventKey: 'pot_2026-10-18',
      suggestion: 'Drinks',
      open: ['Roast vegetables', 'Drinks', 'Dessert'],
    },
  ]
  const open = { pot: ['Roast vegetables', 'Dessert'] }

  const takenSince =
    'ask: Sam just signed up for Drinks. Roast vegetables and Dessert are still open. Which one will you bring instead?'

  it.each([
    "I'll bring drinks as suggested",
    "Sure, I'll bring the drinks you suggested",
    'Okay I can bring drinks like you said',
    "I'll bring what you suggested",
    "I'll take the drinks, as suggested",
  ])('"%s": the briefing’s dish, taken since — who by, and what is left', async (said) => {
    const say = conversation({ briefed, open })
    expect(await say(said)).toEqual([takenSince])
  })

  it('and one of what is left, taken up', async () => {
    const say = conversation({ briefed, open })
    await say("I'll bring drinks as suggested")
    // Just read as open.
    expect(await say('the dessert')).toEqual([`offer ${signUp('pot_2026-10-18', 'Dessert', true)}`])
  })

  it('the briefing’s dish still open: shown to confirm, with nothing to ask', async () => {
    const say = conversation({ briefed })
    expect(await say("I'll bring drinks as suggested")).toEqual([
      `offer ${signUp('pot_2026-10-18', 'Drinks', true)}`,
    ])
  })

  it('a dish it showed open, without "as suggested": its event asked about', async () => {
    const say = conversation({ briefed, open })
    expect(await say("I'll bring the dessert")).toEqual([
      'ask: Do you mean Fall Potluck on Sun, Oct 18?',
    ])
    expect(await say('yes')).toEqual([`offer ${signUp('pot_2026-10-18', 'Dessert', true)}`])
  })

  it('a dish it never showed open — taken before — is "already bringing"', async () => {
    const say = conversation({ briefed, open })
    expect(await say("I'll bring the pot roast to the potluck")).toEqual([
      'ask: Sam is already bringing Pot roast. Roast vegetables and Dessert are still open. Which one will you bring instead?',
    ])
  })

  it('one left: asked about, and a yes to it shown to confirm', async () => {
    const say = conversation({ briefed, open: { pot: ['Dessert'] } })
    expect(await say("I'll bring drinks as suggested")).toEqual([
      'ask: Sam just signed up for Drinks. Dessert is still open. Want to bring it instead?',
    ])
    expect(await say('sure')).toEqual([`offer ${signUp('pot_2026-10-18', 'Dessert', true)}`])
  })

  it('none left: said so', async () => {
    const say = conversation({ briefed, open: { pot: [] } })
    expect(await say("I'll bring drinks as suggested")).toEqual([
      'say: Sam just signed up for Drinks. Nothing else on the sheet is open.',
    ])
  })

  it('two suggested, and no dish said: which', async () => {
    const say = conversation({
      briefed: [
        ...briefed,
        { eventKey: 'yth_2026-10-25', suggestion: 'Pizza', open: ['Pizza', 'Chips'] },
      ],
    })
    expect(await say("I'll bring what you suggested")).toEqual([
      'ask: Which did you mean: Drinks for Fall Potluck or Pizza for Youth Night?',
    ])
    expect(await say('the pizza')).toEqual([`offer ${signUp('yth_2026-10-25', 'Pizza', true)}`])
  })

  it('no briefing: a dish already taken is "already bringing"', async () => {
    const say = conversation({ open })
    await say("I'll bring drinks")
    expect(await say('yes')).toEqual([
      'ask: Sam is already bringing Drinks. Roast vegetables and Dessert are still open. Which one will you bring instead?',
    ])
  })
})

describe("a task's status", () => {
  it('a task plainly named: shown to confirm', async () => {
    const say = conversation()
    expect(await say('I booked the bus')).toEqual([`offer ${status(5, 'done')}`])
    expect(await say("I'm working on the hand out flyers task")).toEqual([
      `offer ${status(4, 'in_progress')}`,
    ])
  })

  it('two that fit: asked which, by order', async () => {
    const say = conversation()
    expect(await say('Mark the flyers done')).toEqual([
      'ask: Which one: “Print flyers”, due Thu, Oct 15 or “Hand out flyers”?',
    ])
    expect(await say('the second one')).toEqual([`offer ${status(4, 'done')}`])
  })

  it('tasks of the same name: the soonest asked about, done on a yes', async () => {
    const say = conversation()
    expect(await say('I finished the sound check')).toEqual([
      'ask: Did you mean “Sound check”, due Sun, Oct 18? If so, I’ll mark it done.',
    ])
    expect(await say('yep')).toEqual([`do ${status(2, 'done')}`])
  })

  it('and on a no, the other one asked about', async () => {
    const say = conversation()
    await say('I finished the sound check')
    expect(await say('no')).toEqual([
      'ask: Did you mean “Sound check”, due Sun, Oct 25? If so, I’ll mark it done.',
    ])
    expect(await say("yes that's it")).toEqual([`do ${status(1, 'done')}`])
  })

  it('a no with the right one named', async () => {
    const say = conversation()
    await say('I finished the sound check')
    expect(await say('No, I meant the bus')).toEqual([`offer ${status(5, 'done')}`])
  })

  it('a task said to be one, that isn’t theirs', async () => {
    const say = conversation()
    expect(await say('Mark the parking task done')).toEqual([
      'say: I couldn’t find a task of yours called “parking”.',
    ])
  })

  it('not a task of theirs, nor said to be one: Claude', async () => {
    const say = conversation()
    expect(await say('I finished the dishes')).toEqual(['(to Claude)'])
  })

  it('tasks not loaded yet: Claude', async () => {
    const say = conversation({ tasksReady: false })
    expect(await say('I booked the bus')).toEqual(['(to Claude)'])
  })

  it('not for someone without tasks', async () => {
    const say = conversation({ tools: ALL_TOOLS.filter((t) => t !== 'set_task_status') })
    expect(await say('I booked the bus')).toEqual(['(to Claude)'])
  })
})

describe('notification switches', () => {
  it('one plainly named: shown to confirm', async () => {
    const say = conversation()
    expect(await say('Turn off chat notifications')).toEqual([`offer ${notifs(['newMessage'])}`])
    expect(await say('Turn on notifications for worship sets')).toEqual([
      `offer ${notifs(['worshipSetAssigned'], true)}`,
    ])
  })

  it('"reminders": the likeliest asked about, the rest named', async () => {
    const say = conversation()
    expect(await say('Turn off reminders')).toEqual([
      'ask: Did you mean: turn off “Event reminder” notifications? There’s also “Task due soon”, “Flight reminder” and “Food items still open”.',
    ])
    expect(await say('yes')).toEqual([`do ${notifs(['eventReminder'])}`])
  })

  it('a no with the right one named', async () => {
    const say = conversation()
    await say('Turn off reminders')
    expect(await say('no, the flight ones')).toEqual([`offer ${notifs(['flightReminder'])}`])
  })

  it('a no, then which of the others', async () => {
    const say = conversation()
    await say('Turn off reminders')
    expect(await say('no')).toEqual([
      'ask: Which, then: “Task due soon”, “Flight reminder” or “Food items still open”?',
    ])
    expect(await say('the last one')).toEqual([`offer ${notifs(['foodSignupReminder'])}`])
  })

  it('both food ones offered; "just the reminders" is the food one', async () => {
    const say = conversation()
    expect(await say('turn off food notifications')).toEqual([
      'ask: Did you mean: turn off “Food sign-up opened” and “Food items still open” notifications?',
    ])
    expect(await say('just the reminders')).toEqual([`offer ${notifs(['foodSignupReminder'])}`])
  })

  it('none named: asked which', async () => {
    const say = conversation()
    expect(await say('Turn off my notifications')).toEqual([
      'ask: Which notifications should I turn off? You can name a kind — messages, announcements, event reminders — or say all of them.',
    ])
    expect(await say('messages')).toEqual([`offer ${notifs(['newMessage'])}`])
  })

  it('all of them, when asked which', async () => {
    const say = conversation()
    await say('Turn off my notifications')
    expect(await say('all of them')).toEqual([
      `offer ${notifs(notificationKeysFor({ uid: 'me', roles: ['regular'] } as never))}`,
    ])
  })

  it('one chat can’t be muted from here: said, and every message offered', async () => {
    const say = conversation()
    expect(await say('Turn off notifications for the youth group chat')).toEqual([
      'ask: I can’t mute just one conversation from here — only every new message. Did you mean: turn off “New message” notifications?',
    ])
    expect(await say('no')).toEqual(['say: Okay — nothing was changed.'])
  })

  it('email asked for: only push can be changed, asked', async () => {
    const say = conversation()
    expect(await say('Stop emailing me about announcements')).toEqual([
      'ask: Email notifications aren’t on in the app, so I can only change the push ones. Did you mean: turn off “Announcement” notifications?',
    ])
  })

  it('"mute everything": all of them, asked', async () => {
    const say = conversation()
    expect(await say('Mute everything')).toEqual([
      'ask: Did you mean: turn off all your notifications?',
    ])
  })

  it('one they do not have', async () => {
    const say = conversation()
    expect(await say('Turn off kaizen notifications')).toEqual([
      'say: That isn’t one of the notifications you have. Yours are all in Settings.',
    ])
  })
})

describe('announcements and messages, read out', () => {
  const rooms = [
    room('dm-sk', ['me', 's1']),
    room('dm-sm', ['me', 's2']),
    room('dm-b', ['me', 'b']),
    room('grp', ['me', 's1', 'b']),
    room('yth', ['me', 'b'], 'Youth Leaders'),
  ]
  const messages = {
    'dm-sk': [msg('s1', 'Running late', H)],
    'dm-sm': [msg('s2', 'See you Sunday', 5 * H, true)],
    'dm-b': [msg('me', 'Can you drive?', 3 * H, true), msg('b', 'Sure', 2 * H, true)],
    yth: [msg('b', 'Meeting moved to 7', 30 * 60_000)],
  }

  it('announcements', async () => {
    const say = conversation()
    expect(await say('Any new announcements?')).toEqual([
      'say: There’s one: “Retreat packing list”, from Pastor John, 2 hours ago: Bring a sleeping bag.',
    ])
  })

  it('who has written', async () => {
    const say = conversation({ rooms, messages })
    expect(await say('Do I have any messages?')).toEqual([
      'say: You have 2 unread messages: 1 in Youth Leaders and 1 from Sarah Kim.',
    ])
  })

  it('one person: their own conversation, the group with them named', async () => {
    const say = conversation({ rooms, messages })
    expect(await say('What did Bob say?')).toEqual([
      'say: The latest with Bob Lee, 2 hours ago: You: “Can you drive?”; Bob: “Sure”. You also have your group with Sarah and Bob — ask for it by name if you meant that.',
    ])
  })

  it('two people alike: asked which', async () => {
    const say = conversation({ rooms, messages })
    expect(await say('Any messages from Sarah?')).toEqual([
      'ask: Which conversation: Sarah Kim or Sarah Miller?',
    ])
    expect(await say('Miller')).toEqual([
      'say: The latest with Sarah Miller, 5 hours ago: Sarah: “See you Sunday”.',
    ])
  })

  it('a group by its name', async () => {
    const say = conversation({ rooms, messages })
    expect(await say("What's new in the youth leaders chat?")).toEqual([
      'say: One unread message in “Youth Leaders”, 30 minutes ago: Bob: “Meeting moved to 7”.',
    ])
  })

  it('"what did the doctor say?": no one they talk to, so Claude', async () => {
    const say = conversation({ rooms, messages })
    expect(await say('What did the doctor say?')).toEqual(['(to Claude)'])
  })
})

const AVAIL_TOOLS = [...ALL_TOOLS, 'set_availability']
const answerFor = (key: string, status: string, note = '') =>
  `offer set_availability ${JSON.stringify({ event_key: key, status, note })}`

describe('availability, given', () => {
  it('an event named plainly: shown to confirm', async () => {
    const say = conversation({ tools: AVAIL_TOOLS })
    expect(await say("I can't make it to band practice")).toEqual([
      answerFor('prac_2026-10-18', 'no'),
    ])
  })

  it('late, with why: partly available, noted', async () => {
    const say = conversation({ tools: AVAIL_TOOLS })
    expect(await say("I'll be late to youth night because of work")).toEqual([
      answerFor('yth_2026-10-25', 'partial', 'Arriving late — Because of work'),
    ])
  })

  it('a day with two of theirs on it: asked which', async () => {
    const say = conversation({ tools: AVAIL_TOOLS })
    expect(await say("I'm not sure about Sunday")).toEqual([
      'ask: Which one: Fall Potluck on Sunday or Band Practice on Sunday?',
    ])
    expect(await say('the potluck')).toEqual([answerFor('pot_2026-10-18', 'tbd')])
  })

  it('no event said: the next of theirs they haven’t answered, asked about', async () => {
    const say = conversation({
      tools: AVAIL_TOOLS,
      answers: { 'prac_2026-10-18': { status: 'yes', note: '', ts: NOW } },
    })
    expect(await say("I can't make it")).toEqual([
      'ask: Do you mean Fall Potluck on Sunday? If so, I’ll mark you as not available.',
    ])
    expect(await say('yes')).toEqual([
      `do set_availability ${JSON.stringify({ event_key: 'pot_2026-10-18', status: 'no', note: '' })}`,
    ])
  })

  it('no, then which one they meant', async () => {
    const say = conversation({ tools: AVAIL_TOOLS })
    await say("I can't make it")
    expect(await say('no')).toEqual(['ask: Which event do you mean?'])
    expect(await say('youth night')).toEqual([answerFor('yth_2026-10-25', 'no')])
  })

  it('without the means to answer, or an event not theirs: left to Claude', async () => {
    expect(await conversation()("I can't make it to band practice")).toEqual(['(to Claude)'])
    expect(await conversation({ tools: AVAIL_TOOLS })("I can't make the gala")).toEqual([
      '(to Claude)',
    ])
  })
})

describe('her questions about events they haven’t answered for', () => {
  const ev = (id: string, date: string, title: string) =>
    ({ id, title, date, instanceKey: `${id}_${date}`, templateId: id }) as never
  const potluck = ev('pot', '2026-10-18', 'Fall Potluck')
  const youth = ev('yth', '2026-10-25', 'Youth Night')

  it('asks each in turn, saving each answer, and says when it is done', async () => {
    const say = conversation({ tools: AVAIL_TOOLS })
    expect(
      await say.begin((here, talk) =>
        askAvailability(
          [
            { ev: potluck, wasUnsure: false },
            { ev: youth, wasUnsure: true },
          ],
          here,
          talk,
          '2 of your events need an answer. '
        )
      )
    ).toEqual(['ask: 2 of your events need an answer. Can you make Fall Potluck on Sunday?'])
    expect(await say('Yes but I’ll be a little late')).toEqual([
      'saved pot_2026-10-18 partial (Arriving late)',
      'ask: Okay — partly available, noted. Last time you weren’t sure about Youth Night on Sunday, Oct 25. Can you make it now?',
    ])
    expect(await say("I still don't know")).toEqual([
      'saved yth_2026-10-25 tbd',
      'say: Okay — I’ll ask you again later. That’s all of them — thanks.',
    ])
  })

  it('“skip” leaves one for another time; “not now” ends the questions', async () => {
    const say = conversation({ tools: AVAIL_TOOLS })
    await say.begin((here, talk) =>
      askAvailability(
        [
          { ev: potluck, wasUnsure: false },
          { ev: youth, wasUnsure: false },
        ],
        here,
        talk
      )
    )
    expect(await say('skip')).toEqual(['ask: Okay. Can you make Youth Night on Sunday, Oct 25?'])
    expect(await say('not now')).toEqual(['say: Okay.'])
  })

  it('no, with why, kept with the answer', async () => {
    const say = conversation({ tools: AVAIL_TOOLS })
    await say.begin((here, talk) =>
      askAvailability([{ ev: potluck, wasUnsure: false }], here, talk)
    )
    expect(await say("No, I'm out of town")).toEqual([
      "saved pot_2026-10-18 no (I'm out of town)",
      'say: Okay — you’re down as not available. That’s all of them — thanks.',
    ])
  })

  it('a reply that isn’t an answer: asked once more, then left; a new request is taken as one', async () => {
    const say = conversation({ tools: AVAIL_TOOLS })
    await say.begin((here, talk) =>
      askAvailability(
        [
          { ev: potluck, wasUnsure: false },
          { ev: youth, wasUnsure: false },
        ],
        here,
        talk
      )
    )
    expect(await say('purple')).toEqual([
      'ask: Sorry — can you make Fall Potluck? You can say yes, no, not sure yet, or skip.',
    ])
    expect(await say('purple')).toEqual([
      'ask: I’ll ask about that one another time. Can you make Youth Night on Sunday, Oct 25?',
    ])
    const [first] = await say('What time is band practice?')
    expect(first).toBe('(not an answer: a request of its own)')
  })

  it('an answer that doesn’t save is said, and the next asked', async () => {
    const say = conversation({ tools: AVAIL_TOOLS, failAnswers: true })
    await say.begin((here, talk) =>
      askAvailability([{ ev: potluck, wasUnsure: false }], here, talk)
    )
    expect(await say('yes')).toEqual([
      'say: That didn’t save — you can answer on Fall Potluck’s page. That’s all of them — thanks.',
    ])
  })
})

describe('what they have coming up', () => {
  it('their events, with what is theirs at each, then asks about any not answered', async () => {
    const say = conversation({
      tools: AVAIL_TOOLS,
      // Sam has the roast; the rest of the sheet is open.
      open: { pot: ['Roast vegetables', 'Drinks', 'Dessert'] },
      answers: { 'prac_2026-10-18': { status: 'yes', note: '', ts: NOW } },
    })
    expect(await say('What do I have next week?')).toEqual([
      'ask: Next week you have 2 events. Band Practice, Sunday. Fall Potluck, Sunday — you haven’t said if you can make it. Can you make Fall Potluck on Sunday?',
    ])
    expect(await say('yes')).toEqual([
      'saved pot_2026-10-18 yes',
      'say: Great — you’re down as available. That’s all of them — thanks.',
    ])
  })

  it('nothing on then', async () => {
    const say = conversation({ tools: AVAIL_TOOLS })
    expect(await say("What's my schedule this week?")).toEqual([
      'say: You have nothing on this week.',
    ])
  })

  it('not theirs — what’s on — is left to the plain list', async () => {
    const say = conversation({ tools: AVAIL_TOOLS })
    expect(await say("What's on next week?")).toEqual(['(to Claude)'])
  })
})

describe('the cars, arranged by an admin', () => {
  const ADMIN_TOOLS = [...AVAIL_TOOLS, 'set_carpool']
  const moved = (input: Record<string, unknown>) =>
    `offer move_in_carpool ${JSON.stringify({ event_key: 'ret_2026-10-30', ...input })}`

  it('a passenger put in a car, on the event coming up that has it', async () => {
    const say = conversation({ tools: ADMIN_TOOLS })
    expect(await say('Put Bob in van 1')).toEqual([
      moved({ car_id: 'v1', seat: 'passenger', uid: 'b' }),
    ])
  })

  it('a driver, among two of that name the one on the event', async () => {
    const say = conversation({ tools: ADMIN_TOOLS })
    expect(await say("Make Sarah the driver of Andy's truck")).toEqual([
      moved({ car_id: 'tr', seat: 'driver', uid: 's1' }),
    ])
  })

  it('someone taken out of the carpool, from whichever car they’re in', async () => {
    const say = conversation({ tools: ADMIN_TOOLS })
    expect(await say('Take Bob out of the carpool')).toEqual([
      moved({ car_id: '', seat: 'out', uid: 'b' }),
    ])
  })

  it('a child added by name', async () => {
    const say = conversation({ tools: ADMIN_TOOLS })
    expect(await say('Add a child named Joey to the truck for the retreat')).toEqual([
      moved({ car_id: 'tr', seat: 'child', child: 'Joey' }),
    ])
  })

  it('a car named like none of the event’s: left to Claude', async () => {
    const say = conversation({ tools: ADMIN_TOOLS })
    expect(await say('put Bob in the car for the retreat')).toEqual(['(to Claude)'])
  })

  it('a car no event has, or not an admin: left alone', async () => {
    expect(await conversation({ tools: ADMIN_TOOLS })('put Bob in the bus')).toEqual([
      '(to Claude)',
    ])
    expect(await conversation({ tools: AVAIL_TOOLS })('Put Bob in van 1')).toEqual(['(to Claude)'])
  })

  it('someone the app doesn’t know: said so', async () => {
    const say = conversation({ tools: ADMIN_TOOLS })
    expect(await say('Put Zed in van 1')).toEqual(['say: I couldn’t find anyone called “Zed”.'])
  })
})

describe('reminders from an event, or asked when', () => {
  const TOOLS = [...ALL_TOOLS, 'create_reminder']
  const reminded = (r: Record<string, unknown>) => `remind ${JSON.stringify(r)}`

  it('so long before it starts, tied to it so it moves with it', async () => {
    const say = conversation({ tools: TOOLS })
    expect(await say('Remind me an hour before youth night')).toEqual([
      reminded({
        text: 'Youth Night',
        at: 'Sun Oct 25 2026 18:00',
        spoken: 'about Youth Night — an hour before it',
        eventKey: 'yth_2026-10-25',
        eventTemplateId: 'yth',
        eventTitle: 'Youth Night',
        minutesBefore: 60,
      }),
    ])
  })

  it('the day before, at the hour that means — an event with no time stays put', async () => {
    const say = conversation({ tools: TOOLS })
    expect(await say('Remind me the day before the retreat to pack')).toEqual([
      reminded({
        text: 'Pack',
        at: 'Thu Oct 29 2026 09:00',
        spoken: 'to pack — the day before Youth Retreat',
        eventKey: 'ret_2026-10-30',
        eventTemplateId: 'ret',
        eventTitle: 'Youth Retreat',
      }),
    ])
  })

  it('so long before an event with no start time: said why not', async () => {
    const say = conversation({ tools: TOOLS })
    expect(await say('Remind me 30 minutes before the retreat')).toEqual([
      'say: Youth Retreat has no start time set, so I can’t time a reminder from it. Try a time instead — like “Friday, Oct 30 at 6 PM.”',
    ])
  })

  it('no time said: asked when — a time, or one from an event', async () => {
    const say = conversation({ tools: TOOLS })
    expect(await say('Remind me to bring chips')).toEqual([
      'ask: When should I remind you to bring chips?',
    ])
    expect(await say('the morning of youth night')).toEqual([
      reminded({
        text: 'Bring chips',
        at: 'Sun Oct 25 2026 08:00',
        spoken: 'to bring chips — the morning of Youth Night',
        eventKey: 'yth_2026-10-25',
        eventTemplateId: 'yth',
        eventTitle: 'Youth Night',
        minutesBefore: 660,
      }),
    ])
    await say('Remind me to bring chips')
    expect(await say('tomorrow at 9')).toEqual([
      reminded({ text: 'Bring chips', at: 'Wed Oct 14 2026 09:00', spoken: 'to bring chips' }),
    ])
  })

  it('a when she can’t read: said so', async () => {
    const say = conversation({ tools: TOOLS })
    await say('Remind me to bring chips')
    expect(await say('whenever')).toEqual([
      'say: I couldn’t tell when. Try something like “tomorrow at 9” or “an hour before the potluck.”',
    ])
  })

  it('without reminders on their screens: left to Claude', async () => {
    expect(await conversation()('Remind me an hour before youth night')).toEqual(['(to Claude)'])
  })
})

describe('directions', () => {
  // Today is Tuesday the 13th.
  const placed = [
    {
      id: 'svc',
      title: 'Sunday Service',
      date: '2026-10-18',
      startTime: '10:00 AM',
      users: ['me'],
      location: 'The Midnight Gem',
      address: '2613 Ders Drive NW',
      city: 'Swisher',
      state: 'IA',
    },
    {
      id: 'yn',
      title: 'Youth Night',
      date: '2026-10-13',
      startTime: '7:00 PM',
      users: ['me'],
      location: 'Church Hall',
      city: 'Iowa City',
      state: 'IA',
    },
    {
      id: 'call',
      title: 'Prayer Call',
      date: '2026-10-15',
      users: ['me'],
      isVirtual: true,
      virtualLink: 'https://meet.example',
    },
    { id: 'plan', title: 'Planning Night', date: '2026-10-16', users: ['me'] },
  ]

  it('opens maps to the event meant, by day or by name', async () => {
    const say = conversation({ events: placed })
    expect(await say('Give me directions to the event on Sunday')).toEqual([
      'directions svc_2026-10-18',
    ])
    expect(await say('Take me to youth night')).toEqual(['directions yn_2026-10-13'])
  })

  it('"take me there": theirs today — else their next, asked about', async () => {
    expect(await conversation({ events: placed })('Take me there')).toEqual([
      'directions yn_2026-10-13',
    ])
    const say = conversation({ events: placed.filter((e) => e.id !== 'yn') })
    expect(await say('How do I get there?')).toEqual([
      'ask: Directions to Prayer Call on Thursday?',
    ])
    expect(await say('no, sunday service')).toEqual(['directions svc_2026-10-18'])
  })

  it('says why, when there is nowhere to open maps to', async () => {
    const say = conversation({ events: placed })
    expect(await say('Navigate to the prayer call')).toEqual([
      'say: Prayer Call is virtual — the link is on its page.',
    ])
    expect(await say('directions to planning night')).toEqual([
      'say: Planning Night has no place set yet.',
    ])
  })

  it('an event not among theirs is left to Claude', async () => {
    expect(await conversation({ events: placed })('Take me to the zoo')).toEqual(['(to Claude)'])
  })
})

describe('a reminder before every event', () => {
  const each = (text: string, spoken: string, before: unknown, relation: string, first: unknown) =>
    `before each ${JSON.stringify({ text, spoken, before, relation, first })}`
  // Youth Night (Oct 25, 7 PM) is the first of theirs with a start time.
  const youthNight = (h: number, m = 0) => ({
    key: 'yth_2026-10-25',
    at: new Date(2026, 9, 25, h, m).toString().slice(0, 21),
  })
  const tools = [...ALL_TOOLS, 'create_reminder']

  it('one, for all of them, with the first said', async () => {
    const say = conversation({ tools })
    expect(await say('Remind me to pray 1 hour before any event starts')).toEqual([
      each('Pray', 'to pray', { minutes: 60 }, '1 hour before', youthNight(18)),
    ])
    expect(await say('remind me 15 minutes before all my events')).toEqual([
      each('', '', { minutes: 15 }, '15 minutes before', youthNight(18, 45)),
    ])
  })

  it('a day before, or the morning of — for events with no time too', async () => {
    const say = conversation({ tools })
    expect(await say('Remind me the morning of every event to pack')).toEqual([
      each('Pack', 'to pack', { days: 0, hour: 8 }, 'the morning of', {
        key: 'prac_2026-10-18',
        at: new Date(2026, 9, 18, 8).toString().slice(0, 21),
      }),
    ])
  })

  it('asks how long before, when it wasn’t said', async () => {
    const say = conversation({ tools })
    expect(await say('Remind me to pray before every event')).toEqual([
      'ask: How long before each event should I remind you to pray? An hour before, say.',
    ])
    expect(await say('30 minutes')).toEqual([
      each('Pray', 'to pray', { minutes: 30 }, '30 minutes before', youthNight(18, 30)),
    ])
  })

  it('one event named is still that event alone', async () => {
    const say = conversation({ tools })
    const said = await say('Remind me an hour before youth night')
    expect(said[0]).toMatch(/^remind /)
  })
})
