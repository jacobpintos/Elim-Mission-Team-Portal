import { useEffect, useState } from 'react'
import { Linking, Pressable, ScrollView } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { httpsCallable } from 'firebase/functions'
import { Text, XStack, YStack } from 'tamagui'
import { BrandMark as ChurchMark } from '@/components/ui/Brand'
import { EventAbout, EventHero } from '@/features/events/EventHero'
import { functions } from '@/lib/firebase'
import { downloadICS } from '@/lib/icsExport'
import { THE_WELL_SITE } from '@/lib/invite'
import { eventMapQuery, openLocationInMaps } from '@/lib/location'
import { webLink } from '@/lib/externalUrl'
import { useAuthStore } from '@/stores/authStore'
import { useThemeColors } from '@/theme/useThemeColors'
import type { PublicEventView } from '../../../functions/src/publicEventView'
import type { EventInstance } from '@/types/events'

/**
 * A public event, for anyone — no account, no sign-in: what an invitation
 * links to (lib/invite eventPageUrl). Its date's name, time and place, its
 * photo and what it says about itself, with directions, the calendar, its
 * Facebook event and The Well's site; read from the server, which gives
 * nothing of an event that isn't public (functions/src/publicEvent).
 * Someone with the app, signed in, can open it there.
 */
export default function PublicInvite() {
  const { key } = useLocalSearchParams<{ key: string }>()
  const router = useRouter()
  const colors = useThemeColors()
  const signedIn = useAuthStore((s) => !!s.profile)
  const [view, setView] = useState<PublicEventView | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    httpsCallable<{ key: string }, PublicEventView | null>(
      functions,
      'publicEvent'
    )({ key: String(key ?? '') })
      .then((r) => live && setView(r.data ?? null))
      .catch(() => live && setView(null))
    return () => {
      live = false
    }
  }, [key])

  // As the app's own event page has it, for the card (features/events EventHero).
  const event = view
    ? ({
        ...view,
        id: view.key.slice(0, view.key.indexOf('_')),
        templateId: view.key.slice(0, view.key.indexOf('_')),
        instanceKey: view.key,
        isPublic: true,
        isRec: false,
      } as unknown as EventInstance)
    : null

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <YStack
        width="100%"
        maxWidth={760}
        alignSelf="center"
        padding="$4"
        gap="$4"
        paddingBottom="$8"
      >
        <XStack alignItems="center" gap="$2.5" paddingVertical="$2">
          <ChurchMark color={colors.primary} height={22} />
          <Text color={colors.text} fontSize={15} fontWeight="800">
            The Well · Elim
          </Text>
        </XStack>

        {view === undefined ? (
          <Text color={colors.textMuted} fontSize="$4" paddingVertical="$6" textAlign="center">
            Loading the event…
          </Text>
        ) : !event ? (
          <YStack gap="$3" paddingVertical="$6" alignItems="center">
            <Text color={colors.text} fontSize="$6" fontWeight="800" textAlign="center">
              This event isn’t available
            </Text>
            <Text color={colors.textMuted} fontSize="$4" textAlign="center">
              It may have passed, or changed. When and where we meet is at The Well’s site.
            </Text>
          </YStack>
        ) : (
          <>
            <EventHero
              event={event}
              report={[]}
              onDirections={
                !event.isVirtual && (event.location || event.address || event.city)
                  ? () => openLocationInMaps(eventMapQuery(event))
                  : null
              }
              onCalendar={() => downloadICS(event, { team: false }).catch(() => {})}
            />
            {event.description?.trim() ? <EventAbout text={event.description} /> : null}
          </>
        )}

        <YStack
          gap="$3"
          padding="$4"
          borderRadius={16}
          borderWidth={1}
          borderColor={colors.border}
          backgroundColor={colors.surface}
        >
          <Text color={colors.text} fontSize="$5" fontWeight="800">
            Get to know The Well
          </Text>
          <Text color={colors.textMuted} fontSize="$3" lineHeight={20}>
            Who we are, what we believe, and when we meet.
          </Text>
          <XStack gap="$3" flexWrap="wrap">
            <Pressable
              {...webLink(THE_WELL_SITE)}
              onPress={
                webLink(THE_WELL_SITE).href
                  ? undefined
                  : () => Linking.openURL(THE_WELL_SITE).catch(() => {})
              }
              accessibilityRole="link"
            >
              <XStack
                backgroundColor={colors.primary}
                borderRadius={999}
                paddingHorizontal={18}
                paddingVertical={10}
              >
                <Text color="white" fontSize={14} fontWeight="800">
                  thewellofiowa.com
                </Text>
              </XStack>
            </Pressable>
            {/* Someone with the app, signed in: the event there, with their side of it. */}
            {signedIn && event ? (
              <Pressable onPress={() => router.push(`/events/${event.instanceKey}` as never)}>
                <XStack
                  borderWidth={1}
                  borderColor={colors.border}
                  borderRadius={999}
                  paddingHorizontal={18}
                  paddingVertical={10}
                >
                  <Text color={colors.text} fontSize={14} fontWeight="800">
                    Open in the app
                  </Text>
                </XStack>
              </Pressable>
            ) : null}
          </XStack>
        </YStack>
      </YStack>
    </ScrollView>
  )
}
