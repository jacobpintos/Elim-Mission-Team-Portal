import { useState, useMemo, useEffect } from 'react'
import { ScrollView, Pressable, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { useEventsStore } from '@/stores/eventsStore'
import { useUsersStore } from '@/stores/usersStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { AVAIL_COLORS, AVAIL_LABELS } from '@/lib/availability'
import { allInstances, todayStr, dateStr } from '@/lib/events'
import { sameId } from '@/lib/ids'
import { FD } from '@/lib/format'
import type { AvailResponse } from '@/types/events'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

type ResponseFilter = 'all' | AvailResponse['status'] | 'none'

const FILTER_OPTIONS: { key: ResponseFilter; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: '#888' },
  { key: 'yes', label: 'Yes', color: AVAIL_COLORS.yes },
  { key: 'no', label: 'No', color: AVAIL_COLORS.no },
  { key: 'partial', label: 'Partial', color: AVAIL_COLORS.partial },
  { key: 'tbd', label: 'TBD', color: AVAIL_COLORS.tbd },
  { key: 'none', label: 'No Response', color: '#aaa' },
]

export default function AdminAvailScreen() {
  const colors = useThemeColors()
  const {
    templates,
    overrides,
    avail,
    subscribe: subEvents,
    unsubscribe: unsubEvents,
  } = useEventsStore()
  const { users, subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ResponseFilter>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    subEvents()
    subUsers()
    return () => {
      unsubEvents()
      unsubUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = search.trim().toLowerCase()

  // Events in the next 60 days that have at least one assigned user
  const eventInstances = useMemo(() => {
    const today = todayStr()
    const to = dateStr(60)
    return allInstances(templates, overrides, today, to).filter((ev) => (ev.users?.length ?? 0) > 0)
  }, [templates, overrides])

  const displayName = (uid: string | number) =>
    users.find((u) => sameId(u.uid, uid))?.displayName ?? String(uid)

  // Filter events by search and response filter
  const filteredEvents = useMemo(() => {
    return eventInstances.filter((ev) => {
      if (!q) return true
      if (ev.title.toLowerCase().includes(q)) return true
      if (ev.location?.toLowerCase().includes(q)) return true
      if (ev.users?.some((uid) => displayName(uid).toLowerCase().includes(q))) return true
      return false
    })
    // displayName is derived entirely from users which is already in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventInstances, q, users])

  const getResponseForUser = (instanceKey: string, uid: string | number): AvailResponse | null => {
    return avail[instanceKey]?.[String(uid)] ?? null
  }

  const getUsersForEvent = (ev: (typeof eventInstances)[0]) => {
    if (!ev.users || ev.users.length === 0) return []
    return ev.users
      .map((uid) => {
        const r = getResponseForUser(ev.instanceKey, uid)
        return { uid: String(uid), name: displayName(uid), response: r }
      })
      .filter(({ response }) => {
        if (filter === 'all') return true
        if (filter === 'none') return !response
        return response?.status === filter
      })
  }

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Summary counts for an event
  const summarize = (ev: (typeof eventInstances)[0]) => {
    const counts: Record<string, number> = { yes: 0, no: 0, partial: 0, tbd: 0, none: 0 }
    ev.users?.forEach((uid) => {
      const r = getResponseForUser(ev.instanceKey, uid)
      if (!r) counts.none++
      else counts[r.status] = (counts[r.status] ?? 0) + 1
    })
    return counts
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Availability Tracker' }} />

      {/* Search */}
      <YStack padding="$3" gap="$2" borderBottomWidth={1} borderBottomColor={colors.border}>
        <TextInput
          style={[
            styles.search,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by event, location, or person…"
          placeholderTextColor={colors.textMuted}
          clearButtonMode="while-editing"
        />

        {/* Response filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap="$2">
            {FILTER_OPTIONS.map((opt) => (
              <Pressable key={opt.key} onPress={() => setFilter(opt.key)}>
                <XStack
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                  borderRadius="$4"
                  backgroundColor={filter === opt.key ? opt.color : 'transparent'}
                  borderWidth={1}
                  borderColor={opt.color}
                >
                  <Text
                    color={filter === opt.key ? 'white' : opt.color}
                    fontSize="$2"
                    fontWeight="600"
                  >
                    {opt.label}
                  </Text>
                </XStack>
              </Pressable>
            ))}
          </XStack>
        </ScrollView>
      </YStack>

      <ScrollView style={{ flex: 1 }}>
        <YStack padding="$3" gap="$2">
          {filteredEvents.length === 0 ? (
            <YStack alignItems="center" padding="$6">
              <Text color={colors.textMuted} textAlign="center">
                {q ? 'No events match your search.' : 'No upcoming events with assigned users.'}
              </Text>
            </YStack>
          ) : (
            filteredEvents.map((ev) => {
              const usersToShow = getUsersForEvent(ev)
              const counts = summarize(ev)
              const isOpen = expanded.has(ev.instanceKey)

              return (
                <YStack
                  key={ev.instanceKey}
                  backgroundColor={colors.surface}
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor={colors.border}
                  overflow="hidden"
                >
                  <Pressable onPress={() => toggleExpand(ev.instanceKey)}>
                    <YStack padding="$3" gap="$2">
                      <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                        <YStack flex={1} gap="$0.5">
                          <Text color={colors.text} fontWeight="700" fontSize="$3">
                            {ev.title}
                          </Text>
                          <Text color={colors.textMuted} fontSize="$2">
                            {FD(ev.date, { weekday: true })}
                            {ev.startTime ? ` · ${ev.startTime}` : ''}
                            {ev.location ? ` · ${ev.location}` : ''}
                          </Text>
                        </YStack>
                        <Text color={colors.textMuted} fontSize="$3">
                          {isOpen ? '▲' : '▼'}
                        </Text>
                      </XStack>

                      {/* Response summary dots */}
                      <XStack gap="$2" flexWrap="wrap">
                        {(
                          [
                            ['yes', AVAIL_COLORS.yes],
                            ['no', AVAIL_COLORS.no],
                            ['partial', AVAIL_COLORS.partial],
                            ['tbd', AVAIL_COLORS.tbd],
                            ['none', '#aaa'],
                          ] as [string, string][]
                        ).map(([key, color]) =>
                          counts[key] > 0 ? (
                            <XStack
                              key={key}
                              backgroundColor={color + '22'}
                              borderRadius="$4"
                              paddingHorizontal="$2"
                              paddingVertical={2}
                              gap="$1"
                              alignItems="center"
                            >
                              <YStack
                                width={6}
                                height={6}
                                borderRadius={3}
                                backgroundColor={color}
                              />
                              <Text color={color} fontSize={11} fontWeight="600">
                                {counts[key]}{' '}
                                {key === 'none'
                                  ? 'N/A'
                                  : AVAIL_LABELS[key as AvailResponse['status']]}
                              </Text>
                            </XStack>
                          ) : null
                        )}
                      </XStack>
                    </YStack>
                  </Pressable>

                  {isOpen ? (
                    <YStack
                      borderTopWidth={1}
                      borderTopColor={colors.border}
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      gap="$0"
                    >
                      {usersToShow.length === 0 ? (
                        <Text color={colors.textMuted} fontSize="$2" padding="$2">
                          No users match this filter for this event.
                        </Text>
                      ) : (
                        usersToShow.map(({ uid, name, response }) => (
                          <XStack
                            key={uid}
                            paddingVertical="$2"
                            paddingHorizontal="$1"
                            gap="$3"
                            alignItems="center"
                            borderBottomWidth={1}
                            borderBottomColor={colors.border}
                          >
                            <Text color={colors.text} fontSize="$3" flex={1}>
                              {name}
                            </Text>
                            {response ? (
                              <YStack gap="$0.5" alignItems="flex-end">
                                <XStack
                                  backgroundColor={AVAIL_COLORS[response.status] + '22'}
                                  borderRadius="$4"
                                  paddingHorizontal="$2"
                                  paddingVertical={2}
                                >
                                  <Text
                                    color={AVAIL_COLORS[response.status]}
                                    fontSize={11}
                                    fontWeight="700"
                                  >
                                    {AVAIL_LABELS[response.status]}
                                  </Text>
                                </XStack>
                                {response.note ? (
                                  <Text color={colors.textMuted} fontSize={11}>
                                    {response.note}
                                  </Text>
                                ) : null}
                              </YStack>
                            ) : (
                              <XStack
                                backgroundColor="#aaa2"
                                borderRadius="$4"
                                paddingHorizontal="$2"
                                paddingVertical={2}
                              >
                                <Text color="#aaa" fontSize={11} fontWeight="600">
                                  No Response
                                </Text>
                              </XStack>
                            )}
                          </XStack>
                        ))
                      )}
                    </YStack>
                  ) : null}
                </YStack>
              )
            })
          )}
        </YStack>
      </ScrollView>
    </YStack>
  )
}

const styles = StyleSheet.create({
  search: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
})
