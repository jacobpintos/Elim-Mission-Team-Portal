import { onCall } from 'firebase-functions/v2/https'
import { resend, RESEND_API_KEY } from './client'

interface ContactFormPayload {
  name: string
  email: string
  message: string
}

/**
 * Public contact form → sends an email to the church admin inbox.
 * Called from the public contact form (no auth required).
 */
export const sendContactForm = onCall(
  { secrets: [RESEND_API_KEY] },
  async (req) => {
    const { name, email, message } = req.data as ContactFormPayload

    if (!name || !email || !message) {
      throw new Error('Missing required fields: name, email, message')
    }

    await resend().emails.send({
      from: 'Mission Portal <noreply@yourdomain.com>',
      to: 'admin@yourdomain.com', // TODO: read from Firestore appSettings
      reply_to: email,
      subject: `Contact form: ${name}`,
      html: `
        <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
      `,
    })

    return { ok: true }
  }
)
