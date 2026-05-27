// Phase 3 Posts types — Facebook page post aggregator
// (distinct from Phase 2 in-app social posts in src/types/events.ts)

export interface Post {
  id: string // e.g. 'post_' + Date.now()
  date: string // 'YYYY-MM-DD'
  url: string // Facebook post URL (direct link, not oEmbed)
  title?: string
  note?: string // extra context shown in card
}

export interface PostPage {
  id: string // e.g. 'page_1718123456789'
  label: string // display name
  bgImage?: string // URL for page thumbnail / avatar
  fbUrl?: string // Facebook page URL (for "View on Facebook" link)
  desc?: string // caption shown below page selector button
  posts: Post[]
}

export interface PostsConfig {
  pages: PostPage[]
}
