/**
 * Somebody asking to sit down with one or more of the leadership team.
 *
 * A record rather than a notification, because a request has a life: it
 * arrives, someone takes it on, and it is answered or it is not. A line in the
 * notifications list can hold the words but not the state, and it is gone the
 * moment somebody marks everything read.
 */
export interface MeetingRequest {
  id: string
  /** Who asked. They must be signed in, so this is always a real account. */
  fromUid: string
  fromName: string
  fromEmail: string
  /** The uids they asked to meet. Everyone here can see and answer it. */
  leaders: string[]
  /**
   * Those leaders' own addresses, so a reply can copy the rest of them in.
   *
   * Carried on the request because the people who need them cannot look them
   * up: `users` is readable only by its owner and by admins, and most of the
   * leadership team is neither to the others.
   */
  leaderEmails?: string[]
  availability: string
  message: string
  createdAt: number
  /**
   * Who said they would answer it, and when.
   *
   * Separate from handled, because claiming and finishing are different
   * moments: somebody says they are on it, writes the email, and the
   * conversation carries on from there. Collapsing the two would have a
   * request read as answered the second anyone opened a draft.
   */
  claimedBy?: string
  claimedByName?: string
  claimedAt?: number
  /** The task created to answer it, so one can be found from the other. */
  taskId?: number
  status: 'open' | 'handled'
  /** Who marked it handled, and when. */
  handledBy?: string
  handledByName?: string
  handledAt?: number
}
