// Shapes for Facebook Page posts as the sync functions store them.
//
// There is no Graph API client here on purpose. Reading a Page needs a Page
// access token, and shipping one to a device would hand every member a
// credential that can act as the Page — so the sync runs in Cloud Functions
// (`functions/src/facebook/`) and writes into Firestore, and the app only
// ever reads what landed there.
//
// Writing back to Facebook is not possible at all: Meta removed publishing on
// behalf of a user with `publish_actions` in Graph API v3.0 and never replaced
// it, and a Page token would post as the Page rather than as the member who
// tapped. Members act on a post by opening it on Facebook via `permalinkUrl`.

export interface FbComment {
  id: string
  fromName: string
  fromPicture?: string
  message: string
  createdTime: string
}

export interface FbPost {
  id: string
  message?: string
  story?: string
  /** Mirrored into our own Storage bucket; Graph's own URLs expire. */
  fullPicture?: string
  /** Canonical Facebook URL for the post — every action button opens this. */
  permalinkUrl?: string
  createdTime: string
  likesCount: number
  commentsCount: number
  sharesCount: number
  topComments: FbComment[]
}

/** Firestore path holding a Page's synced posts. */
export const postsPath = (fbPageId: string) => ['fbPagePosts', fbPageId, 'posts'] as const

/**
 * Where a member should land when they tap through.
 *
 * Falls back to the Page itself when a post has no permalink, which happens
 * for a few post types, so a tap never dead-ends.
 */
export function facebookUrlFor(post: FbPost, fbPageId?: string): string {
  return post.permalinkUrl ?? `https://www.facebook.com/${fbPageId ?? ''}`
}
