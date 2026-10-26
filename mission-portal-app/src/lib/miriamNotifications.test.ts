import { describe, expect, it } from 'vitest'
import {
  notificationAsked,
  notificationKeysFor,
  notificationPlan,
  pushIsOn,
  switchesSaid,
} from './miriamNotifications'
import type { UserProfile } from '@/types/user'

const member = { uid: 'me', roles: ['regular'] } as unknown as UserProfile
const admin = { uid: 'ad', roles: ['admin'] } as unknown as UserProfile
const pub = { uid: 'pu', roles: ['public'] } as unknown as UserProfile

/** What is asked, as the plan for a member: "sure:newMessage", "likely:a,b/c", "which", "none", or null. */
const plan = (text: string, who: UserProfile = member) => {
  const ask = notificationAsked(text)
  if (!ask) return null
  const p = notificationPlan(ask, notificationKeysFor(who))
  const dir = ask.on ? 'on' : 'off'
  if (p.kind === 'sure') return `${dir} sure:${p.keys.join(',')}`
  if (p.kind === 'likely')
    return `${dir} likely:${p.keys.join(',')}${p.others.length ? `/${p.others.join(',')}` : ''}`
  return `${dir} ${p.kind}`
}

describe('notificationAsked: said plainly', () => {
  it.each([
    ['Turn off chat notifications', 'off sure:newMessage'],
    ['turn off message notifications', 'off sure:newMessage'],
    ['Turn message notifications off', 'off sure:newMessage'],
    ['Stop notifying me about new messages', 'off sure:newMessage'],
    ["I don't want notifications for announcements", 'off sure:announcement'],
    ['Disable announcement alerts', 'off sure:announcement'],
    ['Turn off flight reminders', 'off sure:flightReminder'],
    ['turn off event reminders', 'off sure:eventReminder'],
    ['Please turn off notifications for tasks due soon', 'off sure:taskDueSoon'],
    ['Turn off notifications when I get a new assignment', 'off sure:newAssignment'],
    ['Turn on notifications for worship sets', 'on sure:worshipSetAssigned'],
    ['Turn off travel details notifications', 'off sure:eventLogistics'],
    ['turn off notifications for food reminders', 'off sure:foodSignupReminder'],
    ['Turn off message and announcement notifications', 'off sure:newMessage,announcement'],
    ['Turn off all notifications', 'off sure:' + notificationKeysFor(member).join(',')],
    ['Silence all alerts', 'off sure:' + notificationKeysFor(member).join(',')],
  ])('"%s"', (text, want) => {
    expect(plan(text)).toBe(want)
  })
})

describe('notificationAsked: likely, asked about', () => {
  it.each([
    // No word for a notification: probably the switch, but asked.
    ['Turn off messages', 'off likely:newMessage'],
    ['Mute chats', 'off likely:newMessage'],
    // A word that fits several: the likeliest first, the rest offered.
    [
      'Turn off reminders',
      'off likely:eventReminder/taskDueSoon,flightReminder,foodSignupReminder',
    ],
    ['Turn off flight notifications', 'off likely:flightReminder/eventLogistics'],
    ['turn off food notifications', 'off likely:foodSignupOpen,foodSignupReminder'],
    ['Turn off task notifications', 'off likely:newAssignment,taskDueSoon'],
    ['Turn off event notifications', 'off likely:eventReminder,eventJoin,eventRemoved'],
    // Email isn't on: asked whether push is meant.
    ['Stop emailing me about announcements', 'off likely:announcement'],
    // One chat can't be muted from here: every message offered, asked.
    ['Turn off notifications for the youth group chat', 'off likely:newMessage'],
    ['Mute everything', 'off likely:' + notificationKeysFor(member).join(',')],
  ])('"%s"', (text, want) => {
    expect(plan(text)).toBe(want)
  })
})

describe('notificationAsked: which, none, or not one', () => {
  it('asks which when none is named', () => {
    expect(plan('Turn off my notifications')).toBe('off which')
    expect(plan('turn on push notifications')).toBe('on which')
  })

  it('a switch only an admin has, for a member', () => {
    expect(plan('Turn off kaizen notifications')).toBe('off none')
    expect(plan('Turn off kaizen notifications', admin)).toBe('off sure:kaizenSubmission')
  })

  it.each([
    ["I don't want to get notified about messages anymore", 'off sure:newMessage'],
    ['No more chat alerts', 'off sure:newMessage'],
    ['Quit buzzing me about announcements', 'off sure:announcement'],
    ['Enable flight reminders', 'on sure:flightReminder'],
    ['Turn notifications off for new assignments', 'off sure:newAssignment'],
  ])('more ways of saying it: "%s"', (text, want) => {
    expect(plan(text)).toBe(want)
  })

  it('a stream alert is for admins and public followers, not members', () => {
    expect(plan('I want to know when we go live', pub)).toBe('on likely:livestream')
    expect(plan('Turn on livestream notifications')).toBe('on none')
    expect(plan('Turn on livestream notifications', admin)).toBe('on sure:livestream')
    expect(plan('Let me know when we go live', pub)).toBe('on likely:livestream')
  })

  it('public followers have their own', () => {
    expect(plan('Turn off announcement notifications', pub)).toBe('off sure:publicAnnouncement')
    expect(plan('Turn on notifications for nearby events', pub)).toBe('on sure:publicEvent')
    expect(plan('Turn off notifications for new sermons', pub)).toBe('off sure:contentFeatured')
  })

  it.each([
    'Turn off the lights',
    'Turn on dark mode',
    'Stop the music',
    'What notifications do I have on?',
    'I am getting too many messages',
    'Remind me to call Sam at 5',
    // A reminder of their own names reminders, and switches none.
    'set a reminder for 3:50 to start Claude',
    'Set a reminder to start the reminders slide',
    'add a reminder to stop at the store',
    'reminder at 9 to turn on the projector',
    'Send Sarah a message',
    'Turn off messages and turn on announcements',
  ])('"%s" is not one', (text) => {
    expect(notificationAsked(text)).toBeNull()
  })

  it('"news" is not "newsletter"', () => {
    expect(notificationAsked('turn off the newsletter notifications')?.subjects).toEqual([])
  })
})

describe('pushIsOn', () => {
  it('reads as Settings shows it', () => {
    expect(pushIsOn({ newMessage: { push: true } }, 'newMessage', false)).toBe(true)
    expect(pushIsOn({}, 'newMessage', false)).toBe(false)
    // A public row unset reads on — but a stream alert reads off.
    expect(pushIsOn({}, 'publicAnnouncement', true)).toBe(true)
    expect(pushIsOn({}, 'livestream', true)).toBe(false)
  })
})

describe('switchesSaid', () => {
  it('names them as Settings does', () => {
    expect(switchesSaid(['newMessage', 'announcement'])).toBe('“New message” and “Announcement”')
  })
})

describe('notificationAsked: all but some', () => {
  const keepOf = (text: string, who: UserProfile) => {
    const ask = notificationAsked(text)
    const p = ask && notificationPlan(ask, notificationKeysFor(who))
    return p && (p.kind === 'sure' || p.kind === 'likely') ? p.keep : undefined
  }

  it('turns off all of them but those named, which are kept on', () => {
    const visible = notificationKeysFor(pub)
    expect(plan('turn off all notifications except for elim store sales', pub)).toBe(
      `off sure:${visible.filter((k) => k !== 'storeSale').join(',')}`
    )
    expect(keepOf('turn off all notifications except for elim store sales', pub)).toEqual([
      'storeSale',
    ])
    expect(keepOf('turn off everything except store sales', pub)).toEqual(['storeSale'])
    expect(plan('Turn off all notifications except messages')).toBe(
      `off sure:${notificationKeysFor(member)
        .filter((k) => k !== 'newMessage')
        .join(',')}`
    )
    expect(keepOf('Turn off all notifications but not announcements and messages', member)).toEqual(
      notificationKeysFor(member).filter((k) => ['announcement', 'newMessage'].includes(k))
    )
  })

  it('takes "how do I" as asking for it', () => {
    expect(plan('how do I turn off announcement notifications', pub)).toBe(
      'off sure:publicAnnouncement'
    )
  })

  it('leaves an exception it can’t name', () => {
    expect(notificationAsked('turn off all notifications except the ones I like')).toBeNull()
  })
})
