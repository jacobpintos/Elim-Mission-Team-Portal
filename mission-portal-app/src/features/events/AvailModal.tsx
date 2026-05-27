import { Pressable } from 'react-native'
import { useState } from 'react'
import { YStack, XStack, Text, TextArea } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { useThemeColors } from '@/theme/useThemeColors'
import { AVAIL_LABELS, AVAIL_COLORS, availKey } from '@/lib/availability'
import { FD } from '@/lib/format'
import { useEventsStore } from '@/stores/eventsStore'
import { useUIStore } from '@/stores/uiStore'
import type { EventInstance, AvailResponse } from '@/types/events'

interface AvailModalProps {
  event: EventInstance | null
  uid: string
  open: boolean
  onClose: () => void
}

const STATUSES: AvailResponse['status'][] = ['yes', 'no', 'partial', 'tbd']

export function AvailModal({ event, uid, open, onClose }: AvailModalProps) {
  const colors = useThemeColors()
  const { avail, setAvail } = useEventsStore()
  const toast = useUIStore((s) => s.toast)

  const current = event ? (avail[availKey(event)]?.[uid] ?? null) : null
  const [status, setStatus] = useState<AvailResponse['status']>(current?.status ?? 'tbd')
  const [note, setNote] = useState(current?.note ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!event) return
    setSaving(true)
    try {
      await setAvail(event, uid, status, note)
      toast('Availability saved', 'success')
      onClose()
    } catch {
      toast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title={event ? `RSVP: ${event.title}` : 'RSVP'}
    >
      <YStack gap="$3">
        {event ? (
          <Text color={colors.textMuted} fontSize="$3">
            {FD(event.date, { weekday: true })}
            {event.startTime ? ` · ${event.startTime}` : ''}
          </Text>
        ) : null}

        <Text color={colors.text} fontWeight="600">
          Your availability
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          {STATUSES.map((s) => (
            <Pressable key={s} onPress={() => setStatus(s)}>
              <XStack
                backgroundColor={status === s ? AVAIL_COLORS[s] : 'transparent'}
                borderWidth={2}
                borderColor={AVAIL_COLORS[s]}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$2"
              >
                <Text
                  color={status === s ? 'white' : AVAIL_COLORS[s]}
                  fontWeight="600"
                  fontSize="$3"
                >
                  {AVAIL_LABELS[s]}
                </Text>
              </XStack>
            </Pressable>
          ))}
        </XStack>

        <YStack gap="$1">
          <Text color={colors.text} fontSize="$3">
            Note (optional)
          </Text>
          <TextArea
            value={note}
            onChangeText={setNote}
            placeholder="Any details…"
            backgroundColor={colors.surface}
            color={colors.text}
            borderColor={colors.border}
            minHeight={80}
          />
        </YStack>

        <XStack gap="$2" justifyContent="flex-end">
          <Pressable onPress={onClose}>
            <XStack
              borderWidth={1}
              borderColor={colors.border}
              borderRadius="$2"
              paddingHorizontal="$4"
              paddingVertical="$2"
            >
              <Text color={colors.textMuted}>Cancel</Text>
            </XStack>
          </Pressable>
          <Pressable onPress={handleSave} disabled={saving}>
            <XStack
              backgroundColor={colors.primary}
              borderRadius="$2"
              paddingHorizontal="$4"
              paddingVertical="$2"
              opacity={saving ? 0.6 : 1}
            >
              <Text color="white" fontWeight="600">
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
      </YStack>
    </Modal>
  )
}
