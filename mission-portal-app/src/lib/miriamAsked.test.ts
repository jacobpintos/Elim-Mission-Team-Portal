import { describe, expect, it, vi } from 'vitest'
import { askedQuestion, audienceOf } from './miriamAsked'
import { embed } from '../../functions/src/miriam/own/encoder'
import { askKind, groupAsked } from '../../functions/src/miriam/own/asked'
import type { UserProfile } from '@/types/user'

// Her model, in plain JavaScript: seconds of it on a busy machine.
vi.setConfig({ testTimeout: 30_000 })

describe('questions kept for Analytics', () => {
  it('are questions, as asked', () => {
    expect(askedQuestion('when is youth night?')).toBe('when is youth night?')
    expect(askedQuestion('Where does the name Elim come from')).toBe(
      'Where does the name Elim come from'
    )
    expect(askedQuestion('youth night is when?')).toBe('youth night is when?')
    expect(askedQuestion('x'.repeat(300) + ' ?')?.length).toBe(200)
  })

  it('never a note, a reminder, a message — nor what is only theirs, or not a question', () => {
    for (const said of [
      'can you add a note to Friday?',
      'what are my notes this week',
      'can you remind me at 5 to call Sam',
      'can you send a message to Jacob',
      'what is my password',
      'when is my doctor appointment',
      'open the chord sheet for Above All',
      'yes',
      'thanks',
    ]) {
      expect(askedQuestion(said), said).toBeNull()
    }
  })

  it('say what kind of account asked — never who', () => {
    const as = (roles: string[]) => ({ uid: 'x', roles }) as unknown as UserProfile
    expect(audienceOf(as(['public']))).toBe('public')
    expect(audienceOf(as(['regular']))).toBe('member')
    expect(audienceOf(as(['guest']))).toBe('guest')
    expect(audienceOf(as(['guest', 'worship']))).toBe('member')
    expect(audienceOf(null)).toBe('public')
  })
})

describe('the most asked, grouped by meaning', () => {
  const asked = (texts: [string, number][]) =>
    texts.flatMap(([text, n]) => Array.from({ length: n }, () => ({ text, v: embed(text) })))

  it('the same question in other words counts once — a different one, apart', () => {
    const groups = groupAsked(
      asked([
        ['When is Youth Night?', 3],
        ['when is youth night', 1],
        ['What time does Youth Night start?', 1],
        ['Where is Youth Night?', 2],
        ['Where does the name Elim come from?', 1],
        ['What does Elim mean?', 1],
        ['When is the church picnic?', 1],
      ])
    )
    expect(groups[0]).toEqual({
      text: 'When is Youth Night?',
      count: 5,
      also: ['What time does Youth Night start?'],
    })
    // Where, not when: a question of its own, however near the words.
    expect(groups.find((g) => g.text === 'Where is Youth Night?')?.count).toBe(2)
    expect(groups.find((g) => g.text.includes('Elim'))?.count).toBe(2)
    expect(groups.find((g) => g.text === 'When is the church picnic?')?.count).toBe(1)
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(10)
  })

  it('knows what a question asks for', () => {
    expect(askKind('when is youth night')).toBe('time')
    expect(askKind('what time does it start')).toBe('time')
    expect(askKind('where is youth night')).toBe('place')
    expect(askKind('how do I get to the church')).toBe('place')
    expect(askKind('where does the name Elim come from')).toBe('other')
    expect(askKind('who is driving')).toBe('who')
    expect(askKind('why are you called Miriam')).toBe('why')
    // Not when, nor where, however it starts.
    expect(askKind('what happens when we die')).toBe('other')
    expect(askKind('how do I get saved')).toBe('other')
    expect(askKind('how do I get there')).toBe('place')
  })
})
