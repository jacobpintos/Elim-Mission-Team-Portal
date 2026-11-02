import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Linking, Platform, Pressable } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Text, XStack, YStack } from 'tamagui'
import { BrandMark } from '@/components/ui/BrandMark'
import { webLink } from '@/lib/externalUrl'
import {
  ELIM_FACEBOOK,
  ELIM_YOUTUBE,
  facebookShareUrl,
  inviteMessage,
  mailUrl,
  nextSundayService,
  smsUrl,
  THE_WELL_SITE,
} from '@/lib/invite'
import { brandOf } from '@/lib/socialIcon'
import { useEventsStore } from '@/stores/eventsStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
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
 * to come: a text, a Facebook post or an email inviting someone to the next
 * Sunday service, written out with its time and place as the calendar has
 * them for that day — the venue changes now and then — and the links to
 * look at first.
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
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const [open, setOpen] = useState(false)

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

  const sms = smsUrl(message.body)
  const mail = mailUrl(message.subject, message.body)
  const facebook = facebookShareUrl(links.site)
  const web = Platform.OS === 'web'

  // Facebook takes no words from another app: the invitation is copied to paste in.
  const copyForFacebook = () => {
    Clipboard.setStringAsync(message.body)
      .then(() => toast('Invitation copied — paste it into your post or message.', 'success'))
      .catch(() => {})
    if (!web) Linking.openURL(facebook).catch(() => {})
  }

  const when = service
    ? [
        new Date(`${service.date}T12:00:00`).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        }) + (service.startTime ? ` at ${service.startTime}` : ''),
        service.online ? 'Online' : service.place,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  const choice = (label: string, icon: ReactNode, props: object) => (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Invite by ${label.toLowerCase()}`}
      {...props}
      style={(state) => ({ opacity: state.pressed ? 0.75 : 1 })}
    >
      <XStack
        borderWidth={1}
        borderColor={colors.border}
        backgroundColor={colors.background}
        borderRadius={999}
        paddingHorizontal={16}
        paddingVertical={10}
        gap={8}
        alignItems="center"
      >
        {icon}
        <Text color={colors.text} fontSize={15} fontWeight="700">
          {label}
        </Text>
      </XStack>
    </Pressable>
  )

  return (
    <YStack gap={12} marginTop={8}>
      <XStack gap={10} flexWrap="wrap">
        {before}
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <XStack
            borderWidth={2}
            borderColor={primary}
            borderRadius={999}
            paddingHorizontal={20}
            paddingVertical={11}
            alignItems="center"
          >
            <Text color={primary} fontSize={15} fontWeight="800">
              Invite a friend
            </Text>
          </XStack>
        </Pressable>
      </XStack>
      {open ? (
        <YStack
          gap={10}
          padding={14}
          borderRadius={16}
          borderWidth={1}
          borderColor={colors.border}
          backgroundColor={colors.surface}
        >
          <Text color={colors.textMuted} fontSize={13} fontWeight="700" letterSpacing={0.6}>
            SEND AN INVITATION BY
          </Text>
          <XStack gap={8} flexWrap="wrap">
            {/* On the web, real links: an sms: or mailto: one opens the app
                for it in place; Facebook's beside the app (lib/externalUrl). */}
            {choice(
              'Text',
              null,
              web ? { href: sms } : { onPress: () => Linking.openURL(sms).catch(() => {}) }
            )}
            {choice(
              'Facebook',
              <BrandMark brand="facebook" size={20} />,
              web
                ? { ...webLink(facebook), onPress: copyForFacebook }
                : { onPress: copyForFacebook }
            )}
            {choice(
              'Email',
              null,
              web ? { href: mail } : { onPress: () => Linking.openURL(mail).catch(() => {}) }
            )}
          </XStack>
          <Text color={colors.textMuted} fontSize={13} lineHeight={18}>
            {when
              ? `Written for you, with ${when}, and links to The Well and Elim’s Facebook and YouTube.`
              : 'Written for you, with links to The Well and Elim’s Facebook and YouTube.'}
          </Text>
        </YStack>
      ) : null}
    </YStack>
  )
}
