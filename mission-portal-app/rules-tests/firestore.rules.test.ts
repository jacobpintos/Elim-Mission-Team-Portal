import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * These run against the Firestore emulator, so they exercise the deployed
 * rules rather than a model of them. That matters: a rules bug is invisible to
 * every other kind of test here — the client just gets an empty result or a
 * silent rejection, which is exactly how the non-admin message room bug hid.
 */
let env: RulesTestEnvironment

const ADMIN = 'admin-uid'
const MEMBER = 'member-uid'
const OUTSIDER = 'outsider-uid'

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mission-portal-rules-test',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => env?.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  // Seed roles and a room the rules will read back via get().
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', ADMIN), { roles: ['admin'], displayName: 'Admin' })
    await setDoc(doc(db, 'users', MEMBER), { roles: ['regular'], displayName: 'Member' })
    await setDoc(doc(db, 'users', OUTSIDER), { roles: ['regular'], displayName: 'Outsider' })
    await setDoc(doc(db, 'rooms', 'r1'), { name: 'Team', members: [MEMBER], reviewers: [] })
    await setDoc(doc(db, 'rooms', 'r1', 'messages', 'm1'), {
      uid: MEMBER,
      text: 'hello',
      ts: 1,
      readBy: [],
    })
  })
})

const as = (uid: string) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

describe('rooms', () => {
  it('lets a member read their own room', async () => {
    await assertSucceeds(getDoc(doc(as(MEMBER), 'rooms/r1')))
  })

  it('refuses a room to someone who is not a member', async () => {
    await assertFails(getDoc(doc(as(OUTSIDER), 'rooms/r1')))
  })

  it('lets an admin read any room', async () => {
    await assertSucceeds(getDoc(doc(as(ADMIN), 'rooms/r1')))
  })

  it('refuses rooms to signed-out users', async () => {
    await assertFails(getDoc(doc(anon(), 'rooms/r1')))
  })

  it('rejects an unfiltered room list for a non-admin', async () => {
    // This is the shape that broke the messages screen: a bare
    // collection('rooms') read is rejected outright rather than returning the
    // subset the user can see, so the list came back empty.
    await assertFails(getDocs(collection(as(MEMBER), 'rooms')))
  })

  it('only admins may create or delete rooms', async () => {
    await assertFails(
      setDoc(doc(as(MEMBER), 'rooms/r2'), { name: 'x', members: [], reviewers: [] })
    )
    await assertSucceeds(
      setDoc(doc(as(ADMIN), 'rooms/r2'), { name: 'x', members: [], reviewers: [] })
    )
  })

  it('lets a member flag their room for review but not rename it', async () => {
    await assertSucceeds(updateDoc(doc(as(MEMBER), 'rooms/r1'), { reviewers: [MEMBER] }))
    // Only reviewers/updatedAt are allowed through that carve-out.
    await assertFails(updateDoc(doc(as(MEMBER), 'rooms/r1'), { name: 'renamed' }))
  })

  it('does not let a non-member flag a room', async () => {
    await assertFails(updateDoc(doc(as(OUTSIDER), 'rooms/r1'), { reviewers: [OUTSIDER] }))
  })
})

describe('messages', () => {
  it('lets a room member read and post', async () => {
    await assertSucceeds(getDoc(doc(as(MEMBER), 'rooms/r1/messages/m1')))
    await assertSucceeds(
      setDoc(doc(as(MEMBER), 'rooms/r1/messages/m2'), { uid: MEMBER, text: 'hi', ts: 2 })
    )
  })

  it('keeps a non-member out of the messages', async () => {
    await assertFails(getDoc(doc(as(OUTSIDER), 'rooms/r1/messages/m1')))
    await assertFails(
      setDoc(doc(as(OUTSIDER), 'rooms/r1/messages/m2'), { uid: OUTSIDER, text: 'hi', ts: 2 })
    )
  })

  it('lets a member mark a message read but not edit its text', async () => {
    await assertSucceeds(updateDoc(doc(as(MEMBER), 'rooms/r1/messages/m1'), { readBy: [MEMBER] }))
    await assertFails(updateDoc(doc(as(MEMBER), 'rooms/r1/messages/m1'), { text: 'edited' }))
  })

  it('only admins may delete a message', async () => {
    // Moderation removes reported messages, so this has to hold.
    await assertFails(deleteDoc(doc(as(MEMBER), 'rooms/r1/messages/m1')))
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'rooms/r1/messages/m1')))
  })
})

describe('users', () => {
  it('lets a user read their own profile but not another', async () => {
    await assertSucceeds(getDoc(doc(as(MEMBER), 'users', MEMBER)))
    await assertFails(getDoc(doc(as(MEMBER), 'users', OUTSIDER)))
  })

  it('stops a user editing their own roles', async () => {
    // Self-promotion to admin is the one escalation that matters here.
    await assertFails(updateDoc(doc(as(MEMBER), 'users', MEMBER), { roles: ['admin'] }))
  })

  it('lets a user edit their own display name and blocked list', async () => {
    await assertSucceeds(updateDoc(doc(as(MEMBER), 'users', MEMBER), { displayName: 'New' }))
    await assertSucceeds(updateDoc(doc(as(MEMBER), 'users', MEMBER), { blockedUsers: [OUTSIDER] }))
  })

  it('lets an admin change roles', async () => {
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'users', MEMBER), { roles: ['worship'] }))
  })

  it('only admins may delete a user', async () => {
    await assertFails(deleteDoc(doc(as(MEMBER), 'users', MEMBER)))
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'users', MEMBER)))
  })
})

describe('contentReports — the moderation queue', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'contentReports', 'rep1'), {
        status: 'open',
        reportedBy: MEMBER,
      })
    })
  })

  it('is readable only by admins', async () => {
    await assertSucceeds(getDoc(doc(as(ADMIN), 'contentReports/rep1')))
    await assertFails(getDoc(doc(as(MEMBER), 'contentReports/rep1')))
  })

  it('cannot be written from a client at all', async () => {
    // Reports are created by a Cloud Function so the payload can be trusted.
    await assertFails(setDoc(doc(as(MEMBER), 'contentReports/rep2'), { status: 'open' }))
    await assertFails(setDoc(doc(as(ADMIN), 'contentReports/rep2'), { status: 'open' }))
  })

  it('lets an admin resolve a report but not rewrite its contents', async () => {
    await assertSucceeds(
      updateDoc(doc(as(ADMIN), 'contentReports/rep1'), { status: 'resolved', resolvedBy: ADMIN })
    )
    await assertFails(updateDoc(doc(as(ADMIN), 'contentReports/rep1'), { reportedBy: OUTSIDER }))
  })
})

describe('securityReports', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'securityReports', 's1'), { description: 'x' })
    })
  })

  it('lets any signed-in user file one', async () => {
    await assertSucceeds(setDoc(doc(as(MEMBER), 'securityReports/s2'), { description: 'y' }))
  })

  it('keeps filed reports away from ordinary members', async () => {
    // The reporter cannot read the queue back — only security and admins can.
    await assertFails(getDoc(doc(as(MEMBER), 'securityReports/s1')))
    await assertSucceeds(getDoc(doc(as(ADMIN), 'securityReports/s1')))
  })
})

describe('tasks', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tasks', 't1'), { title: 'Do', status: 'pending' })
    })
  })

  it('lets a member flip status but not retitle a task', async () => {
    await assertSucceeds(updateDoc(doc(as(MEMBER), 'tasks/t1'), { status: 'done' }))
    await assertFails(updateDoc(doc(as(MEMBER), 'tasks/t1'), { title: 'Changed' }))
  })

  it('lets an admin change anything', async () => {
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'tasks/t1'), { title: 'Changed' }))
  })
})

describe('events', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'events', 'e1'), { title: 'Practice' })
    })
  })

  it('is readable by any signed-in user and writable only by admins', async () => {
    await assertSucceeds(getDoc(doc(as(MEMBER), 'events/e1')))
    await assertFails(getDoc(doc(anon(), 'events/e1')))
    await assertFails(updateDoc(doc(as(MEMBER), 'events/e1'), { title: 'Hacked' }))
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'events/e1'), { title: 'Moved' }))
  })
})
