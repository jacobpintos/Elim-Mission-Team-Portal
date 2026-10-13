import { describe, expect, it } from 'vitest'
import {
  agoSaid,
  announcementsAsked,
  announcementsSaid,
  conversationPicked,
  messagesAsked,
  messagesSaid,
  snippet,
  unreadSaid,
} from './miriamReads'
import type { Announcement, Message, Room } from '@/types/events'

const NOW = new Date('2026-10-13T15:00:00').getTime()
const H = 3_600_000
const D = 24 * H

describe('agoSaid', () => {
  it('says when, as people do', () => {
    expect(agoSaid(NOW - 30_000, NOW)).toBe('just now')
    expect(agoSaid(NOW - 10 * 60_000, NOW)).toBe('10 minutes ago')
    expect(agoSaid(NOW - 2 * H, NOW)).toBe('2 hours ago')
    expect(agoSaid(NOW - D, NOW)).toBe('yesterday')
    expect(agoSaid(NOW - 3 * D, NOW)).toBe('on Saturday')
    expect(agoSaid(NOW - 20 * D, NOW)).toBe('on Sep 23')
  })
})

describe('snippet', () => {
  it('keeps it short, ending on a sentence or a word', () => {
    const long =
      'Bring a coat. ' + 'We leave from the church at six sharp and will be back late. '.repeat(6)
    expect(snippet(long, 60)).toBe('Bring a coat. We leave from the church at six sharp and…')
    expect(snippet(long, 140)).toMatch(/back late\.$/)
    expect(snippet('one two three four five six', 15)).toBe('one two three…')
    expect(snippet('short')).toBe('short')
  })
})

describe('announcementsAsked', () => {
  const ask = (t: string) => announcementsAsked(t)

  it.each([
    ['Any new announcements?', { about: '', from: '', latest: false, days: 7 }],
    ['What are the announcements?', { about: '', from: '', latest: false, days: 0 }],
    ['Read me the latest announcement', { about: '', from: '', latest: true, days: 0 }],
    [
      'Is there an announcement about the retreat?',
      { about: 'retreat', from: '', latest: false, days: 0 },
    ],
    [
      'Any announcements from Pastor John?',
      { about: '', from: 'pastor john', latest: false, days: 7 },
    ],
    ['Did Pastor John post anything?', { about: '', from: 'pastor john', latest: false, days: 0 }],
    ['Has anything been announced today?', { about: '', from: '', latest: false, days: 1 }],
    ["What's been posted this week?", { about: '', from: '', latest: false, days: 7 }],
  ])('"%s"', (text, want) => {
    expect(ask(text)).toEqual(want)
  })

  it.each([
    'Post an announcement about the retreat',
    'I want to post an announcement',
    'Turn off announcement notifications',
    'Delete the retreat announcement',
    'Announce that the retreat is cancelled',
    'What time is it',
  ])('"%s" is not a read', (text) => {
    expect(ask(text)).toBeNull()
  })
})

describe('announcementsSaid', () => {
  const names = new Map([
    ['pj', 'Pastor John'],
    ['amy', 'Amy Lee'],
  ])
  const a = (id: number, title: string, body: string, by: string, ago: number): Announcement =>
    ({
      id,
      title,
      body,
      by,
      ts: NOW - ago,
      isPublic: false,
      audience: [],
      attachment: null,
    }) as Announcement
  const shown = [
    a(1, 'Retreat packing list', 'Bring a sleeping bag. Bus leaves at 6.', 'pj', 2 * H),
    a(2, 'Potluck Sunday', 'Sign up for a dish.', 'amy', 2 * D),
    a(3, 'Summer recap', 'Thanks for a great summer.', 'pj', 30 * D),
  ]
  const say = (text: string) => announcementsSaid(shown, names, announcementsAsked(text)!, NOW)

  it('lists the new ones, reading the newest', () => {
    expect(say('Any new announcements?')).toBe(
      'There are 2 announcements this week: “Retreat packing list” and “Potluck Sunday”. The newest, from Pastor John: Bring a sleeping bag. Bus leaves at 6.'
    )
  })

  it('reads the one asked about', () => {
    expect(say('Is there an announcement about the potluck?')).toBe(
      'There’s one: “Potluck Sunday”, from Amy Lee, on Sunday: Sign up for a dish.'
    )
  })

  it('reads the latest', () => {
    expect(say('Read me the latest announcement')).toMatch(
      /^The latest announcement is “Retreat packing list”/
    )
  })

  it('offers the newest when none is new', () => {
    expect(say('Any new announcements today?')).toBe(
      'There’s one: “Retreat packing list”, from Pastor John, 2 hours ago: Bring a sleeping bag. Bus leaves at 6.'
    )
    expect(
      announcementsSaid(shown.slice(2), names, announcementsAsked('any new announcements')!, NOW)
    ).toBe('No new announcements this week. The latest is “Summer recap”, on Sep 13.')
  })

  it('by who posted it', () => {
    expect(say('Any announcements from Amy?')).toMatch(/^There’s one: “Potluck Sunday”/)
  })

  it('says when there is none like it', () => {
    expect(say('Is there an announcement about parking?')).toBe(
      'I didn’t find an announcement about parking.'
    )
  })
})

describe('messagesAsked', () => {
  it.each([
    ['Do I have any messages?', ''],
    ['Any new messages?', ''],
    ['Check my messages', ''],
    ['Read my messages', ''],
    ['Did anyone message me?', ''],
    ['Who texted me?', ''],
    ['Any unread texts?', ''],
    ["What's in my inbox?", ''],
    ['What did Sarah say?', 'sarah'],
    ['Any messages from Sarah?', 'sarah'],
    ['Did Sarah text me back?', 'sarah'],
    ['Has Sarah gotten back to me?', 'sarah'],
    ["What's new in the youth group chat?", 'youth'],
    ['Read the worship team chat', 'worship team'],
    ['Read my conversation with Bob', 'bob'],
    ['Anything new from Sarah?', 'sarah'],
    ['Did Sarah write back?', 'sarah'],
  ])('"%s"', (text, who) => {
    expect(messagesAsked(text)?.who).toBe(who)
  })

  it('"what did Sarah say?" reads only if Sarah is in one', () => {
    expect(messagesAsked('What did Sarah say?')?.onlyIfFound).toBe(true)
    expect(messagesAsked('Any messages from Sarah?')?.onlyIfFound).toBe(false)
  })

  it.each([
    'What did you say?',
    'What was said in the meeting?',
    'Send Sarah a message',
    'Message Sarah that I am late',
    'Turn off message notifications',
    'Mute the youth chat',
    'What time is it',
    'Any new announcements?',
  ])('"%s" is not a read', (text) => {
    expect(messagesAsked(text)).toBeNull()
  })
})

describe('conversationPicked', () => {
  const uid = 'me'
  const names = new Map([
    ['me', 'Jacob'],
    ['s1', 'Sarah Kim'],
    ['s2', 'Sarah Miller'],
    ['b', 'Bob Lee'],
  ])
  const room = (id: string, members: string[], name = ''): Room =>
    ({ id, name, members, call: false, reviewers: [] }) as Room
  const rooms = [
    room('dm-sk', ['me', 's1']),
    room('dm-bob', ['me', 'b']),
    room('grp', ['me', 's1', 'b']),
    room('yth', ['me', 'b', 's2'], 'Youth Leaders'),
  ]
  const pick = (who: string, from = rooms) => {
    const p = conversationPicked(from, uid, names, who)
    return p.kind === 'sure' || p.kind === 'likely'
      ? `${p.kind}:${p.item.room.id}`
      : p.kind === 'which'
        ? `which:${p.items.map((r) => r.room.id).join(',')}`
        : 'none'
  }

  it('their own conversation with the person, over a group with them', () => {
    expect(pick('bob')).toBe('likely:dm-bob')
  })

  it('a group by its name', () => {
    expect(pick('youth leaders')).toBe('sure:yth')
    expect(pick('youth')).toBe('sure:yth')
  })

  it('asks which of two people alike', () => {
    expect(pick('sarah', [...rooms, room('dm-sm', ['me', 's2'])])).toBe('which:dm-sk,dm-sm')
  })

  it('a group with them, when there is no conversation of their own', () => {
    expect(pick('sarah miller')).toBe('likely:yth')
  })

  it('none for someone not in any', () => {
    expect(pick('doctor')).toBe('none')
  })
})

describe('unreadSaid / messagesSaid', () => {
  const uid = 'me'
  const names = new Map([
    ['me', 'Jacob'],
    ['s1', 'Sarah Kim'],
    ['b', 'Bob Lee'],
  ])
  const m = (from: string, text: string, ago: number, read = false): Message => ({
    uid: from,
    text,
    attachment: null,
    ts: NOW - ago,
    readBy: read ? { me: true } : {},
  })
  const dm = { id: 'dm', name: '', members: ['me', 's1'], call: false, reviewers: [] } as Room
  const grp = {
    id: 'g',
    name: 'Youth Leaders',
    members: ['me', 's1', 'b'],
    call: false,
    reviewers: [],
  } as Room

  it('reads them when it is one conversation with a few', () => {
    expect(
      unreadSaid(
        [{ room: dm, messages: [m('me', 'Hi', 3 * H, true), m('s1', 'Running late', H)] }],
        uid,
        names,
        NOW
      )
    ).toBe('You have one unread message from Sarah Kim, an hour ago. Sarah: “Running late”.')
  })

  it('counts them by conversation when there are more', () => {
    expect(
      unreadSaid(
        [
          { room: dm, messages: [m('s1', 'a', 3 * H), m('s1', 'b', 2 * H)] },
          { room: grp, messages: [m('b', 'c', H)] },
        ],
        uid,
        names,
        NOW
      )
    ).toBe('You have 3 unread messages: 1 in Youth Leaders and 2 from Sarah Kim.')
  })

  it('says when all are read', () => {
    expect(unreadSaid([{ room: dm, messages: [m('s1', 'ok', D, true)] }], uid, names, NOW)).toBe(
      'No unread messages — you’re all caught up. The last was from Sarah Kim, yesterday.'
    )
  })

  it('reads a conversation, oldest first, a photo as such', () => {
    expect(
      messagesSaid(
        [
          m('s1', 'See you there', H),
          m('me', 'Great', 2 * H),
          { ...m('s1', '', 30_000), attachment: { type: 'image', url: 'x' } },
        ],
        uid,
        names
      )
    ).toBe('You: “Great”; Sarah: “See you there”; Sarah sent a photo')
  })
})
