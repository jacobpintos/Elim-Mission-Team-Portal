import { useEffect, useState } from 'react'
import { ScrollView, useWindowDimensions } from 'react-native'
import { YStack, XStack, Text, H3 } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useNotifsStore } from '@/stores/notifsStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { EventCard } from '@/components/ui/EventCard'
import { NotificationRow } from '@/components/ui/NotificationRow'
import { MiniHealthBars } from '@/components/ui/MiniHealthBars'
import { EventDetailModal } from '@/features/events/EventDetailModal'
import { AvailModal } from '@/features/events/AvailModal'
import { buildSectionHealth } from '@/features/events/buildSectionHealth'
import { todayStr, dateStr } from '@/lib/events'
import { FD, timeOfDay } from '@/lib/format'
import { sameId } from '@/lib/ids'
import type { EventInstance } from '@/types/events'

export default function Dashboard() {
  const colors = useThemeColors()
  const { width } = useWindowDimensions()
  const isWide = width >= 768

  const { profile } = useAuthStore()
  const { instances, avail } = useEventsStore()
  const { tasks } = useTasksStore()
  const { items: notifs, markRead } = useNotifsStore()
  const { subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()
  const { subscribe: subTasks, unsubscribe: unsubTasks } = useTasksStore()
  const { subscribe: subNotifs, unsubscribe: unsubNotifs } = useNotifsStore()

  const [detailEvent, setDetailEvent] = useState<EventInstance | null>(null)
  const [availEvent, setAvailEvent] = useState<EventInstance | null>(null)

  const uid = profile?.uid ?? ''

  useEffect(() => {
    subEvents()
    subTasks()
    if (uid) subNotifs(uid)
    return () => {
      unsubEvents()
      unsubTasks()
      unsubNotifs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  const today = todayStr()
  const in7 = dateStr(7)
  const in60 = dateStr(60)

  // Upcoming events (7 days) — dedupe by templateId
  const upcoming7 = (() => {
    const all = instances(today, in7)
    const seen = new Set<string>()
    return all.filter((ev) => {
      const key = String(ev.templateId)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()

  // Event task health (60 days)
  const health60 = (() => {
    const all = instances(today, in60).filter((ev) => ev.taskTemplateId)
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
      <Stack.Screen options={{ title: 'Dashboard' }} />
      <YStack padding="$4" gap="$4">
        {/* Header */}
        <YStack gap="$1">
          <Text color={colors.text} fontSize="$6" fontWeight="700">
            {greeting}
          </Text>
          <Text color={colors.textMuted} fontSize="$3">
            {todayLabel}
          </Text>
        </YStack>

        {/* Two-column layout on wide screens */}
        <XStack gap="$4" flexDirection={isWide ? 'row' : 'column'} alignItems="flex-start">
          {/* Left column: Upcoming Events */}
          <YStack flex={1} gap="$3">
            <H3 color={colors.text}>Upcoming Events (7 Days)</H3>
            {upcoming7.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$4"
                borderWidth={1}
                borderColor={colors.border}
                alignItems="center"
              >
                <Text color={colors.textMuted}>No events in the next 7 days</Text>
              </YStack>
            ) : (
              upcoming7.map((ev) => (
                <EventCard
                  key={ev.instanceKey}
                  event={ev}
                  myAvail={myAvail(ev)}
                  onDetail={() => setDetailEvent(ev)}
                  onAvail={() => setAvailEvent(ev)}
                />
              ))
            )}
          </YStack>

          {/* Right column: Alerts + Notifications */}
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

        {/* Event Task Health */}
        {health60.length > 0 ? (
          <YStack gap="$3">
            <H3 color={colors.text}>Event Task Health (Next 60 Days)</H3>
            <XStack gap="$3" flexWrap="wrap">
              {health60.map((ev) => {
                const evTasks = tasks.filter((t) => sameId(t.evId ?? t.evTemplateId, ev.templateId))
                const sections = buildSectionHealth(ev, evTasks, [])
                const anyBehind = sections.some((s) => s.isLagging)
                return (
                  <YStack
                    key={ev.instanceKey}
                    backgroundColor={colors.surface}
                    borderRadius="$3"
                    padding="$3"
                    borderWidth={2}
                    borderColor={anyBehind ? '#c0392b' : '#27ae60'}
                    width={isWide ? 280 : '100%'}
                    gap="$2"
                  >
                    <Text color={colors.text} fontWeight="700" fontSize="$3">
                      {ev.title}
                    </Text>
                    <Text color={colors.textMuted} fontSize="$2">
                      {FD(ev.date, { weekday: true })}
                    </Text>
                    <MiniHealthBars sections={sections} compact />
                  </YStack>
                )
              })}
            </XStack>
          </YStack>
        ) : null}
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
