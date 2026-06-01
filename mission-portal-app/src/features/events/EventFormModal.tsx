import { useState, useEffect } from 'react'
import { Pressable } from 'react-native'
import { YStack, XStack, Text, Input } from 'tamagui'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Modal } from '@/components/ui/Modal'
import { useThemeColors } from '@/theme/useThemeColors'
import { useEventsStore } from '@/stores/eventsStore'
import { useUsersStore } from '@/stores/usersStore'
import { useUIStore } from '@/stores/uiStore'
import { geocodeCity } from '@/lib/geocode'
import { isPublic } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import type { TaskTemplate } from '@/features/admin/TaskTemplateCard'
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
  foodItems: string
  carpool: boolean
  carpoolLoc: string
  isVirtual: boolean
  virtualLink: string
  taskTemplateId: string
  users: (string | number)[]
}

export function EventFormModal({ event, open, onClose }: EventFormModalProps) {
  const colors = useThemeColors()
  const { createEvent, updateEvent } = useEventsStore()
  const { users: allStoreUsers } = useUsersStore()
  const toast = useUIStore((s) => s.toast)

  const allUsers = allStoreUsers.filter((u) => !isPublic(u) && !!u.displayName)

  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([])
  const [userSearch, setUserSearch] = useState('')

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'taskTemplates'), (snap) => {
      setTaskTemplates(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as TaskTemplate))
    })
    return unsub
  }, [])
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
    foodItems: event?.foodItems?.[0] ?? '',
    carpool: event?.carpool ?? false,
    carpoolLoc: event?.carpoolLoc ?? '',
    isVirtual: event?.isVirtual ?? false,
    virtualLink: event?.virtualLink ?? '',
    taskTemplateId: event?.taskTemplateId ?? '',
    users: event?.users ?? [],
  })
  const [saving, setSaving] = useState(false)

  const field = (key: keyof FormData) => (val: string | boolean | number) =>
    setForm((f) => ({ ...f, [key]: val }) as FormData)

  const toggleUser = (uid: string) => {
    setForm((f) => {
      const already = f.users.some((x) => sameId(x, uid))
      return {
        ...f,
        users: already ? f.users.filter((x) => !sameId(x, uid)) : [...f.users, uid],
      }
    })
  }

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
      // Check geocoding so we can warn the admin if it fails
      const geoCheck = form.isVirtual ? true : !!(await geocodeCity(form.city, form.state))
      const payload = {
        title: form.title,
        date: form.date,
        location: form.location,
        address: form.address,
        city: form.city,
        state: form.state,
        startTime: form.startTime,
        isRec: form.isRec,
        recur: form.recur,
        recDay: form.recDay,
        isPublic: form.isPublic,
        food: form.food,
        foodItems: form.food && form.foodItems.trim() ? [form.foodItems.trim()] : [],
        carpool: form.carpool,
        carpoolLoc: form.carpoolLoc,
        isVirtual: form.isVirtual,
        virtualLink: form.virtualLink,
        users: form.users,
        teams: event?.teams ?? [],
        ...(form.taskTemplateId ? { taskTemplateId: form.taskTemplateId } : {}),
      }
      if (event) {
        await updateEvent(event.id, payload)
        toast('Event updated', 'success')
      } else {
        await createEvent(payload)
        toast('Event created', 'success')
      }
      if (!geoCheck) {
        toast(`Location "${form.city}, ${form.state}" could not be geocoded — event won't appear in Events Near Me.`, 'error')
      }
      onClose()
    } catch {
      toast('Failed to save event', 'error')
    } finally {
      setSaving(false)
    }
  }

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const templateOptions: { id: string; name: string }[] = [
    { id: '', name: 'None' },
    ...taskTemplates,
  ]

  const assignedUsers = allUsers.filter((u) => form.users.some((x) => sameId(x, u.uid)))
  const searchResults = userSearch.trim()
    ? allUsers
        .filter(
          (u) =>
            !form.users.some((x) => sameId(x, u.uid)) &&
            (u.displayName ?? '').toLowerCase().includes(userSearch.toLowerCase())
        )
        .slice(0, 10)
    : []

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title={event ? 'Edit Event' : 'Create Event'}
      scrollable
    >
      <YStack gap="$3" paddingBottom="$4">
        {/* Title */}
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

        {/* Date */}
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

        {/* Venue Name */}
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

        {/* Street Address */}
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

        {/* City + State */}
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

        {/* Start Time */}
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

        {/* Recurring toggle */}
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

        {/* Public Event toggle */}
        <XStack gap="$3" alignItems="center" justifyContent="space-between">
          <Text color={colors.text} fontSize="$3" flex={1}>
            Public event
          </Text>
          <Pressable onPress={() => field('isPublic')(!form.isPublic)}>
            <XStack
              paddingHorizontal="$3"
              paddingVertical="$1"
              borderRadius={99}
              backgroundColor={form.isPublic ? colors.primary : colors.surface}
              borderWidth={1}
              borderColor={form.isPublic ? colors.primary : colors.border}
            >
              <Text
                color={form.isPublic ? 'white' : colors.textMuted}
                fontSize="$2"
                fontWeight="600"
              >
                {form.isPublic ? 'ON' : 'OFF'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>

        {/* Virtual Event toggle + sub-field */}
        <XStack gap="$3" alignItems="center" justifyContent="space-between">
          <Text color={colors.text} fontSize="$3" flex={1}>
            Virtual event
          </Text>
          <Pressable onPress={() => field('isVirtual')(!form.isVirtual)}>
            <XStack
              paddingHorizontal="$3"
              paddingVertical="$1"
              borderRadius={99}
              backgroundColor={form.isVirtual ? colors.primary : colors.surface}
              borderWidth={1}
              borderColor={form.isVirtual ? colors.primary : colors.border}
            >
              <Text
                color={form.isVirtual ? 'white' : colors.textMuted}
                fontSize="$2"
                fontWeight="600"
              >
                {form.isVirtual ? 'ON' : 'OFF'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
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

        {/* Food toggle + sub-field */}
        <XStack gap="$3" alignItems="center" justifyContent="space-between">
          <Text color={colors.text} fontSize="$3" flex={1}>
            Food provided
          </Text>
          <Pressable onPress={() => field('food')(!form.food)}>
            <XStack
              paddingHorizontal="$3"
              paddingVertical="$1"
              borderRadius={99}
              backgroundColor={form.food ? colors.primary : colors.surface}
              borderWidth={1}
              borderColor={form.food ? colors.primary : colors.border}
            >
              <Text color={form.food ? 'white' : colors.textMuted} fontSize="$2" fontWeight="600">
                {form.food ? 'ON' : 'OFF'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
        {form.food ? (
          <YStack gap="$1" paddingLeft="$3" borderLeftWidth={2} borderLeftColor={colors.primary}>
            <Text color={colors.text} fontSize="$3">
              Food description
            </Text>
            <Input
              value={form.foodItems}
              onChangeText={field('foodItems')}
              placeholder="Pizza, salad, drinks"
              backgroundColor={colors.surface}
              color={colors.text}
              borderColor={colors.border}
            />
          </YStack>
        ) : null}

        {/* Carpool toggle + sub-field */}
        <XStack gap="$3" alignItems="center" justifyContent="space-between">
          <Text color={colors.text} fontSize="$3" flex={1}>
            Carpool available
          </Text>
          <Pressable onPress={() => field('carpool')(!form.carpool)}>
            <XStack
              paddingHorizontal="$3"
              paddingVertical="$1"
              borderRadius={99}
              backgroundColor={form.carpool ? colors.primary : colors.surface}
              borderWidth={1}
              borderColor={form.carpool ? colors.primary : colors.border}
            >
              <Text
                color={form.carpool ? 'white' : colors.textMuted}
                fontSize="$2"
                fontWeight="600"
              >
                {form.carpool ? 'ON' : 'OFF'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
        {form.carpool ? (
          <YStack gap="$1" paddingLeft="$3" borderLeftWidth={2} borderLeftColor={colors.primary}>
            <Text color={colors.text} fontSize="$3">
              Pickup location
            </Text>
            <Input
              value={form.carpoolLoc}
              onChangeText={field('carpoolLoc')}
              placeholder="Elim Church parking lot"
              backgroundColor={colors.surface}
              color={colors.text}
              borderColor={colors.border}
            />
          </YStack>
        ) : null}

        {/* Task Template selector */}
        {taskTemplates.length > 0 ? (
          <YStack gap="$1">
            <Text color={colors.text} fontSize="$3">
              Task Template
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              {templateOptions.map((t) => (
                <Pressable key={t.id || 'none'} onPress={() => field('taskTemplateId')(t.id)}>
                  <XStack
                    borderWidth={1}
                    borderColor={form.taskTemplateId === t.id ? colors.primary : colors.border}
                    backgroundColor={
                      form.taskTemplateId === t.id ? colors.primary : 'transparent'
                    }
                    borderRadius="$2"
                    paddingHorizontal="$2"
                    paddingVertical="$1"
                  >
                    <Text
                      color={form.taskTemplateId === t.id ? 'white' : colors.text}
                      fontSize="$2"
                    >
                      {t.name}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </XStack>
          </YStack>
        ) : null}

        {/* Assigned Members */}
        <YStack gap="$1">
          <Text color={colors.text} fontSize="$3">
            Assigned Members
          </Text>
          {assignedUsers.length > 0 ? (
            <XStack flexWrap="wrap" gap="$1">
              {assignedUsers.map((u) => (
                <Pressable key={u.uid} onPress={() => toggleUser(u.uid)}>
                  <XStack
                    borderWidth={1}
                    borderColor={colors.primary}
                    backgroundColor={colors.primary + '22'}
                    borderRadius={99}
                    paddingHorizontal="$2"
                    paddingVertical="$1"
                    gap="$1"
                    alignItems="center"
                  >
                    <Text color={colors.primary} fontSize="$2" fontWeight="600">
                      {u.displayName}
                    </Text>
                    <Text color={colors.primary} fontSize="$1">
                      ✕
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </XStack>
          ) : null}
          <Input
            value={userSearch}
            onChangeText={setUserSearch}
            placeholder="Search members to add…"
            backgroundColor={colors.surface}
            color={colors.text}
            borderColor={colors.border}
          />
          {searchResults.length > 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderWidth={1}
              borderColor={colors.border}
              borderRadius="$2"
              overflow="hidden"
            >
              {searchResults.map((u) => (
                <Pressable
                  key={u.uid}
                  onPress={() => {
                    toggleUser(u.uid)
                    setUserSearch('')
                  }}
                >
                  <XStack
                    padding="$2"
                    borderBottomWidth={1}
                    borderBottomColor={colors.border}
                    alignItems="center"
                  >
                    <Text color={colors.text} fontSize="$3">
                      {u.displayName}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </YStack>
          ) : null}
        </YStack>

        {/* Save / Cancel */}
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
    </Modal>
  )
}
