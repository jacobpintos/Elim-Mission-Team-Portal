import { useEffect, useState } from 'react'
import { ScrollView, useWindowDimensions, Pressable } from 'react-native'
import { YStack, XStack, Text, H3, Button } from 'tamagui'
import { Stack, useRouter } from 'expo-router'
import { AppLogo } from '@/components/ui/AppLogo'
import { useAuthStore } from '@/stores/authStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useNotifsStore } from '@/stores/notifsStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { EventCard } from '@/components/ui/EventCard'
import { NotificationRow } from '@/components/ui/NotificationRow'
import { WeatherDetailSheet } from '@/features/events/WeatherDetailSheet'
import { AvailModal } from '@/features/events/AvailModal'
import { EventKanban } from '@/features/events/EventKanban'
import { todayStr, dateStr } from '@/lib/events'
import { timeOfDay } from '@/lib/format'
import { sameId } from '@/lib/ids'
import { isOverdue } from '@/lib/availability'
import { isAdmin, isGuest } from '@/lib/roles'
import { usePWAInstallPrompt } from '@/lib/pwaInstall'
import type { EventInstance } from '@/types/events'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { useWorshipStore } from '@/stores/worshipStore'
import { guestLodging, guestFlights, worshipEventsFor } from '@/lib/guestItinerary'

export default function Dashboard() {
  const colors = useThemeColors()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isWide = width >= 768

  const { profile } = useAuthStore()
  const { instances, avail, setSelectedEvent } = useEventsStore()
  const { tasks } = useTasksStore()
  const { items: notifs, markRead } = useNotifsStore()
  const { setLists, subscribe: subWorship, unsubscribe: unsubWorship } = useWorshipStore()
  const { subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()
  const { subscribe: subTasks, unsubscribe: unsubTasks } = useTasksStore()
  const { subscribe: subNotifs, unsubscribe: unsubNotifs } = useNotifsStore()

  const [availEvent, setAvailEvent] = useState<EventInstance | null>(null)
  const [kanbanEvent, setKanbanEvent] = useState<EventInstance | null>(null)
  const [weatherEvent, setWeatherEvent] = useState<EventInstance | null>(null)
  const { canInstall, install } = usePWAInstallPrompt()

  const uid = profile?.uid ?? ''
  const admin = isAdmin(profile)
  const guest = isGuest(profile)

  useEffect(() => {
    subEvents()
    subTasks()
    if (uid) subNotifs(uid)
    subWorship()
    return () => {
      unsubEvents()
      unsubTasks()
      unsubNotifs()
      unsubWorship()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  const today = todayStr()
  const in60 = dateStr(60)

  // Upcoming events (60 days) — visibility-filtered, dedupe by templateId
  const openDetail = (ev: EventInstance) => {
    setSelectedEvent(ev)
    router.push(`/(app)/events/${ev.instanceKey}` as never)
  }

  const upcoming60 = (() => {
    const all = instances(today, in60).filter((ev) => {
      if (ev.unpublished === true) return false
      const invited = ev.users?.some((x) => sameId(x, uid))
      // A guest's dashboard is their trip, not the public calendar.
      if (guest) return !!invited
      return ev.isPublic || admin || invited
    })
    const seen = new Set<string>()
    return all.filter((ev) => {
      const key = String(ev.templateId)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()

  // Unread notifs (capped at 6)
  const unreadNotifs = notifs
    .filter((n) => !n.read)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 6)

  const firstName = profile?.displayName?.split(' ')[0]
  const greeting = firstName ? `Good ${timeOfDay()}, ${firstName}!` : `Good ${timeOfDay()}!`
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const myAvail = (ev: EventInstance) => {
    const key = String(ev.instanceKey ?? `${ev.templateId}_${ev.date}`)
    return avail[key]?.[uid] ?? null
  }

  const getEventHealthStatus = (ev: EventInstance): 'on-track' | 'behind' | 'no-tasks' => {
    const evTasks = tasks.filter(
      (t) =>
        sameId(t.evId ?? t.evTemplateId, ev.templateId) || sameId(t.evTemplateId, ev.taskTemplateId)
    )
    if (evTasks.length === 0) return 'no-tasks'
    const hasProblem = evTasks.some((t) => t.status === 'behind' || isOverdue(t))
    return hasProblem ? 'behind' : 'on-track'
  }

  const getKanbanTasks = (ev: EventInstance) =>
    tasks.filter(
      (t) =>
        sameId(t.evId ?? t.evTemplateId, ev.templateId) || sameId(t.evTemplateId, ev.taskTemplateId)
    )

  // A guest is here for the practical details: where they sleep, when they
  // fly, and the set list if they are singing. Those sit above everything else
  // rather than buried inside each event card.
  const myLodging = guest ? guestLodging(upcoming60, uid) : []
  const myFlights = guest ? guestFlights(upcoming60, uid) : []
  const myWorshipEvents = guest ? worshipEventsFor(upcoming60, uid) : []
  const myWorshipSetLists = myWorshipEvents.flatMap((ev) =>
    setLists
      .filter((sl) => sameId(sl.eventTemplateId ?? '', ev.templateId ?? ev.id))
      .map((sl) => ({ event: ev, setList: sl }))
  )

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenTitle options={{ title: 'Dashboard' }} />
      <YStack padding="$4" gap="$4">
        {guest && (myLodging.length > 0 || myFlights.length > 0 || myWorshipSetLists.length > 0) ? (
          <YStack gap="$2">
            <H3 color={colors.text}>Your trip</H3>

            {myFlights.map(({ event, entry }) => (
              <Pressable key={`f-${entry.id}`} onPress={() => openDetail(event)}>
                <YStack
                  backgroundColor={colors.surface}
                  borderRadius="$3"
                  padding="$3"
                  borderWidth={1}
                  borderColor={colors.primary}
                  gap="$1"
                >
                  <Text color={colors.primary} fontSize="$2" fontWeight="700">
                    ✈ FLIGHT · {event.title}
                  </Text>
                  {entry.outDate || entry.outTime ? (
                    <Text color={colors.text} fontSize="$3">
                      Out:{' '}
                      {[entry.outDate, entry.outTime, entry.outAirport, entry.outFlight]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                  {entry.retDate || entry.retTime ? (
                    <Text color={colors.text} fontSize="$3">
                      Return:{' '}
                      {[entry.retDate, entry.retTime, entry.retAirport, entry.retFlight]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                </YStack>
              </Pressable>
            ))}

            {myLodging.map(({ event, entry }) => (
              <Pressable key={`l-${entry.id}`} onPress={() => openDetail(event)}>
                <YStack
                  backgroundColor={colors.surface}
                  borderRadius="$3"
                  padding="$3"
                  borderWidth={1}
                  borderColor={colors.primary}
                  gap="$1"
                >
                  <Text color={colors.primary} fontSize="$2" fontWeight="700">
                    🏨 HOTEL · {event.title}
                  </Text>
                  <Text color={colors.text} fontSize="$3">
                    {[entry.name, entry.room ? `Room ${entry.room}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </YStack>
              </Pressable>
            ))}

            {myWorshipSetLists.map(({ event, setList }) => (
              <Pressable
                key={`s-${setList.id}`}
                onPress={() => router.push('/(app)/worship' as never)}
              >
                <YStack
                  backgroundColor={colors.surface}
                  borderRadius="$3"
                  padding="$3"
                  borderWidth={1}
                  borderColor={colors.primary}
                  gap="$1"
                >
                  <Text color={colors.primary} fontSize="$2" fontWeight="700">
                    ♫ SET LIST · {event.title}
                  </Text>
                  <Text color={colors.text} fontSize="$3">
                    {setList.title}
                  </Text>
                </YStack>
              </Pressable>
            ))}
          </YStack>
        ) : null}
        {/* PWA install banner — web only, shown when browser install prompt is available */}
        {canInstall && (
          <XStack
            backgroundColor="$primary"
            borderRadius="$3"
            padding="$3"
            alignItems="center"
            justifyContent="space-between"
            gap="$3"
          >
            <Text color="white" fontSize="$3" flex={1}>
              Add Mission Portal to your home screen for the best experience.
            </Text>
            <Button size="$2" backgroundColor="white" color="$primary" onPress={install}>
              Install
            </Button>
          </XStack>
        )}

        {/* Header */}
        <XStack alignItems="center" justifyContent="space-between" gap="$3">
          <YStack flex={1} gap="$1">
            <Text color={colors.text} fontSize="$5" fontWeight="700">
              {greeting}
            </Text>
            <Text color={colors.textMuted} fontSize="$3">
              {todayLabel}
            </Text>
          </YStack>
          <AppLogo size="sm" showSlogan={false} />
        </XStack>

        {/* Two-column layout on wide screens */}
        <XStack gap="$4" flexDirection={isWide ? 'row' : 'column'} alignItems="flex-start">
          {/* Left column: Upcoming Events (60 days) */}
          <YStack flex={1} gap="$3">
            <H3 color={colors.text}>Upcoming Events (Next 60 Days)</H3>
            {upcoming60.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$4"
                borderWidth={1}
                borderColor={colors.border}
                alignItems="center"
              >
                <Text color={colors.textMuted}>No events in the next 60 days</Text>
              </YStack>
            ) : (
              upcoming60.map((ev) => (
                <EventCard
                  key={ev.instanceKey}
                  event={ev}
                  myAvail={myAvail(ev)}
                  onDetail={() => openDetail(ev)}
                  onAvail={() => setAvailEvent(ev)}
                  healthStatus={ev.taskTemplateId ? getEventHealthStatus(ev) : undefined}
                  onShowTasks={ev.taskTemplateId ? () => setKanbanEvent(ev) : undefined}
                  onWeatherPress={() => setWeatherEvent(ev)}
                />
              ))
            )}
          </YStack>

          {/* Right column: Notifications */}
          <YStack width={isWide ? 320 : '100%'} gap="$3">
            <H3 color={colors.text}>Notifications</H3>
            {unreadNotifs.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                borderWidth={1}
                borderColor={'#27ae60'}
                gap="$1"
              >
                <XStack gap="$2" alignItems="center">
                  <Text fontSize="$4">✓</Text>
                  <Text color={'#27ae60'} fontWeight="600">
                    No unread notifications
                  </Text>
                </XStack>
              </YStack>
            ) : (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                borderWidth={1}
                borderColor={colors.border}
                overflow="hidden"
              >
                {unreadNotifs.map((n) => (
                  <NotificationRow key={n.id} notif={n} onPress={() => markRead(n.id)} />
                ))}
              </YStack>
            )}
          </YStack>
        </XStack>
      </YStack>

      <AvailModal
        event={availEvent}
        uid={uid}
        open={!!availEvent}
        onClose={() => setAvailEvent(null)}
      />
      <EventKanban
        tasks={kanbanEvent ? getKanbanTasks(kanbanEvent) : []}
        eventTitle={kanbanEvent?.title ?? ''}
        visible={!!kanbanEvent}
        onClose={() => setKanbanEvent(null)}
      />
      {weatherEvent ? (
        <WeatherDetailSheet
          open={!!weatherEvent}
          onClose={() => setWeatherEvent(null)}
          event={weatherEvent}
        />
      ) : null}
    </ScrollView>
  )
}
