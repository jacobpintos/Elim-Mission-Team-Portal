import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import { logger } from 'firebase-functions'
import { CONNECTIONS, INVITES, PAGE_POSTS, FB_CONNECT_SECRET, FB_CONNECT_BASE_URL } from './config'
import { unsubscribePageFromWebhook } from './graph'
import { syncPage } from './sync'

if (!admin.apps.length) admin.initializeApp()

const INVITE_TTL_DAYS = 14

async function requireAdmin(uid: string | undefined): Promise<string> {
  if (!uid) throw new HttpsError('unauthenticated', 'Must be signed in')
  const snap = await admin.firestore().collection('users').doc(uid).get()
  const roles: string[] = snap.data()?.roles ?? []
  if (!roles.includes('admin')) throw new HttpsError('permission-denied', 'Admins only')
  return uid
}

/**
 * Mint a one-time link to hand to a Page owner.
 *
 * The link is the only thing the owner needs, and it carries no credentials —
 * just an invitation ID and a signature proving we issued it.
 */
export const createFbConnectLink = onCall(
  { secrets: [FB_CONNECT_SECRET] },
  async (req): Promise<{ url: string; inviteId: string; expiresAt: number }> => {
    const uid = await requireAdmin(req.auth?.uid)
    const label = typeof req.data?.label === 'string' ? req.data.label.slice(0, 120) : ''

    const inviteId = crypto.randomBytes(24).toString('hex')
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    )

    await admin.firestore().collection(INVITES).doc(inviteId).set({
      createdBy: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      label,
      expiresAt,
    })

    const sig = crypto
      .createHmac('sha256', FB_CONNECT_SECRET.value())
      .update(inviteId)
      .digest('hex')
    const base = FB_CONNECT_BASE_URL.value().replace(/\/$/, '')

    return {
      url: `${base}/fbConnect?invite=${inviteId}&sig=${sig}`,
      inviteId,
      expiresAt: expiresAt.toMillis(),
    }
  }
)

export interface ConnectionSummary {
  pageId: string
  pageName: string
  pagePicture?: string | null
  status: string
  connectedAt?: number | null
  lastSyncedAt?: number | null
  lastSyncError?: string | null
  postCount: number
}

/**
 * Connection health for the admin screen.
 *
 * Access tokens are deliberately not part of the response — the client never
 * needs one, and the whole point of storing them behind the Admin SDK is that
 * they never reach a device.
 */
export const listFbConnections = onCall(async (req): Promise<{ connections: ConnectionSummary[] }> => {
  await requireAdmin(req.auth?.uid)

  const snap = await admin.firestore().collection(CONNECTIONS).get()
  const connections = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data()
      const posts = await admin
        .firestore()
        .collection(PAGE_POSTS)
        .doc(d.id)
        .collection('posts')
        .count()
        .get()
      return {
        pageId: d.id,
        pageName: (data.pageName as string) ?? d.id,
        pagePicture: (data.pagePicture as string | null) ?? null,
        status: (data.status as string) ?? 'active',
        connectedAt: (data.connectedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? null,
        lastSyncedAt: (data.lastSyncedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? null,
        lastSyncError: (data.lastSyncError as string | null) ?? null,
        postCount: posts.data().count,
      }
    })
  )

  connections.sort((a, b) => a.pageName.localeCompare(b.pageName))
  return { connections }
})

/** Pull a Page's posts immediately rather than waiting for the hourly job. */
export const syncFbPageNow = onCall(async (req): Promise<{ synced: number; removed: number }> => {
  await requireAdmin(req.auth?.uid)
  const pageId = String(req.data?.pageId ?? '')
  if (!pageId) throw new HttpsError('invalid-argument', 'pageId is required')

  try {
    return await syncPage(pageId)
  } catch (err) {
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Sync failed')
  }
})

/**
 * Disconnect a Page from our side.
 *
 * Synced posts are removed along with the connection: they were only ever a
 * cache of someone else's content, and leaving them behind would show members
 * a feed that silently stopped updating.
 */
export const disconnectFbPage = onCall(async (req): Promise<{ removed: number }> => {
  await requireAdmin(req.auth?.uid)
  const pageId = String(req.data?.pageId ?? '')
  if (!pageId) throw new HttpsError('invalid-argument', 'pageId is required')

  const db = admin.firestore()
  const connRef = db.collection(CONNECTIONS).doc(pageId)
  const token = (await connRef.get()).data()?.accessToken as string | undefined

  if (token) {
    await unsubscribePageFromWebhook(pageId, token).catch((err) =>
      logger.warn('fb: unsubscribe failed, removing locally anyway', { pageId, err: String(err) })
    )
  }

  const posts = await db.collection(PAGE_POSTS).doc(pageId).collection('posts').get()
  for (let i = 0; i < posts.docs.length; i += 400) {
    const batch = db.batch()
    posts.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }

  await connRef.delete()
  logger.info('fb: page disconnected', { pageId, removed: posts.size })
  return { removed: posts.size }
})
