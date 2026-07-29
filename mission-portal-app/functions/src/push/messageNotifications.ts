import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { RESEND_API_KEY } from '../email/client'
import { notifyUser } from './notifyCore'

if (!admin.apps.length) admin.initializeApp()

/**
 * Notifies room members when a new message arrives.
 *
 * Messages are written client-side straight to Firestore, so this trigger is
 * the only place a message notification can originate. Skips the sender and
 * anyone who has muted the room (Room.mutedBy).
 */
export const onMessageCreated = onDocumentCreated(
  { document: 'rooms/{roomId}/messages/{msgId}', secrets: [RESEND_API_KEY] },
  async (event) => {
    const msg = event.data?.data() as
      | { uid?: string | number; text?: string; attachment?: unknown }
      | undefined
    if (!msg) return

    const roomId = event.params.roomId
    const db = admin.firestore()
    const roomSnap = await db.doc(`rooms/${roomId}`).get()
    const room = roomSnap.data() as
      | { name?: string; members?: (string | number)[]; mutedBy?: (string | number)[] }
      | undefined
    if (!room) return

    const senderUid = String(msg.uid ?? '')
    const muted = new Set((room.mutedBy ?? []).map(String))

    const recipients = (room.members ?? [])
      .map(String)
      .filter((uid) => uid && uid !== senderUid && !muted.has(uid))

    if (recipients.length === 0) return

    // Resolve the sender's display name for a more useful notification body.
    let senderName = ''
    if (senderUid) {
      const senderSnap = await db.doc(`users/${senderUid}`).get()
      const sender = senderSnap.data()
      senderName = (sender?.displayName as string) || (sender?.email as string) || ''
    }

    for (const uid of recipients) {
      await notifyUser(uid, 'newMessage', {
        roomName: room.name ?? 'a room',
        roomId,
        senderName,
      })
    }
    logger.info(`onMessageCreated: notified ${recipients.length} member(s) of room ${roomId}`)
  }
)
