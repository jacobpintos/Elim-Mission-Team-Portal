import { useMemo } from 'react'
import { Platform } from 'react-native'
import { InviteButton } from '@/features/invite/InviteButton'
import { eventInviteMessage, eventPageUrl } from '@/lib/invite'
import type { EventInstance } from '@/types/events'

/** The app's address, for a link to an event's page. */
function appOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin
  return process.env.EXPO_PUBLIC_APP_URL ?? 'https://mission-team-portal.web.app'
}

/**
 * "Invite a friend" to a public event — on its page and on its cards: an
 * invitation with its day, time and place as its date has them, its page in
 * the app, and its Facebook event where it has one (lib/invite
 * eventInviteMessage). Nothing for an event that isn't public: it isn't
 * anyone else's to be invited to.
 */
export function EventInvite({
  event,
  size = 'sm',
  primary,
}: {
  event: EventInstance
  size?: 'sm' | 'md'
  primary?: string
}) {
  const invitation = useMemo(() => {
    const page = eventPageUrl(appOrigin(), event.instanceKey)
    const message = eventInviteMessage(event, page)
    return {
      ...message,
      shareLink: event.facebookUrl?.trim() || page,
      eventKey: event.instanceKey,
      date: event.date,
    }
  }, [event])
  if (event.isPublic !== true || event.unpublished === true) return null
  return <InviteButton invitation={invitation} size={size} primary={primary} />
}
