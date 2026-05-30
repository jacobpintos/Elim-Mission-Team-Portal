import { useState } from 'react'
import { ScrollView, Pressable } from 'react-native'
import { YStack, XStack, Text, Input } from 'tamagui'
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
  address: string
  city: string
  state: string
  startTime: string
  isRec: boolean
  recur: EventTemplate['recur']
  recDay: number
  isPublic: boolean
  food: boolean
  carpool: boolean
  isVirtual: boolean
  virtualLink: string
}

export function EventFormModal({ event, open, onClose }: EventFormModalProps) {
  const colors = useThemeColors()
  const { createEvent, updateEvent } = useEventsStore()
  const toast = useUIStore((s) => s.toast)

  const [form, setForm] = useState<FormData>({
    title: event?.title ?? '',
    date: event?.date ?? '',
    location: event?.location ?? '',
    address: event?.address ?? '',
    city: event?.city ?? '',
    state: event?.state ?? '',
    startTime: event?.startTime ?? '',
    isRec: event?.isRec ?? false,
    recur: event?.recur ?? 'weekly',
    recDay: event?.recDay ?? 0,
    isPublic: event?.isPublic ?? false,
    food: event?.food ?? false,
    carpool: event?.carpool ?? false,
    isVirtual: event?.isVirtual ?? false,
    virtualLink: event?.virtualLink ?? '',
  })
  const [saving, setSaving] = useState(false)

  const field = (key: keyof FormData) => (val: string | boolean | number) =>
    setForm((f) => ({ ...f, [key]: val }))

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast('Title is required', 'error')
      return
    }
    if (!form.isVirtual && (!form.city.trim() || !form.state.trim())) {
      toast('City and state are required for in-person events', 'error')
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
              Venue Name
            </Text>
            <Input
              value={form.location}
              onChangeText={field('location')}
              placeholder="First Baptist Church"
              backgroundColor={colors.surface}
              color={colors.text}
              borderColor={colors.border}
            />
          </YStack>

          <YStack gap="$1">
            <Text color={colors.text} fontSize="$3">
              Street Address
            </Text>
            <Input
              value={form.address}
              onChangeText={field('address')}
              placeholder="123 Main St"
              backgroundColor={colors.surface}
              color={colors.text}
              borderColor={colors.border}
            />
          </YStack>

          <XStack gap="$2">
            <YStack flex={1} gap="$1">
              <Text color={colors.text} fontSize="$3">
                City {!form.isVirtual ? '*' : ''}
              </Text>
              <Input
                value={form.city}
                onChangeText={field('city')}
                placeholder="Dallas"
                backgroundColor={colors.surface}
                color={colors.text}
                borderColor={colors.border}
              />
            </YStack>
            <YStack width={80} gap="$1">
              <Text color={colors.text} fontSize="$3">
                State {!form.isVirtual ? '*' : ''}
              </Text>
              <Input
                value={form.state}
                onChangeText={field('state')}
                placeholder="TX"
                backgroundColor={colors.surface}
                color={colors.text}
                borderColor={colors.border}
              />
            </YStack>
          </XStack>

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

          <XStack gap="$3" alignItems="center" justifyContent="space-between">
            <Text color={colors.text} fontSize="$3" flex={1}>
              Recurring
            </Text>
            <Pressable onPress={() => field('isRec')(!form.isRec)}>
              <XStack
                paddingHorizontal="$3"
                paddingVertical="$1"
                borderRadius={99}
                backgroundColor={form.isRec ? colors.primary : colors.surface}
                borderWidth={1}
                borderColor={form.isRec ? colors.primary : colors.border}
              >
                <Text
                  color={form.isRec ? 'white' : colors.textMuted}
                  fontSize="$2"
                  fontWeight="600"
                >
                  {form.isRec ? 'ON' : 'OFF'}
                </Text>
              </XStack>
            </Pressable>
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

          {(['isPublic', 'isVirtual', 'food', 'carpool'] as const).map((key) => {
            const labels: Record<string, string> = {
              isPublic: 'Public event',
              isVirtual: 'Virtual event',
              food: 'Food provided',
              carpool: 'Carpool available',
            }
            const val = form[key] as boolean
            return (
              <XStack key={key} gap="$3" alignItems="center" justifyContent="space-between">
                <Text color={colors.text} fontSize="$3" flex={1}>
                  {labels[key]}
                </Text>
                <Pressable onPress={() => field(key)(!val)}>
                  <XStack
                    paddingHorizontal="$3"
                    paddingVertical="$1"
                    borderRadius={99}
                    backgroundColor={val ? colors.primary : colors.surface}
                    borderWidth={1}
                    borderColor={val ? colors.primary : colors.border}
                  >
                    <Text color={val ? 'white' : colors.textMuted} fontSize="$2" fontWeight="600">
                      {val ? 'ON' : 'OFF'}
                    </Text>
                  </XStack>
                </Pressable>
              </XStack>
            )
          })}

          {form.isVirtual ? (
            <YStack gap="$1">
              <Text color={colors.text} fontSize="$3">
                Meeting Link
              </Text>
              <Input
                value={form.virtualLink}
                onChangeText={field('virtualLink')}
                placeholder="https://zoom.us/j/..."
                backgroundColor={colors.surface}
                color={colors.text}
                borderColor={colors.border}
              />
            </YStack>
          ) : null}

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
