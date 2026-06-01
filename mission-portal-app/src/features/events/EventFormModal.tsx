import { useState, useEffect } from 'react'
import { Pressable } from 'react-native'
import { YStack, XStack, Text, Input } from 'tamagui'
import { collection, onSnapshot } from 'firebase/firestore'
import { Modal } from '@/components/ui/Modal'
import { db } from '@/lib/firebase'
import { useThemeColors } from '@/theme/useThemeColors'
import { useEventsStore } from '@/stores/eventsStore'
import { useUsersStore } from '@/stores/usersStore'
import { useUIStore } from '@/stores/uiStore'
import { geocodeCity } from '@/lib/geocode'
import { isPublic } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import type { TaskTemplate } from '@/features/admin/TaskTemplateCard'
import type { EventTemplate, CarpoolCarData } from '@/types/events'
import type { UserProfile } from '@/types/user'

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
  foodItems: string[]
  carpool: boolean
  carpoolCars: CarpoolCarData[]
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
    foodItems: event?.foodItems ?? [],
    carpool: event?.carpool ?? false,
    carpoolCars: event?.carpoolCars ?? [],
    isVirtual: event?.isVirtual ?? false,
    virtualLink: event?.virtualLink ?? '',
    taskTemplateId: event?.taskTemplateId ?? '',
    users: event?.users ?? [],
  })
  const [saving, setSaving] = useState(false)

  const [carpoolPicker, setCarpoolPicker] = useState<{ carId: string; role: 'driver' | 'rider' } | null>(null)
  const [carpoolSearch, setCarpoolSearch] = useState('')

  const field = (key: keyof FormData) => (val: string | boolean | number) =>
    setForm((f) => {
      const next = { ...f, [key]: val } as FormData
      if (key === 'food' && val === true && next.foodItems.length === 0) {
        next.foodItems = ['']
      }
      if (key === 'carpool' && val === true && next.carpoolCars.length === 0) {
        next.carpoolCars = [{ id: Date.now().toString(), label: '', seats: 3, driver: '', riders: [] }]
      }
      return next
    })

  const addCar = () =>
    setForm((f) => ({
      ...f,
      carpoolCars: [
        ...f.carpoolCars,
        { id: Date.now().toString(), label: '', seats: 3, driver: '', riders: [] },
      ],
    }))

  const removeCar = (carId: string) =>
    setForm((f) => ({ ...f, carpoolCars: f.carpoolCars.filter((c) => c.id !== carId) }))

  const updateCarField = (carId: string, key: keyof CarpoolCarData, val: unknown) =>
    setForm((f) => ({
      ...f,
      carpoolCars: f.carpoolCars.map((c) => (c.id === carId ? { ...c, [key]: val } : c)),
    }))

  const toggleCarRider = (carId: string, uid: string) =>
    setForm((f) => ({
      ...f,
      carpoolCars: f.carpoolCars.map((c) => {
        if (c.id !== carId) return c
        const has = c.riders.includes(uid)
        return { ...c, riders: has ? c.riders.filter((r) => r !== uid) : [...c.riders, uid] }
      }),
    }))

  const addFoodItem = () => setForm((f) => ({ ...f, foodItems: [...f.foodItems, ''] }))
  const removeFoodItem = (i: number) =>
    setForm((f) => ({ ...f, foodItems: f.foodItems.filter((_, idx) => idx !== i) }))
  const updateFoodItem = (i: number, val: string) =>
    setForm((f) => ({ ...f, foodItems: f.foodItems.map((x, idx) => (idx === i ? val : x)) }))

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
        foodItems: form.food ? form.foodItems.filter((s) => s.trim()) : [],
        carpool: form.carpool,
        carpoolCars: form.carpool ? form.carpoolCars : [],
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
        toast(
          `Location "${form.city}, ${form.state}" could not be geocoded — event won't appear in Events Near Me.`,
          'error'
        )
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
          <YStack gap="$2" paddingLeft="$3" borderLeftWidth={2} borderLeftColor={colors.primary}>
            <Text color={colors.text} fontSize="$3">
              Food items
            </Text>
            {form.foodItems.map((item, i) => (
              <XStack key={i} gap="$2" alignItems="center">
                <Input
                  flex={1}
                  value={item}
                  onChangeText={(v) => updateFoodItem(i, v)}
                  placeholder={`Item ${i + 1}`}
                  backgroundColor={colors.surface}
                  color={colors.text}
                  borderColor={colors.border}
                />
                <Pressable onPress={() => removeFoodItem(i)}>
                  <Text color="$red10" fontSize="$3">
                    ✕
                  </Text>
                </Pressable>
              </XStack>
            ))}
            <Pressable onPress={addFoodItem}>
              <XStack
                borderWidth={1}
                borderColor={colors.primary}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$2"
                alignSelf="flex-start"
              >
                <Text color={colors.primary} fontSize="$3">
                  + Add item
                </Text>
              </XStack>
            </Pressable>
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
          <YStack gap="$3">
            {form.carpoolCars.map((car) => {
              const usedUids = new Set(
                form.carpoolCars.flatMap((c) => [c.driver, ...c.riders].filter(Boolean))
              )
              const isPicking = carpoolPicker?.carId === car.id

              return (
                <YStack
                  key={car.id}
                  gap="$2"
                  backgroundColor={colors.surface}
                  borderRadius="$2"
                  padding="$3"
                  borderWidth={1}
                  borderColor={colors.border}
                >
                  <XStack gap="$2" alignItems="center">
                    <Input
                      flex={1}
                      value={car.label}
                      onChangeText={(v) => updateCarField(car.id, 'label', v)}
                      placeholder="Car name (e.g. Jacob's Van)"
                      backgroundColor={colors.surface}
                      color={colors.text}
                      borderColor={colors.border}
                    />
                    <Pressable onPress={() => removeCar(car.id)}>
                      <Text color="$red10" fontSize="$3">
                        ✕
                      </Text>
                    </Pressable>
                  </XStack>

                  <XStack gap="$2" alignItems="center">
                    <Text color={colors.textMuted} fontSize="$2">
                      Passenger seats:
                    </Text>
                    <XStack gap="$1">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <Pressable key={n} onPress={() => updateCarField(car.id, 'seats', n)}>
                          <XStack
                            width={28}
                            height={28}
                            borderRadius={14}
                            borderWidth={1}
                            borderColor={car.seats === n ? colors.primary : colors.border}
                            backgroundColor={car.seats === n ? colors.primary : 'transparent'}
                            alignItems="center"
                            justifyContent="center"
                          >
                            <Text color={car.seats === n ? 'white' : colors.text} fontSize={11}>
                              {n}
                            </Text>
                          </XStack>
                        </Pressable>
                      ))}
                    </XStack>
                  </XStack>

                  <YStack gap="$1">
                    <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                      DRIVER
                    </Text>
                    {car.driver ? (
                      <XStack gap="$2" alignItems="center">
                        <Text color={colors.text} fontSize="$3">
                          🚗 {allUsers.find((u) => u.uid === car.driver)?.displayName ?? car.driver}
                        </Text>
                        <Pressable onPress={() => updateCarField(car.id, 'driver', '')}>
                          <Text color="$red10" fontSize="$2">
                            ✕
                          </Text>
                        </Pressable>
                      </XStack>
                    ) : (
                      <Pressable
                        onPress={() => {
                          setCarpoolPicker(
                            isPicking && carpoolPicker?.role === 'driver'
                              ? null
                              : { carId: car.id, role: 'driver' }
                          )
                          setCarpoolSearch('')
                        }}
                      >
                        <XStack
                          borderWidth={1}
                          borderColor={colors.border}
                          borderRadius="$2"
                          paddingHorizontal="$3"
                          paddingVertical="$1"
                          alignSelf="flex-start"
                        >
                          <Text color={colors.primary} fontSize="$3">
                            + Assign Driver
                          </Text>
                        </XStack>
                      </Pressable>
                    )}
                  </YStack>

                  <YStack gap="$1">
                    <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                      RIDERS
                    </Text>
                    {car.riders.length > 0 && (
                      <XStack flexWrap="wrap" gap="$1">
                        {car.riders.map((rUid) => (
                          <XStack
                            key={rUid}
                            backgroundColor="$gray4"
                            borderRadius="$4"
                            paddingHorizontal="$2"
                            paddingVertical="$0.5"
                            gap="$1"
                            alignItems="center"
                          >
                            <Text fontSize="$2" color="$gray11">
                              {allUsers.find((u) => u.uid === rUid)?.displayName ?? rUid}
                            </Text>
                            <Pressable onPress={() => toggleCarRider(car.id, rUid)}>
                              <Text color="$gray10" fontSize="$1">
                                ✕
                              </Text>
                            </Pressable>
                          </XStack>
                        ))}
                      </XStack>
                    )}
                    {car.riders.length < car.seats && (
                      <Pressable
                        onPress={() => {
                          setCarpoolPicker(
                            isPicking && carpoolPicker?.role === 'rider'
                              ? null
                              : { carId: car.id, role: 'rider' }
                          )
                          setCarpoolSearch('')
                        }}
                      >
                        <XStack
                          borderWidth={1}
                          borderColor={colors.border}
                          borderRadius="$2"
                          paddingHorizontal="$3"
                          paddingVertical="$1"
                          alignSelf="flex-start"
                        >
                          <Text color={colors.primary} fontSize="$3">
                            + Add Rider
                          </Text>
                        </XStack>
                      </Pressable>
                    )}
                  </YStack>

                  {isPicking && (
                    <YStack
                      gap="$1"
                      backgroundColor={colors.background}
                      borderRadius="$2"
                      padding="$2"
                      borderWidth={1}
                      borderColor={colors.primary}
                    >
                      <Input
                        value={carpoolSearch}
                        onChangeText={setCarpoolSearch}
                        placeholder="Search…"
                        backgroundColor={colors.surface}
                        color={colors.text}
                        borderColor={colors.border}
                        size="$3"
                      />
                      {allUsers
                        .filter((u) => {
                          if (carpoolPicker?.role === 'driver' && u.uid === car.driver) return false
                          if (carpoolPicker?.role === 'rider' && car.riders.includes(u.uid))
                            return false
                          if (
                            usedUids.has(u.uid) &&
                            u.uid !== car.driver &&
                            !car.riders.includes(u.uid)
                          )
                            return false
                          if (carpoolSearch.trim())
                            return (u.displayName ?? '')
                              .toLowerCase()
                              .includes(carpoolSearch.toLowerCase())
                          return true
                        })
                        .slice(0, 8)
                        .map((u) => (
                          <Pressable
                            key={u.uid}
                            onPress={() => {
                              if (carpoolPicker?.role === 'driver') {
                                updateCarField(car.id, 'driver', u.uid)
                              } else {
                                toggleCarRider(car.id, u.uid)
                              }
                              setCarpoolPicker(null)
                              setCarpoolSearch('')
                            }}
                          >
                            <XStack
                              padding="$2"
                              borderRadius="$1"
                              backgroundColor={colors.surface}
                            >
                              <Text color={colors.text} fontSize="$3">
                                {u.displayName}
                              </Text>
                            </XStack>
                          </Pressable>
                        ))}
                    </YStack>
                  )}
                </YStack>
              )
            })}

            <Pressable onPress={addCar}>
              <XStack
                borderWidth={1}
                borderColor={colors.primary}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$2"
                alignSelf="flex-start"
              >
                <Text color={colors.primary} fontSize="$3">
                  + Add Car
                </Text>
              </XStack>
            </Pressable>
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
