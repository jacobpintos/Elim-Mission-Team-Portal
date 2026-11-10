import { describe, it, beforeAll, afterAll } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage'
import { doc, setDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Storage rules, against the emulator.
 *
 * Two things are held here that nothing else checks:
 *
 * - The content-type clauses. Every upload path in the app had to be changed
 *   to send an explicit contentType, because a Blob read off a native file://
 *   URI does not reliably carry one — and when it does not, these rules
 *   reject the upload with an error the client reports as a generic failure.
 * - Who may write, delete and read each folder. The rules read each person's
 *   roles from Firestore (firestore.get), so the Firestore emulator runs
 *   beside this one and is given the people below. Before, the rules asked
 *   only that someone be signed in.
 */
let env: RulesTestEnvironment

const ADMIN = 'admin-uid'
const MEMBER = 'member-uid'
const OTHER = 'other-uid'
const WORSHIP = 'worship-uid'
const SECURITY = 'security-uid'
const GUEST = 'guest-uid'
const FOLLOWER = 'follower-uid'
/** A login with no record of its own: made with the app's public key, say. */
const STRANGER = 'stranger-uid'

/** A blob of `bytes` length, tagged with `type`. */
const blob = (bytes: number, type = 'image/jpeg') => new Blob([new Uint8Array(bytes)], { type })

const IMAGE = { contentType: 'image/jpeg' }

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mission-portal-rules-test',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync(resolve(__dirname, '../storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  })
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', ADMIN), { roles: ['admin'] })
    await setDoc(doc(db, 'users', MEMBER), { roles: ['regular'] })
    await setDoc(doc(db, 'users', OTHER), { roles: ['regular'] })
    await setDoc(doc(db, 'users', WORSHIP), { roles: ['worship'] })
    await setDoc(doc(db, 'users', SECURITY), { roles: ['security'] })
    await setDoc(doc(db, 'users', GUEST), { roles: ['guest'] })
    await setDoc(doc(db, 'users', FOLLOWER), { roles: ['public'] })
    // MEMBER and WORSHIP talking; and a group chat someone in it reported.
    await setDoc(doc(db, 'rooms', 'r1'), { kind: 'dm', members: [MEMBER, WORSHIP] })
    await setDoc(doc(db, 'rooms', 'reported1'), {
      kind: 'group',
      members: [MEMBER, WORSHIP, OTHER],
      reported: true,
    })
    // WORSHIP is the Accountant.
    await setDoc(doc(db, 'config', 'main'), { connectConfig: { accountant: WORSHIP } })
  })
})

afterAll(async () => env?.cleanup())

const as = (uid: string) => env.authenticatedContext(uid).storage()
const anon = () => env.unauthenticatedContext().storage()

/** A file put there as the server would, which the rules don't apply to. */
const seed = (path: string, metadata: Record<string, unknown> = IMAGE) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), blob(512), metadata)
  })

describe('avatars', () => {
  it('lets a user upload their own avatar', async () => {
    await assertSucceeds(uploadBytes(ref(as(MEMBER), `avatars/${MEMBER}`), blob(1024), IMAGE))
  })

  it('stops a user overwriting someone else avatar', async () => {
    await assertFails(uploadBytes(ref(as(OTHER), `avatars/${MEMBER}`), blob(1024), IMAGE))
  })

  it('refuses an anonymous upload', async () => {
    await assertFails(uploadBytes(ref(anon(), `avatars/${MEMBER}`), blob(1024), IMAGE))
  })

  it('refuses a non-image content type', async () => {
    // This is the clause the native upload path kept tripping: without an
    // explicit image/* content type the upload is rejected here, not in the
    // client, so the failure surfaced as an opaque storage error.
    await assertFails(
      uploadBytes(ref(as(MEMBER), `avatars/${MEMBER}`), blob(1024, 'application/octet-stream'), {
        contentType: 'application/octet-stream',
      })
    )
  })

  it('refuses an avatar at or over the 5MB cap', async () => {
    await assertFails(
      uploadBytes(ref(as(MEMBER), `avatars/${MEMBER}`), blob(5 * 1024 * 1024), IMAGE)
    )
  })

  it('accepts an avatar just under the cap', async () => {
    await assertSucceeds(
      uploadBytes(ref(as(MEMBER), `avatars/${MEMBER}`), blob(5 * 1024 * 1024 - 1024), IMAGE)
    )
  })

  it('lets any signed-in user read an avatar, but not an anonymous one', async () => {
    await seed(`avatars/${MEMBER}`)
    await assertSucceeds(getDownloadURL(ref(as(OTHER), `avatars/${MEMBER}`)))
    await assertFails(getDownloadURL(ref(anon(), `avatars/${MEMBER}`)))
  })
})

describe('room attachments', () => {
  const path = 'rooms/r1/attachments/photo.jpg'

  it('lets someone in the conversation attach an image', async () => {
    await assertSucceeds(uploadBytes(ref(as(MEMBER), path), blob(2048), IMAGE))
  })

  it('refuses one from anyone who isn’t in it, an admin included', async () => {
    // It used to take one from anyone signed in.
    await assertFails(uploadBytes(ref(as(OTHER), 'rooms/r1/attachments/x.jpg'), blob(2048), IMAGE))
    await assertFails(uploadBytes(ref(as(ADMIN), 'rooms/r1/attachments/y.jpg'), blob(2048), IMAGE))
    await assertFails(uploadBytes(ref(anon(), 'rooms/r1/attachments/z.jpg'), blob(2048), IMAGE))
  })

  it('never lets one be written over another', async () => {
    await seed('rooms/r1/attachments/first.jpg')
    await assertFails(
      uploadBytes(ref(as(WORSHIP), 'rooms/r1/attachments/first.jpg'), blob(2048), IMAGE)
    )
  })

  it('refuses a non-image attachment', async () => {
    await assertFails(
      uploadBytes(ref(as(MEMBER), 'rooms/r1/attachments/doc.pdf'), blob(2048, 'application/pdf'), {
        contentType: 'application/pdf',
      })
    )
  })

  it('refuses an attachment at or over the 10MB cap', async () => {
    await assertFails(
      uploadBytes(ref(as(MEMBER), 'rooms/r1/attachments/big.jpg'), blob(10 * 1024 * 1024), IMAGE)
    )
  })

  it('is read by those in the conversation, and nobody else', async () => {
    await seed('rooms/r1/attachments/read.jpg')
    await assertSucceeds(getDownloadURL(ref(as(WORSHIP), 'rooms/r1/attachments/read.jpg')))
    await assertFails(getDownloadURL(ref(as(OTHER), 'rooms/r1/attachments/read.jpg')))
    // An admin no more than anyone, as with its messages.
    await assertFails(getDownloadURL(ref(as(ADMIN), 'rooms/r1/attachments/read.jpg')))
    await assertFails(listAll(ref(as(ADMIN), 'rooms/r1/attachments')))
  })

  it('is read by the admins while its conversation is reported', async () => {
    await seed('rooms/reported1/attachments/read.jpg')
    await assertSucceeds(getDownloadURL(ref(as(ADMIN), 'rooms/reported1/attachments/read.jpg')))
    await assertFails(getDownloadURL(ref(as(SECURITY), 'rooms/reported1/attachments/read.jpg')))
  })

  it('is taken down by an admin, and by no one else', async () => {
    await seed('rooms/r1/attachments/gone.jpg')
    // It used to be anyone's to delete.
    await assertFails(deleteObject(ref(as(OTHER), 'rooms/r1/attachments/gone.jpg')))
    await assertFails(deleteObject(ref(as(MEMBER), 'rooms/r1/attachments/gone.jpg')))
    await assertSucceeds(deleteObject(ref(as(ADMIN), 'rooms/r1/attachments/gone.jpg')))
  })
})

describe('a group chat’s cover photo', () => {
  it('is changed by anyone in the chat, and by nobody outside it', async () => {
    await assertSucceeds(
      uploadBytes(ref(as(OTHER), 'rooms/reported1/cover/1.jpg'), blob(2048), IMAGE)
    )
    await assertFails(uploadBytes(ref(as(GUEST), 'rooms/reported1/cover/2.jpg'), blob(2048), IMAGE))
    await assertFails(uploadBytes(ref(as(OTHER), 'rooms/r1/cover/1.jpg'), blob(2048), IMAGE))
  })

  it('is asked for by those in it, straight after putting it there', async () => {
    await seed('rooms/r1/cover/c.jpg')
    await assertSucceeds(getDownloadURL(ref(as(MEMBER), 'rooms/r1/cover/c.jpg')))
    await assertFails(getDownloadURL(ref(as(OTHER), 'rooms/r1/cover/c.jpg')))
  })
})

describe('security report photos', () => {
  it('lets anyone signed in attach a photo to a report, saying it is theirs', async () => {
    await assertSucceeds(
      uploadBytes(ref(as(MEMBER), 'securityReports/s1/photo'), blob(2048), {
        ...IMAGE,
        customMetadata: { uploadedBy: MEMBER },
      })
    )
    // A follower at a public event may report too.
    await assertSucceeds(
      uploadBytes(ref(as(FOLLOWER), 'securityReports/s2/photo'), blob(2048), {
        ...IMAGE,
        customMetadata: { uploadedBy: FOLLOWER },
      })
    )
  })

  it('refuses one said to be someone else’s', async () => {
    await assertFails(
      uploadBytes(ref(as(OTHER), 'securityReports/s3/photo'), blob(2048), {
        ...IMAGE,
        customMetadata: { uploadedBy: MEMBER },
      })
    )
  })

  it('never lets a report’s photo be written over, or deleted by anyone but an admin', async () => {
    await seed('securityReports/s4/photo', { ...IMAGE, customMetadata: { uploadedBy: MEMBER } })
    // Both were anyone's to do.
    await assertFails(uploadBytes(ref(as(OTHER), 'securityReports/s4/photo'), blob(2048), IMAGE))
    await assertFails(uploadBytes(ref(as(MEMBER), 'securityReports/s4/photo'), blob(2048), IMAGE))
    await assertFails(deleteObject(ref(as(OTHER), 'securityReports/s4/photo')))
    await assertFails(deleteObject(ref(as(SECURITY), 'securityReports/s4/photo')))
    await assertSucceeds(deleteObject(ref(as(ADMIN), 'securityReports/s4/photo')))
  })

  it('is read by security, the admins and whoever put it there — nobody else', async () => {
    await seed('securityReports/s5/photo', { ...IMAGE, customMetadata: { uploadedBy: MEMBER } })
    await assertSucceeds(getDownloadURL(ref(as(MEMBER), 'securityReports/s5/photo')))
    await assertSucceeds(getDownloadURL(ref(as(SECURITY), 'securityReports/s5/photo')))
    await assertSucceeds(getDownloadURL(ref(as(ADMIN), 'securityReports/s5/photo')))
    // Report ids count up, and the photo's name is always the same: it used
    // to be anyone's to ask for by guessing the next.
    await assertFails(getDownloadURL(ref(as(OTHER), 'securityReports/s5/photo')))
    await assertFails(getDownloadURL(ref(as(GUEST), 'securityReports/s5/photo')))
    await assertFails(getDownloadURL(ref(anon(), 'securityReports/s5/photo')))
    await assertFails(listAll(ref(as(OTHER), 'securityReports/s5')))
  })

  it('from an app that doesn’t say whose it is: still theirs to ask for, straight after', async () => {
    // What an app not yet updated does: upload, then ask for the address.
    // (For two minutes; after that, security's and the admins' alone.)
    await assertSucceeds(
      uploadBytes(ref(as(MEMBER), 'securityReports/s6/photo'), blob(2048), IMAGE)
    )
    await assertSucceeds(getDownloadURL(ref(as(MEMBER), 'securityReports/s6/photo')))
  })

  it('refuses a non-image, and an anonymous upload', async () => {
    await assertFails(
      uploadBytes(ref(as(MEMBER), 'securityReports/s7/photo'), blob(2048, 'text/plain'), {
        contentType: 'text/plain',
      })
    )
    await assertFails(uploadBytes(ref(anon(), 'securityReports/s8/photo'), blob(2048), IMAGE))
  })
})

describe('announcement photos', () => {
  const path = 'announcements/a1/photo.jpg'

  it('lets an admin, who posts announcements, upload one', async () => {
    await assertSucceeds(uploadBytes(ref(as(ADMIN), path), blob(2048), IMAGE))
  })

  it('refuses one from anyone else', async () => {
    // It used to take one, or a 100MB video, from anyone signed in.
    await assertFails(uploadBytes(ref(as(MEMBER), path), blob(2048), IMAGE))
    await assertFails(uploadBytes(ref(as(FOLLOWER), path), blob(2048), IMAGE))
    await assertFails(uploadBytes(ref(as(STRANGER), path), blob(2048), IMAGE))
    await assertFails(uploadBytes(ref(anon(), path), blob(2048), IMAGE))
  })

  it('refuses a non-image', async () => {
    await assertFails(
      uploadBytes(ref(as(ADMIN), path), blob(2048, 'application/pdf'), {
        contentType: 'application/pdf',
      })
    )
  })

  it('refuses one at or over the 10MB cap', async () => {
    await assertFails(uploadBytes(ref(as(ADMIN), path), blob(10 * 1024 * 1024), IMAGE))
  })

  it('takes a video, up to 100MB', async () => {
    const video = 'announcements/a1/clip.mp4'
    const mp4 = { contentType: 'video/mp4' }
    await assertSucceeds(
      uploadBytes(ref(as(ADMIN), video), blob(20 * 1024 * 1024, 'video/mp4'), mp4)
    )
    await assertSucceeds(
      uploadBytes(ref(as(ADMIN), 'announcements/a1/clip.mov'), blob(2048, 'video/quicktime'), {
        contentType: 'video/quicktime',
      })
    )
    await assertFails(
      uploadBytes(ref(as(ADMIN), video), blob(100 * 1024 * 1024 + 1, 'video/mp4'), mp4)
    )
    await assertFails(uploadBytes(ref(as(MEMBER), video), blob(2048, 'video/mp4'), mp4))
  })

  it('is seen by everyone signed in, and taken down only by an admin', async () => {
    await seed('announcements/a2/photo.jpg')
    await assertSucceeds(getDownloadURL(ref(as(FOLLOWER), 'announcements/a2/photo.jpg')))
    await assertFails(getDownloadURL(ref(anon(), 'announcements/a2/photo.jpg')))
    await assertFails(deleteObject(ref(as(MEMBER), 'announcements/a2/photo.jpg')))
    await assertSucceeds(deleteObject(ref(as(ADMIN), 'announcements/a2/photo.jpg')))
  })
})

describe.each(['photoAlbums/al1', 'pages/home'])('%s pictures', (folder) => {
  it('are put up and taken down by admins alone, and seen by everyone signed in', async () => {
    const path = `${folder}/1.jpg`
    await assertFails(uploadBytes(ref(as(MEMBER), path), blob(1024), IMAGE))
    await assertFails(uploadBytes(ref(as(GUEST), path), blob(1024), IMAGE))
    await assertSucceeds(uploadBytes(ref(as(ADMIN), path), blob(1024), IMAGE))
    await assertSucceeds(getDownloadURL(ref(as(FOLLOWER), path)))
    await assertFails(getDownloadURL(ref(anon(), path)))
    await assertFails(deleteObject(ref(as(WORSHIP), path)))
    await assertSucceeds(deleteObject(ref(as(ADMIN), path)))
  })
})

describe.each(['eventFlights', 'eventLodging'])('%s images', (folder) => {
  const path = `${folder}/entry-1/1700000000_pass.jpg`

  it('lets an admin, who fills in the event form, upload one', async () => {
    await assertSucceeds(uploadBytes(ref(as(ADMIN), path), blob(1024), IMAGE))
  })

  it('refuses one from anyone else', async () => {
    await assertFails(uploadBytes(ref(as(MEMBER), path), blob(1024), IMAGE))
    await assertFails(uploadBytes(ref(anon(), path), blob(1024), IMAGE))
  })

  it('refuses a non-image content type', async () => {
    await assertFails(
      uploadBytes(ref(as(ADMIN), path), blob(1024, 'application/pdf'), {
        contentType: 'application/pdf',
      })
    )
  })

  it('is never a public account’s to ask for, nor anyone’s but an admin’s to delete', async () => {
    await seed(`${folder}/entry-2/pass.jpg`)
    await assertSucceeds(getDownloadURL(ref(as(GUEST), `${folder}/entry-2/pass.jpg`)))
    await assertSucceeds(getDownloadURL(ref(as(MEMBER), `${folder}/entry-2/pass.jpg`)))
    await assertFails(getDownloadURL(ref(as(FOLLOWER), `${folder}/entry-2/pass.jpg`)))
    await assertFails(deleteObject(ref(as(MEMBER), `${folder}/entry-2/pass.jpg`)))
    await assertSucceeds(deleteObject(ref(as(ADMIN), `${folder}/entry-2/pass.jpg`)))
  })
})

describe('set list reference tracks', () => {
  const path = 'setListAudio/song-1/track.mp3'
  const MP3 = { contentType: 'audio/mpeg' }

  it('are kept by the worship team and admins', async () => {
    await assertSucceeds(uploadBytes(ref(as(WORSHIP), path), blob(2048, 'audio/mpeg'), MP3))
    await assertSucceeds(
      uploadBytes(ref(as(ADMIN), 'setListAudio/song-2/track.mp3'), blob(2048, 'audio/mpeg'), MP3)
    )
    await assertFails(
      uploadBytes(ref(as(MEMBER), 'setListAudio/song-3/track.mp3'), blob(2048, 'audio/mpeg'), MP3)
    )
    await assertFails(
      uploadBytes(ref(as(GUEST), 'setListAudio/song-3/track.mp3'), blob(2048, 'audio/mpeg'), MP3)
    )
  })

  it('must be audio, under 20MB', async () => {
    await assertFails(uploadBytes(ref(as(WORSHIP), path), blob(2048), IMAGE))
    await assertFails(
      uploadBytes(ref(as(WORSHIP), path), blob(20 * 1024 * 1024, 'audio/mpeg'), MP3)
    )
  })

  it('are heard by the worship team, admins and guests, and removed by those who keep them', async () => {
    await seed('setListAudio/song-4/track.mp3', MP3)
    await assertSucceeds(getDownloadURL(ref(as(GUEST), 'setListAudio/song-4/track.mp3')))
    await assertFails(getDownloadURL(ref(as(MEMBER), 'setListAudio/song-4/track.mp3')))
    await assertFails(deleteObject(ref(as(GUEST), 'setListAudio/song-4/track.mp3')))
    await assertSucceeds(deleteObject(ref(as(WORSHIP), 'setListAudio/song-4/track.mp3')))
  })
})

describe('reimbursement receipts', () => {
  const path = `reimbursements/${MEMBER}/receipt.jpg`

  it('lets someone add a receipt to their own folder', async () => {
    await assertSucceeds(uploadBytes(ref(as(MEMBER), path), blob(2048), IMAGE))
  })

  it("refuses a receipt put in someone else's folder", async () => {
    // submitReimbursement trusts a path in a person's folder to be theirs.
    await assertFails(
      uploadBytes(ref(as(OTHER), `reimbursements/${MEMBER}/theirs.jpg`), blob(2048), IMAGE)
    )
  })

  it('takes an invoice as a PDF', async () => {
    await assertSucceeds(
      uploadBytes(
        ref(as(MEMBER), `reimbursements/${MEMBER}/invoice.pdf`),
        blob(2048, 'application/pdf'),
        {
          contentType: 'application/pdf',
        }
      )
    )
  })

  it('refuses anything else, and anything at or over 10MB', async () => {
    await assertFails(
      uploadBytes(ref(as(MEMBER), `reimbursements/${MEMBER}/page.html`), blob(2048, 'text/html'), {
        contentType: 'text/html',
      })
    )
    await assertFails(
      uploadBytes(
        ref(as(MEMBER), `reimbursements/${MEMBER}/big.jpg`),
        blob(10 * 1024 * 1024),
        IMAGE
      )
    )
  })

  it('is looked at by whoever paid and the Accountant — no one else, an admin included', async () => {
    await seed(`reimbursements/${MEMBER}/seen.jpg`)
    await assertSucceeds(getDownloadURL(ref(as(MEMBER), `reimbursements/${MEMBER}/seen.jpg`)))
    await assertSucceeds(getDownloadURL(ref(as(WORSHIP), `reimbursements/${MEMBER}/seen.jpg`)))
    // It used to open for anyone signed in who had its path.
    await assertFails(getDownloadURL(ref(as(OTHER), `reimbursements/${MEMBER}/seen.jpg`)))
    await assertFails(getDownloadURL(ref(as(ADMIN), `reimbursements/${MEMBER}/seen.jpg`)))
    await assertFails(getDownloadURL(ref(anon(), `reimbursements/${MEMBER}/seen.jpg`)))
  })

  it('is listed, and taken back, only by whoever paid', async () => {
    await seed(`reimbursements/${MEMBER}/mine.jpg`)
    await assertSucceeds(listAll(ref(as(MEMBER), `reimbursements/${MEMBER}`)))
    await assertFails(listAll(ref(as(WORSHIP), `reimbursements/${MEMBER}`)))
    await assertFails(deleteObject(ref(as(WORSHIP), `reimbursements/${MEMBER}/mine.jpg`)))
    await assertSucceeds(deleteObject(ref(as(MEMBER), `reimbursements/${MEMBER}/mine.jpg`)))
  })
})

describe('logos', () => {
  it('is readable without signing in, since the login screen shows it', async () => {
    await seed('logos/logo_1')
    await assertSucceeds(getDownloadURL(ref(anon(), 'logos/logo_1')))
  })

  it('is changed, and the one it replaced removed, by admins alone', async () => {
    // It used to be anyone's who was signed in to replace.
    await assertFails(uploadBytes(ref(as(MEMBER), 'logos/logo_2'), blob(512), IMAGE))
    await assertFails(uploadBytes(ref(anon(), 'logos/logo_2'), blob(512), IMAGE))
    await assertSucceeds(uploadBytes(ref(as(ADMIN), 'logos/logo_2'), blob(512), IMAGE))
    await assertFails(deleteObject(ref(as(MEMBER), 'logos/logo_2')))
    await assertSucceeds(deleteObject(ref(as(ADMIN), 'logos/logo_2')))
  })
})

describe('unmatched paths', () => {
  it('denies anything the rules do not name', async () => {
    // Default-deny: a path nobody wrote a rule for must not be writable.
    await assertFails(uploadBytes(ref(as(ADMIN), 'random/thing.jpg'), blob(512), IMAGE))
  })
})
