import { useState, useMemo } from 'react'
import { Pressable, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useEventsStore } from '@/stores/eventsStore'
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

export function AvailQueueBanner({ uid }: AvailQueueBannerProps) {
  const colors = useThemeColors()
  const { templates, overrides, avail, setAvail } = useEventsStore()
  const toast = useUIStore((s) => s.toast)

  const [collapsed, setCollapsed] = useState(false)
  const [saving, setSaving] = useState(false)

  const queue: EventInstance[] = useMemo(() => {
    const today = todayStr()
    const to = dateStr(60)
    return allInstances(templates, overrides, today, to).filter((ev) => {
      if (!ev.users?.some((x) => sameId(x, uid))) return false
      const r = avail[availKey(ev)]?.[uid]
      return !r || r.status === 'tbd'
    })
  }, [templates, overrides, avail, uid])

  const current = queue[0] ?? null

  // Derive initial values from existing response; reset when current event changes
  const existingResponse = current ? (avail[availKey(current)]?.[uid] ?? null) : null
  const [lastKey, setLastKey] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState<AvailResponse['status']>(existingResponse?.status ?? 'yes')
  const [note, setNote] = useState(existingResponse?.note ?? '')

  if (current?.instanceKey !== lastKey) {
    setLastKey(current?.instanceKey)
    setStatus(existingResponse?.status ?? 'yes')
    setNote(existingResponse?.note ?? '')
  }

  if (queue.length === 0) return null

  const handleSave = async () => {
    if (!current) return
    setSaving(true)
    try {
      await setAvail(current, uid, status, note)
      // queue auto-updates via store; no manual advance needed
    } catch {
      toast('Failed to save RSVP', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <YStack
      borderBottomWidth={1}
      borderBottomColor={colors.border}
      backgroundColor={colors.surface}
    >
      {/* Header row */}
      <Pressable onPress={() => setCollapsed((v) => !v)}>
        <XStack
          paddingHorizontal="$3"
          paddingVertical="$2"
          alignItems="center"
          justifyContent="space-between"
          borderLeftWidth={3}
          borderLeftColor="#f39c12"
        >
          <XStack gap="$2" alignItems="center">
            <Text fontSize={14}>📋</Text>
            <Text color={colors.text} fontWeight="700" fontSize="$3">
              {queue.length} event{queue.length !== 1 ? 's' : ''} need your RSVP
            </Text>
          </XStack>
          <Text color={colors.textMuted} fontSize="$3">
            {collapsed ? '▼' : '▲'}
          </Text>
        </XStack>
      </Pressable>

      {!collapsed && current ? (
        <YStack padding="$3" gap="$3" borderTopWidth={1} borderTopColor={colors.border}>
          {/* Event info */}
          <XStack justifyContent="space-between" alignItems="flex-start">
            <YStack flex={1} gap="$0.5">
              <Text color={colors.text} fontWeight="700" fontSize="$4">
                {current.title}
              </Text>
              <Text color={colors.textMuted} fontSize="$2">
                {FD(current.date, { weekday: true })}
                {current.startTime ? ` · ${current.startTime}` : ''}
                {current.location ? ` · ${current.location}` : ''}
              </Text>
            </YStack>
            {queue.length > 1 ? (
              <XStack
                backgroundColor={colors.primary + '18'}
                borderRadius="$4"
                paddingHorizontal="$2"
                paddingVertical={2}
              >
                <Text color={colors.primary} fontSize={11} fontWeight="600">
                  1 of {queue.length}
                </Text>
              </XStack>
            ) : null}
          </XStack>

          {/* Response buttons */}
          <XStack gap="$2" flexWrap="wrap">
            {STATUSES.map((s) => (
              <Pressable key={s} onPress={() => setStatus(s)}>
                <XStack
                  backgroundColor={status === s ? AVAIL_COLORS[s] : 'transparent'}
                  borderWidth={2}
                  borderColor={AVAIL_COLORS[s]}
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                >
                  <Text
                    color={status === s ? 'white' : AVAIL_COLORS[s]}
                    fontWeight="600"
                    fontSize="$2"
                  >
                    {AVAIL_LABELS[s]}
                  </Text>
                </XStack>
              </Pressable>
            ))}
          </XStack>

          {/* Note input */}
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

          {/* Save button */}
          <XStack justifyContent="flex-end">
            <Pressable onPress={handleSave} disabled={saving}>
              <XStack
                backgroundColor={AVAIL_COLORS[status]}
                borderRadius="$2"
                paddingHorizontal="$4"
                paddingVertical="$2"
                opacity={saving ? 0.6 : 1}
              >
                <Text color="white" fontWeight="700" fontSize="$3">
                  {saving ? 'Saving…' : queue.length > 1 ? 'Save & Next' : 'Save'}
                </Text>
              </XStack>
            </Pressable>
          </XStack>
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
