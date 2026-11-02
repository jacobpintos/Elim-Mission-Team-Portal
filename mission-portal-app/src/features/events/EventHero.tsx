import { Linking, Pressable, View } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Path } from 'react-native-svg'
import { Text, XStack, YStack } from 'tamagui'
import { BrandMark as ChurchMark, Overline } from '@/components/ui/Brand'
import { BrandMark } from '@/components/ui/BrandMark'
import { webLink } from '@/lib/externalUrl'
import { useThemeStore } from '@/stores/themeStore'
import { autoTextColor } from '@/theme/contrast'
import { useThemeColors } from '@/theme/useThemeColors'
import { EventInvite } from './EventInvite'
import type { EventInstance } from '@/types/events'

const CALENDAR =
  'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zM5 10h14v10H5V10z'
const PIN =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z'
const SCREEN =
  'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6v2h3v2H8v-2h3v-2H5a2 2 0 0 1-2-2V5zm2 0v10h14V5H5z'

function Glyph({ d, color }: { d: string; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d={d} fill={color} />
    </Svg>
  )
}

/** A line of the card: an icon in a tile, what it is, and a second line under it. */
function Info({
  icon,
  main,
  sub,
  onPress,
}: {
  icon: string
  main: string
  sub?: string[]
  onPress?: () => void
}) {
  const colors = useThemeColors()
  const row = (
    <XStack gap={14} alignItems="flex-start">
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.primary + '22',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Glyph d={icon} color={colors.primary} />
      </View>
      <YStack flex={1} gap={2} paddingTop={1}>
        <Text color={colors.text} fontSize={16} fontWeight="700">
          {main}
        </Text>
        {(sub ?? []).map((line) => (
          <Text key={line} color={colors.textMuted} fontSize={14} lineHeight={20}>
            {line}
          </Text>
        ))}
      </YStack>
    </XStack>
  )
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="link">
      {row}
    </Pressable>
  ) : (
    row
  )
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: color + '22',
      }}
    >
      <Text color={color} fontSize={11} fontWeight="800" letterSpacing={0.8}>
        {label.toUpperCase()}
      </Text>
    </View>
  )
}

/**
 * The top of an event's page, as a card: its cover photo — or, with none, a
 * banner in the theme's colour with its date — then its name, when, where,
 * and what can be done from here: directions, the calendar, its Facebook
 * event, and inviting a friend to a public one. What follows on the page —
 * the team's side — is unchanged.
 */
export function EventHero({
  event,
  report,
  onDirections,
  onCalendar,
}: {
  event: EventInstance
  /** Report times, for those on it: "Report 5:00 PM (Worship)". */
  report: string[]
  onDirections: (() => void) | null
  onCalendar: (() => void) | null
}) {
  const colors = useThemeColors()
  const primary = colors.primary
  const onPrimary = useThemeStore((s) => s.theme.onPrimaryOverride) ?? autoTextColor(primary)
  const day = event.date ? new Date(`${event.date}T12:00:00`) : null
  const town = [event.city, event.state].filter(Boolean).join(', ')
  // Its public page's: shown while it — this date of it — is public, and kept
  // for when it is again (the form shows them only then too).
  const facebook = event.isPublic ? event.facebookUrl?.trim() : ''
  const cover = event.isPublic ? event.coverImage : undefined

  const button = (label: string, solid: boolean, icon?: React.ReactNode) => (
    <XStack
      backgroundColor={solid ? primary : 'transparent'}
      borderWidth={solid ? 0 : 1}
      borderColor={colors.border}
      borderRadius={999}
      paddingHorizontal={18}
      paddingVertical={11}
      gap={8}
      alignItems="center"
    >
      {icon}
      <Text color={solid ? onPrimary : colors.text} fontSize={14} fontWeight="800">
        {label}
      </Text>
    </XStack>
  )

  return (
    <YStack
      borderRadius={20}
      overflow="hidden"
      borderWidth={1}
      borderColor={colors.border}
      backgroundColor={colors.surface}
    >
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={{ width: '100%', aspectRatio: 16 / 9, maxHeight: 360 }}
          contentFit="cover"
          accessibilityLabel={event.title}
        />
      ) : (
        // No photo: the theme's colour, with the date on a calendar leaf.
        <XStack
          height={132}
          backgroundColor={primary}
          paddingHorizontal={20}
          alignItems="flex-end"
          paddingBottom={18}
          justifyContent="space-between"
        >
          {day ? (
            <YStack
              width={64}
              backgroundColor="white"
              borderRadius={14}
              alignItems="center"
              paddingVertical={8}
            >
              <Text color={primary} fontSize={12} fontWeight="900" letterSpacing={1.2}>
                {day.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
              </Text>
              <Text color="#11111b" fontSize={28} lineHeight={32} fontWeight="900">
                {day.getDate()}
              </Text>
            </YStack>
          ) : (
            <View />
          )}
          <View style={{ opacity: 0.35, paddingBottom: 6 }}>
            <ChurchMark color={onPrimary} height={34} />
          </View>
        </XStack>
      )}

      <YStack padding={20} gap={16}>
        <YStack gap={10}>
          {event.isPublic || event.isVirtual ? (
            <XStack gap={8} flexWrap="wrap">
              {event.isPublic ? <Chip label="Open to everyone" color={primary} /> : null}
              {event.isVirtual ? <Chip label="Online" color={primary} /> : null}
            </XStack>
          ) : null}
          <Text
            color={colors.text}
            fontSize={28}
            lineHeight={34}
            fontWeight="900"
            letterSpacing={-0.5}
          >
            {event.title}
          </Text>
        </YStack>

        {day ? (
          <Info
            icon={CALENDAR}
            main={day.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
            sub={[...(event.startTime ? [event.startTime] : []), ...report]}
          />
        ) : null}
        {event.isVirtual ? (
          <Info
            icon={SCREEN}
            main="Online"
            sub={event.virtualLink ? ['Join the meeting'] : undefined}
            onPress={
              event.virtualLink
                ? () => Linking.openURL(event.virtualLink!).catch(() => {})
                : undefined
            }
          />
        ) : event.location || event.address || town ? (
          <Info
            icon={PIN}
            main={event.location || event.address || town}
            sub={[
              ...(event.location && event.address ? [event.address] : []),
              ...(town && (event.location || event.address) ? [town] : []),
            ]}
            onPress={onDirections ?? undefined}
          />
        ) : null}

        {onDirections || onCalendar || facebook ? (
          <XStack gap={10} flexWrap="wrap">
            {onDirections ? (
              <Pressable onPress={onDirections} accessibilityRole="link">
                {button('Get directions', true)}
              </Pressable>
            ) : null}
            {onCalendar ? (
              <Pressable onPress={onCalendar} accessibilityRole="button">
                {button('Add to calendar', false)}
              </Pressable>
            ) : null}
            {facebook ? (
              <Pressable
                {...webLink(facebook)}
                onPress={
                  webLink(facebook).href
                    ? undefined
                    : () => Linking.openURL(facebook).catch(() => {})
                }
                accessibilityRole="link"
                accessibilityLabel="The event on Facebook"
              >
                {button('Facebook event', false, <BrandMark brand="facebook" size={18} />)}
              </Pressable>
            ) : null}
          </XStack>
        ) : null}

        {/* Anyone may bring a friend to a public event (./EventInvite). */}
        <EventInvite event={event} size="md" primary={primary} />
      </YStack>
    </YStack>
  )
}

/** What a public event says about itself, under its card. */
export function EventAbout({ text }: { text: string }) {
  const colors = useThemeColors()
  return (
    <YStack gap={10}>
      <Overline color={colors.primary}>About</Overline>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <Text key={i} color={colors.text} fontSize={16} lineHeight={25}>
            {p}
          </Text>
        ))}
    </YStack>
  )
}
