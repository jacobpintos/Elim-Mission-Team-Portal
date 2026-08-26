export interface LodgingEntry {
  id: string
  name: string
  room?: string
  assignees: string[]
}

export interface FlightEntry {
  id: string
  uid: string // required — who this entry belongs to

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
  deleted?: boolean
  unpublished?: boolean
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
  notifiedDueWeekAt?: string | null // date str this task's 1-week-out reminder was sent, for dedup
  notifiedDueTodayAt?: string | null // date str this task's due-today reminder was sent, for dedup
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
  mutedBy?: (string | number)[]
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
  /**
   * Last day this announcement is shown, as YYYY-MM-DD.
   *
   * Deleted outright the day after — document, and the photo in Storage with
   * it — by expireAnnouncements. Absent means it stays until someone removes
   * it by hand.
   */
  expiresAt?: string
  /** When it was last edited, if it has been. */
  editedTs?: number
}

export interface AnnouncementAttachment {
  type: 'image' | 'file'
  url: string
  name?: string
  /**
   * The photo's own pixel size, recorded at upload.
   *
   * Kept so a card can work out the height that preserves the proportions
   * without downloading the image and measuring it first — which would mean
   * every card jumping once the real size arrived.
   */
  width?: number
  height?: number
  /**
   * The height an admin chose instead, in points.
   *
   * The photo always spans the card's width, so height is the only dimension
   * there is to set. Absent means "whatever the proportions ask for". When it
   * is set and differs, the photo is cropped to the box, never stretched.
   */
  displayHeight?: number
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
  /**
   * Facebook Page ID this portal page mirrors.
   *
   * Set by an admin to match a Page an owner connected through the
   * `fbConnect` flow; it is the key into `fbPagePosts/{fbPageId}/posts`. The
   * Page access token is deliberately not here — it lives server-side in
   * `fbConnections` and never reaches a device.
   */
  fbPageId?: string
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
  // CCLI license number for the organization. Displayed on chord sheets and
  // their PDF/print exports — CCLI requires the license number to appear on
  // reproduced worship materials.
  ccliLicense?: string
  COMMON_TEAMS: (string | CommonTeam)[]
  connectConfig: {
    socialLinks: unknown[]
    leadershipTeam: unknown[]
    /**
     * Who receives the daily texting-list requests.
     *
     * An identifier, not a title: it routes a job and is shown nowhere on the
     * person's profile. Empty when nobody holds it, which holds the requests
     * rather than dropping them.
     */
    connectionsCoordinator?: string
  }
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
