import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import { logger } from 'firebase-functions'
import {
  CONNECTIONS,
  INVITES,
  FB_APP_ID,
  FB_APP_SECRET,
  FB_CONNECT_SECRET,
  FB_CONNECT_BASE_URL,
  SCOPES,
  redirectUri,
} from './config'
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  listManagedPages,
  fetchPageProfile,
  subscribePageToWebhook,
} from './graph'
import { syncPage } from './sync'
import { startPage, pickerPage, successPage, errorPage } from './page'

if (!admin.apps.length) admin.initializeApp()

const ORG_NAME = 'the Elim Mission Team'

/** Pending page choices live this long — the owner is on the screen right now. */
const PENDING_TTL_MS = 15 * 60 * 1000

function sign(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex')
}

/** Constant-time compare, tolerant of length mismatch. */
function verify(value: string, signature: string, secret: string): boolean {
  const expected = sign(value, secret)
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

interface InviteDoc {
  createdBy?: string
  label?: string
  expiresAt?: FirebaseFirestore.Timestamp
  usedAt?: FirebaseFirestore.Timestamp
  nonce?: string
}

/**
 * The whole owner-facing flow, on one URL.
 *
 * Meta matches `redirect_uri` exactly against its registered list, so the
 * callback cannot live on its own path with its own query string. Every stage
 * therefore lands here and is told apart by which parameters are present.
 */
export const fbConnect = onRequest(
  { secrets: [FB_APP_ID, FB_APP_SECRET, FB_CONNECT_SECRET], cors: false },
  async (req, res) => {
    const secret = FB_CONNECT_SECRET.value()
    const q = req.query as Record<string, string | undefined>

    try {
      if (q.error) {
        // The owner pressed Cancel on Facebook's dialog.
        res
          .status(200)
          .send(
            errorPage(
              'Facebook connection cancelled',
              'Nothing was connected. If you didn\'t mean to cancel, open the link again and choose Continue.'
            )
          )
        return
      }

      if (q.code && q.state) return await handleCallback(req, res, secret)
      if (q.pending && q.page && q.sig) return await handlePageChoice(req, res, secret)
      if (q.invite && q.sig) return await handleStart(req, res, secret)

      res
        .status(400)
        .send(
          errorPage(
            'This link is incomplete',
            'Part of the web address is missing — it was probably cut off by an email or messaging app. Ask for the link again and open it in one piece.'
          )
        )
    } catch (err) {
      logger.error('fb: connect flow failed', { err: String(err) })
      res
        .status(500)
        .send(
          errorPage(
            'We hit an unexpected problem',
            'Nothing was connected and nothing was changed on your Page. Please try the link again in a few minutes.'
          )
        )
    }
  }
)

/** Stage one: validate the invitation and send the owner to Facebook. */
async function handleStart(
  req: import('firebase-functions/v2/https').Request,
  res: import('express').Response,
  secret: string
) {
  const inviteId = String(req.query.invite)
  const sig = String(req.query.sig)

  if (!verify(inviteId, sig, secret)) {
    res.status(403).send(errorPage('This link isn\'t valid', 'Ask for a fresh connection link.'))
    return
  }

  const ref = admin.firestore().collection(INVITES).doc(inviteId)
  const snap = await ref.get()
  const invite = snap.data() as InviteDoc | undefined

  if (!snap.exists) {
    res
      .status(404)
      .send(errorPage('This link has been cancelled', 'Ask for a fresh connection link.'))
    return
  }
  if (invite?.usedAt) {
    res
      .status(410)
      .send(
        errorPage(
          'This link has already been used',
          'A Page was already connected with it. If you need to connect another Page, ask for a new link.'
        )
      )
    return
  }
  if (invite?.expiresAt && invite.expiresAt.toMillis() < Date.now()) {
    res
      .status(410)
      .send(errorPage('This link has expired', 'Ask for a fresh one and it will work.'))
    return
  }

  // A per-invite nonce ties the Facebook round-trip back to this exact click.
  const nonce = crypto.randomBytes(16).toString('hex')
  await ref.set({ nonce }, { merge: true })

  const state = `${inviteId}.${nonce}`
  const authUrl =
    `https://www.facebook.com/v20.0/dialog/oauth?` +
    new URLSearchParams({
      client_id: FB_APP_ID.value(),
      redirect_uri: redirectUri(),
      state: `${state}.${sign(state, secret)}`,
      scope: SCOPES.join(','),
      response_type: 'code',
    })

  res.status(200).send(startPage(ORG_NAME, authUrl))
}

/** Stage two: Facebook sent the owner back with a one-time code. */
async function handleCallback(
  req: import('firebase-functions/v2/https').Request,
  res: import('express').Response,
  secret: string
) {
  const [inviteId, nonce, sig] = String(req.query.state).split('.')
  if (!inviteId || !nonce || !sig || !verify(`${inviteId}.${nonce}`, sig, secret)) {
    res
      .status(403)
      .send(errorPage('This link isn\'t valid', 'Please start again from the link you were sent.'))
    return
  }

  const inviteRef = admin.firestore().collection(INVITES).doc(inviteId)
  const invite = (await inviteRef.get()).data() as InviteDoc | undefined
  if (!invite || invite.nonce !== nonce) {
    res
      .status(403)
      .send(
        errorPage(
          'This link has expired',
          'Connection links can only be used once, and only for a short time. Ask for a fresh one.'
        )
      )
    return
  }

  const appId = FB_APP_ID.value()
  const appSecret = FB_APP_SECRET.value()

  const shortToken = await exchangeCodeForUserToken(
    String(req.query.code),
    appId,
    appSecret,
    redirectUri()
  )
  const longToken = await exchangeForLongLivedUserToken(shortToken, appId, appSecret)
  const pages = await listManagedPages(longToken)

  if (pages.length === 0) {
    res
      .status(200)
      .send(
        errorPage(
          'No Pages were shared',
          'Facebook didn\'t pass along any Pages. This usually means the tick box next to your Page was left unchecked, or you don\'t have full control of it. Open the link again and make sure your Page is ticked.'
        )
      )
    return
  }

  if (pages.length === 1) {
    const page = pages[0]
    await finalize(inviteId, page.id, page.accessToken, invite?.createdBy)
    const profile = await fetchPageProfile(page.id, page.accessToken).catch(() => ({
      name: page.name,
    }))
    res.status(200).send(successPage(profile.name ?? page.name))
    return
  }

  // More than one Page came back, so the owner picks. The tokens stay server
  // side in a short-lived document rather than being round-tripped through
  // the browser as hidden form fields.
  const pendingId = crypto.randomBytes(16).toString('hex')
  await admin
    .firestore()
    .collection(INVITES)
    .doc(inviteId)
    .collection('pending')
    .doc(pendingId)
    .set({
      pages: pages.map((p) => ({ id: p.id, name: p.name, accessToken: p.accessToken })),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + PENDING_TTL_MS),
    })

  const base = `${FB_CONNECT_BASE_URL.value().replace(/\/$/, '')}/fbConnect`
  res.status(200).send(
    pickerPage(
      pages.map((p) => ({ id: p.id, name: p.name })),
      (pageId) => {
        const payload = `${inviteId}.${pendingId}.${pageId}`
        return `${base}?pending=${encodeURIComponent(
          `${inviteId}.${pendingId}`
        )}&page=${encodeURIComponent(pageId)}&sig=${sign(payload, secret)}`
      }
    )
  )
}

/** Stage three, only when the owner manages several Pages. */
async function handlePageChoice(
  req: import('firebase-functions/v2/https').Request,
  res: import('express').Response,
  secret: string
) {
  const [inviteId, pendingId] = String(req.query.pending).split('.')
  const pageId = String(req.query.page)
  const sig = String(req.query.sig)

  if (!inviteId || !pendingId || !verify(`${inviteId}.${pendingId}.${pageId}`, sig, secret)) {
    res.status(403).send(errorPage('This link isn\'t valid', 'Please start again from the beginning.'))
    return
  }

  const pendingRef = admin
    .firestore()
    .collection(INVITES)
    .doc(inviteId)
    .collection('pending')
    .doc(pendingId)
  const pending = (await pendingRef.get()).data() as
    | { pages?: { id: string; name: string; accessToken: string }[]; expiresAt?: FirebaseFirestore.Timestamp }
    | undefined

  if (!pending?.pages || (pending.expiresAt && pending.expiresAt.toMillis() < Date.now())) {
    res
      .status(410)
      .send(
        errorPage(
          'That took a little too long',
          'For safety this step expires after fifteen minutes. Open your connection link again — it only takes a moment.'
        )
      )
    return
  }

  const chosen = pending.pages.find((p) => p.id === pageId)
  if (!chosen) {
    res.status(400).send(errorPage('We couldn\'t find that Page', 'Please start again from the link you were sent.'))
    return
  }

  const invite = (await admin.firestore().collection(INVITES).doc(inviteId).get()).data() as
    | InviteDoc
    | undefined

  await finalize(inviteId, chosen.id, chosen.accessToken, invite?.createdBy)
  await pendingRef.delete().catch(() => {})
  res.status(200).send(successPage(chosen.name))
}

/**
 * Store the connection, start the webhook, and pull the first batch of posts.
 *
 * The initial sync runs inline so the owner's "connected" screen is truthful —
 * by the time they read it, their posts really are on their way.
 */
async function finalize(
  inviteId: string,
  pageId: string,
  pageToken: string,
  connectedBy?: string
): Promise<void> {
  const profile = await fetchPageProfile(pageId, pageToken).catch(() => null)

  await admin
    .firestore()
    .collection(CONNECTIONS)
    .doc(pageId)
    .set(
      {
        pageId,
        pageName: profile?.name ?? pageId,
        pagePicture: profile?.picture ?? null,
        accessToken: pageToken,
        connectedBy: connectedBy ?? null,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
        lastSyncError: null,
      },
      { merge: true }
    )

  await admin
    .firestore()
    .collection(INVITES)
    .doc(inviteId)
    .set(
      { usedAt: admin.firestore.FieldValue.serverTimestamp(), pageId, nonce: null },
      { merge: true }
    )

  // Neither of these should cost the owner their success screen: the webhook
  // can be re-subscribed by the hourly job, and the first sync will retry.
  await subscribePageToWebhook(pageId, pageToken).catch((err) =>
    logger.error('fb: webhook subscribe failed', { pageId, err: String(err) })
  )
  await syncPage(pageId).catch((err) => logger.error('fb: initial sync failed', { pageId, err: String(err) }))
}
