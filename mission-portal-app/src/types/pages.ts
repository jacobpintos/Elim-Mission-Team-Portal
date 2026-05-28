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

export interface TwoColData extends Record<string, unknown> {
  leftHead?: string
  leftContent?: string
  rightImage?: string
  rightContent?: string
}

export interface TimelineData extends Record<string, unknown> {
  entries?: Array<{ year: string; title: string; desc: string }>
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
  links?: Array<{ icon: string; label: string; url: string }>
}

export interface PageData {
  blocks: PageBlock[]
  bgImage: string | null
  bgParallax: boolean
}
