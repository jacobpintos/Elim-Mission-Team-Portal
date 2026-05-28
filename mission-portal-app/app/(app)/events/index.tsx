import { useEffect, useState, useMemo } from 'react'
import { ScrollView, Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useConfigStore } from '@/stores/configStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { EventDetailModal } from '@/features/events/EventDetailModal'
import { AvailModal } from '@/features/events/AvailModal'
import { EventFormModal } from '@/features/events/EventFormModal'
import { isAdmin } from '@/lib/roles'
import { FD } from '@/lib/format'
import type { EventInstance } from '@/types/events'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// Build a range string for a given month (1-indexed)
function monthRange(y: number, m: number) {
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

export default function EventsScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''
  const admin = isAdmin(profile)

  const { instances } = useEventsStore()
  const { subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()
  const configStore = useConfigStore()
  const { subscribe: subConfig, unsubscribe: unsubConfig } = useConfigStore()

  // Admin uses Firestore-synced cal; non-admin uses local state
  const [localY, setLocalY] = useState(() => new Date().getFullYear())
  const [localM, setLocalM] = useState(() => new Date().getMonth() + 1)

  const calY = admin ? configStore.calY : localY
  const calM = admin ? configStore.calM : localM

  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [detailEvent, setDetailEvent] = useState<EventInstance | null>(null)
  const [availEvent, setAvailEvent] = useState<EventInstance | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [view, setView] = useState<'calendar' | 'list'>('calendar')

  useEffect(() => {
    subEvents()
    subConfig()
    return () => {
      unsubEvents()
      unsubConfig()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { from, to } = monthRange(calY, calM)
  const monthEvents = instances(from, to)

  // Group events by date string
  const byDate = useMemo(() => {
    const map: Record<string, EventInstance[]> = {}
    monthEvents.forEach((ev) => {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    })
    return map
  }, [monthEvents])

  // Calendar grid helpers
  const firstDayOfMonth = new Date(calY, calM - 1, 1).getDay()
  const daysInMonth = new Date(calY, calM, 0).getDate()

  const prevMonth = () => {
    const nm = calM === 1 ? 12 : calM - 1
    const ny = calM === 1 ? calY - 1 : calY
    if (admin) configStore.setCalMonth(ny, nm)
    else {
      setLocalM(nm)
      setLocalY(ny)
    }
  }

  const nextMonth = () => {
    const nm = calM === 12 ? 1 : calM + 1
    const ny = calM === 12 ? calY + 1 : calY
    if (admin) configStore.setCalMonth(ny, nm)
    else {
      setLocalM(nm)
      setLocalY(ny)
    }
  }

  const dayStr = (day: number) =>
    `${calY}-${String(calM).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const selectedEvents = selectedDay ? (byDate[selectedDay] ?? []) : []

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Events' }} />

      {/* Header */}
      <XStack
        padding="$3"
        justifyContent="space-between"
        alignItems="center"
        borderBottomWidth={1}
        borderBottomColor={colors.border}
      >
        <Pressable onPress={prevMonth}>
          <Text color={colors.primary} fontSize="$4" paddingHorizontal="$2">
            ‹
          </Text>
        </Pressable>
        <Text color={colors.text} fontWeight="700" fontSize="$4">
          {MONTH_NAMES[calM - 1]} {calY}
        </Text>
        <Pressable onPress={nextMonth}>
          <Text color={colors.primary} fontSize="$4" paddingHorizontal="$2">
            ›
          </Text>
        </Pressable>
      </XStack>

      {/* View toggle + create button */}
      <XStack padding="$2" gap="$2" justifyContent="space-between" alignItems="center">
        <XStack gap="$1">
          {(['calendar', 'list'] as const).map((v) => (
            <Pressable key={v} onPress={() => setView(v)}>
              <XStack
                paddingHorizontal="$3"
                paddingVertical="$1"
                borderRadius="$2"
                backgroundColor={view === v ? colors.primary : 'transparent'}
                borderWidth={1}
                borderColor={view === v ? colors.primary : colors.border}
              >
                <Text color={view === v ? 'white' : colors.text} fontSize="$2">
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </Text>
              </XStack>
            </Pressable>
          ))}
        </XStack>
        {admin ? (
          <Pressable onPress={() => setShowCreateModal(true)}>
            <XStack
              backgroundColor={colors.primary}
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$1"
            >
              <Text color="white" fontSize="$2" fontWeight="600">
                + Create Event
              </Text>
            </XStack>
          </Pressable>
        ) : null}
      </XStack>

      <ScrollView style={{ flex: 1 }}>
        {view === 'calendar' ? (
          <YStack padding="$2">
            {/* Day headers */}
            <XStack>
              {DAY_NAMES.map((d) => (
                <YStack key={d} flex={1} alignItems="center" padding="$1">
                  <Text color={colors.textMuted} fontSize={11} fontWeight="600">
                    {d}
                  </Text>
                </YStack>
              ))}
            </XStack>

            {/* Calendar grid */}
            {Array.from({ length: Math.ceil((firstDayOfMonth + daysInMonth) / 7) }, (_, week) => (
              <XStack key={week}>
                {Array.from({ length: 7 }, (_, dow) => {
                  const cellIdx = week * 7 + dow
                  const day = cellIdx - firstDayOfMonth + 1
                  if (day < 1 || day > daysInMonth) {
                    return <YStack key={dow} flex={1} minHeight={50} />
                  }
                  const ds = dayStr(day)
                  const evs = byDate[ds] ?? []
                  const isSelected = selectedDay === ds
                  const isToday = ds === new Date().toISOString().split('T')[0]

                  return (
                    <Pressable
                      key={dow}
                      style={{ flex: 1 }}
                      onPress={() => setSelectedDay(isSelected ? null : ds)}
                    >
                      <YStack
                        flex={1}
                        minHeight={50}
                        padding={4}
                        borderRadius="$2"
                        backgroundColor={isSelected ? colors.primary + '33' : 'transparent'}
                        borderWidth={isToday ? 2 : 0}
                        borderColor={colors.primary}
                        alignItems="center"
                        gap={2}
                      >
                        <Text
                          color={isSelected ? colors.primary : colors.text}
                          fontSize={13}
                          fontWeight={isToday ? '700' : '400'}
                        >
                          {day}
                        </Text>
                        {evs.length > 0 ? (
                          <XStack flexWrap="wrap" gap={2} justifyContent="center">
                            {evs.slice(0, 3).map((ev) => (
                              <YStack
                                key={ev.instanceKey}
                                width={6}
                                height={6}
                                borderRadius={3}
                                backgroundColor={colors.primary}
                              />
                            ))}
                          </XStack>
                        ) : null}
                      </YStack>
                    </Pressable>
                  )
                })}
              </XStack>
            ))}

            {/* Selected day events */}
            {selectedDay && selectedEvents.length > 0 ? (
              <YStack marginTop="$3" gap="$2">
                <Text color={colors.text} fontWeight="700" fontSize="$3">
                  {FD(selectedDay, { weekday: true })}
                </Text>
                {selectedEvents.map((ev) => (
                  <Pressable key={ev.instanceKey} onPress={() => setDetailEvent(ev)}>
                    <XStack
                      backgroundColor={colors.surface}
                      borderRadius="$2"
                      padding="$2"
                      borderWidth={1}
                      borderColor={colors.border}
                      gap="$2"
                      alignItems="center"
                    >
                      <YStack
                        width={4}
                        alignSelf="stretch"
                        backgroundColor={colors.primary}
                        borderRadius={2}
                      />
                      <YStack flex={1}>
                        <Text color={colors.text} fontWeight="600" fontSize="$3">
                          {ev.title}
                        </Text>
                        {ev.startTime ? (
                          <Text color={colors.textMuted} fontSize="$2">
                            {ev.startTime}
                          </Text>
                        ) : null}
                        {ev.location ? (
                          <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                            {ev.location}
                          </Text>
                        ) : null}
                      </YStack>
                    </XStack>
                  </Pressable>
                ))}
              </YStack>
            ) : selectedDay ? (
              <Text color={colors.textMuted} marginTop="$3" textAlign="center">
                No events on {FD(selectedDay)}.
              </Text>
            ) : null}
          </YStack>
        ) : (
          /* List view */
          <YStack padding="$3" gap="$2">
            {monthEvents.length === 0 ? (
              <Text color={colors.textMuted} textAlign="center">
                No events this month.
              </Text>
            ) : (
              monthEvents.map((ev) => (
                <Pressable key={ev.instanceKey} onPress={() => setDetailEvent(ev)}>
                  <XStack
                    backgroundColor={colors.surface}
                    borderRadius="$3"
                    padding="$3"
                    borderWidth={1}
                    borderColor={colors.border}
                    gap="$2"
                    alignItems="center"
                  >
                    <YStack
                      width={44}
                      height={44}
                      borderRadius="$2"
                      backgroundColor={colors.primary + '22'}
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text color={colors.primary} fontWeight="700" fontSize={15}>
                        {ev.date.split('-')[2]}
                      </Text>
                    </YStack>
                    <YStack flex={1}>
                      <Text color={colors.text} fontWeight="600">
                        {ev.title}
                      </Text>
                      <Text color={colors.textMuted} fontSize="$2">
                        {FD(ev.date, { weekday: true })}
                        {ev.startTime ? ` · ${ev.startTime}` : ''}
                      </Text>
                      {ev.location ? (
                        <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                          {ev.location}
                        </Text>
                      ) : null}
                    </YStack>
                  </XStack>
                </Pressable>
              ))
            )}
          </YStack>
        )}
      </ScrollView>

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
      {admin ? (
        <EventFormModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
      ) : null}
    </YStack>
  )
}
