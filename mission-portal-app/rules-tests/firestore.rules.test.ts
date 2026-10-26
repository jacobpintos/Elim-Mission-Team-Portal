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
  deleteField,
  runTransaction,
  FieldPath,
  collection,
  getDocs,
  query,
  where,
  documentId,
  serverTimestamp,
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
    await setDoc(doc(db, 'tasks', 'gt1'), {
      title: 'Do',
      status: 'pending',
      assignees: [MEMBER, GUEST],
    })
    await setDoc(doc(db, 'rooms', 'r1'), { name: 'Team', members: [MEMBER], reviewers: [] })
    await setDoc(doc(db, 'rooms', 'r1', 'messages', 'm1'), {
      uid: MEMBER,
      text: 'hello',
      ts: 1,
      readBy: [],
    })
    // One live card and one that has already run out, so the listing tests
    // below cover a collection holding both.
    await setDoc(doc(db, 'livestreams', 'live1'), {
      title: 'Sunday Service',
      youtubeUrl: 'https://www.youtube.com/live/4xzDTAGJ1bY',
      createdAt: Date.now(),
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    })
    // MEMBER asked; WORSHIP is the Accountant it went to.
    await setDoc(doc(db, 'reimbursements', 'rb1'), {
      id: 'rb1',
      submitterUid: MEMBER,
      accountantUid: WORSHIP,
      accountantName: 'Worship',
      total: 4520,
      status: 'submitted',
    })
    await setDoc(doc(db, 'meetingRequests', 'mr1'), {
      id: 'mr1',
      fromUid: OUTSIDER,
      fromName: 'Outsider',
      fromEmail: 'outsider@example.com',
      leaders: [WORSHIP],
      availability: 'Sunday afternoons',
      message: 'Would love to talk.',
      createdAt: Date.now(),
      status: 'open',
    })
    await setDoc(doc(db, 'livestreams', 'expired1'), {
      title: 'Last Sunday',
      youtubeUrl: 'https://www.youtube.com/live/4xzDTAGJ1bY',
      createdAt: Date.now() - 48 * 60 * 60 * 1000,
      expiresAt: Date.now() - 42 * 60 * 60 * 1000,
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

  it('lets no one make their own record while sign-up is off — an admin least of all', async () => {
    // A login made outside the app, with its public key, writing itself in.
    const newcomer = as('newcomer-uid')
    await assertFails(setDoc(doc(newcomer, 'users', 'newcomer-uid'), { roles: ['admin'] }))
    await assertFails(setDoc(doc(newcomer, 'users', 'newcomer-uid'), { roles: ['public'] }))
    await assertFails(getDoc(doc(newcomer, 'users', MEMBER)))
  })

  it('lets an admin give a login with no record one (Auth Audit)', async () => {
    await assertSucceeds(
      setDoc(doc(as(ADMIN), 'users', 'orphan-uid'), { roles: ['public'], displayName: 'Orphan' })
    )
    await assertFails(setDoc(doc(as(MEMBER), 'users', 'orphan-uid'), { roles: ['public'] }))
  })

  it('leaves male / female to admins', async () => {
    // It colours a person's carpool card and is set in user management.
    await assertFails(updateDoc(doc(as(MEMBER), 'users', MEMBER), { sex: 'female' }))
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'users', MEMBER), { sex: 'female' }))
    await assertFails(updateDoc(doc(as(MEMBER), 'users', MEMBER), { sex: deleteField() }))
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'users', MEMBER), { sex: deleteField() }))
    // Their other edits are unaffected by it being there.
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'users', MEMBER), { sex: 'male' }))
    await assertSucceeds(updateDoc(doc(as(MEMBER), 'users', MEMBER), { displayName: 'Still me' }))
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

describe('users, with sign-up turned back on', () => {
  // The same rules with signUpOpen() switched on, so what it allows is known
  // before the day it is.
  let open: RulesTestEnvironment
  const SWITCH = 'function signUpOpen() { return false; }'
  beforeAll(async () => {
    const rules = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8')
    expect(rules).toContain(SWITCH)
    open = await initializeTestEnvironment({
      projectId: 'mission-portal-rules-signup-open',
      firestore: {
        rules: rules.replace(SWITCH, 'function signUpOpen() { return true; }'),
        host: '127.0.0.1',
        port: 8080,
      },
    })
  })
  afterAll(async () => open?.cleanup())
  beforeEach(async () => open.clearFirestore())

  const self = () => open.authenticatedContext('newcomer-uid').firestore()
  const mine = () => doc(self(), 'users', 'newcomer-uid')

  it('lets a new login write its own record as public', async () => {
    await assertSucceeds(setDoc(mine(), { roles: ['public'], displayName: 'New' }))
  })

  it('refuses any other role, alone or alongside public', async () => {
    await assertFails(setDoc(mine(), { roles: ['admin'] }))
    await assertFails(setDoc(mine(), { roles: ['public', 'admin'] }))
    await assertFails(setDoc(mine(), { roles: ['regular'] }))
    await assertFails(setDoc(mine(), { displayName: 'No roles' }))
  })

  it('refuses what admins set, and anyone else’s record', async () => {
    await assertFails(setDoc(mine(), { roles: ['public'], sex: 'male' }))
    await assertFails(setDoc(mine(), { roles: ['public'], title: 'Lead Pastor' }))
    await assertFails(setDoc(doc(self(), 'users', 'someone-else'), { roles: ['public'] }))
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
    await assertFails(
      getDocs(collection(env.unauthenticatedContext().firestore(), 'publicProfiles'))
    )
  })

  it('lets nobody write it, not even an admin or the named user', async () => {
    // Only mirrorPublicProfile writes this, with Admin SDK privileges, which
    // these rules do not apply to. A client that could write here would rename
    // anyone in everyone else's copy of the directory.
    await assertFails(
      setDoc(doc(as(MEMBER), 'publicProfiles', MEMBER), { displayName: 'Impostor' })
    )
    await assertFails(setDoc(doc(as(ADMIN), 'publicProfiles', MEMBER), { displayName: 'Impostor' }))
    await assertFails(deleteDoc(doc(as(ADMIN), 'publicProfiles', MEMBER)))
  })
})

describe('textingListSignups — a request, not a subscription', () => {
  const REQ = { uid: MEMBER, displayName: 'A Member', phone: '+13195551234', status: 'pending' }

  it('lets someone ask to be added, for themselves only', async () => {
    await assertSucceeds(setDoc(doc(as(MEMBER), 'textingListSignups', MEMBER), REQ))
    await assertFails(
      setDoc(doc(as(MEMBER), 'textingListSignups', OUTSIDER), { ...REQ, uid: OUTSIDER })
    )
  })

  it('refuses a request that is not pending', async () => {
    // `status` is what the digest clears once the coordinator has the number.
    // A client that could write 'sent' would drop itself off the list without
    // anyone ever seeing it.
    await assertFails(
      setDoc(doc(as(MEMBER), 'textingListSignups', MEMBER), { ...REQ, status: 'sent' })
    )
  })

  it('does not let the subject read it back', async () => {
    // Nothing in the app shows it to them, and a phone number does not need a
    // second way out. The digest reads it with the Admin SDK, which these
    // rules do not apply to.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'textingListSignups', MEMBER), REQ)
    })
    await assertFails(getDoc(doc(as(MEMBER), 'textingListSignups', MEMBER)))
    await assertSucceeds(getDoc(doc(as(ADMIN), 'textingListSignups', MEMBER)))
  })

  it('keeps one number away from everybody else', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'textingListSignups', MEMBER), REQ)
    })
    await assertFails(getDoc(doc(as(OUTSIDER), 'textingListSignups', MEMBER)))
    await assertFails(getDocs(collection(as(OUTSIDER), 'textingListSignups')))
  })

  it('refuses an unauthenticated write', async () => {
    await assertFails(
      setDoc(doc(env.unauthenticatedContext().firestore(), 'textingListSignups', MEMBER), REQ)
    )
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

describe('foodSignups — one item at a time, never over someone', () => {
  const KEY = 'ev1_2026-10-16'
  const mine = { uid: MEMBER, displayName: 'Member' }
  const theirs = { uid: OUTSIDER, displayName: 'Outsider' }

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      // Item 0 already taken; 1 and 2 open.
      await setDoc(doc(ctx.firestore(), 'foodSignups', KEY), { signups: { '0': theirs } })
    })
  })

  it('lets a member take an open item, as the app does it', async () => {
    const db = as(MEMBER)
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const ref = doc(db, 'foodSignups', KEY)
        await tx.get(ref)
        tx.update(ref, new FieldPath('signups', '1'), mine)
      })
    )
  })

  it('lets a member start a sheet with their own sign-up', async () => {
    await assertSucceeds(
      setDoc(doc(as(MEMBER), 'foodSignups', 'ev1_2026-10-23'), { signups: { '2': mine } })
    )
  })

  it('lets a member give up an item', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'foodSignups', KEY), {
        signups: { '0': theirs, '1': mine },
      })
    })
    await assertSucceeds(
      updateDoc(doc(as(MEMBER), 'foodSignups', KEY), new FieldPath('signups', '1'), deleteField())
    )
  })

  it('still takes one sign-up written the old way, the whole sheet sent back', async () => {
    // An app not yet updated: the sheet as it is, plus one item.
    await assertSucceeds(
      setDoc(doc(as(MEMBER), 'foodSignups', KEY), { signups: { '0': theirs, '1': mine } })
    )
  })

  it('refuses writing over someone else’s sign-up for the same item', async () => {
    await assertFails(
      updateDoc(doc(as(MEMBER), 'foodSignups', KEY), new FieldPath('signups', '0'), mine)
    )
  })

  it('refuses an old copy of the sheet that would erase a sign-up made since', async () => {
    // A screen that last saw an empty sheet, writing it back with its own item.
    await assertFails(setDoc(doc(as(MEMBER), 'foodSignups', KEY), { signups: { '1': mine } }))
  })

  it('refuses taking two items in one write, or touching anything else', async () => {
    await assertFails(
      setDoc(doc(as(MEMBER), 'foodSignups', KEY), {
        signups: { '0': theirs, '1': mine, '2': mine },
      })
    )
    await assertFails(updateDoc(doc(as(MEMBER), 'foodSignups', KEY), { note: 'hi' }))
  })

  it('refuses a member deleting the sheet', async () => {
    await assertFails(deleteDoc(doc(as(MEMBER), 'foodSignups', KEY)))
  })

  it('lets an admin assign several at once, over anyone', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(ADMIN), 'foodSignups', KEY),
        { signups: { '0': mine, '1': theirs, '2': mine } },
        { merge: true }
      )
    )
  })

  it('refuses a guest, who is not asked to bring food', async () => {
    await assertFails(
      updateDoc(doc(as(GUEST), 'foodSignups', KEY), new FieldPath('signups', '1'), {
        uid: GUEST,
        displayName: 'Guest',
      })
    )
  })
})

describe('carpool — arranged by admins, read by everyone on it', () => {
  const KEY = 'ev1_2026-10-16'
  const cars = { cars: [{ id: 'c1', driver: MEMBER, riders: [OUTSIDER] }] }

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'carpool', KEY), cars)
    })
  })

  it('lets a member read the cars', async () => {
    await assertSucceeds(getDoc(doc(as(MEMBER), 'carpool', KEY)))
  })

  it('lets an admin arrange them', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'carpool', KEY), { cars: [] }))
    await assertSucceeds(setDoc(doc(as(ADMIN), 'carpool', 'ev1_2026-10-23'), cars))
  })

  it('refuses a member changing them, or starting a date’s cars', async () => {
    await assertFails(setDoc(doc(as(MEMBER), 'carpool', KEY), { cars: [] }))
    await assertFails(setDoc(doc(as(MEMBER), 'carpool', 'ev1_2026-10-23'), cars))
    await assertFails(deleteDoc(doc(as(MEMBER), 'carpool', KEY)))
  })

  it('refuses a guest, and anyone signed out', async () => {
    await assertFails(setDoc(doc(as(GUEST), 'carpool', KEY), { cars: [] }))
    await assertFails(getDoc(doc(anon(), 'carpool', KEY)))
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
      const db = ctx.firestore()
      await setDoc(doc(db, 'tasks', 't1'), { title: 'Do', status: 'pending', assignees: [MEMBER] })
      await setDoc(doc(db, 'tasks', 'rt1'), {
        title: 'Reimbursement',
        status: 'pending',
        assignees: [WORSHIP],
        owner: MEMBER,
        taskType: 'reimbursement',
      })
    })
  })

  it('lets an assignee flip status but not retitle a task', async () => {
    await assertSucceeds(updateDoc(doc(as(MEMBER), 'tasks/t1'), { status: 'done' }))
    await assertFails(updateDoc(doc(as(MEMBER), 'tasks/t1'), { title: 'Changed' }))
  })

  it('lets a member mark a task done as the app does, with when it was done', async () => {
    // tasksStore.setStatus writes doneAt with 'done': cleanup reads it.
    await assertSucceeds(
      updateDoc(doc(as(MEMBER), 'tasks/t1'), {
        status: 'done',
        doneAt: serverTimestamp(),
        _updatedAt: serverTimestamp(),
      })
    )
  })

  it("refuses a member moving a task that isn't theirs", async () => {
    // It used to be allowed for any member, on any task.
    await assertFails(updateDoc(doc(as(OUTSIDER), 'tasks/t1'), { status: 'done' }))
  })

  it('lets an assignee say they are behind, with when they expect to finish', async () => {
    // What the update sheet on Assignments writes.
    await assertSucceeds(
      updateDoc(doc(as(MEMBER), 'tasks/t1'), {
        status: 'behind',
        projectedDate: '2026-11-01',
        _updatedAt: serverTimestamp(),
      })
    )
  })

  it("refuses moving a reimbursement's task directly, even for its assignee or owner", async () => {
    // The callables move it, along with the request and a notification.
    await assertFails(updateDoc(doc(as(WORSHIP), 'tasks/rt1'), { status: 'done' }))
    await assertFails(updateDoc(doc(as(MEMBER), 'tasks/rt1'), { status: 'done' }))
  })

  it('lets only an admin create or delete a task', async () => {
    await assertFails(
      setDoc(doc(as(MEMBER), 'tasks/new1'), {
        title: 'Mine',
        status: 'pending',
        assignees: [MEMBER],
      })
    )
    await assertFails(deleteDoc(doc(as(MEMBER), 'tasks/t1')))
    await assertSucceeds(
      setDoc(doc(as(ADMIN), 'tasks/new1'), {
        title: 'Theirs',
        status: 'pending',
        assignees: [MEMBER],
      })
    )
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'tasks/t1')))
  })

  it('lets an admin change anything', async () => {
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'tasks/t1'), { title: 'Changed' }))
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'tasks/rt1'), { status: 'done' }))
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

describe('chord sheet notes', () => {
  // Private to whoever wrote them — admins included — and guests may keep
  // their own like anyone who can open a sheet.
  it('are read and written by their writer', async () => {
    await assertSucceeds(
      setDoc(doc(as(WORSHIP), 'sheetNotes', WORSHIP), { cs1: { song: 'Capo 2' } }, { merge: true })
    )
    await assertSucceeds(getDoc(doc(as(WORSHIP), 'sheetNotes', WORSHIP)))
    await assertSucceeds(
      setDoc(doc(as(GUEST), 'sheetNotes', GUEST), { cs1: { sections: { s1: 'soft' } } })
    )
    await assertSucceeds(deleteDoc(doc(as(WORSHIP), 'sheetNotes', WORSHIP)))
  })

  it('are read and written by no one else, admins included', async () => {
    await assertFails(getDoc(doc(as(ADMIN), 'sheetNotes', WORSHIP)))
    await assertFails(getDoc(doc(as(MEMBER), 'sheetNotes', WORSHIP)))
    await assertFails(setDoc(doc(as(ADMIN), 'sheetNotes', WORSHIP), { cs1: { song: 'x' } }))
    await assertFails(setDoc(doc(as(GUEST), 'sheetNotes', WORSHIP), { cs1: { song: 'x' } }))
  })
})

describe('notes on days of their calendar', () => {
  const note = { n1: { date: '2026-10-16', text: 'Bring the projector', at: 1 } }

  it('are kept by anyone but a public account, and read only by them', async () => {
    await assertSucceeds(setDoc(doc(as(MEMBER), 'dateNotes', MEMBER), note, { merge: true }))
    await assertSucceeds(getDoc(doc(as(MEMBER), 'dateNotes', MEMBER)))
    await assertSucceeds(setDoc(doc(as(GUEST), 'dateNotes', GUEST), note))
    await assertSucceeds(
      setDoc(doc(as(MEMBER), 'dateNotes', MEMBER), { n1: deleteField() }, { merge: true })
    )
    await assertSucceeds(deleteDoc(doc(as(MEMBER), 'dateNotes', MEMBER)))
  })

  it('are nobody else’s to read or write — an admin’s included', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'dateNotes', MEMBER), note)
    })
    await assertFails(getDoc(doc(as(ADMIN), 'dateNotes', MEMBER)))
    await assertFails(getDoc(doc(as(OUTSIDER), 'dateNotes', MEMBER)))
    await assertFails(setDoc(doc(as(ADMIN), 'dateNotes', MEMBER), note))
    await assertFails(deleteDoc(doc(as(OUTSIDER), 'dateNotes', MEMBER)))
  })

  it('are not for a public account', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'public-uid'), { roles: ['public'] })
    })
    await assertFails(setDoc(doc(as('public-uid'), 'dateNotes', 'public-uid'), note))
  })

  it('are a thousand at most', async () => {
    const many = Object.fromEntries(
      Array.from({ length: 1001 }, (_, i) => [`n${i}`, { date: '2026-10-16', text: 'x', at: i }])
    )
    await assertFails(setDoc(doc(as(MEMBER), 'dateNotes', MEMBER), many))
  })
})

describe('birthdays and anniversaries on the calendar', () => {
  const one = { o1: { kind: 'birthday', people: [{ name: 'Whitney' }], month: 11, day: 5 } }

  it('are kept by admins', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'occasions', 'all'), one, { merge: true }))
    await assertSucceeds(
      setDoc(doc(as(ADMIN), 'occasions', 'all'), { o1: deleteField() }, { merge: true })
    )
    await assertFails(setDoc(doc(as(MEMBER), 'occasions', 'all'), one, { merge: true }))
    await assertFails(setDoc(doc(as(WORSHIP), 'occasions', 'all'), one, { merge: true }))
  })

  it('are seen by every account but a guest’s or a public one', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'occasions', 'all'), one)
      await setDoc(doc(ctx.firestore(), 'users', 'public-uid'), { roles: ['public'] })
    })
    await assertSucceeds(getDoc(doc(as(MEMBER), 'occasions', 'all')))
    await assertSucceeds(getDoc(doc(as(WORSHIP), 'occasions', 'all')))
    await assertSucceeds(getDoc(doc(as(ADMIN), 'occasions', 'all')))
    await assertFails(getDoc(doc(as(GUEST), 'occasions', 'all')))
    await assertFails(getDoc(doc(as('public-uid'), 'occasions', 'all')))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'occasions', 'all')))
  })
})

describe('questions asked of Miriam', () => {
  const asked = (extra: Record<string, unknown> = {}) => ({
    text: 'when is youth night?',
    audience: 'member',
    at: serverTimestamp(),
    ...extra,
  })

  it('are written by anyone signed in: the words and the kind of account, never who', async () => {
    await assertSucceeds(setDoc(doc(as(MEMBER), 'miriamAsked', 'q1'), asked()))
    await assertFails(setDoc(doc(as(MEMBER), 'miriamAsked', 'q2'), asked({ uid: MEMBER })))
    await assertFails(setDoc(doc(as(MEMBER), 'miriamAsked', 'q3'), asked({ audience: 'admin' })))
    await assertFails(
      setDoc(doc(as(MEMBER), 'miriamAsked', 'q4'), asked({ text: 'x'.repeat(201) }))
    )
    await assertFails(setDoc(doc(as(MEMBER), 'miriamAsked', 'q5'), asked({ at: 1 })))
    await assertFails(
      setDoc(doc(env.unauthenticatedContext().firestore(), 'miriamAsked', 'q6'), asked())
    )
  })

  it('are read, changed or taken away by no device — an admin’s included', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'miriamAsked', 'q1'), {
        text: 'hi?',
        audience: 'member',
        at: 1,
      })
    })
    await assertFails(getDoc(doc(as(ADMIN), 'miriamAsked', 'q1')))
    await assertFails(updateDoc(doc(as(ADMIN), 'miriamAsked', 'q1'), { text: 'changed?' }))
    await assertFails(deleteDoc(doc(as(ADMIN), 'miriamAsked', 'q1')))
  })
})

describe('Miriam’s records of how she is doing', () => {
  const turn = (extra: Record<string, unknown> = {}) => ({
    kind: 'turn',
    tier: 'phone',
    outcome: 'handled',
    at: serverTimestamp(),
    ...extra,
  })
  const card = (extra: Record<string, unknown> = {}) => ({
    kind: 'card',
    outcome: 'confirmed',
    at: serverTimestamp(),
    ...extra,
  })

  it('are written by anyone signed in: that the phone handled one, or a card’s answer — never what or who', async () => {
    await assertSucceeds(setDoc(doc(as(MEMBER), 'miriamEvents', 'e1'), turn()))
    await assertSucceeds(
      setDoc(doc(as(GUEST), 'miriamEvents', 'e2'), card({ outcome: 'cancelled' }))
    )
    // Only the phone's own: the server's are written by the server.
    await assertFails(setDoc(doc(as(MEMBER), 'miriamEvents', 'e3'), turn({ tier: 'claude' })))
    await assertFails(setDoc(doc(as(MEMBER), 'miriamEvents', 'e4'), turn({ outcome: 'answered' })))
    await assertFails(
      setDoc(doc(as(MEMBER), 'miriamEvents', 'e5'), {
        kind: 'food',
        would: 'confirm',
        at: serverTimestamp(),
      })
    )
    // Never the words, nor who.
    await assertFails(
      setDoc(doc(as(MEMBER), 'miriamEvents', 'e6'), turn({ text: 'when is youth night' }))
    )
    await assertFails(setDoc(doc(as(MEMBER), 'miriamEvents', 'e7'), card({ uid: MEMBER })))
    await assertFails(setDoc(doc(as(MEMBER), 'miriamEvents', 'e8'), card({ outcome: 'maybe' })))
    await assertFails(setDoc(doc(as(MEMBER), 'miriamEvents', 'e9'), turn({ at: 1 })))
    await assertFails(
      setDoc(doc(env.unauthenticatedContext().firestore(), 'miriamEvents', 'e10'), turn())
    )
  })

  it('are read, changed or taken away by no device — an admin’s included', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'miriamEvents', 'e1'), {
        kind: 'turn',
        tier: 'own',
        outcome: 'answered',
        at: 1,
      })
    })
    await assertFails(getDoc(doc(as(ADMIN), 'miriamEvents', 'e1')))
    await assertFails(updateDoc(doc(as(ADMIN), 'miriamEvents', 'e1'), { tier: 'phone' }))
    await assertFails(deleteDoc(doc(as(ADMIN), 'miriamEvents', 'e1')))
  })
})

describe('usage counts — the server’s alone', () => {
  it('are read, written or taken away by no device — an admin’s included, or their own', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'usageLimits', `askMiriam_${MEMBER}`), {
        calls: [1],
        until: 2,
      })
    })
    await assertFails(getDoc(doc(as(MEMBER), 'usageLimits', `askMiriam_${MEMBER}`)))
    await assertFails(getDoc(doc(as(ADMIN), 'usageLimits', `askMiriam_${MEMBER}`)))
    // Their own count put back to nothing, to be allowed more.
    await assertFails(
      setDoc(doc(as(MEMBER), 'usageLimits', `askMiriam_${MEMBER}`), { calls: [], until: 0 })
    )
    await assertFails(deleteDoc(doc(as(MEMBER), 'usageLimits', `askMiriam_${MEMBER}`)))
    await assertFails(getDocs(collection(as(ADMIN), 'usageLimits')))
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
    await assertFails(setDoc(doc(as(GUEST), 'chordSheets/cs2'), { title: 'New' }))
    await assertFails(deleteDoc(doc(as(GUEST), 'chordSheets/cs1')))
    await assertFails(deleteDoc(doc(as(GUEST), 'setLists/sl1')))
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

describe('livestreams', () => {
  it('lets any signed-in user read the live card', async () => {
    await assertSucceeds(getDoc(doc(as(MEMBER), 'livestreams/live1')))
    await assertSucceeds(getDoc(doc(as(GUEST), 'livestreams/live1')))
  })

  it('refuses the live card to signed-out users', async () => {
    await assertFails(getDoc(doc(anon(), 'livestreams/live1')))
  })

  it('serves a bare collection read even with an expired card present', async () => {
    // The regression this exists for: narrowing the read rule by expiresAt
    // reads naturally and breaks the app outright. Rules are not filters, so a
    // rule touching resource.data is checked against every document the query
    // could return — one stale card and the whole listener is refused, which
    // is how the box would have gone dark rather than skipping the old card.
    const snap = await assertSucceeds(getDocs(collection(as(MEMBER), 'livestreams')))
    expect(snap.docs.map((d) => d.id).sort()).toEqual(['expired1', 'live1'])
  })

  it('lets an admin post and take down a card', async () => {
    await assertSucceeds(
      setDoc(doc(as(ADMIN), 'livestreams/new1'), {
        title: 'Worship Night',
        youtubeUrl: 'https://youtu.be/4xzDTAGJ1bY',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
      })
    )
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'livestreams/live1')))
  })

  it('refuses a card posted by anyone but an admin', async () => {
    await assertFails(
      setDoc(doc(as(MEMBER), 'livestreams/nope'), {
        title: 'Not mine to post',
        youtubeUrl: 'https://youtu.be/4xzDTAGJ1bY',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000,
      })
    )
    await assertFails(deleteDoc(doc(as(MEMBER), 'livestreams/live1')))
  })
})

describe('storeSales', () => {
  const PUBLIC = 'public-uid'
  const sale = {
    message: '20% off every T-shirt',
    endsOn: '2026-11-01',
    endsAt: Date.now() + 24 * 60 * 60 * 1000,
    createdAt: Date.now(),
  }

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'users', PUBLIC), { roles: ['public'], displayName: 'Follower' })
      await setDoc(doc(db, 'storeSales', 'sale1'), sale)
      await setDoc(doc(db, 'storeSales', 'ended1'), { ...sale, endsAt: Date.now() - 1000 })
    })
  })

  it('lets any signed-in account read the sale, public followers included', async () => {
    await assertSucceeds(getDoc(doc(as(PUBLIC), 'storeSales/sale1')))
    await assertSucceeds(getDoc(doc(as(GUEST), 'storeSales/sale1')))
    // The store tab listens to the whole collection, ended sales and all.
    const snap = await assertSucceeds(getDocs(collection(as(PUBLIC), 'storeSales')))
    expect(snap.docs.map((d) => d.id).sort()).toEqual(['ended1', 'sale1'])
  })

  it('refuses the sale to signed-out users', async () => {
    await assertFails(getDoc(doc(anon(), 'storeSales/sale1')))
  })

  it('lets an admin post, correct and end a sale', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'storeSales/sale2'), sale))
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'storeSales/sale2'), { message: 'Half off' }))
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'storeSales/sale2')))
  })

  it('refuses a sale posted, changed or ended by anyone but an admin', async () => {
    await assertFails(setDoc(doc(as(MEMBER), 'storeSales/nope'), sale))
    await assertFails(setDoc(doc(as(PUBLIC), 'storeSales/nope'), sale))
    await assertFails(updateDoc(doc(as(MEMBER), 'storeSales/sale1'), { message: 'Free' }))
    await assertFails(deleteDoc(doc(as(PUBLIC), 'storeSales/sale1')))
  })
})

describe('the Elim Store tab', () => {
  const PUBLIC = 'public-uid'
  const store = { tagline: 'Handmade', intro: '', featuredNote: '', shelves: [] }

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'users', PUBLIC), { roles: ['public'], displayName: 'Follower' })
      await setDoc(doc(db, 'config', 'main'), { elimStore: store })
    })
  })

  it('is read by a public follower', async () => {
    await assertSucceeds(getDoc(doc(as(PUBLIC), 'config/main')))
  })

  it('is edited by an admin and nobody else', async () => {
    await assertSucceeds(
      updateDoc(doc(as(ADMIN), 'config/main'), { elimStore: { ...store, tagline: 'New' } })
    )
    await assertFails(
      updateDoc(doc(as(MEMBER), 'config/main'), { elimStore: { ...store, tagline: 'Mine' } })
    )
    await assertFails(
      updateDoc(doc(as(PUBLIC), 'config/main'), { elimStore: { ...store, tagline: 'Mine' } })
    )
  })
})

describe('meetingRequests', () => {
  it('lets a leader named on the request read it', () => {
    // The reason the rule is not admin-only: a worship leader holds no admin
    // role, and was being notified about a request and then refused the
    // document describing it.
    return assertSucceeds(getDoc(doc(as(WORSHIP), 'meetingRequests/mr1')))
  })

  it('lets an admin read any request', () => {
    return assertSucceeds(getDoc(doc(as(ADMIN), 'meetingRequests/mr1')))
  })

  it('refuses a request to a member it was not addressed to', () => {
    return assertFails(getDoc(doc(as(MEMBER), 'meetingRequests/mr1')))
  })

  it('refuses a request to the person who sent it', () => {
    // They know what they asked; the answer comes to them by other means. The
    // document carries the leaders' handling of it, which is not theirs.
    return assertFails(getDoc(doc(as(OUTSIDER), 'meetingRequests/mr1')))
  })

  it('refuses a request to signed-out readers', () => {
    return assertFails(getDoc(doc(anon(), 'meetingRequests/mr1')))
  })

  it('lets a named leader close the request off', () => {
    return assertSucceeds(updateDoc(doc(as(WORSHIP), 'meetingRequests/mr1'), { status: 'handled' }))
  })

  it('lets a named leader say they are on it', () => {
    // What the "I'm on it" button writes. Telling the others who has the
    // request is the whole point of it, so a rule refusing this would leave
    // the button silently doing nothing.
    return assertSucceeds(
      updateDoc(doc(as(WORSHIP), 'meetingRequests/mr1'), {
        claimedBy: WORSHIP,
        claimedByName: 'Worship',
        claimedAt: Date.now(),
      })
    )
  })

  it('refuses a claim from someone the request was not sent to', () => {
    return assertFails(
      updateDoc(doc(as(MEMBER), 'meetingRequests/mr1'), {
        claimedBy: MEMBER,
        claimedByName: 'Member',
        claimedAt: Date.now(),
      })
    )
  })

  it('refuses a create from any client, admin included', () => {
    // Everything is made by sendMeetingRequest, which checks the daily limit,
    // takes the name and address off the account, and creates the task.
    return assertFails(
      setDoc(doc(as(ADMIN), 'meetingRequests/forged'), {
        leaders: [WORSHIP],
        fromUid: ADMIN,
        availability: 'any time',
        status: 'open',
      })
    )
  })

  it('lets only an admin delete one', async () => {
    await assertFails(deleteDoc(doc(as(WORSHIP), 'meetingRequests/mr1')))
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'meetingRequests/mr1')))
  })
})

describe('meetingBlocks — no more requests from this account', () => {
  const block = () => ({ blockedAt: Date.now(), requestId: 'mr1' })
  const seedBlock = () =>
    env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'meetingBlocks', OUTSIDER), block())
    )

  it('lets an admin block the sender, recording who on the request itself', async () => {
    // What the task's Block button writes, in one batch.
    await assertSucceeds(setDoc(doc(as(ADMIN), 'meetingBlocks', OUTSIDER), block()))
    await assertSucceeds(
      updateDoc(doc(as(ADMIN), 'meetingRequests/mr1'), {
        blockedBy: ADMIN,
        blockedByName: 'Admin',
        blockedAt: Date.now(),
      })
    )
  })

  it('refuses a block from anyone else, the leader it was sent to included', async () => {
    await assertFails(setDoc(doc(as(WORSHIP), 'meetingBlocks', OUTSIDER), block()))
    await assertFails(setDoc(doc(as(MEMBER), 'meetingBlocks', OUTSIDER), block()))
  })

  it('refuses a block carrying who made it', () => {
    // The blocked person can read their own block, so naming the admin on it
    // would tell them who to take it up with.
    return assertFails(
      setDoc(doc(as(ADMIN), 'meetingBlocks', OUTSIDER), { ...block(), blockedByName: 'Admin' })
    )
  })

  it('lets the blocked person see their own block, and nobody else’s', async () => {
    await seedBlock()
    await assertSucceeds(getDoc(doc(as(OUTSIDER), 'meetingBlocks', OUTSIDER)))
    await assertFails(getDoc(doc(as(MEMBER), 'meetingBlocks', OUTSIDER)))
    await assertFails(getDoc(doc(anon(), 'meetingBlocks', OUTSIDER)))
  })

  it('lets someone check for a block that is not there', () => {
    // The form asks on every visit, blocked or not; a refusal here would break
    // it for everyone who has never been blocked.
    return assertSucceeds(getDoc(doc(as(MEMBER), 'meetingBlocks', MEMBER)))
  })

  it('refuses the blocked person lifting it themselves', async () => {
    await seedBlock()
    await assertFails(deleteDoc(doc(as(OUTSIDER), 'meetingBlocks', OUTSIDER)))
    await assertFails(updateDoc(doc(as(OUTSIDER), 'meetingBlocks', OUTSIDER), { blockedAt: 0 }))
  })

  it('lets an admin lift it', async () => {
    await seedBlock()
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'meetingBlocks', OUTSIDER)))
  })
})

describe('reimbursements', () => {
  it('lets the person who asked read their request', () => {
    return assertSucceeds(getDoc(doc(as(MEMBER), 'reimbursements/rb1')))
  })

  it('lets the Accountant it was sent to read it', () => {
    return assertSucceeds(getDoc(doc(as(WORSHIP), 'reimbursements/rb1')))
  })

  it('lets an admin read it', () => {
    return assertSucceeds(getDoc(doc(as(ADMIN), 'reimbursements/rb1')))
  })

  it('keeps it from every other member', () => {
    // What someone spent, and their receipts, are why this is not a task.
    return assertFails(getDoc(doc(as(OUTSIDER), 'reimbursements/rb1')))
  })

  it("answers a member's query for their own requests", () => {
    return assertSucceeds(
      getDocs(query(collection(as(MEMBER), 'reimbursements'), where('submitterUid', '==', MEMBER)))
    )
  })

  it("answers the Accountant's query for requests sent to them", () => {
    return assertSucceeds(
      getDocs(
        query(collection(as(WORSHIP), 'reimbursements'), where('accountantUid', '==', WORSHIP))
      )
    )
  })

  it('refuses an unfiltered listing to a member', () => {
    return assertFails(getDocs(collection(as(MEMBER), 'reimbursements')))
  })

  it('refuses the Accountant approving it directly', () => {
    // Every step goes through a callable, which also moves the task and tells
    // the person who asked.
    return assertFails(updateDoc(doc(as(WORSHIP), 'reimbursements/rb1'), { status: 'approved' }))
  })

  it('refuses the person who asked changing their own request', () => {
    return assertFails(updateDoc(doc(as(MEMBER), 'reimbursements/rb1'), { status: 'paid' }))
  })

  it('refuses a create from any client, admin included', () => {
    return assertFails(
      setDoc(doc(as(ADMIN), 'reimbursements/forged'), {
        submitterUid: ADMIN,
        accountantUid: ADMIN,
        total: 100,
        status: 'approved',
      })
    )
  })

  it('lets an admin hand a request to a new Accountant, and change nothing else', async () => {
    await assertSucceeds(
      updateDoc(doc(as(ADMIN), 'reimbursements/rb1'), {
        accountantUid: OUTSIDER,
        accountantName: 'Outsider',
      })
    )
    await assertFails(updateDoc(doc(as(ADMIN), 'reimbursements/rb1'), { status: 'paid' }))
  })
})

describe('backupStatus', () => {
  it('lets an admin read how the nightly backup went', () => {
    return assertSucceeds(getDoc(doc(as(ADMIN), 'backupStatus/latest')))
  })

  it('keeps it from members, and lets no client write it', async () => {
    await assertFails(getDoc(doc(as(MEMBER), 'backupStatus/latest')))
    await assertFails(setDoc(doc(as(ADMIN), 'backupStatus/latest'), { lastOk: '2026-01-01' }))
  })
})
