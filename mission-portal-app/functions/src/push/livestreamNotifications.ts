import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { sendExpoPush } from './expoPush'

if (!admin.apps.length) admin.initializeApp()

/**
 * Push tokens for everyone who asked to hear about streams.
 *
 * Queried on the preference rather than on a role, unlike getPublicTokens
 * above it: a service going live is of interest to the team and to the people
 * who follow along from home alike, and the only thing that decides it is
 * whether someone said yes when asked.
 *
 * The equality is against `true` explicitly. The field is absent for anyone
 * who has not been asked yet, and absent must not mean subscribed.
 */
async function getLivestreamTokens(): Promise<string[]> {
  const snap = await admin
    .firestore()
    .collection('users')
    .where('notificationPrefs.livestream.push', '==', true)
    .get()

  const tokens: string[] = []
  for (const doc of snap.docs) {
    const pushTokens = doc.data().pushTokens as
      | Record<string, { token: string } | string | null>
      | undefined
    if (!pushTokens) continue
    for (const val of Object.values(pushTokens)) {
      const token = typeof val === 'string' ? val : val?.token
      if (token && token.startsWith('ExponentPushToken')) tokens.push(token)
    }
  }
  return tokens
}

/**
 * Tell subscribers when a stream card is posted.
 *
 * On create only, which is what makes a correction free: the admin sheet
 * reuses the standing card's id when a wrong link is fixed mid-service, so
 * that write lands as an update and nobody is pushed a second time. A stream
 * posted after the last one was taken down gets a fresh id, and does notify.
 */
export const onLivestreamPosted = onDocumentCreated('livestreams/{id}', async (event) => {
  const data = event.data?.data()
  if (!data) return

  // A card posted already expired is not worth waking anyone for — it will
  // never appear in the app, so the push would lead to nothing.
  const expiresAt = Number(data.expiresAt ?? 0)
  if (!expiresAt || expiresAt <= Date.now()) {
    logger.info('[onLivestreamPosted] card is already expired, sending nothing', {
      id: event.params.id,
      expiresAt,
    })
    return
  }

  const tokens = await getLivestreamTokens()
  if (!tokens.length) return

  const title = typeof data.title === 'string' && data.title ? data.title : 'A service'
  await sendExpoPush(tokens, 'Live now', `${title} has started streaming.`, {
    type: 'livestream',
    id: event.params.id,
    // Opened by the response listener in app/_layout.tsx, which routes on
    // `link` — so tapping the notification lands on the screen with the box.
    link: '/(app)/music',
  })
  logger.info(`[onLivestreamPosted] "${title}" sent to ${tokens.length} token(s)`)
})
