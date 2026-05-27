import { Resend } from 'resend'
import { defineSecret } from 'firebase-functions/params'

export const RESEND_API_KEY = defineSecret('RESEND_API_KEY')

let _client: Resend | null = null

export function resend() {
  if (!_client) _client = new Resend(RESEND_API_KEY.value())
  return _client
}
