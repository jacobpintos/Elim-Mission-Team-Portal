export interface EventTeam {
  name: string
  leaders: (string | number)[]
  members: (string | number)[]
}

export interface ExtraDay {
  date: string // 'YYYY-MM-DD'
  startTime?: string
  location?: string
}

export interface EventTemplate {
  id: string | number
  title: string
  date?: string // 'YYYY-MM-DD'
  isRec: boolean
  recur?: 'weekly' | 'biweekly' | 'monthly'
  recDay?: number // 0=Sunday … 6=Saturday
  recEnd?: string | null
  location?: string
  city?: string
  state?: string
  address?: string
  isVirtual?: boolean
  signUpLink?: string
  startTime?: string // '10:00 AM'
  rtp?: string
  rtm?: string
  dcw?: string
  dcm?: string
  users?: (string | number)[]
  food?: boolean
  carpool?: boolean
  foodItems?: string[]
  carpoolLoc?: string
  vehicles?: unknown[]
  teams?: EventTeam[]
  isPublic?: boolean
  taskTemplateId?: string
  extraDays?: ExtraDay[]
  overrides?: Record<string, Partial<EventTemplate>>
  _geocodeLat?: number
  _geocodeLng?: number
  _updatedAt?: unknown
}

export interface EventInstance extends EventTemplate {
  date: string
  instanceKey: string
  templateId: string | number
  _dayIndex?: number
  _dayLabel?: string
  _isExtraDay?: boolean
}

export interface AvailResponse {
  status: 'yes' | 'no' | 'partial' | 'tbd'
  note: string
  uid: string
  ts: number
}

export interface AvailDoc {
  responses: Record<string, AvailResponse>
  updatedAt: unknown
}

export interface Task {
  id: string | number
  assignees: (string | number)[]
  lead: string | number | null
  by: string | number
  title: string
  status: 'pending' | 'done' | 'behind'
  evId?: string | number | null
  evDate?: string | null
  evTemplateId?: string | number | null
  dueDate?: string | null
  projectedDate?: string | null
  overdueNotified?: boolean
  _updatedAt?: unknown
}

export interface Room {
  id: string | number
  name: string
  members: (string | number)[]
  call: boolean
  reviewers: (string | number)[]
  updatedAt?: unknown
}

export interface MessageAttachment {
  type: 'image' | 'file'
  url: string
  name?: string
  size?: number
}

export interface Message {
  uid: string | number
  text: string
  attachment: MessageAttachment | null
  ts: number
  readBy: Record<string, boolean>
}

export interface Announcement {
  id: string | number
  title: string
  body: string
  isPublic: boolean
  audience: (string | number)[]
  attachment: AnnouncementAttachment | null
  by: string | number
  ts: number
}

export interface AnnouncementAttachment {
  type: 'image' | 'file'
  url: string
  name?: string
}

export interface PostComment {
  id: string
  uid: string | number
  body: string
  ts: number
}

export interface Post {
  id: string
  ts: number
  author: string | number
  body: string
  images?: string[]
  likes?: Record<string, boolean>
  comments?: PostComment[]
}

export interface PostPage {
  id: string
  label: string
  bgImage?: string
  fbUrl?: string
  desc?: string
  posts: Post[]
}

export interface PostsConfig {
  pages: PostPage[]
}

export interface InAppNotif {
  id: string
  msg: string
  ts: number
  type: string
  read: boolean
  link?: string
}

export interface NotifDoc {
  items: InAppNotif[]
  updatedAt?: unknown
}

export interface ConfigMain {
  calY: number
  calM: number
  COMMON_TEAMS: string[]
  connectConfig: { socialLinks: unknown[]; leadershipTeam: unknown[] }
  publicPages: Record<string, unknown>
  postsConfig: PostsConfig
  lastSeenPosts: Record<string, number>
  nEv: number
  nTask: number
  nGroup: number
  nRoom: number
  nReport: number
  nNotif: number
  updatedAt: unknown
}
