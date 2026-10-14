import type { Post, PostPage } from '@/types/events'

/**
 * Posts read out by Miriam — "what's the latest post?", "read me the newest
 * post from Missions", "any new posts?" — from the church's own post pages
 * (config/main: postsConfig), as the Posts screen shows them.
 */

const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[?!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Posts asked to be read — from one page, if one is named — or null for anything else. */
export function postsAsked(text: string): { page: string } | null {
  const s = plain(text)
  if (!/\bposts?\b|\bposted\b/.test(s)) return null
  // Making, liking or answering one is not reading it.
  if (/\b(?:add|make|create|write|delete|remove|like|comment|share)\b/.test(s)) return null
  if (!/\b(?:latest|newest|recent|new|last|read|any|what's|whats|what|show|tell)\b/.test(s))
    return null
  const page =
    /\bwhat\s+(?:did|has)\s+(?:the\s+)?(.+?)\s+post(?:ed)?\b/.exec(s)?.[1] ??
    /\bposts?\s+(?:from|on|by|in)\s+(?:the\s+)?(.+)$/.exec(s)?.[1] ??
    ''
  return {
    page: page
      .replace(/\b(?:page|feed|team)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }
}

export interface PostRead {
  page: PostPage
  post: Post
}

/** The posts asked for, newest first: from the page named (by any of its words), or all of them. */
export function postsFor(pages: readonly PostPage[], page: string): PostRead[] {
  const words = page.split(' ').filter((w) => w.length > 2)
  const from = words.length
    ? pages.filter((p) => words.some((w) => p.label.toLowerCase().includes(w)))
    : pages
  return from
    .flatMap((p) => (p.posts ?? []).map((post) => ({ page: p, post })))
    .filter((r) => r.post.body?.trim())
    .sort((a, b) => b.post.ts - a.post.ts)
}

/** A day as said: "today", "yesterday", "Monday", "Oct 3". */
function daySaid(ts: number, now: number): string {
  const d = new Date(ts)
  const today = new Date(now)
  const days = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000
  )
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The words of a post, as said: about sixty of them at most. */
const bodySaid = (body: string) => {
  const words = body
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
  return words.length > 60 ? `${words.slice(0, 60).join(' ')}…` : words.join(' ')
}

/** The newest of them read out, with how many there were this week. */
export function postsSaid(read: readonly PostRead[], page: string, now: number): string {
  if (read.length === 0) {
    return page ? `I couldn’t find any posts from ${page}.` : 'There aren’t any posts yet.'
  }
  const [latest] = read
  const week = read.filter((r) => now - r.post.ts < 7 * 86_400_000).length
  const lead =
    week > 1 ? `There have been ${week} posts this week. The latest, ` : 'The latest post, '
  const body = bodySaid(latest.post.body)
  return `${lead}from ${latest.page.label} ${daySaid(latest.post.ts, now)}: ${body}${/[.!?…]$/.test(body) ? '' : '.'}`
}
