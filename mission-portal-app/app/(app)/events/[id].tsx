import { useState, useEffect } from 'react'
import { ScrollView, Pressable, Linking } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useUsersStore } from '@/stores/usersStore'
import { usePlanningStore } from '@/stores/planningStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { AvailBadge } from '@/components/ui/AvailBadge'
import { AvailModal } from '@/features/events/AvailModal'
import { EventFormModal } from '@/features/events/EventFormModal'
import { WeatherDetailSheet } from '@/features/events/WeatherDetailSheet'
import { PlanningBoardCanvas } from '@/features/planning/PlanningBoardCanvas'
import {
  TeamsDisplay,
  LodgingDisplay,
  FlightDisplay,
  DressCodeDisplay,
  FoodPanel,
  CarpoolReadOnly,
  CarpoolPanel,
} from '@/features/events/EventDetailModal'
import { FD } from '@/lib/format'
import { openLocationInMaps, eventMapQuery } from '@/lib/location'
import { downloadICS } from '@/lib/icsExport'
import { availKey, effectiveAvail, getSeriesAvail } from '@/lib/availability'
import { fetchWeather, fetchNWSAlerts, type WeatherData, type NWSAlert } from '@/lib/weather'
import { isAdmin, isPublic } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import { useUIStore } from '@/stores/uiStore'

const EMPTY_COLOR = '#e67e22'

function EmptyField({ label }: { label: string }) {
  const colors = useThemeColors()
  return (
    <XStack
      backgroundColor={EMPTY_COLOR + '18'}
      borderRadius="$2"
      borderWidth={1}
      borderColor={EMPTY_COLOR}
      paddingHorizontal="$2"
      paddingVertical="$1"
    >
      <Text color={EMPTY_COLOR} fontSize="$3">
        {label} — not set
      </Text>
    </XStack>
  )
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)

  const { profile } = useAuthStore()
  const uid = String(profile?.uid ?? '')
  const admin = isAdmin(profile)
  const publicUser = isPublic(profile)
  const isMember = !publicUser

  const { selectedEvent, getInstanceByKey, avail, subscribe, unsubscribe } = useEventsStore()
  const { subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const { subscribe: subPlanning, unsubscribe: unsubPlanning } = usePlanningStore()
  const { boards } = usePlanningStore()

  useEffect(() => {
    subscribe()
    subUsers()
    subPlanning()
    return () => {
      unsubscribe()
      unsubUsers()
      unsubPlanning()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Resolve event: prefer selectedEvent matching this id, fallback to lookup
  const event =
    selectedEvent?.instanceKey === id
      ? selectedEvent
      : id
      ? getInstanceByKey(id)
      : null

  const isUnpublished = event?.unpublished === true

  const [availModalOpen, setAvailModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [showBoard, setShowBoard] = useState(false)
  const [showWeather, setShowWeather] = useState(false)
  const [weatherEntry, setWeatherEntry] = useState<{ key: string; data: WeatherData } | null>(null)
  const [alertsEntry, setAlertsEntry] = useState<{ key: string; data: NWSAlert[] } | null>(null)

  const eventWeatherKey = `${event?.templateId}_${event?.date}`
  const weather = weatherEntry?.key === eventWeatherKey ? weatherEntry.data : null
  const alerts = alertsEntry?.key === eventWeatherKey ? alertsEntry.data : []

  useEffect(() => {
    if (!event?._geocodeLat || !event?._geocodeLng || !event?.date || event?.isVirtual) return
    if (!isMember && !admin) return
    const key = `${event.templateId}_${event.date}`
    fetchWeather(event._geocodeLat, event._geocodeLng, event.date).then((w) => {
      if (w) setWeatherEntry({ key, data: w })
    })
    fetchNWSAlerts(event._geocodeLat, event._geocodeLng).then((a) =>
      setAlertsEntry({ key, data: a })
    )
  }, [event?.date, event?._geocodeLat, event?._geocodeLng, isMember, admin])

  const myAvail = event ? effectiveAvail(avail, event, uid) : null
  const instanceAvail = event ? (avail[availKey(event)]?.[uid] ?? null) : null
  const hasSeriesResponse = event?.isRec
    ? getSeriesAvail(avail, event.templateId ?? event.id, uid) !== null
    : true

  const linkedBoard = event?.planningBoardId
    ? boards.find((b) => sameId(b.id, event!.planningBoardId!))
    : null

  const { users } = useUsersStore()
  const myDisplayName = users.find((u) => sameId(u.uid, uid))?.displayName ?? ''

  const handleExportICS = async () => {
    if (!event) return
    try {
      await downloadICS(event)
    } catch {
      toast('Failed to export calendar file', 'error')
    }
  }

  if (!event) {
    return (
      <YStack flex={1} padding="$4" alignItems="center" justifyContent="center">
        <ScreenTitle options={{ title: 'Event' }} />
        <Text color={colors.textMuted}>Event not found.</Text>
        <Pressable onPress={() => router.back()}>
          <Text color={colors.primary} marginTop="$3">← Go back</Text>
        </Pressable>
      </YStack>
    )
  }

  return (
    <>
      <ScreenTitle options={{ title: event.title }} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
        <YStack padding="$4" gap="$4" paddingBottom="$8">

          {/* Back button */}
          <Pressable onPress={() => router.back()}>
            <XStack alignItems="center" gap="$1">
              <Text color={colors.primary} fontSize="$4">←</Text>
              <Text color={colors.primary} fontSize="$3" fontWeight="600">Back</Text>
            </XStack>
          </Pressable>

          {/* Unpublished banner */}
          {isUnpublished ? (
            <XStack
              backgroundColor={EMPTY_COLOR + '22'}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={EMPTY_COLOR}
              alignItems="center"
              justifyContent="space-between"
              gap="$2"
            >
              <YStack flex={1} gap="$0.5">
                <Text color={EMPTY_COLOR} fontWeight="700" fontSize="$3">
                  Unpublished Draft
                </Text>
                <Text color={EMPTY_COLOR} fontSize="$2">
                  Only admins can see this event. Highlighted fields need to be completed before publishing.
                </Text>
              </YStack>
              {admin ? (
                <Pressable onPress={() => setEditModalOpen(true)}>
                  <XStack
                    backgroundColor={EMPTY_COLOR}
                    borderRadius="$2"
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                  >
                    <Text color="white" fontWeight="700" fontSize="$2">
                      Edit / Publish
                    </Text>
                  </XStack>
                </Pressable>
              ) : null}
            </XStack>
          ) : null}

          {/* Date & Time */}
          <YStack gap="$2">
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
              DATE & TIME
            </Text>
            {event.date ? (
              <Text color={colors.text} fontSize="$3">
                {FD(event.date, { weekday: true })}
              </Text>
            ) : isUnpublished ? (
              <EmptyField label="Date" />
            ) : null}
            {event.startTime ? (
              <Text color={colors.text} fontSize="$3">
                Start: {event.startTime}
              </Text>
            ) : isUnpublished ? (
              <EmptyField label="Start time" />
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

          {/* Weather */}
          {weather ? (
            <Pressable onPress={() => setShowWeather(true)}>
              <XStack
                backgroundColor={colors.surface}
                borderRadius="$2"
                padding="$2"
                borderWidth={1}
                borderColor={alerts.length > 0 ? '#e74c3c' : colors.border}
                alignItems="center"
                gap="$3"
              >
                <Text fontSize={24}>{weather.icon}</Text>
                <YStack flex={1}>
                  <Text color={colors.text} fontSize="$3" fontWeight="600">
                    {weather.label}
                  </Text>
                  <Text color={colors.textMuted} fontSize="$2">
                    {weather.high}°F / {weather.low}°F · {weather.precipPct}% chance of rain
                  </Text>
                </YStack>
                {alerts.length > 0 ? (
                  <XStack
                    backgroundColor="#e74c3c"
                    borderRadius={99}
                    paddingHorizontal={8}
                    paddingVertical={3}
                  >
                    <Text color="white" fontSize={11} fontWeight="700">
                      ⚠ {alerts.length}
                    </Text>
                  </XStack>
                ) : null}
                <Text color={colors.textMuted} fontSize="$2">›</Text>
              </XStack>
            </Pressable>
          ) : null}

          {/* Location */}
          {(event.location || event.address || event.city || isUnpublished) ? (
            <YStack gap="$2">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                LOCATION
              </Text>
              {event.location ? (
                <Text color={colors.text} fontSize="$3">
                  {event.location}
                </Text>
              ) : isUnpublished && !event.isVirtual ? (
                <EmptyField label="Venue name" />
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
              ) : isUnpublished && !event.isVirtual ? (
                <EmptyField label="City & state" />
              ) : null}
              {(event.location || event.city) ? (
                <Pressable onPress={() => openLocationInMaps(eventMapQuery(event))}>
                  <Text color={colors.primary} textDecorationLine="underline" fontSize="$2">
                    Get Directions →
                  </Text>
                </Pressable>
              ) : null}
            </YStack>
          ) : null}

          {/* Virtual */}
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
              ) : isUnpublished ? (
                <EmptyField label="Meeting link" />
              ) : null}
            </YStack>
          ) : null}

          {/* Dress Code — members only */}
          {isMember ? <DressCodeDisplay event={event} uid={uid} /> : null}

          {/* Food — members only */}
          {isMember && event.food ? (
            <FoodPanel event={event} uid={uid} myDisplayName={myDisplayName} />
          ) : null}

          {/* Carpool — members only */}
          {isMember && event.carpool ? (
            event.carpoolCars && event.carpoolCars.length > 0 ? (
              <CarpoolReadOnly event={event} uid={uid} isAdmin={admin} />
            ) : (
              <CarpoolPanel event={event} uid={uid} isAdmin={admin} />
            )
          ) : null}

          {/* Teams — members only */}
          {isMember && event.teams && event.teams.length > 0 ? (
            <TeamsDisplay event={event} uid={uid} />
          ) : null}

          {/* Lodging — members only */}
          {isMember && event.lodging && event.lodgingEntries && event.lodgingEntries.length > 0 ? (
            <LodgingDisplay event={event} uid={uid} isAdmin={admin} />
          ) : null}

          {/* Flights — members only */}
          {isMember && event.flights && event.flightEntries && event.flightEntries.length > 0 ? (
            <FlightDisplay event={event} uid={uid} isAdmin={admin} />
          ) : null}

          {/* Sign up link */}
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
                {event.isRec && instanceAvail ? (
                  <Text color={colors.textMuted} fontSize={11}>
                    (this date only)
                  </Text>
                ) : event.isRec && myAvail ? (
                  <Text color={colors.textMuted} fontSize={11}>
                    (series)
                  </Text>
                ) : null}
              </XStack>
              {event.isRec && !hasSeriesResponse ? (
                <Text color={colors.textMuted} fontSize="$2">
                  Set your series availability in the banner above first.
                </Text>
              ) : !isUnpublished ? (
                <Pressable onPress={() => setAvailModalOpen(true)}>
                  <XStack
                    borderWidth={1}
                    borderColor={colors.primary}
                    borderRadius="$2"
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    alignSelf="flex-start"
                  >
                    <Text color={colors.primary} fontWeight="600" fontSize="$3">
                      {instanceAvail
                        ? 'Change This Date'
                        : myAvail
                        ? 'Override This Date'
                        : 'Set RSVP'}
                    </Text>
                  </XStack>
                </Pressable>
              ) : null}
            </YStack>
          ) : null}

          {/* Planning Board */}
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

          {/* ICS Export */}
          {!isUnpublished ? (
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
          ) : null}

          {/* Admin Edit */}
          {admin && !isUnpublished ? (
            <Pressable onPress={() => setEditModalOpen(true)}>
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
      </ScrollView>

      <AvailModal
        event={event}
        uid={uid}
        open={availModalOpen}
        onClose={() => setAvailModalOpen(false)}
      />

      {admin ? (
        <EventFormModal
          key={event.instanceKey}
          event={event}
          instanceKey={event.isRec ? event.instanceKey : undefined}
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
        />
      ) : null}

      <PlanningBoardCanvas
        boardId={linkedBoard?.id ?? null}
        readOnly
        visible={showBoard}
        onClose={() => setShowBoard(false)}
      />

      <WeatherDetailSheet
        open={showWeather}
        onClose={() => setShowWeather(false)}
        event={event}
      />
    </>
  )
}
