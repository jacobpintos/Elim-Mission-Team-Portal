import { resend } from './client'

interface TransactionalEmailParams {
  to: string
  subject: string
  html: string
}

/**
 * Low-level helper for sending a transactional email.
 * Called internally by Cloud Function handlers.
 */
export async function sendTransactionalEmail(params: TransactionalEmailParams): Promise<void> {
  await resend().emails.send({
    from: 'Mission Portal <noreply@yourdomain.com>',
    ...params,
  })
}
