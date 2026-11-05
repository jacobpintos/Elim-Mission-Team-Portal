import { describe, expect, it } from 'vitest'
import { isAppLink, notifLink, screenFor } from '../../functions/src/push/notifLinks'
import { notifTarget, pushTarget } from './notifTarget'

describe('where a notification opens', () => {
  it('the link it was sent with', () => {
    expect(notifLink('newMessage', { link: '/(app)/messages/r1', roomId: 'r2' })).toBe(
      '/(app)/messages/r1'
    )
    expect(notifLink('kaizenSubmission', { link: '/(app)/issues/kaizen?id=k9' })).toBe(
      '/(app)/issues/kaizen?id=k9'
    )
  })

  it('else what it carries: an issue, an event, a task, a chat', () => {
    expect(notifLink('issueAssigned', { issueId: '12', taskId: 't3' })).toBe('/(app)/issues/12')
    expect(notifLink('eventReminder', { eventKey: 'ev1_2026-11-16' })).toBe(
      '/(app)/events/ev1_2026-11-16'
    )
    expect(notifLink('newAssignment', { taskId: 't 7' })).toBe('/(app)/assignments?taskId=t%207')
    expect(notifLink('taskComplete', { taskId: 42 })).toBe('/(app)/assignments?taskId=42')
    expect(notifLink('newMessage', { roomId: 'r1' })).toBe('/(app)/messages/r1')
  })

  it('else the screen its kind belongs to', () => {
    expect(notifLink('worshipSetAssigned', { eventTitle: 'Revival' })).toBe('/(app)/worship')
    expect(notifLink('securityReport', { message: 'x' })).toBe('/(app)/security')
    expect(notifLink('chatFlagged', { roomId: 'r1' })).toBe('/(app)/messages/moderation')
    expect(notifLink('eventRemoved', { eventTitle: 'Revival' })).toBe('/(app)/events')
    expect(notifLink('somethingNew', {})).toBe('/(app)/dashboard')
  })

  it('never another site, or anything that isn’t a path', () => {
    for (const link of ['https://evil.test', '//evil.test/x', 'javascript:alert(1)', '/a b', 4])
      expect(isAppLink(link), String(link)).toBe(false)
    expect(notifLink('newAssignment', { link: 'https://evil.test', taskId: 't1' })).toBe(
      '/(app)/assignments?taskId=t1'
    )
  })

  it('in the app’s list: its link, or for one from before links were kept, its screen', () => {
    expect(notifTarget({ type: 'eventJoin', link: '/(app)/events/e1_2026-11-16' })).toBe(
      '/(app)/events/e1_2026-11-16'
    )
    expect(notifTarget({ type: 'kaizenSubmission' })).toBe('/(app)/issues/kaizen')
    expect(notifTarget({ type: 'newMessage', link: '' })).toBe('/(app)/messages')
    expect(screenFor('storeSale')).toBe('/(app)/store')
  })

  it('an event’s notice that names no event: the Events tab, told what it said', () => {
    expect(notifTarget({ type: 'eventJoin', msg: "You've been added to Revive Me" })).toBe(
      `/(app)/events?about=${encodeURIComponent("You've been added to Revive Me")}`
    )
    expect(notifTarget({ type: 'eventJoin', link: '/(app)/events', msg: 'Added to Revive' })).toBe(
      '/(app)/events?about=Added%20to%20Revive'
    )
    expect(notifTarget({ type: 'eventJoin' })).toBe('/(app)/events')
    // A push: the title it carries, else what it said.
    expect(pushTarget('/(app)/events', { eventTitle: 'Revive Me' })).toBe(
      '/(app)/events?about=Revive%20Me'
    )
    expect(pushTarget('/(app)/events', {}, 'Added to Revive Me')).toBe(
      '/(app)/events?about=Added%20to%20Revive%20Me'
    )
    expect(pushTarget('/(app)/events/e1_2026-11-16', { eventTitle: 'Revive Me' })).toBe(
      '/(app)/events/e1_2026-11-16'
    )
  })
})
