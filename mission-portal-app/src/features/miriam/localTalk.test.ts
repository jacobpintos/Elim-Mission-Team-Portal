import { describe, expect, it } from 'vitest'
import { talkHere, type Here, type Reply, type Talk } from './localTalk'
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
    users: ['me'],
    food: true,
    foodItems: ['Pizza', 'Chips'],
  },
  { id: 'prac', title: 'Band Practice', date: '2026-10-18', users: ['me'] },
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
  }
  const data: QuickData = {
    templates: templates as never,
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
  }
  return async (said: string): Promise<string[]> => {
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

  it.each([
    "I'll bring drinks as suggested",
    "Sure, I'll bring the drinks you suggested",
    'Okay I can bring drinks like you said',
    "I'll bring what you suggested",
    "I'll take the drinks, as suggested",
  ])('"%s": the briefing’s event and dish, with nothing to ask', async (said) => {
    const say = conversation({ briefed, open })
    // Shown open in the briefing: taken since is "just signed up for".
    expect(await say(said)).toEqual([`offer ${signUp('pot_2026-10-18', 'Drinks', true)}`])
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
      `offer ${signUp('pot_2026-10-18', 'Pot roast', false)}`,
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
    expect(await say('yes')).toEqual([`offer ${signUp('pot_2026-10-18', 'Drinks', false)}`])
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
