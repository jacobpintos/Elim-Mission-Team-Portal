import { useState, type ReactNode } from 'react'
import { Linking, Platform, Pressable } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Text, XStack, YStack } from 'tamagui'
import { BrandMark } from '@/components/ui/BrandMark'
import { webLink } from '@/lib/externalUrl'
import { facebookShareUrl, mailUrl, smsUrl } from '@/lib/invite'
import { logInvite, type InviteChannel } from '@/lib/inviteLog'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'

export interface Invitation {
  subject: string
  body: string
  /** What Facebook shares — Facebook takes no words from another app. */
  shareLink: string
  /** The event's date it invites to, counted for the admins (lib/inviteLog). */
  eventKey: string | null
  date: string | null
}

/**
 * "Invite a friend", then Text, Facebook or Email — each with the invitation
 * written in (Facebook's copied, to paste: it takes no words from another
 * app). Shared by Connect (features/page-builder InviteFriend), an event's
 * page and its cards (features/events EventInvite). Each choice is counted
 * against the event's date for the admins.
 *
 * `size`: "md" a pill beside Connect's Get directions; "sm" as a card's buttons are.
 */
export function InviteButton({
  invitation,
  primary,
  size = 'md',
  before,
}: {
  invitation: Invitation
  primary?: string
  size?: 'sm' | 'md'
  /** In the same row, before it: Get directions. */
  before?: ReactNode
}) {
  const colors = useThemeColors()
  const accent = primary ?? colors.primary
  const toast = useUIStore((s) => s.toast)
  const [open, setOpen] = useState(false)
  const web = Platform.OS === 'web'

  const { subject, body, shareLink, eventKey, date } = invitation
  const sms = smsUrl(body)
  const mail = mailUrl(subject, body)
  const facebook = facebookShareUrl(shareLink)
  const counted = (channel: InviteChannel) => {
    if (eventKey && date) logInvite(eventKey, date, channel)
  }

  const viaFacebook = () => {
    counted('facebook')
    Clipboard.setStringAsync(body)
      .then(() => toast('Invitation copied — paste it into your post or message.', 'success'))
      .catch(() => {})
    if (!web) Linking.openURL(facebook).catch(() => {})
  }
  // On the web, real links: an sms: or mailto: one opens its app in place,
  // Facebook's beside the app (lib/externalUrl); on the phone, opened here.
  const app = (url: string, channel: InviteChannel) =>
    web
      ? { href: url, onPress: () => counted(channel) }
      : {
          onPress: () => {
            counted(channel)
            Linking.openURL(url).catch(() => {})
          },
        }

  const sm = size === 'sm'
  const choice = (label: string, icon: ReactNode, props: object) => (
    <Pressable
      key={label}
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
        paddingHorizontal={sm ? 12 : 16}
        paddingVertical={sm ? 7 : 10}
        gap={8}
        alignItems="center"
      >
        {icon}
        <Text color={colors.text} fontSize={sm ? 13 : 15} fontWeight="700">
          {label}
        </Text>
      </XStack>
    </Pressable>
  )

  return (
    <YStack gap={sm ? 8 : 12}>
      <XStack gap={sm ? 8 : 10} flexWrap="wrap" alignItems="center">
        {before}
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          {sm ? (
            <XStack
              borderWidth={1}
              borderColor={accent}
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$1"
              alignItems="center"
              backgroundColor={open ? accent + '1f' : undefined}
            >
              <Text color={accent} fontWeight="600" fontSize="$2">
                Invite a friend
              </Text>
            </XStack>
          ) : (
            <XStack
              borderWidth={2}
              borderColor={accent}
              borderRadius={999}
              paddingHorizontal={20}
              paddingVertical={11}
              alignItems="center"
            >
              <Text color={accent} fontSize={15} fontWeight="800">
                Invite a friend
              </Text>
            </XStack>
          )}
        </Pressable>
      </XStack>
      {open ? (
        // A tap between its buttons stays here, not on a card it sits in.
        <Pressable onPress={() => {}} accessible={false} style={{ cursor: 'auto' } as never}>
          <YStack
            gap={sm ? 8 : 10}
            padding={sm ? 10 : 14}
            borderRadius={sm ? 12 : 16}
            borderWidth={1}
            borderColor={colors.border}
            backgroundColor={sm ? colors.background : colors.surface}
          >
            <Text color={colors.textMuted} fontSize={12} fontWeight="700" letterSpacing={0.6}>
              SEND AN INVITATION BY
            </Text>
            <XStack gap={8} flexWrap="wrap">
              {choice('Text', null, app(sms, 'text'))}
              {choice(
                'Facebook',
                <BrandMark brand="facebook" size={sm ? 16 : 20} />,
                web ? { ...webLink(facebook), onPress: viaFacebook } : { onPress: viaFacebook }
              )}
              {choice('Email', null, app(mail, 'email'))}
            </XStack>
          </YStack>
        </Pressable>
      ) : null}
    </YStack>
  )
}
