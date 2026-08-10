import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import { logger } from 'firebase-functions'
import { FB_APP_SECRET, FB_WEBHOOK_VERIFY_TOKEN } from './config'
import { syncSinglePost } from './sync'

if (!admin.apps.length) admin.initializeApp()

interface FeedChange {
  field?: string
  value?: {
    item?: string
    verb?: string
    post_id?: string
    published?: number
  }
}

interface WebhookBody {
  object?: string
  entry?: { id: string; changes?: FeedChange[] }[]
}

/**
 * Real-time Page updates from Meta.
 *
 * Meta expects a 200 quickly and retries on anything else, so the response is
 * sent before the syncing work — a slow Graph call must not turn into a
 * duplicate delivery.
 */
export const fbWebhook = onRequest(
  { secrets: [FB_APP_SECRET, FB_WEBHOOK_VERIFY_TOKEN] },
  async (req, res) => {
    // Registration handshake: Meta calls this once when the callback URL is saved.
    if (req.method === 'GET') {
      const mode = req.query['hub.mode']
      const token = req.query['hub.verify_token']
      const challenge = req.query['hub.challenge']
      if (mode === 'subscribe' && token === FB_WEBHOOK_VERIFY_TOKEN.value()) {
        res.status(200).send(String(challenge))
      } else {
        logger.warn('fb: webhook verification rejected')
        res.status(403).send('Forbidden')
      }
      return
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed')
      return
    }

    // The signature covers the exact bytes Meta sent, so the parsed body is no
    // use here — `rawBody` is what has to be hashed.
    const signature = (req.headers['x-hub-signature-256'] as string | undefined) ?? ''
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', FB_APP_SECRET.value()).update(req.rawBody).digest('hex')

    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expected)
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      logger.warn('fb: webhook signature mismatch')
      res.status(401).send('Invalid signature')
      return
    }

    res.status(200).send('EVENT_RECEIVED')

    const body = req.body as WebhookBody
    if (body.object !== 'page') return

    for (const entry of body.entry ?? []) {
      const pageId = entry.id
      for (const change of entry.changes ?? []) {
        if (change.field !== 'feed') continue
        const value = change.value ?? {}
        const postId = value.post_id
        if (!postId) continue

        // `remove` on the post itself is a deletion; everything else (a new
        // post, an edit, a comment or reaction landing on it) is a reason to
        // re-read the post and refresh its counts.
        try {
          if (value.verb === 'remove' && value.item === 'post') {
            await admin
              .firestore()
              .collection('fbPagePosts')
              .doc(pageId)
              .collection('posts')
              .doc(postId)
              .delete()
            logger.info('fb: post removed via webhook', { pageId, postId })
          } else {
            await syncSinglePost(pageId, postId)
          }
        } catch (err) {
          logger.error('fb: webhook handling failed', { pageId, postId, err: String(err) })
        }
      }
    }
  }
)
