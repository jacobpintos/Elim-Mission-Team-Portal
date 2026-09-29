import { describe, it, expect } from 'vitest'
import { matchContentByTitle, contentItemForUrl, uniqueTitleMatch } from './contentMatch'
import type { MusicItem } from '@/stores/musicStore'

const item = (over: Partial<MusicItem>): MusicItem => ({
  id: over.id ?? '1',
  type: over.type ?? 'music',
  title: over.title ?? 'Goodness of God',
  youtubeUrl: over.youtubeUrl ?? 'https://youtu.be/abc123',
  ...over,
})

describe('matchContentByTitle', () => {
  it('matches a title ignoring case and surrounding space', () => {
    const items = [item({ title: 'Goodness of God ' })]
    expect(matchContentByTitle('  GOODNESS OF GOD', items)?.id).toBe('1')
  })

  it('returns nothing when no video shares the name', () => {
    expect(matchContentByTitle('Great Are You Lord', [item({})])).toBeNull()
  })

  it('refuses to guess between two videos of the same name', () => {
    // A studio cut and a live version: picking either is as likely to be wrong
    // as right, so the builder leaves it to the person.
    const items = [item({ id: '1' }), item({ id: '2', youtubeUrl: 'https://youtu.be/def456' })]
    expect(matchContentByTitle('Goodness of God', items)).toBeNull()
  })

  it('ignores sermons and podcasts that happen to share a name', () => {
    const items = [item({ id: '9', type: 'sermon' })]
    expect(matchContentByTitle('Goodness of God', items)).toBeNull()
  })

  it('ignores an item with no video behind it', () => {
    expect(matchContentByTitle('Goodness of God', [item({ youtubeUrl: '' })])).toBeNull()
  })

  it('has nothing to match on an empty name', () => {
    expect(matchContentByTitle('', [item({})])).toBeNull()
    expect(matchContentByTitle(null, [item({})])).toBeNull()
    expect(matchContentByTitle(undefined, [item({})])).toBeNull()
  })
})

describe('contentItemForUrl', () => {
  it('finds the item a link came from', () => {
    expect(contentItemForUrl('https://youtu.be/abc123', [item({})])?.title).toBe('Goodness of God')
  })

  it('returns nothing for a link typed by hand', () => {
    expect(contentItemForUrl('https://youtu.be/zzz999', [item({})])).toBeNull()
    expect(contentItemForUrl('', [item({})])).toBeNull()
  })
})

describe('uniqueTitleMatch', () => {
  it('finds a chord sheet by the video it shares a name with', () => {
    const sheets = [
      { id: 7, title: 'Great Are You Lord' },
      { id: 8, title: 'Goodness of God' },
    ]
    expect(uniqueTitleMatch('goodness of god ', sheets)?.id).toBe(8)
  })

  it('declines when two things share the name', () => {
    const sheets = [
      { id: 1, title: 'Goodness of God' },
      { id: 2, title: 'Goodness of God' },
    ]
    expect(uniqueTitleMatch('Goodness of God', sheets)).toBeNull()
  })

  it('has nothing to match on an empty name', () => {
    expect(uniqueTitleMatch('   ', [{ id: 1, title: 'Anything' }])).toBeNull()
  })
})
