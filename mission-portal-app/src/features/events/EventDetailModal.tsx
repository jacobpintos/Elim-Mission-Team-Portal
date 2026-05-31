import { useState, useEffect } from 'react'
import { Pressable, Linking } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { onSnapshot, doc, setDoc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Modal } from '@/components/ui/Modal'
import { useThemeColors } from '@/theme/useThemeColors'
import { FD } from '@/lib/format'
import { openLocationInMaps, eventMapQuery } from '@/lib/location'
import { downloadICS } from '@/lib/icsExport'
import { availKey } from '@/lib/availability'
import { AvailBadge } from '@/components/ui/AvailBadge'
import { useUIStore } from '@/stores/uiStore'
import { useEventsStore } from '@/stores/eventsStore'
import { usePlanningStore } from '@/stores/planningStore'
import { useUsersStore } from '@/stores/usersStore'
import { sameId } from '@/lib/ids'
import { PlanningBoardCanvas } from '@/features/planning/PlanningBoardCanvas'
import type { EventInstance } from '@/types/events'

interface EventDetailModalProps {
  event: EventInstance | null
  uid: string
  isMember: boolean
  open: boolean
  onClose: () => void
  onAvail?: () => void
  onEdit?: () => void
}

function CarpoolPanel({ event, uid }: { event: EventInstance; uid: string }) {
  const colors = useThemeColors()
  const { users } = useUsersStore()
  const toast = useUIStore((s) => s.toast)
  const [signups, setSignups] = useState<Record<string, 'driver' | 'rider'>>({})

  const carpoolKey = `${event.templateId}_${event.date}`

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'carpool', carpoolKey), (snap) => {
      setSignups((snap.data()?.signups as Record<string, 'driver' | 'rider'>) ?? {})
    })
    return () => unsub()
  }, [carpoolKey])

  const setRole = async (role: 'driver' | 'rider' | null) => {
    try {
      if (role === null) {
        await updateDoc(doc(db, 'carpool', carpoolKey), {
          [`signups.${uid}`]: deleteField(),
        })
      } else {
        await setDoc(doc(db, 'carpool', carpoolKey), { signups: { [uid]: role } }, { merge: true })
      }
    } catch {
      toast('Failed to update carpool', 'error')
    }
  }

  const getName = (u: string) => users.find((x) => x.uid === u)?.displayName ?? u
  const drivers = Object.entries(signups)
    .filter(([, r]) => r === 'driver')
    .map(([u]) => u)
  const riders = Object.entries(signups)
    .filter(([, r]) => r === 'rider')
    .map(([u]) => u)
  const myRole = signups[uid] ?? null

  return (
    <YStack gap="$2">
      <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
        CARPOOL
      </Text>

      {drivers.length > 0 && (
        <YStack gap="$1">
          <Text color={colors.text} fontSize="$2" fontWeight="600">
            Drivers ({drivers.length})
          </Text>
          {drivers.map((u) => (
            <Text key={u} color={colors.text} fontSize="$3">
              🚗 {getName(u)}
            </Text>
          ))}
        </YStack>
      )}

      {riders.length > 0 && (
        <YStack gap="$1">
          <Text color={colors.text} fontSize="$2" fontWeight="600">
            Riders ({riders.length})
          </Text>
          {riders.map((u) => (
            <Text key={u} color={colors.text} fontSize="$3">
              👤 {getName(u)}
            </Text>
          ))}
        </YStack>
      )}

      {drivers.length === 0 && riders.length === 0 && (
        <Text color={colors.textMuted} fontSize="$2">
          No signups yet.
        </Text>
      )}

      <XStack gap="$2" marginTop="$1">
        <Pressable onPress={() => setRole(myRole === 'driver' ? null : 'driver')}>
          <XStack
            borderWidth={1}
            borderColor={myRole === 'driver' ? colors.primary : colors.border}
            backgroundColor={myRole === 'driver' ? colors.primary + '22' : 'transparent'}
            borderRadius="$2"
            paddingHorizontal="$3"
            paddingVertical="$2"
          >
            <Text
              color={myRole === 'driver' ? colors.primary : colors.text}
              fontWeight={myRole === 'driver' ? '700' : '400'}
              fontSize="$3"
            >
              {myRole === 'driver' ? '✓ Driving' : 'I Can Drive'}
            </Text>
          </XStack>
        </Pressable>
        <Pressable onPress={() => setRole(myRole === 'rider' ? null : 'rider')}>
          <XStack
            borderWidth={1}
            borderColor={myRole === 'rider' ? colors.primary : colors.border}
            backgroundColor={myRole === 'rider' ? colors.primary + '22' : 'transparent'}
            borderRadius="$2"
            paddingHorizontal="$3"
            paddingVertical="$2"
          >
            <Text
              color={myRole === 'rider' ? colors.primary : colors.text}
              fontWeight={myRole === 'rider' ? '700' : '400'}
              fontSize="$3"
            >
              {myRole === 'rider' ? '✓ Need a Ride' : 'Need a Ride'}
            </Text>
          </XStack>
        </Pressable>
      </XStack>
    </YStack>
  )
}

export function EventDetailModal({
  event,
  uid,
  isMember,
  open,
  onClose,
  onAvail,
  onEdit,
}: EventDetailModalProps) {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const { avail } = useEventsStore()
  const myAvail = event ? (avail[availKey(event)]?.[uid] ?? null) : null
  const { boards } = usePlanningStore()
  const linkedBoard = event?.planningBoardId
    ? boards.find((b) => sameId(b.id, event.planningBoardId!))
    : null
  const [showBoard, setShowBoard] = useState(false)

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
      scrollable
    >
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
          {isMember && event.rtp ? (
            <Text color={colors.text} fontSize="$3">
              Report (Production): {event.rtp}
            </Text>
          ) : null}
          {isMember && event.rtm ? (
            <Text color={colors.text} fontSize="$3">
              Report (Mission): {event.rtm}
            </Text>
          ) : null}
        </YStack>

        {/* Location */}
        {event.location || event.address || event.city ? (
          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
              LOCATION
            </Text>
            {event.location ? (
              <Text color={colors.text} fontSize="$3">
                {event.location}
              </Text>
            ) : null}
            {event.address ? (
              <Text color={colors.text} fontSize="$3">
                {event.address}
              </Text>
            ) : null}
            {event.city ? (
              <Text color={colors.text} fontSize="$3">
                {event.city}
                {event.state ? `, ${event.state}` : ''}
              </Text>
            ) : null}
            <Pressable onPress={() => openLocationInMaps(eventMapQuery(event))}>
              <Text color={colors.primary} textDecorationLine="underline" fontSize="$2">
                Get Directions →
              </Text>
            </Pressable>
          </YStack>
        ) : null}

        {/* Virtual join link */}
        {event.isVirtual ? (
          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
              VIRTUAL EVENT
            </Text>
            <XStack gap="$2" alignItems="center">
              <Text fontSize="$3">🖥</Text>
              <Text color={colors.text} fontSize="$3">
                Virtual Event
              </Text>
            </XStack>
            {event.virtualLink ? (
              <Pressable onPress={() => Linking.openURL(event.virtualLink!)}>
                <Text color={colors.primary} textDecorationLine="underline" fontSize="$3">
                  {event.virtualLink}
                </Text>
              </Pressable>
            ) : null}
          </YStack>
        ) : null}

        {/* Dress Codes — members only */}
        {isMember && (event.dcw || event.dcm) ? (
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

        {/* Food — members only */}
        {isMember && event.food ? (
          <XStack gap="$1" alignItems="center">
            <Text>🍽</Text>
            <Text color={colors.text} fontSize="$3">
              Food provided
            </Text>
          </XStack>
        ) : null}

        {/* Carpool — members only, driver/rider signup */}
        {isMember && event.carpool ? <CarpoolPanel event={event} uid={uid} /> : null}

        {/* Teams — members only */}
        {isMember && event.teams && event.teams.length > 0 ? (
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

        {/* Sign up link — visible to all */}
        {event.signUpLink ? (
          <Pressable onPress={() => Linking.openURL(event.signUpLink!)}>
            <Text color={colors.primary} textDecorationLine="underline">
              Sign Up →
            </Text>
          </Pressable>
        ) : null}

        {/* Availability — members only */}
        {isMember ? (
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
        ) : null}

        {/* Planning Board — members only */}
        {isMember && linkedBoard ? (
          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
              PLANNING BOARD
            </Text>
            <Pressable onPress={() => setShowBoard(true)}>
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
                <Text>📋</Text>
                <Text color={colors.text} fontSize="$3">
                  {linkedBoard.name}
                </Text>
                <Text color={colors.primary} fontSize="$3">
                  →
                </Text>
              </XStack>
            </Pressable>
          </YStack>
        ) : null}

        {/* ICS Export — visible to all */}
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

        {/* Admin Edit */}
        {onEdit ? (
          <Pressable onPress={onEdit}>
            <XStack
              backgroundColor={colors.primary}
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$2"
              alignSelf="flex-start"
              gap="$2"
            >
              <Text color="white" fontWeight="600" fontSize="$3">
                ✎ Edit Event
              </Text>
            </XStack>
          </Pressable>
        ) : null}
      </YStack>

      <PlanningBoardCanvas
        boardId={linkedBoard?.id ?? null}
        readOnly
        visible={showBoard}
        onClose={() => setShowBoard(false)}
      />
    </Modal>
  )
}
