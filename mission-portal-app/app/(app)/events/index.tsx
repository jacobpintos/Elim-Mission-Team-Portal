import { useEffect, useState } from 'react'
import { ScrollView, Pressable, Linking } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack, useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useConfigStore } from '@/stores/configStore'
import { sameId } from '@/lib/ids'
import { useThemeColors } from '@/theme/useThemeColors'
import { EventFormModal } from '@/features/events/EventFormModal'
import { AvailQueueBanner } from '@/features/events/AvailQueueBanner'
import { isAdmin, isPublic } from '@/lib/roles'
import { useGroupsStore } from '@/stores/groupsStore'
import { FD } from '@/lib/format'
import type { EventInstance, EventTemplate } from '@/types/events'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

const VIRTUAL_COLOR = '#8e44ad'

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
  const router = useRouter()
  const { profile } = useAuthStore()
  const uid = String(profile?.uid ?? '')
  const admin = isAdmin(profile)
  const publicUser = isPublic(profile)
  const isMember = !publicUser

  const { instances, templates } = useEventsStore()
  const { subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()
  const configStore = useConfigStore()
  const { subscribe: subConfig, unsubscribe: unsubConfig } = useConfigStore()
  const { subscribe: subGroups, unsubscribe: unsubGroups, getMemberUids } = useGroupsStore()

  // Admin uses Firestore-synced cal; non-admin uses local state
  const [localY, setLocalY] = useState(() => new Date().getFullYear())
  const [localM, setLocalM] = useState(() => new Date().getMonth() + 1)

  const calY = admin ? configStore.calY : localY
  const calM = admin ? configStore.calM : localM

  const { setSelectedEvent } = useEventsStore()
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editInstance, setEditInstance] = useState<EventInstance | null>(null)
  const [editDraft, setEditDraft] = useState<EventTemplate | null>(null)
  const [view, setView] = useState<'calendar' | 'list'>('calendar')

  const openDetail = (ev: EventInstance) => {
    setSelectedEvent(ev)
    router.push(`/(app)/events/${ev.instanceKey}` as never)
  }

  useEffect(() => {
    subEvents()
    subConfig()
    subGroups()
    return () => {
      unsubEvents()
      unsubConfig()
      unsubGroups()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { from, to } = monthRange(calY, calM)
  const allMonthInstances = instances(from, to)
  // Unpublished drafts: pulled from all templates (not month-scoped) so dateless drafts appear
  const unpublishedEvents = admin
    ? templates.filter((t) => t.unpublished === true && !t.deleted)
    : []
  const monthEvents = allMonthInstances.filter(
    (ev) =>
      ev.unpublished !== true &&
      (ev.isPublic ||
        admin ||
        ev.users?.some((x) => sameId(x, uid)) ||
        (ev.groups?.length ? getMemberUids(ev.groups).some((gUid) => sameId(gUid, uid)) : false))
  )

  // Group events by date string
  const byDate: Record<string, EventInstance[]> = {}
  monthEvents.forEach((ev) => {
    if (!byDate[ev.date]) byDate[ev.date] = []
    byDate[ev.date].push(ev)
  })

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
      <ScreenTitle options={{ title: 'Events' }} />

      {/* Header */}
      <XStack
        padding="$3"
        justifyContent="space-between"
        alignItems="center"
        borderBottomWidth={1}
        borderBottomColor={colors.border}
      >
        <Pressable onPress={prevMonth} hitSlop={12} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
          <Text color={colors.primary} fontSize={30} lineHeight={32} fontWeight="700">
            ‹
          </Text>
        </Pressable>
        <Text color={colors.text} fontWeight="700" fontSize="$4">
          {MONTH_NAMES[calM - 1]} {calY}
        </Text>
        <Pressable onPress={nextMonth} hitSlop={12} style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
          <Text color={colors.primary} fontSize={30} lineHeight={32} fontWeight="700">
            ›
          </Text>
        </Pressable>
      </XStack>

      {/* View toggle + create button — wraps so nothing is cut off on narrow screens */}
      <XStack
        padding="$2"
        gap="$2"
        rowGap="$2"
        flexWrap="wrap"
        justifyContent="space-between"
        alignItems="center"
      >
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
          <XStack gap="$2" alignItems="center">
            <Pressable onPress={() => router.push('/(app)/events/map' as never)}>
              <XStack
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$1"
                borderWidth={1}
                borderColor={colors.border}
              >
                <Text color={colors.text} fontSize="$2" fontWeight="600">
                  Map
                </Text>
              </XStack>
            </Pressable>
            <Pressable onPress={() => router.push('/(app)/admin/avail' as never)}>
              <XStack
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$1"
                borderWidth={1}
                borderColor={colors.border}
              >
                <Text color={colors.text} fontSize="$2" fontWeight="600">
                  Availability
                </Text>
              </XStack>
            </Pressable>
            <Pressable onPress={() => setShowCreateModal(true)} hitSlop={6}>
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingHorizontal="$4"
                paddingVertical="$2.5"
              >
                <Text color="white" fontSize="$3" fontWeight="700">
                  + Create Event
                </Text>
              </XStack>
            </Pressable>
          </XStack>
        ) : null}
      </XStack>

      {!publicUser ? <AvailQueueBanner uid={uid} /> : null}

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
                              <Pressable
                                key={ev.instanceKey}
                                onPress={() => openDetail(ev)}
                                hitSlop={6}
                              >
                                <YStack
                                  width={6}
                                  height={6}
                                  borderRadius={3}
                                  backgroundColor={ev.isVirtual ? VIRTUAL_COLOR : colors.primary}
                                />
                              </Pressable>
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
                  <Pressable key={ev.instanceKey} onPress={() => openDetail(ev)}>
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
                        backgroundColor={ev.isVirtual ? VIRTUAL_COLOR : colors.primary}
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
                        {ev.isVirtual ? (
                          <Text color={VIRTUAL_COLOR} fontSize="$2">
                            🖥 Virtual
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
              monthEvents.map((ev) => {
                const evColor = ev.isVirtual ? VIRTUAL_COLOR : colors.primary
                return (
                  <Pressable key={ev.instanceKey} onPress={() => openDetail(ev)}>
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
                        backgroundColor={evColor + '22'}
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text color={evColor} fontWeight="700" fontSize={15}>
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
                        {ev.isVirtual && ev.virtualLink ? (
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation()
                              Linking.openURL(ev.virtualLink!)
                            }}
                          >
                            <Text
                              color={VIRTUAL_COLOR}
                              fontSize="$2"
                              textDecorationLine="underline"
                            >
                              Join Here
                            </Text>
                          </Pressable>
                        ) : null}
                      </YStack>
                    </XStack>
                  </Pressable>
                )
              })
            )}
          </YStack>
        )}
        {/* Unpublished queue — admins only */}
        {admin && unpublishedEvents.length > 0 ? (
          <YStack padding="$3" gap="$2">
            <XStack alignItems="center" gap="$2">
              <YStack flex={1} height={1} backgroundColor={colors.border} />
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                UNPUBLISHED DRAFTS
              </Text>
              <YStack flex={1} height={1} backgroundColor={colors.border} />
            </XStack>
            {unpublishedEvents.map((ev) => (
              <Pressable key={String(ev.id)} onPress={() => setEditDraft(ev)}>
                <XStack
                  backgroundColor={colors.surface}
                  borderRadius="$2"
                  padding="$2"
                  borderWidth={1}
                  borderColor="#e67e2244"
                  gap="$2"
                  alignItems="center"
                >
                  <YStack
                    width={4}
                    alignSelf="stretch"
                    backgroundColor="#e67e22"
                    borderRadius={2}
                  />
                  <YStack flex={1}>
                    <Text color={colors.text} fontWeight="600" fontSize="$3">
                      {ev.title}
                    </Text>
                    <Text color={colors.textMuted} fontSize="$2">
                      {ev.date ? FD(ev.date, { weekday: true }) : 'No date set'}
                    </Text>
                  </YStack>
                  <XStack
                    borderWidth={1}
                    borderColor="#e67e22"
                    borderRadius="$2"
                    paddingHorizontal="$2"
                    paddingVertical="$1"
                  >
                    <Text color="#e67e22" fontSize="$2" fontWeight="600">
                      Edit
                    </Text>
                  </XStack>
                </XStack>
              </Pressable>
            ))}
          </YStack>
        ) : null}
      </ScrollView>

      {admin ? (
        <EventFormModal
          key={editInstance?.instanceKey ?? String(editDraft?.id ?? 'create')}
          event={editInstance ?? editDraft}
          instanceKey={editInstance?.isRec ? editInstance.instanceKey : undefined}
          open={showCreateModal || !!editInstance || !!editDraft}
          onClose={() => {
            setShowCreateModal(false)
            setEditInstance(null)
            setEditDraft(null)
          }}
          selectedDate={!editInstance && !editDraft && selectedDay ? selectedDay : undefined}
        />
      ) : null}
    </YStack>
  )
}
