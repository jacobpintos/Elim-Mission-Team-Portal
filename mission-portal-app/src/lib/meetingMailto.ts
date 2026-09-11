import type { MeetingRequest } from '@/types/meeting'

/**
 * The reply to a meeting request, handed to whatever mail app is installed.
 *
 * A mailto rather than something sent from the app. The reply should land in
 * the leader's own sent items and come from their own address, so the person
 * who asked can simply reply to it and carry on the conversation — an email
 * sent by the server arrives from nobody and replies into a void. It also
 * means answering a request needs no mail service configured at all.
 *
 * The draft is a starting point and is meant to be edited. It repeats the
 * availability back because that is the thing the reply has to respond to, and
 * having it in the body saves switching between the app and the mail window.
 */

/** Just the first word of a name, for a greeting. */
export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? ''
  return first || 'there'
}

export interface MailtoParts {
  to: string
  cc: string[]
  subject: string
  body: string
}

/** The pieces of the reply, before they are encoded into a URL. */
export function meetingReplyParts(request: MeetingRequest, signerName?: string): MailtoParts {
  const greeting = firstName(request.fromName)
  const sign = signerName?.trim() ? `\n\n${signerName.trim()}` : ''
  const said = request.message.trim()

  const body = [
    `Hi ${greeting},`,
    '',
    'Thank you for reaching out — we would love to meet with you.',
    '',
    `You mentioned you are available: ${request.availability.trim()}`,
    '',
    said ? `You wrote: "${said}"` : null,
    said ? '' : null,
    'Would one of those times work? Reply here and we will get it in the diary.',
    'We look forward to meeting you.',
  ]
    .filter((line) => line !== null)
    .join('\n')

  return {
    to: request.fromEmail,
    // Everyone else who was asked, so the rest of them can see it is answered
    // and nobody writes to the same person twice.
    cc: (request.leaderEmails ?? []).filter((e) => e && e !== request.fromEmail),
    subject: 'Re: Your meeting request',
    body: body + sign,
  }
}

/**
 * The whole mailto URL.
 *
 * Every part is encoded, including the address. A name or a subject carrying an
 * ampersand would otherwise end the query string early and drop the body.
 */
export function meetingReplyMailto(request: MeetingRequest, signerName?: string): string {
  const { to, cc, subject, body } = meetingReplyParts(request, signerName)
  const params = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`]
  if (cc.length > 0) params.unshift(`cc=${encodeURIComponent(cc.join(','))}`)
  return `mailto:${encodeURIComponent(to)}?${params.join('&')}`
}
