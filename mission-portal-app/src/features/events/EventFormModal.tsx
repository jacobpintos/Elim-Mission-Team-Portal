import { useState } from 'react'
import { ScrollView, Pressable } from 'react-native'
import { YStack, XStack, Text, Input, Switch, Label } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { useThemeColors } from '@/theme/useThemeColors'
import { useEventsStore } from '@/stores/eventsStore'
import { useUIStore } from '@/stores/uiStore'
import type { EventTemplate } from '@/types/events'

interface EventFormModalProps {
  event?: EventTemplate | null
  open: boolean
  onClose: () => void
}

type FormData = {
  title: string
  date: string
  location: string
  startTime: string
  isRec: boolean
  recur: EventTemplate['recur']
  recDay: number
  isPublic: boolean
  food: boolean
  carpool: boolean
}

export function EventFormModal({ event, open, onClose }: EventFormModalProps) {
  const colors = useThemeColors()
  const { createEvent, updateEvent } = useEventsStore()
  const toast = useUIStore((s) => s.toast)

  const [form, setForm] = useState<FormData>({
    title: event?.title ?? '',
    date: event?.date ?? '',
    location: event?.location ?? '',
    startTime: event?.startTime ?? '',
    isRec: event?.isRec ?? false,
    recur: event?.recur ?? 'weekly',
    recDay: event?.recDay ?? 0,
    isPublic: event?.isPublic ?? false,
    food: event?.food ?? false,
    carpool: event?.carpool ?? false,
  })
  const [saving, setSaving] = useState(false)

  const field = (key: keyof FormData) => (val: string | boolean | number) =>
    setForm((f) => ({ ...f, [key]: val }))

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast('Title is required', 'error')
      return
    }
    setSaving(true)
    try {
      if (event) {
        await updateEvent(event.id, form)
        toast('Event updated', 'success')
      } else {
        await createEvent({ ...form, users: [], teams: [] })
        toast('Event created', 'success')
      }
      onClose()
    } catch {
      toast('Failed to save event', 'error')
    } finally {
      setSaving(false)
    }
  }

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title={event ? 'Edit Event' : 'Create Event'}
    >
      <ScrollView style={{ maxHeight: 500 }}>
        <YStack gap="$3" paddingBottom="$4">
          <YStack gap="$1">
            <Text color={colors.text} fontSize="$3">
              Title *
            </Text>
            <Input
              value={form.title}
              onChangeText={field('title')}
              placeholder="Event title"
              backgroundColor={colors.surface}
              color={colors.text}
              borderColor={colors.border}
            />
          </YStack>

          <YStack gap="$1">
            <Text color={colors.text} fontSize="$3">
              Date (YYYY-MM-DD)
            </Text>
            <Input
              value={form.date}
              onChangeText={field('date')}
              placeholder="2026-04-06"
              backgroundColor={colors.surface}
              color={colors.text}
              borderColor={colors.border}
            />
          </YStack>

          <YStack gap="$1">
            <Text color={colors.text} fontSize="$3">
              Location
            </Text>
            <Input
              value={form.location}
              onChangeText={field('location')}
              placeholder="Venue name or address"
              backgroundColor={colors.surface}
              color={colors.text}
              borderColor={colors.border}
            />
          </YStack>

          <YStack gap="$1">
            <Text color={colors.text} fontSize="$3">
              Start Time
            </Text>
            <Input
              value={form.startTime}
              onChangeText={field('startTime')}
              placeholder="10:00 AM"
              backgroundColor={colors.surface}
              color={colors.text}
              borderColor={colors.border}
            />
          </YStack>

          <XStack gap="$3" alignItems="center">
            <Label color={colors.text} fontSize="$3" flex={1}>
              Recurring
            </Label>
            <Switch checked={form.isRec} onCheckedChange={(v) => field('isRec')(v)} />
          </XStack>

          {form.isRec ? (
            <>
              <YStack gap="$1">
                <Text color={colors.text} fontSize="$3">
                  Frequency
                </Text>
                <XStack gap="$2">
                  {(['weekly', 'biweekly', 'monthly'] as const).map((r) => (
                    <Pressable key={r} onPress={() => field('recur')(r)}>
                      <XStack
                        borderWidth={1}
                        borderColor={form.recur === r ? colors.primary : colors.border}
                        backgroundColor={form.recur === r ? colors.primary : 'transparent'}
                        borderRadius="$2"
                        paddingHorizontal="$2"
                        paddingVertical="$1"
                      >
                        <Text color={form.recur === r ? 'white' : colors.text} fontSize="$2">
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </Text>
                      </XStack>
                    </Pressable>
                  ))}
                </XStack>
              </YStack>
              <YStack gap="$1">
                <Text color={colors.text} fontSize="$3">
                  Day of Week
                </Text>
                <XStack gap="$1" flexWrap="wrap">
                  {DAY_LABELS.map((d, i) => (
                    <Pressable key={d} onPress={() => field('recDay')(i)}>
                      <XStack
                        width={36}
                        height={36}
                        borderRadius={18}
                        borderWidth={1}
                        borderColor={form.recDay === i ? colors.primary : colors.border}
                        backgroundColor={form.recDay === i ? colors.primary : 'transparent'}
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text color={form.recDay === i ? 'white' : colors.text} fontSize={11}>
                          {d}
                        </Text>
                      </XStack>
                    </Pressable>
                  ))}
                </XStack>
              </YStack>
            </>
          ) : null}

          <XStack gap="$3" alignItems="center">
            <Label color={colors.text} fontSize="$3" flex={1}>
              Public event
            </Label>
            <Switch checked={form.isPublic} onCheckedChange={(v) => field('isPublic')(v)} />
          </XStack>

          <XStack gap="$3" alignItems="center">
            <Label color={colors.text} fontSize="$3" flex={1}>
              Food provided
            </Label>
            <Switch checked={form.food} onCheckedChange={(v) => field('food')(v)} />
          </XStack>

          <XStack gap="$3" alignItems="center">
            <Label color={colors.text} fontSize="$3" flex={1}>
              Carpool available
            </Label>
            <Switch checked={form.carpool} onCheckedChange={(v) => field('carpool')(v)} />
          </XStack>

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
                  {saving ? 'Saving…' : event ? 'Update' : 'Create'}
                </Text>
              </XStack>
            </Pressable>
          </XStack>
        </YStack>
      </ScrollView>
    </Modal>
  )
}
