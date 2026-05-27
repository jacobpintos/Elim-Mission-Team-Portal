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

export interface HeroData {
  heading?: string
  subheading?: string
  bgImage?: string
  parallax?: boolean
  overlayColor?: string
  textColor?: string
}

export interface TextData {
  heading?: string
  content?: string
}

export interface ImageData {
  src?: string
  caption?: string
  align?: 'left' | 'center' | 'right'
}

export interface TwoColData {
  leftHead?: string
  leftContent?: string
  rightImage?: string
  rightContent?: string
}

export interface TimelineData {
  entries?: Array<{ year: string; title: string; desc: string }>
}

export interface ButtonData {
  label?: string
  url?: string
  align?: 'left' | 'center' | 'right'
}

export interface DividerData {}

export interface MeetingData {
  heading?: string
  intro?: string
}

export interface SocialData {
  heading?: string
  links?: Array<{ icon: string; label: string; url: string }>
}

export interface PageData {
  blocks: PageBlock[]
  bgImage: string | null
  bgParallax: boolean
}
