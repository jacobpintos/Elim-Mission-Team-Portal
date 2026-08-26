import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Storage rules, against the emulator.
 *
 * The content-type clauses are the reason this file exists. Every upload path
 * in the app had to be changed to send an explicit contentType, because a Blob
 * read off a native file:// URI does not reliably carry one — and when it does
 * not, these rules reject the upload with an error the client reports as a
 * generic failure. That is a rule the app depends on and nothing else checks.
 */
let env: RulesTestEnvironment

const OWNER = 'owner-uid'
const OTHER = 'other-uid'

/** A blob of `bytes` length, tagged with `type`. */
const blob = (bytes: number, type = 'image/jpeg') => new Blob([new Uint8Array(bytes)], { type })

const IMAGE = { contentType: 'image/jpeg' }

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mission-portal-rules-test',
    storage: {
      rules: readFileSync(resolve(__dirname, '../storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  })
})

afterAll(async () => env?.cleanup())

const as = (uid: string) => env.authenticatedContext(uid).storage()
const anon = () => env.unauthenticatedContext().storage()

describe('avatars', () => {
  it('lets a user upload their own avatar', async () => {
    await assertSucceeds(uploadBytes(ref(as(OWNER), `avatars/${OWNER}`), blob(1024), IMAGE))
  })

  it('stops a user overwriting someone else avatar', async () => {
    await assertFails(uploadBytes(ref(as(OTHER), `avatars/${OWNER}`), blob(1024), IMAGE))
  })

  it('refuses an anonymous upload', async () => {
    await assertFails(uploadBytes(ref(anon(), `avatars/${OWNER}`), blob(1024), IMAGE))
  })

  it('refuses a non-image content type', async () => {
    // This is the clause the native upload path kept tripping: without an
    // explicit image/* content type the upload is rejected here, not in the
    // client, so the failure surfaced as an opaque storage error.
    await assertFails(
      uploadBytes(ref(as(OWNER), `avatars/${OWNER}`), blob(1024, 'application/octet-stream'), {
        contentType: 'application/octet-stream',
      })
    )
  })

  it('refuses an avatar at or over the 5MB cap', async () => {
    await assertFails(uploadBytes(ref(as(OWNER), `avatars/${OWNER}`), blob(5 * 1024 * 1024), IMAGE))
  })

  it('accepts an avatar just under the cap', async () => {
    await assertSucceeds(
      uploadBytes(ref(as(OWNER), `avatars/${OWNER}`), blob(5 * 1024 * 1024 - 1024), IMAGE)
    )
  })

  it('lets any signed-in user read an avatar, but not an anonymous one', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `avatars/${OWNER}`), blob(512), IMAGE)
    })
    await assertSucceeds(getDownloadURL(ref(as(OTHER), `avatars/${OWNER}`)))
    await assertFails(getDownloadURL(ref(anon(), `avatars/${OWNER}`)))
  })
})

describe('room attachments', () => {
  const path = 'rooms/r1/attachments/photo.jpg'

  it('lets a signed-in user attach an image', async () => {
    await assertSucceeds(uploadBytes(ref(as(OWNER), path), blob(2048), IMAGE))
  })

  it('refuses an anonymous attachment', async () => {
    await assertFails(uploadBytes(ref(anon(), path), blob(2048), IMAGE))
  })

  it('refuses a non-image attachment', async () => {
    await assertFails(
      uploadBytes(ref(as(OWNER), path), blob(2048, 'application/pdf'), {
        contentType: 'application/pdf',
      })
    )
  })

  it('refuses an attachment at or over the 10MB cap', async () => {
    await assertFails(uploadBytes(ref(as(OWNER), path), blob(10 * 1024 * 1024), IMAGE))
  })
})

describe('security report photos', () => {
  const path = 'securityReports/s1/photo'

  it('lets a signed-in user attach a photo to a report', async () => {
    await assertSucceeds(uploadBytes(ref(as(OWNER), path), blob(2048), IMAGE))
  })

  it('refuses a non-image', async () => {
    await assertFails(
      uploadBytes(ref(as(OWNER), path), blob(2048, 'text/plain'), { contentType: 'text/plain' })
    )
  })

  it('refuses an anonymous upload', async () => {
    await assertFails(uploadBytes(ref(anon(), path), blob(2048), IMAGE))
  })
})

describe('announcement photos', () => {
  const path = 'announcements/a1/photo.jpg'

  it('lets a signed-in user upload one', async () => {
    // Firestore is what gates who may post an announcement; Storage rules
    // cannot read it, so the check here is only that somebody is signed in.
    await assertSucceeds(uploadBytes(ref(as(OWNER), path), blob(2048), IMAGE))
  })

  it('refuses an anonymous upload', async () => {
    await assertFails(uploadBytes(ref(anon(), path), blob(2048), IMAGE))
  })

  it('refuses a non-image', async () => {
    await assertFails(
      uploadBytes(ref(as(OWNER), path), blob(2048, 'application/pdf'), {
        contentType: 'application/pdf',
      })
    )
  })

  it('refuses one at or over the 10MB cap', async () => {
    await assertFails(uploadBytes(ref(as(OWNER), path), blob(10 * 1024 * 1024), IMAGE))
  })
})

describe('logos', () => {
  it('is readable without signing in, since the login screen shows it', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'logos/logo_1'), blob(512), IMAGE)
    })

    await assertSucceeds(getDownloadURL(ref(anon(), 'logos/logo_1')))
  })

  it('refuses an anonymous write', async () => {
    await assertFails(uploadBytes(ref(anon(), 'logos/logo_2'), blob(512), IMAGE))
  })
})

describe('unmatched paths', () => {
  it('denies anything the rules do not name', async () => {
    // Default-deny: a path nobody wrote a rule for must not be writable.
    await assertFails(uploadBytes(ref(as(OWNER), 'random/thing.jpg'), blob(512), IMAGE))
  })
})
