import { describe, expect, it } from 'vitest'
import { postsAsked, postsFor, postsSaid } from './miriamPosts'
import { screenAsked } from './miriamQuick'
import { screensFor } from './miriamScreens'
import type { PostPage } from '@/types/events'
import type { UserProfile } from '@/types/user'

const NOW = new Date('2026-10-14T15:00:00').getTime() // a Wednesday
const day = (d: string) => new Date(`${d}T10:00:00`).getTime()
const PAGES: PostPage[] = [
  {
    id: 'missions',
    label: 'Missions',
    posts: [
      { id: 'm1', ts: day('2026-10-12'), author: 'a', body: 'The Guatemala team landed safely!' },
      { id: 'm2', ts: day('2026-09-30'), author: 'a', body: 'Packing day is Saturday.' },
    ],
  },
  {
    id: 'youth',
    label: 'Youth',
    posts: [{ id: 'y1', ts: day('2026-10-13'), author: 'b', body: 'Pizza night Friday at 7' }],
  },
]

describe('posts read out', () => {
  it('knows when they are asked for — and from which page', () => {
    expect(postsAsked('what’s the latest post?')).toEqual({ page: '' })
    expect(postsAsked('read me the newest post from Missions')).toEqual({ page: 'missions' })
    expect(postsAsked('what did the youth page post')).toEqual({ page: 'youth' })
    expect(postsAsked('any new posts')).toEqual({ page: '' })
    for (const said of [
      'make a post about Sunday',
      'like the latest post',
      'when is youth night',
    ]) {
      expect(postsAsked(said), said).toBeNull()
    }
  })

  it('the newest first, from the page named', () => {
    expect(postsFor(PAGES, '').map((r) => r.post.id)).toEqual(['y1', 'm1', 'm2'])
    expect(postsFor(PAGES, 'missions').map((r) => r.post.id)).toEqual(['m1', 'm2'])
  })

  it('said as she says them', () => {
    expect(postsSaid(postsFor(PAGES, ''), '', NOW)).toBe(
      'There have been 2 posts this week. The latest, from Youth yesterday: Pizza night Friday at 7.'
    )
    expect(postsSaid(postsFor(PAGES, 'missions'), 'missions', NOW)).toBe(
      'The latest post, from Missions Monday: The Guatemala team landed safely!'
    )
    expect(postsSaid([], 'choir', NOW)).toBe('I couldn’t find any posts from choir.')
  })
})

describe('a public follower’s screens, asked for', () => {
  const screens = screensFor({ uid: 'p', roles: ['public'] } as unknown as UserProfile)

  it.each([
    ['take me to giving', 'giving'],
    ['open our story', 'story'],
    ['open the meeting form', 'connect'],
    ['go to posts', 'posts'],
    ['show me the events', 'events'],
  ])('%s', (said, id) => {
    expect(screenAsked(said, screens)).toBe(id)
  })

  it('and none of a member’s', () => {
    expect(screenAsked('open my tasks', screens)).toBeNull()
    expect(screenAsked('open messages', screens)).toBeNull()
  })
})
