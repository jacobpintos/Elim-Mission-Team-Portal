import { describe, expect, it } from 'vitest'
import { selfAsked, selfIntro } from '../../functions/src/miriam/own/self'

describe('selfAsked', () => {
  it('hears a question about her, however it is put', () => {
    for (const q of [
      'who are you',
      'Hey Miriam, who are you?',
      'What are you?',
      'what can you do',
      'What can you help me with?',
      'how can you help me',
      'tell me about yourself',
      'Introduce yourself',
      'are you a real person',
      'Are you a robot or a person?',
      'are you AI',
      'are you ChatGPT',
      'what kind of AI are you',
      'how do you work',
    ])
      expect(selfAsked(q), q).toBe(true)
  })

  it('leaves requests, other people and her name alone', () => {
    for (const q of [
      'what can you do about the picnic',
      'who are you bringing to the retreat',
      'who is the pastor',
      'why are you called Miriam',
      'what does Miriam mean',
      'are you coming to youth night',
    ])
      expect(selfAsked(q), q).toBe(false)
  })
})

describe('selfIntro', () => {
  it('to a team member: an AI, Claude for the rest, and what they can do', () => {
    const said = selfIntro({ isPublic: false, messages: true, worship: true, admin: true })
    expect(said).toMatch(
      /^I’m Miriam, the assistant in this app — an AI language model, not a person\./
    )
    expect(said).toContain('Claude, an AI model from Anthropic')
    expect(said).toContain('read your messages and announcements')
    expect(said).toContain('open chord sheets and set lists')
    expect(said).toContain('help with admin work')
    expect(said).toMatch(/check anything that matters/)
  })

  it('offers only what they have', () => {
    const said = selfIntro({ isPublic: false })
    expect(said).toContain('read announcements')
    expect(said).not.toMatch(/messages|chord sheets|admin work/)
  })

  it('to a public follower: her own model only, and what is theirs', () => {
    const said = selfIntro({ isPublic: true })
    expect(said).toMatch(/an AI language model, not a person, and I run on the app’s own servers/)
    expect(said).toContain('ask to meet with our leadership')
    expect(said).toContain('light or dark mode, your notifications')
    expect(said).not.toMatch(/Claude|Anthropic|messages/)
  })
})
