export type PageBlockType =
  | 'hero'
  | 'text'
  | 'image'
  | 'twocol'
  | 'timeline'
  | 'button'
  | 'divider'
  | 'meeting'
  | 'social'
  | 'embed'
  | 'quote'
  | 'gallery'

export interface PageBlock {
  id: number // Date.now() at creation
  type: PageBlockType
  data: Record<string, unknown>
}

export interface HeroData extends Record<string, unknown> {
  heading?: string
  subheading?: string
  bgImage?: string
  parallax?: boolean
  overlayColor?: string
  textColor?: string
}

export interface TextData extends Record<string, unknown> {
  heading?: string
  content?: string
}

export interface ImageData extends Record<string, unknown> {
  src?: string
  caption?: string
  align?: 'left' | 'center' | 'right'
}

export interface EmbedData extends Record<string, unknown> {
  url?: string
  /** Shown above the frame, so the page still reads if the embed fails. */
  heading?: string
  /**
   * How tall the frame is, in points.
   *
   * A web page has no natural height the app can measure, so it has to be
   * declared. The block scrolls its own content inside this box, which is why
   * getting it roughly right matters more than for an image.
   */
  height?: number
}

export interface QuoteData extends Record<string, unknown> {
  /** The line itself. Set larger and in the accent colour. */
  text?: string
  /** Who said it, if it is attributed. */
  attribution?: string
}

export interface GalleryData extends Record<string, unknown> {
  /** Image addresses, laid out in a grid in the order given. */
  images?: string[]
  /** Columns. Two suits book covers; three suits snapshots. */
  columns?: number
  heading?: string
}

export interface TwoColData extends Record<string, unknown> {
  leftHead?: string
  leftContent?: string
  rightImage?: string
  rightContent?: string
}

export interface TimelineData extends Record<string, unknown> {
  entries?: { year: string; title: string; desc: string }[]
}

export interface ButtonData extends Record<string, unknown> {
  label?: string
  url?: string
  align?: 'left' | 'center' | 'right'
}

export interface DividerData extends Record<string, unknown> {}

export interface MeetingData extends Record<string, unknown> {
  heading?: string
  intro?: string
}

export interface SocialData extends Record<string, unknown> {
  heading?: string
  links?: { icon: string; label: string; url: string }[]
}

export interface PageData {
  blocks: PageBlock[]
  bgImage: string | null
  bgParallax: boolean
}
