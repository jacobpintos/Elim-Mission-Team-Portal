import type { UserProfile } from '@/types/user'
import {
  canUseMessages,
  isAdmin,
  isPublicFollower,
  isSecurity,
  isWorship,
  visibleTabs,
} from './roles'

/**
 * What Miriam's bar offers to tap while it waits for a request — a few things
 * to say, for the screen it was opened on and what this person can do there —
 * so nobody has to guess what she can do from an empty box.
 *
 * A suggestion is one of two kinds. Most are said for them, as they are
 * written: "What do I need to know today?". Some begin a conversation instead
 * (a Starter): "Create an event" is answered "Ok, tell me more about it", and
 * what they say next is the request — for an event, all of it, however it
 * comes out (functions/src/miriam/askMiriam: describing).
 *
 * Nothing tapped changes anything by itself: a change is still shown to
 * confirm, and a form still opens to be checked and saved.
 *
 * Pure, so it can be tested.
 */

/** A conversation she begins: her question, and what the reply is taken as. */
export interface Starter {
  /** What she asks. */
  ask: string
  /**
   * The words the reply finishes, sent as the whole request: "Remind me" and
   * "to call Sam at 5". Empty when the reply is sent as it is.
   */
  then: string
  /** An event being described: sent as that, and listened to patiently — people think out loud. */
  describing?: 'event'
}

export interface Suggestion {
  /** As shown on its button. */
  label: string
  /** Said for them when tapped; or, with `starter`, the conversation begun. */
  say?: string
  starter?: Starter
}

/** "Create an event": her asking to hear about it, and the event's form filled in from what they say. */
export const NEW_EVENT: Starter = {
  ask: 'Ok, tell me more about it.',
  then: '',
  describing: 'event',
}

const BLOCK_DAYS: Starter = {
  ask: 'Which days can’t you make, and why?',
  then: 'Block off these days, I can’t make them:',
}
const REMINDER: Starter = { ask: 'What should I remind you of, and when?', then: 'Remind me' }
const ISSUE: Starter = { ask: 'What’s wrong, and where?', then: 'Report an issue:' }
const KAIZEN: Starter = { ask: 'What’s your idea?', then: 'Submit a kaizen idea:' }
const CONCERN: Starter = {
  ask: 'What’s happening, and where?',
  then: 'Report a security concern:',
}
const TASK: Starter = {
  ask: 'What’s the task, who should it go to, and when is it due?',
  then: 'Assign a task:',
}
const ANNOUNCEMENT: Starter = {
  ask: 'What should it say, and who is it for?',
  then: 'Post an announcement:',
}
const SLIDES: Starter = { ask: 'Which song?', then: 'Make slides for' }
/** An admin's report on an event (lib/eventReport): which one asked, then given. */
export const REPORT: Starter = { ask: 'Which event?', then: 'Give me a report on' }

const say = (label: string, said = label): Suggestion => ({ label, say: said })
const start = (label: string, starter: Starter): Suggestion => ({ label, starter })

/** How many are offered at once: a row or two, not a menu. */
export const MOST_SUGGESTED = 4

/**
 * The suggestions for this screen (its path: "/events", "/worship") and this
 * person, best first: the screen's own, then a few for anywhere.
 */
export function suggestionsFor(path: string, profile: UserProfile | null): Suggestion[] {
  if (!profile) return []
  const screen = path.split('/').filter(Boolean)[0] ?? ''
  const tabs = visibleTabs(profile)
  const has = (tab: string) => (tabs as string[]).includes(tab)
  const admin = isAdmin(profile)

  // A public follower: the visitor's side of the app, and nothing to change.
  if (isPublicFollower(profile)) {
    const own: Suggestion[] = []
    if (screen === 'music') own.push(say('Play the latest sermon'))
    if (screen === 'store')
      own.push(say('Is anything on sale?', 'Is anything on sale at the Elim Store?'))
    if (screen === 'connect') own.push(say('I’d like to meet with a pastor'))
    if (screen === 'events') own.push(say('What’s happening this weekend?'))
    return unique([
      ...own,
      say('What’s happening this month?'),
      say('When is Sunday service?'),
      say('Give me a tour'),
    ]).slice(0, MOST_SUGGESTED)
  }

  const own: Suggestion[] = []
  switch (screen) {
    case 'events':
      if (admin) own.push(start('Create an event', NEW_EVENT))
      if (admin) own.push(start('Report on an event', REPORT))
      own.push(say('What’s my next event?'))
      if (has('assignments')) own.push(start('Block off dates', BLOCK_DAYS))
      own.push(say('Directions to my next event'))
      break
    case 'dashboard':
    case 'home':
      own.push(say('What do I need to know today?'))
      if (admin) own.push(start('Create an event', NEW_EVENT))
      if (admin) own.push(start('Report on an event', REPORT))
      own.push(say('What’s on this week?'))
      break
    case 'assignments':
      own.push(say('What’s due this week?', 'What tasks are due this week?'))
      if (admin) own.push(start('Assign a task', TASK))
      own.push(start('Set a reminder', REMINDER))
      break
    case 'announce':
    case 'messages':
      own.push(say('Read the latest announcements'))
      if (canUseMessages(profile)) own.push(say('Read my new messages'))
      if (admin) own.push(start('Post an announcement', ANNOUNCEMENT))
      break
    case 'issues':
    case 'inventory':
      own.push(start('Report an issue', ISSUE))
      own.push(start('Submit a kaizen idea', KAIZEN))
      break
    case 'security':
      if (isSecurity(profile)) own.push(start('Report a concern', CONCERN))
      break
    case 'worship':
      if (isWorship(profile)) {
        own.push(say('What’s on Sunday’s set list?'))
        own.push(start('Make slides for a song', SLIDES))
      }
      break
    case 'music':
      own.push(say('Play the latest sermon'))
      break
    case 'admin':
    case 'rolehub':
      if (admin) own.push(start('Create an event', NEW_EVENT))
      if (admin) own.push(start('Report on an event', REPORT))
      break
  }

  return unique([
    ...own,
    say('What do I need to know today?'),
    ...(admin ? [start('Create an event', NEW_EVENT)] : []),
    say('What can you do?'),
    say(
      'Give me a tour',
      screen && has(screen) ? `Give me a tour of ${tourPart(screen)}` : 'Give me a tour'
    ),
  ]).slice(0, MOST_SUGGESTED)
}

/** The tour's name for a screen, as she is asked for it (features/tour/flows). */
function tourPart(screen: string): string {
  const parts: Record<string, string> = {
    dashboard: 'the dashboard',
    home: 'Home',
    events: 'Events',
    assignments: 'Assignments',
    announce: 'Announcements',
    messages: 'Messages',
    issues: 'Operations',
    security: 'Security',
    worship: 'Worship',
    music: 'Content',
    rolehub: 'Admin',
    admin: 'Admin',
    settings: 'Settings',
  }
  return parts[screen] ?? 'the app'
}

/** Each once, the first kept. */
function unique(list: Suggestion[]): Suggestion[] {
  const seen = new Set<string>()
  return list.filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true)))
}

/**
 * "Create an event", said with nothing more about it — "Hey Miriam, make a
 * new event", "can you create an event for me?": begun as tapping it is,
 * with her asking to hear about it. Anything about the event said with it
 * ("create an event called Revive Me") is a request of its own: null.
 */
export function newEventAsked(said: string): boolean {
  const s = said
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.!?,]+$/g, '')
    .replace(/^(?:ok(?:ay)?|so|hey|um|uh|alright|all right)[\s,]+/g, '')
    .replace(/\s+(?:please|for me|for us|real quick|now)$/g, '')
    .replace(/\s+(?:please|for me|for us)$/g, '')
  return /^(?:(?:can|could|would|will) you\s+|(?:i(?:'d)? (?:want|need|would like|wanna) to|i(?:'d)? like to|let's|lets|let me|help me|i want you to|please)\s+)?(?:create|make|add|set up|setup|schedule|start|plan|put together)\s+(?:a\s+|an\s+)?(?:new\s+)?event$/.test(
    s
  )
}

/** The reply to a starter, as the whole request it finishes. */
export function finishedBy(starter: Starter, reply: string): string {
  const said = reply.trim()
  if (!starter.then) return said
  // "Remind me" and "remind me to call Sam": not said twice.
  const lead = starter.then.toLowerCase().replace(/[:,]$/, '')
  return said.toLowerCase().startsWith(lead) ? said : `${starter.then} ${said}`
}
