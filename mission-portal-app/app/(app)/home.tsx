import { useEffect, useState } from 'react'
import { ScrollView, useWindowDimensions, Pressable, Linking } from 'react-native'
import { YStack, XStack, Text, H3, Input } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useAnnounceStore } from '@/stores/announceStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { EventCard } from '@/components/ui/EventCard'
import { TaskCard } from '@/components/ui/TaskCard'
import { AnnouncementCard } from '@/components/ui/AnnouncementCard'
import { EventDetailModal } from '@/features/events/EventDetailModal'
import { AvailModal } from '@/features/events/AvailModal'
import { isPublic } from '@/lib/roles'
import { AppLogo } from '@/components/ui/AppLogo'
import { todayStr, dateStr } from '@/lib/events'
import { FD, timeOfDay } from '@/lib/format'
import { haversineMiles, geocodeCity } from '@/lib/geocode'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { EventInstance } from '@/types/events'

// Public Home sub-component
function PubHomeContent() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const { instances } = useEventsStore()
  const { publicAnnouncements } = useAnnounceStore()
  const { subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()
  const { subscribe: subAnnounce, unsubscribe: unsubAnnounce } = useAnnounceStore()

  const [city, setCity] = useState(profile?.locationPref?.city ?? '')
  const [stateVal, setStateVal] = useState(profile?.locationPref?.state ?? '')
  const [radius, setRadius] = useState(profile?.locationPref?.radius ?? 50)
  const [saving, setSaving] = useState(false)
  const [showLocForm, setShowLocForm] = useState(false)

  useEffect(() => {
    subEvents()
    subAnnounce()
    return () => {
      unsubEvents()
      unsubAnnounce()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = todayStr()
  const in60 = dateStr(60)
  const allPublic = instances(today, in60).filter((ev) => ev.isPublic)

  const nearMe = (() => {
    const locPref = profile?.locationPref
    if (!locPref?.lat || !locPref?.lng) return []
    return allPublic.filter((ev) => {
      if (ev.isVirtual) return true
      if (!ev._geocodeLat || !ev._geocodeLng) return false
      return (
        haversineMiles(locPref.lat!, locPref.lng!, ev._geocodeLat, ev._geocodeLng) <= locPref.radius
      )
    })
  })()

  const publicAnns = publicAnnouncements()
  const uid = profile?.uid ?? ''

  const handleSaveLocation = async () => {
    if (!uid) return
    setSaving(true)
    try {
      const coords = await geocodeCity(city, stateVal)
      const locationPref = { city, state: stateVal, radius, ...(coords ?? {}) }
      await updateDoc(doc(db, 'users', uid), { locationPref })
      setShowLocForm(false)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <YStack padding="$4" gap="$4">
        {/* Welcome */}
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$3"
          padding="$4"
          borderWidth={1}
          borderColor={colors.border}
          gap="$3"
          alignItems="center"
        >
          <AppLogo size="lg" showSlogan />
          <Text color={colors.text} fontSize="$4" fontWeight="600" textAlign="center">
            Welcome, {profile?.displayName?.split(' ')[0] ?? 'friend'}!
          </Text>
        </YStack>

        {/* Events Near Me */}
        <YStack gap="$2">
          <XStack justifyContent="space-between" alignItems="center">
            <H3 color={colors.text}>Events Near Me</H3>
            <Pressable onPress={() => setShowLocForm((v) => !v)}>
              <Text color={colors.primary} fontSize="$3">
                Set Location
              </Text>
            </Pressable>
          </XStack>

          {showLocForm ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={colors.border}
              gap="$2"
            >
              <XStack gap="$2">
                <Input
                  flex={1}
                  value={city}
                  onChangeText={(v: string) => setCity(v)}
                  placeholder="City"
                  backgroundColor={colors.surface}
                  color={colors.text}
                  borderColor={colors.border}
                />
                <Input
                  width={80}
                  value={stateVal}
                  onChangeText={(v: string) => setStateVal(v)}
                  placeholder="State"
                  backgroundColor={colors.surface}
                  color={colors.text}
                  borderColor={colors.border}
                />
              </XStack>
              <XStack gap="$2" alignItems="center">
                <Text color={colors.textMuted} fontSize="$3">
                  Radius (miles):
                </Text>
                <Input
                  width={80}
                  value={String(radius)}
                  onChangeText={(v: string) => setRadius(Number(v) || 50)}
                  keyboardType="numeric"
                  backgroundColor={colors.surface}
                  color={colors.text}
                  borderColor={colors.border}
                />
              </XStack>
              <Pressable onPress={handleSaveLocation} disabled={saving}>
                <XStack
                  backgroundColor={colors.primary}
                  borderRadius="$2"
                  paddingHorizontal="$4"
                  paddingVertical="$2"
                  alignSelf="flex-start"
                  opacity={saving ? 0.6 : 1}
                >
                  <Text color="white" fontWeight="600">
                    {saving ? 'Saving…' : 'Save Location'}
                  </Text>
                </XStack>
              </Pressable>
            </YStack>
          ) : null}

          {nearMe.length === 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={colors.border}
            >
              <Text color={colors.textMuted}>
                {profile?.locationPref
                  ? 'No events near your location in the next 60 days.'
                  : 'Set your location to see nearby events.'}
              </Text>
            </YStack>
          ) : (
            nearMe.map((ev) => (
              <YStack
                key={ev.instanceKey}
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                borderWidth={1}
                borderColor={colors.border}
                gap="$1"
              >
                <Text color={colors.text} fontWeight="700">
                  {ev.title}
                </Text>
                <Text color={colors.textMuted} fontSize="$2">
                  {FD(ev.date)} {ev.startTime ? `· ${ev.startTime}` : ''}
                  {ev.isVirtual ? ' · Virtual' : ''}
                </Text>
                {ev.location ? (
                  <Text color={colors.textMuted} fontSize="$2">
                    {ev.location}
                  </Text>
                ) : null}
                {ev.isVirtual && ev.virtualLink ? (
                  <Pressable onPress={() => Linking.openURL(ev.virtualLink!)}>
                    <Text color="#8e44ad" fontSize="$2" textDecorationLine="underline">
                      Join Here
                    </Text>
                  </Pressable>
                ) : null}
              </YStack>
            ))
          )}
        </YStack>

        {/* Public Announcements */}
        <YStack gap="$2">
          <H3 color={colors.text}>Announcements</H3>
          {publicAnns.length === 0 ? (
            <Text color={colors.textMuted} fontSize="$3">
              No announcements.
            </Text>
          ) : (
            publicAnns.map((ann) => <AnnouncementCard key={String(ann.id)} announcement={ann} />)
          )}
        </YStack>

        {/* All Public Events */}
        <YStack gap="$2">
          <H3 color={colors.text}>All Public Events (60 Days)</H3>
          {allPublic.length === 0 ? (
            <Text color={colors.textMuted} fontSize="$3">
              No upcoming public events.
            </Text>
          ) : (
            allPublic.map((ev) => (
              <YStack
                key={ev.instanceKey}
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                borderWidth={1}
                borderColor={colors.border}
                gap="$1"
              >
                <Text color={colors.text} fontWeight="700">
                  {ev.title}
                </Text>
                <Text color={colors.textMuted} fontSize="$2">
                  {FD(ev.date, { weekday: true })} {ev.startTime ? `· ${ev.startTime}` : ''}
                </Text>
                {ev.location ? (
                  <Text color={colors.textMuted} fontSize="$2">
                    {ev.location}
                  </Text>
                ) : null}
              </YStack>
            ))
          )}
        </YStack>
      </YStack>
    </ScrollView>
  )
}

// Main Home for team members (non-admin, non-public)
function TeamHomeContent() {
  const colors = useThemeColors()
  const { width } = useWindowDimensions()
  const isWide = width >= 768

  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''

  const { avail } = useEventsStore()
  const eventsStore = useEventsStore()
  const tasksStore = useTasksStore()
  const announceStore = useAnnounceStore()
  const { subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()
  const { subscribe: subTasks, unsubscribe: unsubTasks } = useTasksStore()
  const { subscribe: subAnnounce, unsubscribe: unsubAnnounce } = useAnnounceStore()

  const [detailEvent, setDetailEvent] = useState<EventInstance | null>(null)
  const [availEvent, setAvailEvent] = useState<EventInstance | null>(null)

  useEffect(() => {
    subEvents()
    subTasks()
    subAnnounce()
    return () => {
      unsubEvents()
      unsubTasks()
      unsubAnnounce()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = todayStr()
  const in7 = dateStr(7)

  const myEvents = eventsStore.myInstances(uid, today, in7)
  const overdueTasks = tasksStore.overdueTasks(uid)
  const behindTasks = tasksStore.behindTasks(uid)
  const dueSoonTasks = tasksStore.dueThisWeekTasks(uid)
  const myAnns = announceStore.myAnnouncements(uid).slice(0, 3)

  const greeting = `Good ${timeOfDay()}, ${profile?.displayName?.split(' ')[0] ?? 'there'}!`
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const myAvail = (ev: EventInstance) => {
    const key = String(ev.instanceKey ?? `${ev.templateId}_${ev.date}`)
    return avail[key]?.[uid] ?? null
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <YStack padding="$4" gap="$4">
        <YStack gap="$1">
          <Text color={colors.text} fontSize="$6" fontWeight="700">
            {greeting}
          </Text>
          <Text color={colors.textMuted} fontSize="$3">
            {todayLabel}
          </Text>
        </YStack>

        <XStack gap="$4" flexDirection={isWide ? 'row' : 'column'} alignItems="flex-start">
          {/* Left: Events + Tasks */}
          <YStack flex={1} gap="$3">
            <H3 color={colors.text}>My Upcoming Events</H3>
            {myEvents.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                borderWidth={1}
                borderColor={colors.border}
              >
                <Text color={colors.textMuted}>No events assigned to you this week.</Text>
              </YStack>
            ) : (
              myEvents.map((ev) => (
                <EventCard
                  key={ev.instanceKey}
                  event={ev}
                  myAvail={myAvail(ev)}
                  onDetail={() => setDetailEvent(ev)}
                  onAvail={() => setAvailEvent(ev)}
                />
              ))
            )}

            <H3 color={colors.text} marginTop="$2">
              My Tasks
            </H3>

            {overdueTasks.length > 0 ? (
              <YStack
                backgroundColor="#c0392b22"
                borderRadius="$3"
                padding="$2"
                borderWidth={1}
                borderColor="#c0392b"
                gap="$1"
              >
                <Text color="#c0392b" fontWeight="700" fontSize="$3">
                  ⚠ {overdueTasks.length} Overdue
                </Text>
                {overdueTasks.map((t) => (
                  <TaskCard key={String(t.id)} task={t} />
                ))}
              </YStack>
            ) : null}

            {behindTasks.length > 0 ? (
              <YStack
                backgroundColor="#e67e2222"
                borderRadius="$3"
                padding="$2"
                borderWidth={1}
                borderColor="#e67e22"
                gap="$1"
              >
                <Text color="#e67e22" fontWeight="700" fontSize="$3">
                  ⏰ {behindTasks.length} Behind
                </Text>
                {behindTasks.map((t) => (
                  <TaskCard key={String(t.id)} task={t} />
                ))}
              </YStack>
            ) : null}

            {dueSoonTasks.length > 0 ? (
              <YStack gap="$1">
                <Text color={colors.textMuted} fontWeight="600" fontSize="$3">
                  → {dueSoonTasks.length} Due This Week
                </Text>
                {dueSoonTasks.map((t) => (
                  <TaskCard key={String(t.id)} task={t} />
                ))}
              </YStack>
            ) : null}

            {overdueTasks.length === 0 && behindTasks.length === 0 && dueSoonTasks.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                borderWidth={1}
                borderColor={colors.border}
              >
                <Text color={colors.textMuted}>No urgent tasks this week.</Text>
              </YStack>
            ) : null}
          </YStack>

          {/* Right: Announcements */}
          <YStack width={isWide ? 300 : '100%'} gap="$3">
            <H3 color={colors.text}>Recent Announcements</H3>
            {myAnns.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                borderWidth={1}
                borderColor={colors.border}
              >
                <Text color={colors.textMuted}>No announcements.</Text>
              </YStack>
            ) : (
              myAnns.map((ann) => <AnnouncementCard key={String(ann.id)} announcement={ann} />)
            )}
          </YStack>
        </XStack>
      </YStack>

      <EventDetailModal
        event={detailEvent}
        uid={uid}
        open={!!detailEvent}
        onClose={() => setDetailEvent(null)}
        onAvail={() => {
          setAvailEvent(detailEvent)
          setDetailEvent(null)
        }}
      />
      <AvailModal
        event={availEvent}
        uid={uid}
        open={!!availEvent}
        onClose={() => setAvailEvent(null)}
      />
    </ScrollView>
  )
}

export default function Home() {
  const { profile } = useAuthStore()

  if (isPublic(profile)) {
    return (
      <>
        <Stack.Screen options={{ title: 'Home' }} />
        <PubHomeContent />
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Home' }} />
      <TeamHomeContent />
    </>
  )
}
