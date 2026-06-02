// Facebook Graph API v20.0 utilities.
// These functions are wired in after Facebook app review approval.
// Until then, the feed uses Firestore posts written by Zapier or demo data.

export interface FbPost {
  id: string
  message?: string
  story?: string
  fullPicture?: string
  permalinkUrl?: string
  createdTime: string
  likesCount: number
  commentsCount: number
  sharesCount: number
  topComments: FbComment[]
}

export interface FbComment {
  id: string
  fromName: string
  fromPicture?: string
  message: string
  createdTime: string
}

const BASE = 'https://graph.facebook.com/v20.0'
const FIELDS = [
  'id',
  'message',
  'story',
  'full_picture',
  'permalink_url',
  'created_time',
  'likes.summary(true)',
  'comments.limit(3).summary(true){id,from{name,picture{url}},message,created_time}',
  'shares',
].join(',')

type RawPost = Record<string, unknown>
type RawComment = { id: string; from?: { name?: string; picture?: { url?: string } }; message: string; created_time: string }

function mapPost(raw: RawPost): FbPost {
  const likes = raw.likes as { summary: { total_count: number } } | undefined
  const comments = raw.comments as { summary: { total_count: number }; data?: RawComment[] } | undefined
  const shares = raw.shares as { count: number } | undefined
  return {
    id: raw.id as string,
    message: raw.message as string | undefined,
    story: raw.story as string | undefined,
    fullPicture: raw.full_picture as string | undefined,
    permalinkUrl: raw.permalink_url as string | undefined,
    createdTime: raw.created_time as string,
    likesCount: likes?.summary?.total_count ?? 0,
    commentsCount: comments?.summary?.total_count ?? 0,
    sharesCount: shares?.count ?? 0,
    topComments: (comments?.data ?? []).map((c) => ({
      id: c.id,
      fromName: c.from?.name ?? 'Facebook User',
      fromPicture: c.from?.picture?.url,
      message: c.message,
      createdTime: c.created_time,
    })),
  }
}

export async function fetchPagePosts(
  fbPageId: string,
  token: string,
  after?: string
): Promise<{ posts: FbPost[]; nextCursor?: string }> {
  const params = new URLSearchParams({ fields: FIELDS, access_token: token, limit: '10' })
  if (after) params.set('after', after)
  const res = await fetch(`${BASE}/${fbPageId}/posts?${params}`)
  const data = (await res.json()) as { data?: RawPost[]; paging?: { cursors?: { after?: string } }; error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
  return {
    posts: (data.data ?? []).map(mapPost),
    nextCursor: data.paging?.cursors?.after,
  }
}

export async function likeFbPost(postId: string, token: string): Promise<void> {
  const res = await fetch(`${BASE}/${postId}/likes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: token }).toString(),
  })
  const data = (await res.json()) as { error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
}

export async function unlikeFbPost(postId: string, token: string): Promise<void> {
  const res = await fetch(`${BASE}/${postId}/likes`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: token }).toString(),
  })
  const data = (await res.json()) as { error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
}

export async function postFbComment(postId: string, token: string, message: string): Promise<void> {
  const res = await fetch(`${BASE}/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: token, message }).toString(),
  })
  const data = (await res.json()) as { error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
}
