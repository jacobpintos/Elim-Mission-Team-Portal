import { describe, expect, it } from 'vitest'
import { seal, unseal, type Paused } from '../../functions/src/miriam/pause'
import { appToolsFrom } from '../../functions/src/miriam/plan'
import { screensFor } from './miriamScreens'
import {
  announcementsFound,
  announcementsShown,
  contentFound,
  fits,
  roomName,
  roomsFor,
  settingsShown,
} from './miriamAppData'
import type { UserProfile } from '@/types/user'
import type { Announcement, Room } from '@/types/events'
import type { MusicItem } from '@/stores/musicStore'

const person = (uid: string, roles: string[]) =>
  ({ uid, roles, displayName: uid, email: `${uid}@x.org` }) as unknown as UserProfile

describe('a request paused while the app looks things up', () => {
  const paused: Paused = {
    uid: 'sarah',
    until: 1,
    round: 1,
    alone: false,
    appTools: ['read_messages'],
    messages: [{ role: 'user', content: 'hi' }],
    done: [],
    waiting: ['call1'],
  }

  it('comes back as it was sent', () => {
    expect(unseal(seal(paused, 'key'), 'key')).toEqual(paused)
  })

  it('is refused if changed, or sealed with another key', () => {
    const state = seal(paused, 'key')
    const [body, mark] = state.split('.')
    const changed = Buffer.from(JSON.stringify({ ...paused, uid: 'boss' }), 'utf8').toString(
      'base64url'
    )
    expect(unseal(`${changed}.${mark}`, 'key')).toBeNull()
    expect(unseal(`${body}.${mark}x`, 'key')).toBeNull()
    expect(unseal(state, 'other key')).toBeNull()
    expect(unseal(undefined, 'key')).toBeNull()
  })

  it('offers only lookups that exist', () => {
    expect(appToolsFrom(['read_messages', 'delete_everything', 'find_content'])).toEqual([
      'find_content',
      'read_messages',
    ])
    expect(appToolsFrom('read_messages')).toEqual([])
  })
})

describe('the screens Miriam can take someone to', () => {
  const ids = (roles: string[]) => screensFor(person('u', roles)).map((s) => s.id)

  it('gives admins the admin panel and its sections', () => {
    expect(ids(['admin'])).toEqual(
      expect.arrayContaining(['admin', 'admin_users', 'admin_groups', 'planning', 'ops_inventory'])
    )
  })

  it('gives a member their own tabs, and no admin pages', () => {
    const member = ids(['regular'])
    expect(member).toEqual(expect.arrayContaining(['events', 'issues', 'kaizen', 'settings']))
    expect(member.filter((id) => id.startsWith('admin') || id === 'planning')).toEqual([])
  })

  it('gives a guest Worship and Content, and not Operations', () => {
    const guest = ids(['guest'])
    expect(guest).toEqual(expect.arrayContaining(['worship', 'music', 'events']))
    expect(guest).not.toContain('issues')
    expect(guest).not.toContain('kaizen')
  })
})

describe('what the app lookups hand back', () => {
  it('matches loosely, and everything on an empty query', () => {
    expect(fits('Sunday Sermon — Grace', 'sermons')).toBe(true)
    expect(fits('Worship Night', 'serm')).toBe(false)
    expect(fits('anything', '')).toBe(true)
  })

  it('shows announcements as the screen does: to their audience, until their last day', () => {
    const a = (id: string, over: Partial<Announcement>) =>
      ({
        id,
        title: id,
        body: '',
        isPublic: false,
        audience: [],
        attachment: null,
        by: 'boss',
        ts: 1,
        ...over,
      }) as Announcement
    const all = [
      a('everyone', { ts: 3 }),
      a('for sarah', { audience: ['sarah'], ts: 2 }),
      a('for bob', { audience: ['bob'] }),
      a('gone', { expiresAt: '2026-10-01' }),
    ]
    const shown = announcementsShown(all, person('sarah', ['regular']), '2026-10-09')
    expect(shown.map((x) => x.title)).toEqual(['everyone', 'for sarah'])
    expect(announcementsShown(all, person('boss', ['admin']), '2026-10-09')).toHaveLength(4)
    expect(announcementsFound(shown, new Map([['boss', 'Pastor Bo']]), '')[0]).toMatchObject({
      title: 'everyone',
      postedBy: 'Pastor Bo',
    })
  })

  it('finds a conversation by its name or a person in it', () => {
    const rooms = [
      { id: 'r1', name: '', members: ['sarah', 'jacob'] },
      { id: 'r2', name: 'Worship Team', members: ['sarah', 'mia', 'jacob'] },
    ] as Room[]
    const names = new Map([
      ['jacob', 'Jacob Pintos'],
      ['mia', 'Mia Tentschert'],
    ])
    expect(roomName(rooms[0], 'sarah', names)).toBe('Jacob Pintos')
    expect(roomsFor(rooms, 'sarah', names, 'worship').map((r) => r.id)).toEqual(['r2'])
    expect(roomsFor(rooms, 'sarah', names, 'mia').map((r) => r.id)).toEqual(['r2'])
    expect(roomsFor(rooms, 'sarah', names, 'jacob').map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('finds Content to play by preacher or kind, newest first', () => {
    const items = [
      {
        id: 'm1',
        type: 'sermon',
        title: 'Grace',
        preacher: 'Pastor Bo',
        youtubeUrl: '',
        year: 2025,
      },
      {
        id: 'm2',
        type: 'sermon',
        title: 'Hope',
        preacher: 'Pastor Bo',
        youtubeUrl: '',
        year: 2026,
      },
      { id: 'm3', type: 'music', title: 'Above All', youtubeUrl: '', year: 2026 },
    ] as MusicItem[]
    expect(contentFound(items, 'bo').map((m) => m.id)).toEqual(['m2', 'm1'])
    expect(contentFound(items, 'sermon').map((m) => m.id)).toEqual(['m2', 'm1'])
  })

  it('reads their settings out plainly', () => {
    const p = {
      ...person('sarah', ['regular']),
      notificationPrefs: { newMessage: { push: true, email: false }, weeklyDigest: true },
    } as unknown as UserProfile
    expect(settingsShown(p).notifications).toEqual({
      newMessage: 'push on, email off',
      weeklyDigest: 'on',
    })
  })
})
