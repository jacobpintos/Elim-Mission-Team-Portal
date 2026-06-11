import { useState, useEffect } from 'react'
import { Pressable, Alert } from 'react-native'
import { YStack, XStack, Text, Input } from 'tamagui'
import { collection, onSnapshot } from 'firebase/firestore'
import { Modal } from '@/components/ui/Modal'
import { db } from '@/lib/firebase'
import { useThemeColors } from '@/theme/useThemeColors'
import { useEventsStore } from '@/stores/eventsStore'
import { useUsersStore } from '@/stores/usersStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useConfigStore } from '@/stores/configStore'
import { geocodeCity } from '@/lib/geocode'
import { isPublic } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import { TeamsEditor } from './TeamsEditor'
import { DressCodeEditor } from './DressCodeEditor'
import { LodgingEditor } from './LodgingEditor'
import { FlightEditor } from './FlightEditor'
import type { TaskTemplate } from '@/features/admin/TaskTemplateCard'
import type { EventTemplate, CarpoolCarData, EventTeam, DressCodeEntry, LodgingEntry, FlightEntry } from '@/types/events'

interface GroupDoc {
  id: string
  name: string
  members: string[]
}

interface EventFormModalProps {
  event?: EventTemplate | null
  open: boolean
  onClose: () => void
  selectedDate?: string
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
  lodging: boolean
  flights: boolean
  isVirtual: boolean
  virtualLink: string
  taskTemplateId: string
  users: (string | number)[]
  groups: string[]
}

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return iso
  const [, y, m, d] = match
  return `${m}/${d}/${y.slice(2)}`
}

function displayToIso(display: string): string {
  if (!display) return ''
  const match = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!match) return ''
  const [, m, d, y] = match
  const mn = Number(m), dn = Number(d)
  if (mn < 1 || mn > 12 || dn < 1 || dn > 31) return ''
  const fullYear = y.length <= 2 ? `20${y.padStart(2, '0')}` : y
  return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export function EventFormModal({ event, open, onClose, selectedDate }: EventFormModalProps) {
  const colors = useThemeColors()
  const { createEvent, updateEvent, deleteEvent } = useEventsStore()
  const { users: allStoreUsers } = useUsersStore()
  const { createTask } = useTasksStore()
  const { profile } = useAuthStore()
  const toast = useUIStore((s) => s.toast)
  const { commonTeams, subscribe: subConfig, unsubscribe: unsubConfig } = useConfigStore()

  const allUsers = allStoreUsers.filter((u) => !isPublic(u) && !!u.displayName)

  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([])
  const [allGroups, setAllGroups] = useState<GroupDoc[]>([])
  const [userSearch, setUserSearch] = useState('')

  useEffect(() => {
    subConfig()
    const unsubTemplates = onSnapshot(collection(db, 'taskTemplates'), (snap) => {
      setTaskTemplates(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as TaskTemplate))
    })
    const unsubGroups = onSnapshot(collection(db, 'groups'), (snap) => {
      setAllGroups(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as GroupDoc))
          .sort((a, b) => {
            if (a.name === 'All') return -1
            if (b.name === 'All') return 1
            return a.name.localeCompare(b.name)
          })
      )
    })
    return () => {
      unsubConfig()
      unsubTemplates()
      unsubGroups()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initDate = event?.date
    ? isoToDisplay(event.date)
    : selectedDate
      ? isoToDisplay(selectedDate)
      : ''

  const [form, setForm] = useState<FormData>({
    title: event?.title ?? '',
    date: initDate,
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
    lodging: event?.lodging ?? false,
    flights: event?.flights ?? false,
    isVirtual: event?.isVirtual ?? false,
    virtualLink: event?.virtualLink ?? '',
    taskTemplateId: event?.taskTemplateId ?? '',
    users: event?.users ?? [],
    groups: event?.groups ?? [],
  })
  const [teams, setTeams] = useState<EventTeam[]>(event?.teams ?? [])
  const [dressCode, setDressCode] = useState<DressCodeEntry[]>(event?.dressCode ?? [])
  const [lodgingEntries, setLodgingEntries] = useState<LodgingEntry[]>(event?.lodgingEntries ?? [])
  const [flightEntries, setFlightEntries] = useState<FlightEntry[]>(event?.flightEntries ?? [])
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
        next.carpoolCars = [{ id: Date.now().toString(), label: '', driver: '', riders: [] }]
      }
      return next
    })

  const addCar = () =>
    setForm((f) => ({
      ...f,
      carpoolCars: [
        ...f.carpoolCars,
        { id: Date.now().toString(), label: '', driver: '', riders: [] },
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

  const toggleGroup = (gid: string) => {
    setForm((f) => {
      const has = f.groups.includes(gid)
      return {
        ...f,
        groups: has ? f.groups.filter((g) => g !== gid) : [...f.groups, gid],
      }
    })
  }

  // UIDs directly assigned (via users array or assigned groups)
  const groupMemberUids = new Set(
    form.groups.flatMap((gid) => allGroups.find((g) => g.id === gid)?.members ?? [])
  )
  const assignedUids = new Set([...form.users.map(String), ...groupMemberUids])

  const doSave = async (finalUsers: (string | number)[]) => {
    setSaving(true)
    try {
      const coords = form.isVirtual ? null : await geocodeCity(form.city, form.state)
      const payload = {
        title: form.title,
        date: form.isRec ? '' : displayToIso(form.date),
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
        lodging: form.lodging,
        lodgingEntries: form.lodging ? lodgingEntries : [],
        flights: form.flights,
        flightEntries: form.flights ? flightEntries : [],
        isVirtual: form.isVirtual,
        virtualLink: form.virtualLink,
        users: finalUsers,
        groups: form.groups,
        teams,
        dressCode,
        ...(form.taskTemplateId ? { taskTemplateId: form.taskTemplateId } : {}),
        ...(coords ? { _geocodeLat: coords.lat, _geocodeLng: coords.lng } : {}),
      }
      if (event) {
        await updateEvent(event.id, payload)
        toast('Event updated', 'success')
      } else {
        const newEventId = await createEvent(payload)
        if (form.taskTemplateId && newEventId) {
          const tpl = taskTemplates.find((tt) => String(tt.id) === form.taskTemplateId)
          if (tpl) {
            const eventDate = form.isRec ? null : displayToIso(form.date) || null
            for (const taskItem of tpl.tasks ?? []) {
              if (!taskItem.title.trim()) continue
              const isPostEvent = (taskItem.daysAfterEvent ?? 0) > 0
              let dueDate: string | null = null
              if (eventDate) {
                if (isPostEvent) {
                  const d = new Date(eventDate)
                  d.setDate(d.getDate() + (taskItem.daysAfterEvent ?? 1))
                  dueDate = d.toISOString().split('T')[0]
                } else if (taskItem.daysBefore > 0) {
                  const d = new Date(eventDate)
                  d.setDate(d.getDate() - taskItem.daysBefore)
                  dueDate = d.toISOString().split('T')[0]
                }
              }
              await createTask({
                title: taskItem.title,
                assignees: taskItem.assignees ?? [],
                lead: (taskItem.assignees ?? [])[0] ?? null,
                by: profile?.uid ?? '',
                status: 'pending',
                evTemplateId: newEventId,
                evDate: eventDate,
                dueDate,
                ...(isPostEvent ? { isPostEvent: true } : {}),
              })
            }
          }
        }
        toast('Event created', 'success')
      }
      if (!form.isVirtual && !coords) {
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

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast('Title is required', 'error')
      return
    }
    if (!form.isVirtual && (!form.city.trim() || !form.state.trim())) {
      toast('City and state are required for in-person events', 'error')
      return
    }
    if (!form.isRec && form.date && !displayToIso(form.date)) {
      toast('Invalid date — use MM/DD/YY format', 'error')
      return
    }

    // Check for team members not directly assigned to the event
    const teamMemberUids = [
      ...new Set(teams.flatMap((t) => [...t.leaders, ...t.members].map(String))),
    ]
    const unassignedTeamMembers = teamMemberUids.filter((uid) => !assignedUids.has(uid))

    if (unassignedTeamMembers.length > 0) {
      const names = unassignedTeamMembers
        .map(
          (uid) =>
            allUsers.find((u) => sameId(u.uid, uid))?.displayName ??
            allUsers.find((u) => sameId(u.uid, uid))?.email ??
            uid
        )
        .join(', ')
      Alert.alert(
        'Team Members Not Assigned',
        `${names}\n\n${unassignedTeamMembers.length > 1 ? 'These people are' : 'This person is'} on a team but not directly assigned to this event. Add them?`,
        [
          { text: 'Go Back', style: 'cancel' },
          {
            text: 'Add & Save',
            onPress: () => doSave([...form.users, ...unassignedTeamMembers]),
          },
        ]
      )
      return
    }

    // Check for people not assigned to any lodging
    if (form.lodging && assignedUids.size > 0) {
      const placed = new Set(lodgingEntries.flatMap((e) => e.assignees))
      const unassignedLodging = [...assignedUids].filter((uid) => !placed.has(uid))
      if (unassignedLodging.length > 0) {
        const names = unassignedLodging
          .map(
            (uid) =>
              allUsers.find((u) => sameId(u.uid, uid))?.displayName ??
              allUsers.find((u) => sameId(u.uid, uid))?.email ??
              uid
          )
          .join(', ')
        Alert.alert(
          'Unassigned Lodging',
          `${names}\n\n${unassignedLodging.length > 1 ? 'These people are' : 'This person is'} not assigned to any lodging. Save anyway?`,
          [
            { text: 'Go Back', style: 'cancel' },
            { text: 'Save Anyway', onPress: () => doSave(form.users) },
          ]
        )
        return
      }
    }

    await doSave(form.users)
  }

  const handleDelete = () => {
    if (!event) return
    Alert.alert(
      'Delete Event',
      `Delete "${event.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEvent(event.id)
              onClose()
            } catch {
              toast('Failed to delete event', 'error')
            }
          },
        },
      ]
    )
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

  const assignedGroups = allGroups.filter((g) => form.groups.includes(g.id))
  const availableGroups = allGroups.filter((g) => !form.groups.includes(g.id))

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
            Date (MM/DD/YY)
          </Text>
          <Input
            value={form.date}
            onChangeText={field('date')}
            placeholder="04/06/26"
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

        {/* ── Assignments ── */}

        {/* Assigned Groups */}
        <YStack gap="$1">
          <Text color={colors.text} fontSize="$3">
            Assigned Groups
          </Text>
          {assignedGroups.length > 0 ? (
            <XStack flexWrap="wrap" gap="$1">
              {assignedGroups.map((g) => (
                <Pressable key={g.id} onPress={() => toggleGroup(g.id)}>
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
                      {g.name}
                    </Text>
                    <Text color={colors.primary} fontSize="$1">
                      ✕
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </XStack>
          ) : null}
          {availableGroups.length > 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderWidth={1}
              borderColor={colors.border}
              borderRadius="$2"
              overflow="hidden"
            >
              {availableGroups.map((g) => (
                <Pressable key={g.id} onPress={() => toggleGroup(g.id)}>
                  <XStack
                    padding="$2"
                    borderBottomWidth={1}
                    borderBottomColor={colors.border}
                    alignItems="center"
                    gap="$2"
                  >
                    <Text color={colors.primary} fontSize="$2">
                      +
                    </Text>
                    <YStack flex={1}>
                      <Text color={colors.text} fontSize="$3">
                        {g.name}
                      </Text>
                      <Text color={colors.textMuted} fontSize="$1">
                        {g.members.length} member{g.members.length !== 1 ? 's' : ''}
                      </Text>
                    </YStack>
                  </XStack>
                </Pressable>
              ))}
            </YStack>
          ) : null}
          {allGroups.length === 0 ? (
            <Text color={colors.textMuted} fontSize="$2">
              No groups created yet.
            </Text>
          ) : null}
        </YStack>

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
                      {u.displayName || u.email || String(u.uid)}
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
                      {u.displayName || u.email || String(u.uid)}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </YStack>
          ) : null}
        </YStack>

        {/* Teams */}
        <TeamsEditor
          teams={teams}
          onChange={setTeams}
          assignedUids={assignedUids}
          allUsers={allUsers}
          commonTeams={commonTeams}
        />

        {/* Dress Code */}
        <DressCodeEditor entries={dressCode} onChange={setDressCode} teams={teams} />

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

        {/* Food toggle + items */}
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

        {/* Carpool toggle + cars */}
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
                          if (carpoolPicker?.role === 'driver' && u.uid === car.driver)
                            return false
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
                                {u.displayName || u.email || String(u.uid)}
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

        {/* Lodging toggle + entries */}
        <XStack gap="$3" alignItems="center" justifyContent="space-between">
          <Text color={colors.text} fontSize="$3" flex={1}>
            Hotel / Lodging
          </Text>
          <Pressable
            onPress={() => {
              const next = !form.lodging
              field('lodging')(next)
              if (next && lodgingEntries.length === 0) {
                setLodgingEntries([{ id: Date.now().toString(), name: '', room: '', assignees: [] }])
              }
            }}
          >
            <XStack
              paddingHorizontal="$3"
              paddingVertical="$1"
              borderRadius={99}
              backgroundColor={form.lodging ? colors.primary : colors.surface}
              borderWidth={1}
              borderColor={form.lodging ? colors.primary : colors.border}
            >
              <Text
                color={form.lodging ? 'white' : colors.textMuted}
                fontSize="$2"
                fontWeight="600"
              >
                {form.lodging ? 'ON' : 'OFF'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
        {form.lodging ? (
          <LodgingEditor
            entries={lodgingEntries}
            onChange={setLodgingEntries}
            assignedUids={assignedUids}
            allUsers={allUsers}
            teams={teams}
            assignedGroups={allGroups.filter((g) => form.groups.includes(g.id))}
          />
        ) : null}

        {/* Flights toggle + entries */}
        <XStack gap="$3" alignItems="center" justifyContent="space-between">
          <Text color={colors.text} fontSize="$3" flex={1}>
            Flights
          </Text>
          <Pressable onPress={() => field('flights')(!form.flights)}>
            <XStack
              paddingHorizontal="$3"
              paddingVertical="$1"
              borderRadius={99}
              backgroundColor={form.flights ? colors.primary : colors.surface}
              borderWidth={1}
              borderColor={form.flights ? colors.primary : colors.border}
            >
              <Text
                color={form.flights ? 'white' : colors.textMuted}
                fontSize="$2"
                fontWeight="600"
              >
                {form.flights ? 'ON' : 'OFF'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
        {form.flights ? (
          <FlightEditor
            entries={flightEntries}
            onChange={setFlightEntries}
            assignedUids={assignedUids}
            allUsers={allUsers}
          />
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

        {/* Save / Cancel / Delete */}
        <XStack gap="$2" justifyContent="space-between" alignItems="center">
          {event ? (
            <Pressable onPress={handleDelete} disabled={saving}>
              <XStack
                backgroundColor="$red10"
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$2"
                opacity={saving ? 0.6 : 1}
              >
                <Text color="white" fontWeight="600">
                  Delete
                </Text>
              </XStack>
            </Pressable>
          ) : (
            <YStack />
          )}
          <XStack gap="$2">
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
        </XStack>
      </YStack>
    </Modal>
  )
}
