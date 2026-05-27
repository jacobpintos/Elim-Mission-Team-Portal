import { ScrollView, Pressable, Linking } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { useThemeColors } from '@/theme/useThemeColors'
import { FD } from '@/lib/format'
import { openLocationInMaps } from '@/lib/location'
import { downloadICS } from '@/lib/icsExport'
import { availKey } from '@/lib/availability'
import { AvailBadge } from '@/components/ui/AvailBadge'
import { useUIStore } from '@/stores/uiStore'
import { useEventsStore } from '@/stores/eventsStore'
import type { EventInstance } from '@/types/events'

interface EventDetailModalProps {
  event: EventInstance | null
  uid: string
  open: boolean
  onClose: () => void
  onAvail?: () => void
}

export function EventDetailModal({ event, uid, open, onClose, onAvail }: EventDetailModalProps) {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const { avail } = useEventsStore()
  const myAvail = event ? (avail[availKey(event)]?.[uid] ?? null) : null

  const handleExportICS = async () => {
    if (!event) return
    try {
      await downloadICS(event)
    } catch {
      toast('Failed to export calendar file', 'error')
    }
  }

  if (!event) return null

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title={event.title}
    >
      <ScrollView style={{ maxHeight: 500 }}>
        <YStack gap="$3" paddingBottom="$4">
          {/* Date & Time */}
          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
              DATE & TIME
            </Text>
            <Text color={colors.text} fontSize="$3">
              {FD(event.date, { weekday: true })}
            </Text>
            {event.startTime ? (
              <Text color={colors.text} fontSize="$3">
                Start: {event.startTime}
              </Text>
            ) : null}
            {event.rtp ? (
              <Text color={colors.text} fontSize="$3">
                Report (Production): {event.rtp}
              </Text>
            ) : null}
            {event.rtm ? (
              <Text color={colors.text} fontSize="$3">
                Report (Mission): {event.rtm}
              </Text>
            ) : null}
          </YStack>

          {/* Location */}
          {event.location ? (
            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                LOCATION
              </Text>
              <Pressable onPress={() => openLocationInMaps(event.location!)}>
                <Text color={colors.primary} textDecorationLine="underline">
                  {event.location}
                </Text>
              </Pressable>
              {event.isVirtual ? (
                <Text color={colors.textMuted} fontSize="$2">
                  🖥 Virtual Event
                </Text>
              ) : null}
            </YStack>
          ) : null}

          {/* Dress Codes */}
          {event.dcw || event.dcm ? (
            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                DRESS CODE
              </Text>
              {event.dcw ? (
                <Text color={colors.text} fontSize="$3">
                  Worship: {event.dcw}
                </Text>
              ) : null}
              {event.dcm ? (
                <Text color={colors.text} fontSize="$3">
                  Mission: {event.dcm}
                </Text>
              ) : null}
            </YStack>
          ) : null}

          {/* Food / Carpool */}
          {event.food || event.carpool ? (
            <XStack gap="$3">
              {event.food ? (
                <XStack gap="$1" alignItems="center">
                  <Text>🍽</Text>
                  <Text color={colors.text} fontSize="$3">
                    Food provided
                  </Text>
                </XStack>
              ) : null}
              {event.carpool ? (
                <XStack gap="$1" alignItems="center">
                  <Text>🚗</Text>
                  <Text color={colors.text} fontSize="$3">
                    Carpool {event.carpoolLoc ? `from ${event.carpoolLoc}` : 'available'}
                  </Text>
                </XStack>
              ) : null}
            </XStack>
          ) : null}

          {/* Teams */}
          {event.teams && event.teams.length > 0 ? (
            <YStack gap="$2">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                TEAMS
              </Text>
              {event.teams.map((team) => (
                <YStack
                  key={team.name}
                  backgroundColor={colors.surface}
                  borderRadius="$2"
                  padding="$2"
                  gap="$1"
                  borderWidth={1}
                  borderColor={colors.border}
                >
                  <Text color={colors.text} fontWeight="600" fontSize="$3">
                    {team.name}
                  </Text>
                </YStack>
              ))}
            </YStack>
          ) : null}

          {/* Sign up link */}
          {event.signUpLink ? (
            <Pressable
              onPress={() => {
                Linking.openURL(event.signUpLink!)
              }}
            >
              <Text color={colors.primary} textDecorationLine="underline">
                Sign Up Link →
              </Text>
            </Pressable>
          ) : null}

          {/* Availability */}
          <YStack gap="$2">
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
              YOUR AVAILABILITY
            </Text>
            <XStack gap="$2" alignItems="center">
              <AvailBadge status={myAvail?.status} />
              {myAvail?.note ? (
                <Text color={colors.textMuted} fontSize="$2">
                  {myAvail.note}
                </Text>
              ) : null}
            </XStack>
            {onAvail ? (
              <Pressable onPress={onAvail}>
                <XStack
                  borderWidth={1}
                  borderColor={colors.primary}
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  alignSelf="flex-start"
                >
                  <Text color={colors.primary} fontWeight="600" fontSize="$3">
                    {myAvail ? 'Change RSVP' : 'Set RSVP'}
                  </Text>
                </XStack>
              </Pressable>
            ) : null}
          </YStack>

          {/* ICS Export */}
          <Pressable onPress={handleExportICS}>
            <XStack
              backgroundColor={colors.surface}
              borderWidth={1}
              borderColor={colors.border}
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$2"
              alignSelf="flex-start"
              gap="$2"
            >
              <Text>📅</Text>
              <Text color={colors.text} fontSize="$3">
                Add to Calendar (.ics)
              </Text>
            </XStack>
          </Pressable>
        </YStack>
      </ScrollView>
    </Modal>
  )
}
