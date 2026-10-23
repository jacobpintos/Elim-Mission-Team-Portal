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
   * Those leaders' names, as the form showed them, so the task can say who was
   * asked. Carried here because most of the people reading the task cannot
   * look another account up: `users` is readable only by its owner and admins.
   */
  leaderNames?: string[]
  availability: string
  message: string
  createdAt: number
  /**
   * Who said they would answer it, and when.
   *
   * Separate from handled, because claiming and finishing are different
   * moments: somebody says they are on it, gets in touch, and the
   * conversation carries on from there. Collapsing the two would have a
   * request read as answered the second anyone picked it up.
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
  /**
   * The admin who blocked the sender from this request, and when.
   *
   * Kept here rather than on the block, which the blocked person can read.
   * Whether they are still blocked is the block's to say: this is only who did
   * it, cleared when it is lifted from this request.
   */
  blockedBy?: string
  blockedByName?: string
  blockedAt?: number
}

/**
 * meetingBlocks/{uid}: an account an admin has stopped from sending meeting
 * requests. sendMeetingRequest refuses them while it exists.
 *
 * Readable by the person it names, so it holds nothing that says who did it;
 * the rules refuse any other field.
 */
export interface MeetingBlock {
  blockedAt: number
  /** The request it was made from. */
  requestId: string
}
