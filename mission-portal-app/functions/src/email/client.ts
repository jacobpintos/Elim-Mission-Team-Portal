import { Resend } from 'resend'
import { defineSecret, defineString } from 'firebase-functions/params'

export const RESEND_API_KEY = defineSecret('RESEND_API_KEY')

// Single source of truth for the outbound sender identity and the admin inbox.
// Every email send site reads these, so pointing the app at the verified Resend
// domain is a one-place change: set the MAIL_FROM / MAIL_ADMIN_TO param (via
// functions/.env or the Firebase config) or edit the defaults below. These are
// plain config, not secrets, so they use string params. The from-address must
// be on a domain verified in Resend before non-sandbox sends will succeed.
export const MAIL_FROM = defineString('MAIL_FROM', {
  default: 'Mission Portal <noreply@yourdomain.com>',
})
export const MAIL_ADMIN_TO = defineString('MAIL_ADMIN_TO', {
  default: 'admin@yourdomain.com',
})

let _client: Resend | null = null

export function resend() {
  if (!_client) _client = new Resend(RESEND_API_KEY.value())
  return _client
}
