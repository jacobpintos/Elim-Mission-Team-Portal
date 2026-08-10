import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import { logger } from 'firebase-functions'
import { CONNECTIONS, PAGE_POSTS } from './config'
import { fetchPagePosts, fetchSinglePost, type StoredPost } from './graph'

if (!admin.apps.length) admin.initializeApp()

export interface Connection {
  pageId: string
  pageName: string
  pagePicture?: string
  accessToken: string
  connectedBy?: string
  connectedAt?: FirebaseFirestore.Timestamp
  lastSyncedAt?: FirebaseFirestore.Timestamp
  lastSyncError?: string | null
  status: 'active' | 'error' | 'revoked'
}

export async function getConnection(pageId: string): Promise<Connection | null> {
  const snap = await admin.firestore().collection(CONNECTIONS).doc(pageId).get()
  return snap.exists ? (snap.data() as Connection) : null
}

/**
 * Copy a Graph image into our own bucket.
 *
 * `full_picture` is a signed CDN URL that stops resolving after a few weeks,
 * so storing it verbatim means posts silently lose their images later. The
 * download-token scheme below is the same one the Firebase client SDK uses,
 * and unlike `makePublic()` or signed URLs it works under uniform bucket-level
 * access without needing a service-account key to sign with.
 */
async function mirrorImage(pageId: string, postId: string, url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) return null
    const body = Buffer.from(await res.arrayBuffer())

    const ext = contentType.split('/')[1]?.split(';')[0] ?? 'jpg'
    const safeId = postId.replace(/[^a-zA-Z0-9_-]/g, '_')
    const path = `fbPagePosts/${pageId}/${safeId}.${ext}`
    const downloadToken = crypto.randomUUID()

    const file = admin.storage().bucket().file(path)
    await file.save(body, {
      resumable: false,
      contentType,
      metadata: {
        cacheControl: 'public, max-age=31536000',
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    })

    const bucket = admin.storage().bucket().name
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
      path
    )}?alt=media&token=${downloadToken}`
  } catch (err) {
    logger.warn('fb: image mirror failed', { pageId, postId, err: String(err) })
    return null
  }
}

/**
 * Write one post, mirroring its image the first time we see it.
 *
 * Engagement counts are refreshed on every pass, but the mirrored image is
 * kept — re-uploading an identical picture on every hourly sync would burn
 * storage writes for nothing.
 */
async function upsertPost(
  pageId: string,
  post: StoredPost & { id: string }
): Promise<void> {
  const ref = admin
    .firestore()
    .collection(PAGE_POSTS)
    .doc(pageId)
    .collection('posts')
    .doc(post.id)

  const existing = await ref.get()
  const prior = existing.data() as (StoredPost & { mirroredImage?: string }) | undefined

  let fullPicture = prior?.mirroredImage ?? undefined
  if (!fullPicture && post.fullPicture) {
    fullPicture = (await mirrorImage(pageId, post.id, post.fullPicture)) ?? undefined
  }

  await ref.set(
    {
      ...post,
      // Fall back to the Graph URL so a failed mirror still renders today.
      fullPicture: fullPicture ?? post.fullPicture ?? null,
      mirroredImage: fullPicture ?? null,
      sourceUrl: post.fullPicture ?? null,
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

/**
 * Drop posts deleted on Facebook.
 *
 * Only the window we just fetched is considered: anything older than the
 * oldest post in the response is outside what we asked for, so its absence
 * says nothing about whether it still exists. Without that guard the first
 * sync would delete the entire archive.
 */
async function reconcileDeletions(
  pageId: string,
  fetched: (StoredPost & { id: string })[]
): Promise<number> {
  if (fetched.length === 0) return 0

  const oldest = fetched.reduce(
    (min, p) => (p.createdTime < min ? p.createdTime : min),
    fetched[0].createdTime
  )
  const liveIds = new Set(fetched.map((p) => p.id))

  const stored = await admin
    .firestore()
    .collection(PAGE_POSTS)
    .doc(pageId)
    .collection('posts')
    .where('createdTime', '>=', oldest)
    .get()

  const stale = stored.docs.filter((d) => !liveIds.has(d.id))
  if (stale.length === 0) return 0

  const batch = admin.firestore().batch()
  stale.forEach((d) => batch.delete(d.ref))
  await batch.commit()
  return stale.length
}

function markSynced(pageId: string, error: string | null) {
  return admin
    .firestore()
    .collection(CONNECTIONS)
    .doc(pageId)
    .set(
      {
        lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSyncError: error,
        status: error ? 'error' : 'active',
      },
      { merge: true }
    )
}

/**
 * Full pass over a Page: pull recent posts, refresh counts, remove deletions.
 *
 * Runs on the hourly schedule and immediately after a Page is connected.
 */
export async function syncPage(pageId: string, limit = 25): Promise<{ synced: number; removed: number }> {
  const conn = await getConnection(pageId)
  if (!conn?.accessToken) throw new Error(`No connection stored for page ${pageId}`)

  try {
    const posts = await fetchPagePosts(pageId, conn.accessToken, limit)
    for (const post of posts) await upsertPost(pageId, post)
    const removed = await reconcileDeletions(pageId, posts)
    await markSynced(pageId, null)
    logger.info('fb: synced page', { pageId, synced: posts.length, removed })
    return { synced: posts.length, removed }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // A dead token is the failure that matters: sync stops and nothing in the
    // app looks broken, so it has to be visible on the connection record.
    await markSynced(pageId, message)
    logger.error('fb: sync failed', { pageId, err: message })
    throw err
  }
}

/** Targeted refresh for a single post the webhook told us about. */
export async function syncSinglePost(pageId: string, postId: string): Promise<boolean> {
  const conn = await getConnection(pageId)
  if (!conn?.accessToken) return false

  const post = await fetchSinglePost(postId, conn.accessToken)
  if (!post) {
    await admin
      .firestore()
      .collection(PAGE_POSTS)
      .doc(pageId)
      .collection('posts')
      .doc(postId)
      .delete()
      .catch(() => {})
    return false
  }

  await upsertPost(pageId, post)
  await markSynced(pageId, null)
  return true
}
