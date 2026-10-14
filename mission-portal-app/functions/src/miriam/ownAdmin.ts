import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { embed } from './own/encoder'
import { forgetBraveKey } from './own'
import { forget, listLearned, listTaught, teach, untaught, WEB_DOC, type OwnDb } from './own/learn'

if (!admin.apps.length) admin.initializeApp()

/**
 * Admin → Miriam: what she has learned from Claude (to see, and to forget
 * one learned wrong), the answers she has been taught (to add and take
 * away), and her web search key. All of it is kept where no device can read
 * it (firestore.rules: miriamOwn); this is the only way in, for admins only.
 * The key is never sent back — only whether one is set.
 */
export const miriamOwnAdmin = onCall(
  { memory: '1GiB', cpu: 1, timeoutSeconds: 60 },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.')
    const db = admin.firestore()
    const me = await db.doc(`users/${uid}`).get()
    const roles: unknown = me.data()?.roles
    if (!Array.isArray(roles) || !roles.includes('admin')) {
      throw new HttpsError('permission-denied', 'Only admins can change what Miriam knows.')
    }
    const ownDb = db as unknown as OwnDb
    const action = String(req.data?.action ?? '')
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

    if (action === 'list') {
      const [learned, taught, web] = await Promise.all([
        listLearned(ownDb),
        listTaught(ownDb),
        db.doc(WEB_DOC).get(),
      ])
      const w = web.data() ?? {}
      return {
        learned: learned.slice(0, 300),
        learnedCount: learned.length,
        taught,
        web: {
          brave: typeof w.braveKey === 'string' && !!w.braveKey,
          setAt: typeof w.setAt === 'number' ? w.setAt : null,
        },
      }
    }
    if (action === 'forget') {
      const t = text(req.data?.text, 300)
      if (!t) throw new HttpsError('invalid-argument', 'Which one?')
      await forget(ownDb, t)
      return { ok: true }
    }
    if (action === 'teach') {
      const q = text(req.data?.question, 300)
      const a = text(req.data?.answer, 1200)
      if (!q || !a) throw new HttpsError('invalid-argument', 'A question and its answer, both.')
      try {
        // Its meaning, as she reads a question: what she matches questions to.
        const id = await teach(ownDb, { q, a, v: embed(q), by: uid })
        return { ok: true, id }
      } catch (err) {
        if (err instanceof Error && err.message === 'full') {
          throw new HttpsError(
            'resource-exhausted',
            'She has as many answers as she can hold — take one away first.'
          )
        }
        throw err
      }
    }
    if (action === 'untaught') {
      const id = text(req.data?.id, 40)
      if (!id) throw new HttpsError('invalid-argument', 'Which one?')
      await untaught(ownDb, id)
      return { ok: true }
    }
    if (action === 'setWebKey') {
      const key = text(req.data?.key, 200)
      await db
        .doc(WEB_DOC)
        .set(
          key
            ? { braveKey: key, setAt: Date.now(), by: uid }
            : { braveKey: admin.firestore.FieldValue.delete(), setAt: Date.now(), by: uid },
          { merge: true }
        )
      forgetBraveKey()
      return { ok: true, brave: !!key }
    }
    throw new HttpsError('invalid-argument', 'Not something Miriam’s admin page does.')
  }
)
