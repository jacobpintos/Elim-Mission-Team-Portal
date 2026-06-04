import { useState, useMemo } from 'react'
import { Pressable, TextInput, ScrollView, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useEventsStore } from '@/stores/eventsStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { AVAIL_LABELS, AVAIL_COLORS, availKey } from '@/lib/availability'
import { allInstances, todayStr, dateStr } from '@/lib/events'
import { sameId } from '@/lib/ids'
import { FD } from '@/lib/format'
import type { AvailResponse, EventInstance } from '@/types/events'

const STATUSES: AvailResponse['status'][] = ['yes', 'no', 'partial', 'tbd']

interface AvailQueueBannerProps {
  uid: string
}

// Inline RSVP form shared by both queue mode and pick mode
function RsvpForm({
  event,
  uid,
  queueCount,
  onSaved,
}: {
  event: EventInstance
  uid: string
  queueCount: number
  onSaved: () => void
}) {
  const colors = useThemeColors()
  const { avail, setAvail } = useEventsStore()
  const toast = useUIStore((s) => s.toast)

  const existing = avail[availKey(event)]?.[uid] ?? null
  const [status, setStatus] = useState<AvailResponse['status'] | null>(existing?.status ?? null)
  const [note, setNote] = useState(existing?.note ?? '')
  const [saving, setSaving] = useState(false)

  const needsNote = status === 'partial' || status === 'tbd'

  const handleSave = async (saveStatus: AvailResponse['status'] = status ?? 'tbd') => {
    setSaving(true)
    try {
      await setAvail(event, uid, saveStatus, note)
      onSaved()
    } catch {
      toast('Failed to save RSVP', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusSelect = (s: AvailResponse['status']) => {
    setStatus(s)
    if (s !== 'partial' && s !== 'tbd') {
      // advance card immediately; save runs in background
      onSaved()
      setAvail(event, uid, s, note).catch(() => toast('Failed to save RSVP', 'error'))
    }
  }

  return (
    <YStack padding="$3" gap="$3" borderTopWidth={1} borderTopColor={colors.border}>
      <XStack justifyContent="space-between" alignItems="flex-start">
        <YStack flex={1} gap="$0.5">
          <Text color={colors.text} fontWeight="700" fontSize="$4">
            {event.title}
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            {FD(event.date, { weekday: true })}
            {event.startTime ? ` · ${event.startTime}` : ''}
            {event.location ? ` · ${event.location}` : ''}
          </Text>
        </YStack>
        {queueCount > 1 ? (
          <XStack
            backgroundColor={colors.primary + '18'}
            borderRadius="$4"
            paddingHorizontal="$2"
            paddingVertical={2}
          >
            <Text color={colors.primary} fontSize={11} fontWeight="600">
              1 of {queueCount}
            </Text>
          </XStack>
        ) : null}
      </XStack>

      <XStack gap="$2" flexWrap="wrap">
        {STATUSES.map((s) => (
          <Pressable key={s} onPress={() => handleStatusSelect(s)} disabled={saving}>
            <XStack
              backgroundColor={status === s ? AVAIL_COLORS[s] : 'transparent'}
              borderWidth={2}
              borderColor={AVAIL_COLORS[s]}
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$1"
              opacity={saving ? 0.5 : 1}
            >
              <Text color={status === s ? 'white' : AVAIL_COLORS[s]} fontWeight="600" fontSize="$2">
                {AVAIL_LABELS[s]}
              </Text>
            </XStack>
          </Pressable>
        ))}
      </XStack>

      {needsNote ? (
        <>
          <TextInput
            style={[
              styles.noteInput,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor={colors.textMuted}
          />
          <XStack justifyContent="flex-end">
            <Pressable onPress={() => handleSave()} disabled={saving}>
              <XStack
                backgroundColor={AVAIL_COLORS[status!]}
                borderRadius="$2"
                paddingHorizontal="$4"
                paddingVertical="$2"
                opacity={saving ? 0.6 : 1}
              >
                <Text color="white" fontWeight="700" fontSize="$3">
                  {saving ? 'Saving…' : queueCount > 1 ? 'Save & Next' : 'Save'}
                </Text>
              </XStack>
            </Pressable>
          </XStack>
        </>
      ) : null}
    </YStack>
  )
}

export function AvailQueueBanner({ uid }: AvailQueueBannerProps) {
  const colors = useThemeColors()
  const { templates, overrides, avail } = useEventsStore()
  const { groups } = useGroupsStore()

  const [collapsed, setCollapsed] = useState(false)
  // pick mode: shown when queue is empty and user wants to edit an existing response
  const [pickMode, setPickMode] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<EventInstance | null>(null)
  // keys responded to locally — prevents re-appearing if snapshot fires before write is confirmed
  const [skipKeys, setSkipKeys] = useState<Set<string>>(new Set())

  const isAssignedToEvent = (ev: EventInstance) => {
    if (ev.users?.some((x) => sameId(x, uid))) return true
    if (ev.groups?.some((gid) => {
      const group = groups.find((g) => g.id === gid)
      return group?.members.some((m) => sameId(m, uid))
    })) return true
    if (ev.teams?.some((team) =>
      team.leaders.some((m) => sameId(m, uid)) ||
      team.members.some((m) => sameId(m, uid))
    )) return true
    return false
  }

  // Events with missing/TBD responses (the queue)
  const queue: EventInstance[] = useMemo(() => {
    const today = todayStr()
    const to = dateStr(60)
    return allInstances(templates, overrides, today, to).filter((ev) => {
      if (!isAssignedToEvent(ev)) return false
      if (skipKeys.has(ev.instanceKey)) return false
      const r = avail[availKey(ev)]?.[uid]
      return !r || r.status === 'tbd'
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, overrides, avail, uid, groups, skipKeys])

  // All upcoming assigned events (for the picker)
  const allAssigned: EventInstance[] = useMemo(() => {
    const today = todayStr()
    const to = dateStr(60)
    return allInstances(templates, overrides, today, to).filter((ev) => isAssignedToEvent(ev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, overrides, uid, groups])

  const hasQueue = queue.length > 0
  const accentColor = hasQueue ? '#f39c12' : '#27ae60'

  // When queue drains to zero while in collapsed state, reset collapsed
  const [lastHadQueue, setLastHadQueue] = useState(hasQueue)
  if (hasQueue !== lastHadQueue) {
    setLastHadQueue(hasQueue)
    if (!hasQueue) {
      setCollapsed(false)
      setPickMode(false)
      setSelectedEvent(null)
    }
  }

  return (
    <YStack
      borderBottomWidth={1}
      borderBottomColor={colors.border}
      backgroundColor={colors.surface}
    >
      {/* Header row — always visible */}
      <Pressable
        onPress={() => {
          if (hasQueue) {
            setCollapsed((v) => !v)
          } else {
            setPickMode((v) => !v)
            setSelectedEvent(null)
          }
        }}
      >
        <XStack
          paddingHorizontal="$3"
          paddingVertical="$2"
          alignItems="center"
          justifyContent="space-between"
          borderLeftWidth={3}
          borderLeftColor={accentColor}
        >
          <XStack gap="$2" alignItems="center">
            <Text fontSize={14}>{hasQueue ? '📋' : '✓'}</Text>
            <Text color={colors.text} fontWeight="700" fontSize="$3">
              {hasQueue
                ? `${queue.length} event${queue.length !== 1 ? 's' : ''} need your RSVP`
                : 'All RSVPs up to date'}
            </Text>
          </XStack>
          <Text color={colors.textMuted} fontSize="$3">
            {hasQueue ? (collapsed ? '▼' : '▲') : pickMode ? '▲' : 'Update availability ›'}
          </Text>
        </XStack>
      </Pressable>

      {/* Queue mode: show first pending event */}
      {hasQueue && !collapsed && queue[0] ? (
        <RsvpForm
          key={queue[0].instanceKey}
          event={queue[0]}
          uid={uid}
          queueCount={queue.length}
          onSaved={() => setSkipKeys((p) => new Set([...p, queue[0].instanceKey]))}
        />
      ) : null}

      {/* All-clear mode: event picker */}
      {!hasQueue && pickMode ? (
        <YStack borderTopWidth={1} borderTopColor={colors.border}>
          {selectedEvent ? (
            <>
              <Pressable onPress={() => setSelectedEvent(null)}>
                <XStack
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  gap="$2"
                  alignItems="center"
                  borderBottomWidth={1}
                  borderBottomColor={colors.border}
                >
                  <Text color={colors.primary} fontSize="$3">
                    ‹ Back
                  </Text>
                </XStack>
              </Pressable>
              <RsvpForm
                key={selectedEvent.instanceKey}
                event={selectedEvent}
                uid={uid}
                queueCount={0}
                onSaved={() => setSelectedEvent(null)}
              />
            </>
          ) : (
            <ScrollView style={{ maxHeight: 260 }}>
              <YStack>
                {allAssigned.length === 0 ? (
                  <YStack alignItems="center" padding="$4">
                    <Text color={colors.textMuted} fontSize="$3">
                      No upcoming assigned events.
                    </Text>
                  </YStack>
                ) : (
                  allAssigned.map((ev) => {
                    const r = avail[availKey(ev)]?.[uid] ?? null
                    return (
                      <Pressable key={ev.instanceKey} onPress={() => setSelectedEvent(ev)}>
                        <XStack
                          paddingHorizontal="$3"
                          paddingVertical="$3"
                          gap="$3"
                          alignItems="center"
                          borderBottomWidth={1}
                          borderBottomColor={colors.border}
                        >
                          <YStack flex={1} gap="$0.5">
                            <Text color={colors.text} fontWeight="600" fontSize="$3">
                              {ev.title}
                            </Text>
                            <Text color={colors.textMuted} fontSize="$2">
                              {FD(ev.date, { weekday: true })}
                              {ev.startTime ? ` · ${ev.startTime}` : ''}
                            </Text>
                          </YStack>
                          {r ? (
                            <XStack
                              backgroundColor={AVAIL_COLORS[r.status] + '22'}
                              borderRadius="$4"
                              paddingHorizontal="$2"
                              paddingVertical={2}
                            >
                              <Text color={AVAIL_COLORS[r.status]} fontSize={11} fontWeight="600">
                                {AVAIL_LABELS[r.status]}
                              </Text>
                            </XStack>
                          ) : (
                            <XStack
                              backgroundColor="#aaa2"
                              borderRadius="$4"
                              paddingHorizontal="$2"
                              paddingVertical={2}
                            >
                              <Text color="#aaa" fontSize={11} fontWeight="600">
                                No response
                              </Text>
                            </XStack>
                          )}
                          <Text color={colors.textMuted} fontSize="$3">
                            ›
                          </Text>
                        </XStack>
                      </Pressable>
                    )
                  })
                )}
              </YStack>
            </ScrollView>
          )}
        </YStack>
      ) : null}
    </YStack>
  )
}

const styles = StyleSheet.create({
  noteInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
  },
})
