import { describe, expect, it } from 'vitest'
import { ADMINS, EVERYONE } from '../../functions/src/eventPrivate'
import { seesTask, setListSeenBy, taskSeenBy } from '../../functions/src/recordAccess'

describe('who may read a task', () => {
  it('is those it is assigned to, its lead, and every admin', () => {
    expect(taskSeenBy({ assignees: ['sam', 7, ''], lead: 'lee', owner: null })).toEqual([
      '7',
      'lee',
      'sam',
      ADMINS,
    ])
    expect(taskSeenBy({ assignees: [] })).toEqual([ADMINS])
  })

  it('is, for a reimbursement’s, whoever asked and the Accountant alone', () => {
    const t = { assignees: ['acct'], lead: 'acct', owner: 'asker', taskType: 'reimbursement' }
    expect(taskSeenBy(t)).toEqual(['acct', 'asker'])
    expect(seesTask(t, { uid: 'asker', admin: false })).toBe(true)
    expect(seesTask(t, { uid: 'boss', admin: true })).toBe(false)
  })

  it('leaves a member someone else’s; an admin sees it', () => {
    const t = { assignees: ['sam'], taskType: 'kaizen_action' }
    expect(seesTask(t, { uid: 'sam', admin: false })).toBe(true)
    expect(seesTask(t, { uid: 'ann', admin: false })).toBe(false)
    expect(seesTask(t, { uid: 'boss', admin: true })).toBe(true)
  })
})

describe('who may read a set list', () => {
  it('is everyone who reads set lists, for none or a public event', () => {
    expect(setListSeenBy({ createdBy: 'lee' }, null)).toEqual([EVERYONE])
    expect(setListSeenBy({ eventTemplateId: 4, createdBy: 'lee' }, [EVERYONE])).toEqual([EVERYONE])
  })

  it('is, for one that isn’t, those who may see the event and whoever made it', () => {
    expect(setListSeenBy({ eventTemplateId: 'e', createdBy: 'lee' }, ['sam', ADMINS])).toEqual([
      'lee',
      'sam',
      ADMINS,
    ])
    // A draft's: its maker's, and the set list's.
    expect(setListSeenBy({ eventTemplateId: 'e', createdBy: 'lee' }, ['boss'])).toEqual([
      'boss',
      'lee',
    ])
    // Its event not found: the admins, and whoever made it.
    expect(setListSeenBy({ eventTemplateId: 'gone', createdBy: 'lee' }, null)).toEqual([
      'lee',
      ADMINS,
    ])
  })
})
