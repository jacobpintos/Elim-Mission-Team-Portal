import { describe, it, expect } from 'vitest'
import { storyPassages, leaderAsked, leaderAnswer } from '../../functions/src/miriam/own/leaders'
import { STORY_BLOCKS } from './__fixtures__/ourStory'

const passages = storyPassages(STORY_BLOCKS)

describe('storyPassages', () => {
  it('reads every kind of block, with its heading, and drops emphasis marks', () => {
    expect(passages.map((p) => p.heading)).toEqual([
      '',
      'How it began',
      'Our Pastor',
      'Elders appointed',
      'Our team',
    ])
    expect(passages[2].text).toContain('Amy loves teaching')
    expect(passages[3].text).toBe(
      '2021: Elders appointed: Mark Chen and Tom Reyes became our first elders.'
    )
  })

  it('reads nothing from a page that is not there', () => {
    expect(storyPassages(undefined)).toEqual([])
  })
})

describe('leaderAsked', () => {
  it('hears the church’s roles however they are asked', () => {
    expect(leaderAsked('Who is the pastor?')).toMatchObject({ role: 'pastor' })
    expect(leaderAsked("who's our lead pastor")).toMatchObject({ role: 'pastor' })
    expect(leaderAsked('who are the elders')).toMatchObject({ role: 'elders' })
    expect(leaderAsked('who started the church')).toMatchObject({ role: 'founders' })
    expect(leaderAsked('who founded the well')).toMatchObject({ role: 'founders' })
    expect(leaderAsked('who leads the church')).toMatchObject({ role: 'leaders' })
    expect(leaderAsked('tell me about the church leadership')).toMatchObject({ role: 'leaders' })
  })

  it('hears someone by name, with or without a title', () => {
    expect(leaderAsked('who is Amy Lee')).toEqual({ role: null, name: 'amy lee' })
    expect(leaderAsked('tell me about pastor Amy')).toEqual({ role: 'pastor', name: 'amy' })
    expect(leaderAsked('who is Mark Chen?')).toEqual({ role: null, name: 'mark chen' })
  })

  it('leaves what is not about who someone is', () => {
    expect(leaderAsked("what's pastor Amy's phone number")).toBeNull()
    expect(leaderAsked('when does the pastor preach')).toBeNull()
    expect(leaderAsked('schedule a meeting with the pastor')).toBeNull()
    expect(leaderAsked('add a task for the elders')).toBeNull()
    expect(leaderAsked("who's on my team")).toBeNull()
  })
})

describe('leaderAnswer', () => {
  const answer = (q: string) => {
    const ask = leaderAsked(q)
    return ask ? leaderAnswer(ask, passages) : null
  }

  it('reads the block whose heading is about it from its start', () => {
    expect(answer('who is the pastor')).toBe(
      'Pastor Amy Lee has led The Well since 2019. She grew up in Cedar Rapids and studied at Moody. Amy loves teaching through whole books of the Bible.'
    )
  })

  it('finds someone by name, and goes on while the page is still about them', () => {
    // Two people asked about together: each name is on the page.
    expect(answer('who are Daniel and Ruth Okafor')).toMatch(/^The Well was planted/)
    expect(answer('who is Ruth Okafor')).toBe(
      'The Well was planted in 2015 by Daniel and Ruth Okafor in North Liberty. They started with twelve people in a living room. Today the church gathers every Sunday.'
    )
    expect(answer('who is Mark Chen')).toBe(
      '2021: Elders appointed: Mark Chen and Tom Reyes became our first elders.'
    )
  })

  it('answers who started it, and who the elders are', () => {
    expect(answer('who started the church')).toMatch(
      /^The Well was planted in 2015 by Daniel and Ruth Okafor/
    )
    expect(answer('who are the elders')).toMatch(/Mark Chen and Tom Reyes/)
  })

  it('says nothing the page does not say', () => {
    expect(answer('who are the deacons')).toBeNull()
    expect(answer('who is Bob Smith')).toBeNull()
    // "team" is in the page, but as a word, not as someone's name.
    expect(answer('who is the team')).toBeNull()
  })
})
