import { useEffect, useState } from 'react'
import { ScrollView, useWindowDimensions } from 'react-native'
import { YStack, XStack, Text, H3, Button } from 'tamagui'
import { Stack } from 'expo-router'
import { AppLogo } from '@/components/ui/AppLogo'
import { useAuthStore } from '@/stores/authStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useNotifsStore } from '@/stores/notifsStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { EventCard } from '@/components/ui/EventCard'
import { NotificationRow } from '@/components/ui/NotificationRow'
import { EventDetailModal } from '@/features/events/EventDetailModal'
import { AvailModal } from '@/features/events/AvailModal'
import { EventKanban } from '@/features/events/EventKanban'
import { todayStr, dateStr } from '@/lib/events'
import { timeOfDay } from '@/lib/format'
import { sameId } from '@/lib/ids'
import { isOverdue } from '@/lib/availability'
import { isAdmin } from '@/lib/roles'
import { usePWAInstallPrompt } from '@/lib/pwaInstall'
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
  const [kanbanEvent, setKanbanEvent] = useState<EventInstance | null>(null)
  const { canInstall, install } = usePWAInstallPrompt()

  const uid = profile?.uid ?? ''
  const admin = isAdmin(profile)

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
  const in60 = dateStr(60)

  // Upcoming events (60 days) — visibility-filtered, dedupe by templateId
  const upcoming60 = (() => {
    const all = instances(today, in60).filter(
      (ev) => ev.isPublic || admin || ev.users?.some((x) => sameId(x, uid))
    )
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Dashboard' }} />
      <YStack padding="$4" gap="$4">
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
                  onDetail={() => setDetailEvent(ev)}
                  onAvail={() => setAvailEvent(ev)}
                  healthStatus={ev.taskTemplateId ? getEventHealthStatus(ev) : undefined}
                  onShowTasks={ev.taskTemplateId ? () => setKanbanEvent(ev) : undefined}
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
      <EventKanban
        tasks={kanbanEvent ? getKanbanTasks(kanbanEvent) : []}
        eventTitle={kanbanEvent?.title ?? ''}
        visible={!!kanbanEvent}
        onClose={() => setKanbanEvent(null)}
      />
    </ScrollView>
  )
}
