import { describe, it, expect } from 'vitest'
import { firstName, meetingReplyParts, meetingReplyMailto } from './meetingMailto'
import type { MeetingRequest } from '@/types/meeting'

const request = (over: Partial<MeetingRequest> = {}): MeetingRequest => ({
  id: 'mr1',
  fromUid: 'u1',
  fromName: 'Jacob Pintos',
  fromEmail: 'jacob.pintos@thewellia.com',
  leaders: ['l1', 'l2'],
  leaderEmails: ['kolton@example.com', 'sunny@example.com'],
  availability: 'Weekday evenings after 6',
  message: 'I would like to talk about serving.',
  createdAt: 1,
  status: 'open',
  ...over,
})

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('Jacob Pintos')).toBe('Jacob')
  })

  it('falls back to something addressable when there is no name', () => {
    expect(firstName('   ')).toBe('there')
    expect(firstName('')).toBe('there')
  })
})

describe('meetingReplyParts', () => {
  it('writes to the person who asked', () => {
    expect(meetingReplyParts(request()).to).toBe('jacob.pintos@thewellia.com')
  })

  it('copies in the others who were asked', () => {
    expect(meetingReplyParts(request()).cc).toEqual(['kolton@example.com', 'sunny@example.com'])
  })

  it('never copies the requester on their own reply', () => {
    const parts = meetingReplyParts(
      request({ leaderEmails: ['kolton@example.com', 'jacob.pintos@thewellia.com'] })
    )
    expect(parts.cc).toEqual(['kolton@example.com'])
  })

  it('copies nobody when their addresses are unknown', () => {
    expect(meetingReplyParts(request({ leaderEmails: undefined })).cc).toEqual([])
  })

  it('greets them and repeats their availability back', () => {
    const { body } = meetingReplyParts(request())
    expect(body).toContain('Hi Jacob,')
    expect(body).toContain('Weekday evenings after 6')
  })

  it('quotes what they wrote when they wrote something', () => {
    expect(meetingReplyParts(request()).body).toContain('I would like to talk about serving.')
  })

  it('leaves no empty quotation when they wrote nothing', () => {
    const { body } = meetingReplyParts(request({ message: '' }))
    expect(body).not.toContain('You wrote')
    expect(body).not.toContain('""')
  })

  it('signs off when it knows who is replying', () => {
    expect(meetingReplyParts(request(), 'Kolton Haight').body).toMatch(/Kolton Haight$/)
  })

  it('does not leave a dangling signature when it does not', () => {
    const { body } = meetingReplyParts(request(), '   ')
    expect(body.endsWith('We look forward to meeting you.')).toBe(true)
  })
})

describe('meetingReplyMailto', () => {
  it('builds a mailto the mail app will accept', () => {
    const url = meetingReplyMailto(request(), 'Kolton Haight')
    expect(url.startsWith('mailto:')).toBe(true)
    expect(url).toContain('cc=')
    expect(url).toContain('subject=')
    expect(url).toContain('body=')
  })

  it('encodes a body that would otherwise break the query', () => {
    // An ampersand reaching the body raw would end the query string early and
    // take the rest of the message with it. Availability is quoted back
    // verbatim, so it is the field most likely to carry one.
    const url = meetingReplyMailto(request({ availability: 'Tue & Thu evenings' }))
    expect(url).toContain('Tue%20%26%20Thu')
    expect(url).not.toContain('& Thu')
  })

  it('keeps everything after an ampersand in the message', () => {
    const url = meetingReplyMailto(request({ message: 'Kids & youth' }))
    const body = decodeURIComponent(url.split('body=')[1])
    expect(body).toContain('Kids & youth')
    expect(body).toContain('We look forward to meeting you.')
  })

  it('encodes the address itself', () => {
    const url = meetingReplyMailto(request({ fromEmail: 'a+b@example.com' }))
    expect(url).toContain('a%2Bb%40example.com')
  })

  it('leaves cc out entirely when there is nobody to copy', () => {
    expect(meetingReplyMailto(request({ leaderEmails: [] }))).not.toContain('cc=')
  })
})
