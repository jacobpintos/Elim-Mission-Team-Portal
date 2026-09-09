import type { NotificationPrefs } from '@/types/user'

/**
 * Whether someone has been asked about stream alerts, and what they said.
 *
 * Stream alerts are the one notification in the app nobody is signed up for by
 * default. Everything else defaults on and can be turned off in Settings; this
 * one waits to be asked for, because a push saying a service has started is
 * the kind that arrives on a Sunday morning to someone who never wanted it.
 *
 * The two questions are separate on purpose. An unanswered prompt and a
 * declined one both mean "send nothing", but only the first should be asked
 * again.
 */

type Prefs = Partial<NotificationPrefs> | null | undefined

/** Has this person answered the prompt, either way? */
export function hasAnsweredStreamNotifications(prefs: Prefs): boolean {
  return typeof prefs?.livestream?.push === 'boolean'
}

/** Did they say yes? Unanswered counts as no. */
export function wantsStreamNotifications(prefs: Prefs): boolean {
  return prefs?.livestream?.push === true
}

/** Should the prompt be put in front of them? */
export function shouldAskAboutStreamNotifications(prefs: Prefs): boolean {
  return !hasAnsweredStreamNotifications(prefs)
}
