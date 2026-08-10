import { GRAPH, POST_FIELDS } from './config'

/** A post in the shape the feed screen reads out of Firestore. */
export interface StoredPost {
  message?: string
  story?: string
  fullPicture?: string
  permalinkUrl?: string
  createdTime: string
  likesCount: number
  commentsCount: number
  sharesCount: number
  topComments: StoredComment[]
}

export interface StoredComment {
  id: string
  fromName: string
  fromPicture?: string
  message: string
  createdTime: string
}

export interface GraphPage {
  id: string
  name: string
  accessToken: string
}

type RawPost = Record<string, unknown>
type RawComment = {
  id: string
  from?: { name?: string; picture?: { data?: { url?: string }; url?: string } }
  message?: string
  created_time: string
}

/**
 * Meta reports failures as a 200 with an `error` body as often as not, so
 * every call funnels through here rather than trusting the status code.
 */
async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`)
  const data = (await res.json()) as T & { error?: { message: string; code?: number } }
  if (data.error) {
    const err = new Error(data.error.message) as Error & { fbCode?: number }
    err.fbCode = data.error.code
    throw err
  }
  return data
}

async function graphPost<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  const data = (await res.json()) as T & { error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
  return data
}

/** Step 1 of the handshake: the one-time code becomes a short-lived user token. */
export async function exchangeCodeForUserToken(
  code: string,
  appId: string,
  appSecret: string,
  redirect: string
): Promise<string> {
  const data = await graphGet<{ access_token: string }>('/oauth/access_token', {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirect,
    code,
  })
  return data.access_token
}

/**
 * Step 2: trade up to a 60-day user token.
 *
 * This matters more than it looks — a Page token minted from a *short-lived*
 * user token expires in about an hour, while one minted from a long-lived
 * token does not expire at all. Skipping this step is why most Page
 * integrations mysteriously die the same afternoon they are set up.
 */
export async function exchangeForLongLivedUserToken(
  shortToken: string,
  appId: string,
  appSecret: string
): Promise<string> {
  const data = await graphGet<{ access_token: string }>('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  })
  return data.access_token
}

/** Step 3: the Pages this person administers, each with its own token. */
export async function listManagedPages(userToken: string): Promise<GraphPage[]> {
  const data = await graphGet<{
    data?: { id: string; name: string; access_token: string }[]
  }>('/me/accounts', { access_token: userToken, fields: 'id,name,access_token', limit: '100' })
  return (data.data ?? []).map((p) => ({ id: p.id, name: p.name, accessToken: p.access_token }))
}

/** Confirms a stored token still works, and refreshes the Page's display name. */
export async function fetchPageProfile(
  pageId: string,
  token: string
): Promise<{ name: string; picture?: string }> {
  const data = await graphGet<{
    name: string
    picture?: { data?: { url?: string } }
  }>(`/${pageId}`, { access_token: token, fields: 'name,picture{url}' })
  return { name: data.name, picture: data.picture?.data?.url }
}

function mapComment(c: RawComment): StoredComment {
  return {
    id: c.id,
    fromName: c.from?.name ?? 'Facebook User',
    fromPicture: c.from?.picture?.data?.url ?? c.from?.picture?.url,
    message: c.message ?? '',
    createdTime: c.created_time,
  }
}

export function mapPost(raw: RawPost): StoredPost & { id: string } {
  const likes = raw.likes as { summary?: { total_count?: number } } | undefined
  const comments = raw.comments as
    | { summary?: { total_count?: number }; data?: RawComment[] }
    | undefined
  const shares = raw.shares as { count?: number } | undefined
  return {
    id: raw.id as string,
    message: (raw.message as string | undefined) ?? undefined,
    story: (raw.story as string | undefined) ?? undefined,
    fullPicture: (raw.full_picture as string | undefined) ?? undefined,
    permalinkUrl: (raw.permalink_url as string | undefined) ?? undefined,
    createdTime: raw.created_time as string,
    likesCount: likes?.summary?.total_count ?? 0,
    commentsCount: comments?.summary?.total_count ?? 0,
    sharesCount: shares?.count ?? 0,
    topComments: (comments?.data ?? []).map(mapComment),
  }
}

/** The Page's own published posts, newest first. */
export async function fetchPagePosts(
  pageId: string,
  token: string,
  limit = 25
): Promise<(StoredPost & { id: string })[]> {
  const data = await graphGet<{ data?: RawPost[] }>(`/${pageId}/posts`, {
    access_token: token,
    fields: POST_FIELDS,
    limit: String(limit),
  })
  return (data.data ?? []).map(mapPost)
}

/** One post by ID — the webhook path, which tells us exactly what changed. */
export async function fetchSinglePost(
  postId: string,
  token: string
): Promise<(StoredPost & { id: string }) | null> {
  try {
    const raw = await graphGet<RawPost>(`/${postId}`, {
      access_token: token,
      fields: POST_FIELDS,
    })
    return mapPost(raw)
  } catch {
    // Deleted between the webhook firing and this call, or not visible to us.
    return null
  }
}

/** Asks Meta to send us `feed` events for this Page. */
export async function subscribePageToWebhook(pageId: string, pageToken: string): Promise<void> {
  await graphPost(`/${pageId}/subscribed_apps`, {
    access_token: pageToken,
    subscribed_fields: 'feed',
  })
}

/** Used when an owner disconnects from our side rather than Facebook's. */
export async function unsubscribePageFromWebhook(pageId: string, pageToken: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: pageToken }).toString(),
  })
  const data = (await res.json()) as { error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
}
