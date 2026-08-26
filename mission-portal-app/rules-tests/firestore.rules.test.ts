import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  documentId,
} from 'firebase/firestore'
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
const GUEST = 'guest-uid'
const WORSHIP = 'worship-uid'

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
    await setDoc(doc(db, 'users', GUEST), { roles: ['guest'], displayName: 'Guest' })
    await setDoc(doc(db, 'users', WORSHIP), { roles: ['worship'], displayName: 'Worship' })
    await setDoc(doc(db, 'setLists', 'sl1'), { title: 'Sunday' })
    await setDoc(doc(db, 'chordSheets', 'cs1'), { title: 'Song' })
    await setDoc(doc(db, 'inputList', 'main'), { rows: [] })
    await setDoc(doc(db, 'tasks', 'gt1'), { title: 'Do', status: 'pending' })
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

  it('refuses a member listing the whole collection', async () => {
    // The bug the directory exists for. A collection query is refused outright
    // when it could return a document the caller may not read — it is not
    // filtered down — so this is what every non-admin's name lookup hit, and
    // why members saw raw uids wherever a name belonged.
    await assertFails(getDocs(collection(as(MEMBER), 'users')))
    await assertSucceeds(getDocs(collection(as(ADMIN), 'users')))
  })
})

describe('publicProfiles — who is this uid?', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'publicProfiles', MEMBER), {
        uid: MEMBER,
        displayName: 'A Member',
      })
    })
  })

  it('lets any signed-in user read the whole directory', async () => {
    // Both the single document and the collection query, since it is the
    // query that the store actually runs and the query that was refused.
    await assertSucceeds(getDoc(doc(as(OUTSIDER), 'publicProfiles', MEMBER)))
    await assertSucceeds(getDocs(collection(as(OUTSIDER), 'publicProfiles')))
    await assertSucceeds(getDocs(collection(as(GUEST), 'publicProfiles')))
  })

  it('refuses an unauthenticated read', async () => {
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'publicProfiles')))
  })

  it('lets nobody write it, not even an admin or the named user', async () => {
    // Only mirrorPublicProfile writes this, with Admin SDK privileges, which
    // these rules do not apply to. A client that could write here would rename
    // anyone in everyone else's copy of the directory.
    await assertFails(setDoc(doc(as(MEMBER), 'publicProfiles', MEMBER), { displayName: 'Impostor' }))
    await assertFails(setDoc(doc(as(ADMIN), 'publicProfiles', MEMBER), { displayName: 'Impostor' }))
    await assertFails(deleteDoc(doc(as(ADMIN), 'publicProfiles', MEMBER)))
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

  it('lets an admin count what is still open, and nobody else', async () => {
    // The badge on the Moderation tab runs exactly this query. If the rules
    // refused it the count would silently read zero and an unattended queue
    // would look like an empty one.
    const openOnly = (db: ReturnType<typeof as>) =>
      getDocs(query(collection(db, 'contentReports'), where('status', '==', 'open')))

    await assertSucceeds(openOnly(as(ADMIN)))
    await assertFails(openOnly(as(MEMBER)))
  })

  it('counts only the reports still waiting', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'contentReports', 'rep2'), { status: 'actioned', reportedBy: MEMBER })
      await setDoc(doc(db, 'contentReports', 'rep3'), { status: 'dismissed', reportedBy: MEMBER })
      await setDoc(doc(db, 'contentReports', 'rep4'), { status: 'open', reportedBy: MEMBER })
    })

    const snap = await getDocs(
      query(collection(as(ADMIN), 'contentReports'), where('status', '==', 'open'))
    )

    expect(snap.docs.map((d) => d.id).sort()).toEqual(['rep1', 'rep4'])
  })
})

describe('what a deleted event takes with it', () => {
  /**
   * onEventDeleted removes food sign-ups and availability responses along with
   * the event. Neither points at the event with a field — both are named
   * `${eventId}_${date}` — so they are found by a range over the document id,
   * which is Firestore's nearest thing to a prefix match.
   */
  const HIGH = String.fromCharCode(0xf8ff)

  const keyed = (db: ReturnType<typeof as>, name: string, eventId: string) =>
    getDocs(
      query(
        collection(db, name),
        where(documentId(), '>=', `${eventId}_`),
        where(documentId(), '<', `${eventId}_${HIGH}`)
      )
    )

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      for (const id of ['4_2026-01-01', '4_2026-02-02', '40_2026-01-01', '41_2026-03-03', '4']) {
        await setDoc(doc(db, 'foodSignups', id), { signups: {} })
        await setDoc(doc(db, 'avail', id), { responses: {} })
      }
    })
  })

  it('finds every occurrence of the event', async () => {
    const snap = await keyed(as(ADMIN), 'foodSignups', '4')

    expect(snap.docs.map((d) => d.id).sort()).toEqual(['4_2026-01-01', '4_2026-02-02'])
  })

  it('does not reach a neighbouring event whose id shares a prefix', async () => {
    // The separator is what makes this safe: "40_..." sorts below "4_" because
    // '0' is below '_', so event 40 cannot be swept up by event 4's delete.
    const snap = await keyed(as(ADMIN), 'foodSignups', '4')
    const ids = snap.docs.map((d) => d.id)

    expect(ids).not.toContain('40_2026-01-01')
    expect(ids).not.toContain('41_2026-03-03')
    expect(ids).not.toContain('4')
  })

  it('works the same for availability', async () => {
    const snap = await keyed(as(ADMIN), 'avail', '4')

    expect(snap.docs.map((d) => d.id).sort()).toEqual(['4_2026-01-01', '4_2026-02-02'])
  })

  it('finds nothing for an event that never had any', async () => {
    const snap = await keyed(as(ADMIN), 'foodSignups', '999')

    expect(snap.docs).toHaveLength(0)
  })
})

describe('flagged conversations — the other half of the queue', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'rooms', 'never'), { name: 'never flagged', members: [MEMBER] })
      await setDoc(doc(db, 'rooms', 'cleared'), {
        name: 'flag cleared',
        members: [MEMBER],
        reviewers: [],
      })
      await setDoc(doc(db, 'rooms', 'flagged'), {
        name: 'flagged',
        members: [MEMBER],
        reviewers: [ADMIN],
      })
    })
  })

  const flaggedOnly = (db: ReturnType<typeof as>) =>
    getDocs(query(collection(db, 'rooms'), where('reviewers', '!=', [])))

  it('lets an admin ask which rooms are flagged', async () => {
    await assertSucceeds(flaggedOnly(as(ADMIN)))
  })

  it('does not let an ordinary member run it', async () => {
    // An unfiltered rooms query is refused for anyone who is not an admin,
    // which is why the badge only ever subscribes for one.
    await assertFails(flaggedOnly(as(MEMBER)))
  })

  it('finds flagged rooms and skips both kinds of unflagged', async () => {
    // "Non-empty array" cannot be asked directly, so it is asked as "not
    // empty". That has to skip a room nobody ever flagged — where the field
    // is absent entirely — as well as one whose flag was cleared to [].
    const snap = await flaggedOnly(as(ADMIN))

    expect(snap.docs.map((d) => d.id)).toEqual(['flagged'])
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

describe('guests', () => {
  it('reads set lists and chord sheets', () => {
    // The worship tab they were given would render nothing without this.
    return Promise.all([
      assertSucceeds(getDoc(doc(as(GUEST), 'setLists/sl1'))),
      assertSucceeds(getDoc(doc(as(GUEST), 'chordSheets/cs1'))),
    ])
  })

  it('cannot write set lists or chord sheets', async () => {
    await assertFails(updateDoc(doc(as(GUEST), 'setLists/sl1'), { title: 'Hijacked' }))
    await assertFails(updateDoc(doc(as(GUEST), 'chordSheets/cs1'), { title: 'Hijacked' }))
    await assertFails(setDoc(doc(as(GUEST), 'setLists/sl2'), { title: 'New' }))
  })

  it('cannot reach the input list', async () => {
    // Stage plumbing is not a visitor's business, in the rules as well as the UI.
    await assertFails(getDoc(doc(as(GUEST), 'inputList/main')))
    await assertFails(updateDoc(doc(as(GUEST), 'inputList/main'), { rows: [] }))
  })

  it('cannot move a task status, which members can', async () => {
    await assertFails(updateDoc(doc(as(GUEST), 'tasks/gt1'), { status: 'done' }))
    await assertSucceeds(updateDoc(doc(as(MEMBER), 'tasks/gt1'), { status: 'done' }))
  })

  it('cannot create or edit events', async () => {
    await assertFails(setDoc(doc(as(GUEST), 'events/e9'), { title: 'Mine' }))
  })

  it('cannot promote itself out of being a guest', async () => {
    await assertFails(updateDoc(doc(as(GUEST), 'users', GUEST), { roles: ['admin'] }))
  })

  it('can still post in a room it was added to', async () => {
    // Guests are explicitly allowed to send messages.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'rooms', 'gr1'), {
        name: 'Trip',
        members: [GUEST],
        reviewers: [],
      })
    })

    await assertSucceeds(getDoc(doc(as(GUEST), 'rooms/gr1')))
    await assertSucceeds(
      setDoc(doc(as(GUEST), 'rooms/gr1/messages/gm1'), { uid: GUEST, text: 'hi', ts: 1 })
    )
  })

  it('still cannot reach a room it was not added to', async () => {
    await assertFails(getDoc(doc(as(GUEST), 'rooms/r1')))
  })

  it('does not shut worship users out of what it can read', async () => {
    // The guest clause is additive; it must not narrow anyone else.
    await assertSucceeds(getDoc(doc(as(WORSHIP), 'setLists/sl1')))
    await assertSucceeds(updateDoc(doc(as(WORSHIP), 'setLists/sl1'), { title: 'Edited' }))
    await assertSucceeds(getDoc(doc(as(WORSHIP), 'inputList/main')))
  })
})

describe('Facebook Page sync', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'fbPagePosts', 'page1'), { pageName: 'Elim' })
      await setDoc(doc(db, 'fbPagePosts', 'page1', 'posts', 'p1'), {
        message: 'Hello',
        createdTime: '2026-08-01T10:00:00+0000',
        likesCount: 3,
      })
      await setDoc(doc(db, 'fbConnections', 'page1'), {
        pageId: 'page1',
        accessToken: 'super-secret-page-token',
      })
      await setDoc(doc(db, 'fbConnectInvites', 'inv1'), { createdBy: ADMIN })
    })
  })

  it('lets any signed-in member read synced posts', async () => {
    await assertSucceeds(getDoc(doc(as(MEMBER), 'fbPagePosts/page1/posts/p1')))
    await assertSucceeds(getDocs(collection(as(GUEST), 'fbPagePosts/page1/posts')))
  })

  it('shuts signed-out visitors out of the feed', async () => {
    await assertFails(getDoc(doc(anon(), 'fbPagePosts/page1/posts/p1')))
  })

  it('refuses client writes to posts, admin included', async () => {
    // The collection mirrors someone else's content; a client write could only
    // ever put it out of step with Facebook.
    await assertFails(setDoc(doc(as(ADMIN), 'fbPagePosts/page1/posts/p2'), { message: 'Forged' }))
    await assertFails(updateDoc(doc(as(ADMIN), 'fbPagePosts/page1/posts/p1'), { likesCount: 999 }))
    await assertFails(deleteDoc(doc(as(MEMBER), 'fbPagePosts/page1/posts/p1')))
  })

  it('keeps Page access tokens unreachable from every client', async () => {
    // The whole point of storing tokens server-side: an admin account being
    // compromised must not hand over a credential that can act as the Page.
    await assertFails(getDoc(doc(as(ADMIN), 'fbConnections/page1')))
    await assertFails(getDoc(doc(as(MEMBER), 'fbConnections/page1')))
    await assertFails(getDoc(doc(anon(), 'fbConnections/page1')))
    await assertFails(setDoc(doc(as(ADMIN), 'fbConnections/page2'), { accessToken: 'x' }))
  })

  it('keeps connect invitations unreadable, so a link cannot be lifted', async () => {
    await assertFails(getDoc(doc(as(ADMIN), 'fbConnectInvites/inv1')))
    await assertFails(getDoc(doc(as(MEMBER), 'fbConnectInvites/inv1')))
    await assertFails(getDoc(doc(as(ADMIN), 'fbConnectInvites/inv1/pending/x')))
  })
})

describe('the owner account', () => {
  // Must match ownerUid() in firestore.rules. If these drift, the rules stop
  // protecting the account they name and these tests are how you find out.
  const OWNER = '0RUxDLC8QGQ6qBTLgBkoMSgYibJ2'

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      // The owner is an admin too — the protection has to single them out by
      // uid, not by role, or it would exclude every admin.
      await setDoc(doc(ctx.firestore(), 'users', OWNER), {
        roles: ['admin'],
        displayName: 'Owner',
      })
    })
  })

  it('refuses an admin editing the owner', async () => {
    await assertFails(updateDoc(doc(as(ADMIN), 'users', OWNER), { displayName: 'Seized' }))
  })

  it('refuses an admin stripping the owner of their roles', async () => {
    // The whole point: an owner demoted to nothing is an owner in name only.
    await assertFails(updateDoc(doc(as(ADMIN), 'users', OWNER), { roles: ['public'] }))
  })

  it('refuses an admin deleting the owner', async () => {
    await assertFails(deleteDoc(doc(as(ADMIN), 'users', OWNER)))
  })

  it('lets the owner edit their own record', async () => {
    // They hold admin, so the admin clause has to admit them for themselves or
    // configuring an owner locks that account out of its own profile.
    await assertSucceeds(updateDoc(doc(as(OWNER), 'users', OWNER), { displayName: 'Me' }))
    await assertSucceeds(updateDoc(doc(as(OWNER), 'users', OWNER), { roles: ['admin'] }))
  })

  it('leaves an admin their normal reach over everyone else', async () => {
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'users', MEMBER), { displayName: 'Renamed' }))
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'users', MEMBER)))
  })

  it("does not hand the owner's protection to ordinary users", async () => {
    await assertFails(updateDoc(doc(as(MEMBER), 'users', MEMBER), { roles: ['admin'] }))
    await assertFails(deleteDoc(doc(as(MEMBER), 'users', OUTSIDER)))
  })
})
