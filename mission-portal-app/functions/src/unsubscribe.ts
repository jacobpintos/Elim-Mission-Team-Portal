import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'

if (!admin.apps.length) admin.initializeApp()

export const unsubscribe = onRequest(async (req, res) => {
  const { uid, type, token } = req.query as { uid: string; type: string; token: string }
  const secret = process.env.UNSUBSCRIBE_HMAC_SECRET ?? ''
  const expected = crypto.createHmac('sha256', secret).update(`${uid}:${type}`).digest('hex')
  if (!secret || token !== expected) {
    res.status(400).send('Invalid unsubscribe link.')
    return
  }
  const db = admin.firestore()
  const field =
    type === 'weekly' ? 'notificationPrefs.weeklyDigest' : 'notificationPrefs.monthlyDigest'
  await db.collection('users').doc(uid).update({ [field]: false })
  res.status(200).send(
    `<!DOCTYPE html><html lang="en"><head><title>Unsubscribed</title></head><body style="font-family:sans-serif;max-width:400px;margin:60px auto;text-align:center;color:#333"><h2>You've been unsubscribed.</h2><p>You will no longer receive ${type} email digests from The Well of Iowa.</p><p style="margin-top:24px;font-size:13px;color:#888">Changed your mind? Update your notification preferences in the portal.</p></body></html>`
  )
})
