import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'

if (!admin.apps.length) admin.initializeApp()

export const resendWebhook = onRequest(async (req, res) => {
  const signingSecret = process.env.RESEND_WEBHOOK_SECRET ?? ''
  const rawBody = JSON.stringify(req.body)
  const expected = crypto.createHmac('sha256', signingSecret).update(rawBody).digest('hex')
  const signature = ((req.headers['resend-signature'] as string) ?? '').replace('sha256=', '')
  if (signingSecret && signature !== expected) {
    res.status(401).send('Invalid signature')
    return
  }

  const event = req.body as {
    type: string
    data?: { tags?: { batchId?: string } }
  }
  const db = admin.firestore()

  if (['email.delivered', 'email.bounced', 'email.opened'].includes(event.type)) {
    const batchId = event.data?.tags?.batchId
    if (batchId) {
      const snap = await db.collection('digestStats').where('batchId', '==', batchId).limit(1).get()
      if (!snap.empty) {
        const field =
          event.type === 'email.delivered'
            ? 'delivered'
            : event.type === 'email.bounced'
            ? 'bounced'
            : 'opened'
        await snap.docs[0].ref.update({ [field]: admin.firestore.FieldValue.increment(1) })
      }
    }
  }

  res.status(200).send('ok')
})
