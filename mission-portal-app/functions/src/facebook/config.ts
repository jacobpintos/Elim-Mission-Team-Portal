import { defineSecret, defineString } from 'firebase-functions/params'

/** Meta app credentials. The secret never leaves the server. */
export const FB_APP_ID = defineSecret('FB_APP_ID')
export const FB_APP_SECRET = defineSecret('FB_APP_SECRET')

/**
 * Shared secret echoed back to Meta during webhook registration, and the key
 * used to sign connect invitations. Both are ours, not Meta's.
 */
export const FB_WEBHOOK_VERIFY_TOKEN = defineSecret('FB_WEBHOOK_VERIFY_TOKEN')
export const FB_CONNECT_SECRET = defineSecret('FB_CONNECT_SECRET')

/**
 * Public base URL the connect function is reachable at, e.g.
 * https://us-central1-mission-team-portal.cloudfunctions.net
 *
 * Meta matches `redirect_uri` against its registered list character for
 * character, so this cannot be derived from the incoming request — behind a
 * Hosting rewrite the host header is the Hosting domain, not the function's.
 */
export const FB_CONNECT_BASE_URL = defineString('FB_CONNECT_BASE_URL')

export const GRAPH = 'https://graph.facebook.com/v20.0'

/** Where Meta sends the owner back. Must be listed as a Valid OAuth Redirect URI. */
export function redirectUri(): string {
  return `${FB_CONNECT_BASE_URL.value().replace(/\/$/, '')}/fbConnect`
}

/**
 * Read-only Page access.
 *
 * `pages_show_list` lets the owner pick a Page, `pages_read_engagement` reads
 * the Page's own posts and its like/share counts, and `pages_read_user_content`
 * is what actually returns comments left by other people — without it the
 * comment previews come back empty. Nothing here can publish.
 */
export const SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_read_user_content']

/** Fields pulled for each post. Mirrors what the feed screen renders. */
export const POST_FIELDS = [
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

/** Firestore collections owned by this integration. */
export const CONNECTIONS = 'fbConnections'
export const INVITES = 'fbConnectInvites'
export const PAGE_POSTS = 'fbPagePosts'
