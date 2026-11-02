import { useEffect, useMemo, type ReactNode } from 'react'
import { YStack } from 'tamagui'
import { InviteButton } from '@/features/invite/InviteButton'
import {
  ELIM_FACEBOOK,
  ELIM_YOUTUBE,
  inviteMessage,
  nextSundayService,
  THE_WELL_SITE,
} from '@/lib/invite'
import { brandOf } from '@/lib/socialIcon'
import { useEventsStore } from '@/stores/eventsStore'
import type { LinkGroup } from './connectLayout'

/**
 * Elim's Facebook and YouTube for the invitation, as the Connect page links
 * them (its socials, which admins keep up to date) — or as they were set up.
 */
export function inviteLinksFrom(groups: LinkGroup[]) {
  const links = groups.flatMap((g) => g.links.map((l) => ({ ...l, heading: g.heading ?? '' })))
  const elim = (l: (typeof links)[number]) => /elim/i.test(`${l.label} ${l.heading}`)
  const facebook = links.find((l) => brandOf(l.url, l.label) === 'facebook' && elim(l))?.url
  const youtube =
    links.find((l) => brandOf(l.url, l.label) === 'youtube' && elim(l))?.url ??
    links.find((l) => brandOf(l.url, l.label) === 'youtube')?.url
  return {
    site: THE_WELL_SITE,
    facebook: facebook ?? ELIM_FACEBOOK,
    youtube: youtube ?? ELIM_YOUTUBE,
  }
}

/**
 * "Invite a friend", beside Get directions where Connect says when and where
 * to come: an invitation to the next Sunday service, written out with its time
 * and place as the calendar has them for that day — the venue changes now and
 * then — and the links to look at first (features/invite InviteButton).
 */
export function InviteFriend({
  groups,
  before,
  primary,
}: {
  /** The Connect page's socials, for Elim's links. */
  groups: LinkGroup[]
  /** What sits before the button in its row: Get directions. */
  before?: ReactNode
  primary: string
}) {
  // The calendar, as this person may read it: the next service's time and place.
  const { templates, overrides, subscribe, unsubscribe } = useEventsStore()
  useEffect(() => {
    subscribe()
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const service = useMemo(() => nextSundayService(templates, overrides), [templates, overrides])
  const links = useMemo(() => inviteLinksFrom(groups), [groups])
  const message = useMemo(() => inviteMessage(service, links), [service, links])

  return (
    <YStackSpacer>
      <InviteButton
        primary={primary}
        before={before}
        invitation={{
          ...message,
          shareLink: links.site,
          eventKey: service?.key ?? null,
          date: service?.date ?? null,
        }}
      />
    </YStackSpacer>
  )
}

/** Its row's place on Connect: a little below the lines above it. */
function YStackSpacer({ children }: { children: ReactNode }) {
  return <YStack marginTop={8}>{children}</YStack>
}
