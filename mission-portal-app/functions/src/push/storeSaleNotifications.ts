import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { deliverNotification } from './notifyCore'

if (!admin.apps.length) admin.initializeApp()

/**
 * The sale's last day as people are told it: "Sunday, November 1".
 *
 * Read from the date the admin chose rather than from the end-of-day moment
 * stored beside it. A function runs in UTC, and that moment, read here, is
 * early the next morning — the wrong day for anyone in Iowa.
 */
export function saleEndsLabel(endsOn: unknown): string {
  if (typeof endsOn !== 'string') return ''
  const match = endsOn.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `ends ${date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })}`
}

/**
 * Tell everyone who asked when the Elim Store posts a sale.
 *
 * On create only, as stream cards are: correcting a sale's wording in the app
 * is an update to the same document and wakes nobody again, while a new sale
 * is a new document and does.
 *
 * Only accounts that said yes. The preference is opt-in and absent until
 * asked for, and deliverNotification on its own reads absent as on — so the
 * query, not the delivery, is what keeps anyone who never asked from being
 * sent one.
 */
export const onStoreSalePosted = onDocumentCreated('storeSales/{id}', async (event) => {
  const data = event.data?.data()
  if (!data) return

  // Posted already over: it will never show in the app, so there is nothing to send people to.
  const endsAt = Number(data.endsAt ?? 0)
  if (!endsAt || endsAt <= Date.now()) {
    logger.info('[onStoreSalePosted] sale has already ended, sending nothing', {
      id: event.params.id,
    })
    return
  }

  const users = await admin
    .firestore()
    .collection('users')
    .where('notificationPrefs.storeSale.push', '==', true)
    .get()
  if (users.empty) return

  const message = typeof data.message === 'string' ? data.message.trim() : ''
  const payload = {
    message,
    endsLabel: saleEndsLabel(data.endsOn),
    // Routed on by the response listener in app/_layout.tsx: the store tab,
    // which public accounts have directly and members reach in Public Facing.
    link: '/(app)/store',
  }

  let sent = 0
  for (const user of users.docs) {
    try {
      await deliverNotification(user.id, 'storeSale', payload)
      sent++
    } catch (err) {
      logger.error('[onStoreSalePosted] delivery failed', { uid: user.id, err })
    }
  }
  logger.info(`[onStoreSalePosted] "${message}" sent to ${sent} account(s)`)
})
