export interface LodgingEntry {
  id: string
  name: string
  room?: string
  assignees: string[]
}

export interface FlightEntry {
  id: string
  uid: string        // required — who this entry belongs to

  // Outbound
  outDate?: string
  outTime?: string
  outAirport?: string
  outAirline?: string
  outFlight?: string
  outStatusLink?: string
  outTicket?: string
  outConfirmation?: string
  outArrival?: string
  outContact?: string

  // Return
  retDate?: string
  retTime?: string
  retAirport?: string
  retAirline?: string
  retFlight?: string
  retStatusLink?: string
  retTicket?: string
  retConfirmation?: string
  retArrival?: string
}

export interface CarpoolCarData {
  id: string
  label: string
  seats?: number
  driver: string
  riders: string[]
}

export interface EventTeam {
  name: string
  leaders: (string | number)[]
  members: (string | number)[]
}

export interface DressCodeEntry {
  group: string // team name | 'Unassigned' | '_remainder_'
  text: string
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
  virtualLink?: string
  signUpLink?: string
  startTime?: string // '10:00 AM'
  rtp?: string
  rtm?: string
  dcw?: string
  dcm?: string
  users?: (string | number)[]
  groups?: string[]
  food?: boolean
  carpool?: boolean
  foodItems?: string[]
  carpoolLoc?: string
  carpoolCars?: CarpoolCarData[]
  vehicles?: unknown[]
  teams?: EventTeam[]
  dressCode?: DressCodeEntry[]
  isPublic?: boolean
  taskTemplateId?: string
  lodging?: boolean
  lodgingEntries?: LodgingEntry[]
  flights?: boolean
  flightEntries?: FlightEntry[]
  extraDays?: ExtraDay[]
  overrides?: Record<string, Partial<EventTemplate>>
  planningBoardId?: string | number
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
  source?: 'instance' | 'series'
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
  status: 'pending' | 'in_progress' | 'done' | 'behind'
  evId?: string | number | null
  evDate?: string | null
  evTemplateId?: string | number | null
  dueDate?: string | null
  projectedDate?: string | null
  overdueNotified?: boolean
  taskType?: 'kaizen_verification' | 'kaizen_action' | 'issue_corrective' | 'worship_setlist_ack'
  kaizenId?: string | number
  issueId?: string | number
  setListId?: string | number
  isPostEvent?: boolean
  doneAt?: unknown
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
  fbPageId?: string  // Facebook Page ID or username — Zapier path + Graph API (post-approval)
  fbToken?: string   // Page Access Token — added after Facebook app approval
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

export interface CommonTeam {
  name: string
  members: string[]
}

export interface ConfigMain {
  calY: number
  calM: number
  COMMON_TEAMS: (string | CommonTeam)[]
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
