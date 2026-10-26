import { useState, useEffect } from 'react'
import { Pressable } from 'react-native'
import { YStack, XStack, Text, Input } from 'tamagui'
import { collection, doc, setDoc } from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { Modal } from '@/components/ui/Modal'
import { db } from '@/lib/firebase'
import { useThemeColors } from '@/theme/useThemeColors'
import { useEventsStore, resolveAssignedUids } from '@/stores/eventsStore'
import { teamAvailStatus } from '@/lib/availability'
import { useUsersStore } from '@/stores/usersStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { audit } from '@/lib/audit'
import { confirmAsync } from '@/lib/confirm'
import { useConfigStore } from '@/stores/configStore'
import { geocodeCity } from '@/lib/geocode'
import { isPublic, groupDisplayName } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import { TeamsEditor } from './TeamsEditor'
import { DressCodeEditor } from './DressCodeEditor'
import { LodgingEditor } from './LodgingEditor'
import { FlightEditor } from './FlightEditor'
import { CarpoolBuilder } from './CarpoolBuilder'
import { CarpoolSummary, carpoolPerson } from './CarpoolSummary'
import { unplaced } from './carpoolCards'
import { ScheduleBuilder } from './ScheduleBuilder'
import { dayNames, scheduleByDay, tidySchedule, tidyTime, whenShown } from '@/lib/eventSchedule'
import type { TaskTemplate } from '@/features/admin/TaskTemplateCard'
import { taskDueDate } from '@/lib/events'
import {
  isoToDisplay,
  displayToIso,
  toExtraDayRows,
  fromExtraDayRows,
  type ExtraDayRow,
} from '@/lib/eventDates'
import {
  notifyAssignees,
  notifyLogisticsAssigned,
  notifyFoodSignupOpen,
} from '@/lib/taskNotifications'
import { newLogisticsAssignments } from '@/lib/guestItinerary'
import type { PendingEventForm } from '@/stores/miriamStore'
import type { EventDraft, FlightLegDraft } from '@/lib/miriam'
import type {
  EventTemplate,
  CarpoolCarData,
  EventTeam,
  DressCodeEntry,
  LodgingEntry,
  FlightEntry,
  ScheduleItem,
} from '@/types/events'

interface GroupDoc {
  id: string
  name: string
  members: string[]
}

interface EventFormModalProps {
  event?: EventTemplate | null
  open: boolean
  onClose: () => void
  onDelete?: () => void
  selectedDate?: string
  instanceKey?: string
  /** A new event filled in by Miriam, opened for checking and saving. */
  prefill?: PendingEventForm | null
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

/**
 * Record who changed an event and how.
 *
 * Events were the one significant thing in the app with no audit trail —
 * user management, groups, task templates and moderation all keep one. So when
 * a draft was published without anyone meaning to, there was no way to find
 * out who or when; the only trace was _updatedAt, a bare timestamp with no
 * actor.
 *
 * Publishing is called out separately from an ordinary update because it is
 * the change that makes an event visible to everyone on it.
 */
type EventAuditAction =
  | 'created'
  | 'draftCreated'
  | 'draftSaved'
  | 'published'
  | 'updated'
  | 'occurrenceUpdated'

const EVENT_AUDIT_DETAIL: Record<EventAuditAction, string> = {
  created: 'Created event',
  draftCreated: 'Created draft',
  draftSaved: 'Saved draft',
  published: 'Published draft',
  updated: 'Updated event',
  occurrenceUpdated: 'Updated a single occurrence of',
}

/**
 * What the form is currently pointed at.
 *
 * A recurring event edited for one date is a different thing to edit than the
 * series, so the occurrence is part of the identity; a blank form is its own
 * value rather than null, so switching from a draft back to creating reloads.
 */
function identify(
  event: EventTemplate | null | undefined,
  instanceKey?: string,
  prefill?: PendingEventForm | null
): string {
  if (!event) return prefill ? `miriam:${prefill.id}` : 'new'
  // An event Miriam changed: the same event, but filled in afresh.
  return `${String(event.id)}::${instanceKey ?? ''}${prefill ? `::miriam:${prefill.id}` : ''}`
}

function blankForm(
  event: EventTemplate | null | undefined,
  date: string,
  prefill?: PendingEventForm | null
): FormData {
  const form: FormData = {
    title: event?.title ?? '',
    date,
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
  }
  return prefill ? withDraft(form, prefill.draft) : form
}

/**
 * What Miriam filled in, over the form as it starts — blank for a new event,
 * or the event as it is, for a change. What she left out stays as it was.
 */
function withDraft(form: FormData, draft: EventDraft): FormData {
  const next = { ...form }
  if (draft.title) next.title = draft.title
  if (draft.location) next.location = draft.location
  if (draft.address) next.address = draft.address
  if (draft.city) next.city = draft.city
  if (draft.state) next.state = draft.state
  if (draft.startTime) next.startTime = tidyTime(draft.startTime)
  if (draft.users) next.users = draft.users
  if (draft.groups) next.groups = draft.groups
  if (draft.repeat === null) next.isRec = false
  else if (draft.repeat) {
    next.isRec = true
    next.recur = draft.repeat.recur
    next.recDay = draft.repeat.recDay
  }
  if (draft.isPublic !== undefined) next.isPublic = draft.isPublic
  if (draft.isVirtual !== undefined) next.isVirtual = draft.isVirtual
  if (draft.virtualLink) next.virtualLink = draft.virtualLink
  if (draft.foodItems) {
    next.food = draft.foodItems.length > 0
    next.foodItems = draft.foodItems
  }
  if (draft.cars) {
    next.carpool = draft.cars.length > 0
    next.carpoolCars = draft.cars.map((c, i) => ({
      id: `${Date.now()}_${i}`,
      label: c.label,
      ...(c.seats ? { seats: c.seats } : {}),
      driver: c.driver,
      riders: c.riders,
      ...(c.children?.length
        ? { children: c.children.map((name, j) => ({ id: `${Date.now()}_${i}_${j}`, name })) }
        : {}),
    }))
  }
  if (draft.lodging) next.lodging = draft.lodging.length > 0
  if (draft.flights) next.flights = draft.flights.length > 0
  if (draft.taskTemplateId) next.taskTemplateId = draft.taskTemplateId
  return next
}

/** The form's lists that live apart from it: the event's, or what Miriam filled in. */
function listsFor(event: EventTemplate | null | undefined, draft?: EventDraft) {
  const leg = (prefix: 'out' | 'ret', l: FlightLegDraft) =>
    Object.fromEntries(
      Object.entries({
        Date: l.date,
        Time: l.time,
        Airport: l.airport,
        Airline: l.airline,
        Flight: l.flight,
        Confirmation: l.confirmation,
        Arrival: l.arrival,
      })
        .filter(([, v]) => v)
        .map(([k, v]) => [`${prefix}${k}`, v])
    )
  return {
    teams: draft?.teams ?? event?.teams ?? [],
    dressCode: draft?.dressCode ?? event?.dressCode ?? [],
    lodgingEntries: draft?.lodging
      ? draft.lodging.map((l, i) => ({
          id: `${Date.now()}_${i}`,
          name: l.name,
          ...(l.address ? { address: l.address } : {}),
          ...(l.room ? { room: l.room } : {}),
          ...(l.confirmation ? { confirmation: l.confirmation } : {}),
          assignees: l.assignees,
        }))
      : (event?.lodgingEntries ?? []),
    flightEntries: draft?.flights
      ? draft.flights.map((f, i) => ({
          id: `${Date.now()}_${i}`,
          uid: f.uid,
          ...leg('out', f.out),
          ...leg('ret', f.ret),
        }))
      : (event?.flightEntries ?? []),
    extraDays: toExtraDayRows(draft?.extraDays ?? event?.extraDays),
    schedule: event?.schedule ?? [],
  }
}

export function EventFormModal({
  event,
  open,
  onClose,
  onDelete,
  selectedDate,
  instanceKey,
  prefill,
}: EventFormModalProps) {
  const colors = useThemeColors()
  const { createEvent, updateEvent, deleteEvent, setOverride, avail } = useEventsStore()
  const { users: allStoreUsers } = useUsersStore()
  const { createTask } = useTasksStore()
  const { profile } = useAuthStore()
  const toast = useUIStore((s) => s.toast)
  const { commonTeams, subscribe: subConfig, unsubscribe: unsubConfig } = useConfigStore()

  const allUsers = allStoreUsers.filter((u) => !isPublic(u) && !!u.displayName)
  /**
   * A person's name wherever the form shows one — from everyone known, not
   * only those it lists to pick from: someone on the event through a group or
   * a team who is left out of that list (a public account, or one with no name
   * yet) was shown as their raw id.
   */
  const nameOf = (uid: string) => {
    const u = allStoreUsers.find((x) => sameId(x.uid, uid))
    return u?.displayName || u?.email || 'Unnamed account'
  }

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
          .map((d) => ({ id: d.id, ...d.data() }) as GroupDoc)
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

  const initDate = prefill?.draft.date
    ? isoToDisplay(prefill.draft.date)
    : event?.date
      ? isoToDisplay(event.date)
      : selectedDate
        ? isoToDisplay(selectedDate)
        : ''

  const [form, setForm] = useState<FormData>(() => blankForm(event, initDate, prefill))
  const [lists] = useState(() => listsFor(event, prefill?.draft))
  const [teams, setTeams] = useState<EventTeam[]>(lists.teams)
  const [dressCode, setDressCode] = useState<DressCodeEntry[]>(lists.dressCode)
  const [lodgingEntries, setLodgingEntries] = useState<LodgingEntry[]>(lists.lodgingEntries)
  const [flightEntries, setFlightEntries] = useState<FlightEntry[]>(lists.flightEntries)
  const [extraDays, setExtraDays] = useState<ExtraDayRow[]>(lists.extraDays)
  const [schedule, setSchedule] = useState<ScheduleItem[]>(lists.schedule)
  // The schedule builder, open in its own window.
  const [buildingSchedule, setBuildingSchedule] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editScope, setEditScope] = useState<'instance' | 'all'>(instanceKey ? 'instance' : 'all')

  /**
   * Reload the form when it is pointed at a different event.
   *
   * The caller used to do this by changing this component's `key`, which
   * throws the whole thing away and builds a new one. That works on the web,
   * where the modal is a Dialog, and fails on a device, where it is a Sheet:
   * a Sheet that is replaced in the same moment it is told to open never
   * appears, so opening an unpublished draft did nothing at all.
   *
   * So the component now stays mounted and reloads itself instead. Setting
   * state during render is React's own answer for state derived from props —
   * it re-renders immediately, before anything is shown, rather than painting
   * one frame of the previous event's details.
   */
  // The carpool builder, open in its own window.
  const [arrangingCars, setArrangingCars] = useState(false)
  // Admin-assigned food items, keyed by item index. Written into the same
  // foodSignups doc that self-signup uses, so both routes agree on who is
  // bringing what.
  const [foodAssignees, setFoodAssignees] = useState<Record<number, string>>({})
  const [foodPickerIndex, setFoodPickerIndex] = useState<number | null>(null)

  // What the form was loaded for, while open; null once it closes. Each
  // opening loads it afresh — a new event after another new one too, which
  // used to open with the last one's details still in it, as both are "new".
  const identity = identify(event, instanceKey, prefill)
  const [loadedFor, setLoadedFor] = useState<string | null>(open ? identity : null)
  // Only while open: the caller clears its selection as it closes, and
  // reloading then would blank the fields in view during the closing
  // animation.
  if (open && identity !== loadedFor) {
    setLoadedFor(identity)
    setForm(blankForm(event, initDate, prefill))
    const next = listsFor(event, prefill?.draft)
    setTeams(next.teams)
    setDressCode(next.dressCode)
    setLodgingEntries(next.lodgingEntries)
    setFlightEntries(next.flightEntries)
    setExtraDays(next.extraDays)
    setSchedule(next.schedule)
    setEditScope(instanceKey ? 'instance' : 'all')
    setFoodAssignees({})
    setFoodPickerIndex(null)
    setArrangingCars(false)
    setBuildingSchedule(false)
    setUserSearch('')
  }
  if (!open && loadedFor !== null) setLoadedFor(null)

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

  const addFoodItem = () => setForm((f) => ({ ...f, foodItems: [...f.foodItems, ''] }))
  const removeFoodItem = (i: number) =>
    setForm((f) => ({ ...f, foodItems: f.foodItems.filter((_, idx) => idx !== i) }))
  const updateFoodItem = (i: number, val: string) =>
    setForm((f) => ({ ...f, foodItems: f.foodItems.map((x, idx) => (idx === i ? val : x)) }))

  /**
   * Write the admin's food assignments into foodSignups.
   *
   * Only the items assigned are written, merged in: someone may have signed
   * themselves up for another dish while the event was being edited, and the
   * sheet is never written back from a copy read earlier, which could erase
   * that (lib/foodSignups).
   */
  async function persistFoodAssignments(templateId: string, isoDate: string) {
    const entries = Object.entries(foodAssignees)
    if (entries.length === 0 || !isoDate) return
    const assigned: Record<string, { uid: string; displayName: string }> = {}
    for (const [index, assigneeUid] of entries) {
      const person = allStoreUsers.find((u) => sameId(u.uid, assigneeUid))
      assigned[index] = { uid: String(assigneeUid), displayName: person?.displayName ?? '' }
    }
    await setDoc(
      doc(db, 'foodSignups', `${templateId}_${isoDate}`),
      { signups: assigned },
      { merge: true }
    )
  }

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
  // Who a uid is, as a card in the carpool builder: the full record an admin
  // reads, so it carries what colours the card.
  const carpoolPeopleOf = (uid: string) => {
    const u = allStoreUsers.find((x) => sameId(x.uid, uid))
    return u ? carpoolPerson(u) : { uid, name: 'Someone' }
  }
  // The event's days, as its schedule names them: its date, then any extra
  // days in the order the form lists them. A recurring event has the one.
  const scheduleDays = dayNames(
    form.isRec ? [null] : [displayToIso(form.date), ...extraDays.map((d) => displayToIso(d.date))]
  )
  // Who can be put in a car: everyone on the event, its teams included — as
  // the event's page counts them (resolveAssignedUids).
  const carpoolUids = [
    ...new Set([
      ...assignedUids,
      ...teams.flatMap((t) => [...t.leaders, ...t.members].map(String)),
    ]),
  ]

  async function auditEventSave(
    action: EventAuditAction,
    title: string,
    id: string | number | null | undefined
  ) {
    // A failed audit write must not roll back the save that already happened.
    await audit(
      `event.${action}`,
      `${EVENT_AUDIT_DETAIL[action]} "${title.trim() || 'Untitled'}" (#${id ?? '?'})`,
      profile?.displayName ?? ''
    ).catch(() => {})
  }

  const doSave = async (finalUsers: (string | number)[], saveAsDraft = false) => {
    // Captured before the write, because the payload sets unpublished and the
    // difference between "updated" and "published" is what it used to be.
    const wasDraft = event?.unpublished === true
    setSaving(true)
    try {
      const coords = form.isVirtual || saveAsDraft ? null : await geocodeCity(form.city, form.state)
      const payload = {
        title: form.title,
        date: form.isRec ? '' : displayToIso(form.date),
        location: form.location,
        address: form.address,
        city: form.city,
        state: form.state,
        startTime: tidyTime(form.startTime),
        isRec: form.isRec,
        // A recurring event repeats by rule, so extra dates would fight with
        // it — the editor is hidden in that case and the stored ones go too.
        extraDays: form.isRec ? [] : fromExtraDayRows(extraDays),
        recur: form.recur,
        recDay: form.recDay,
        isPublic: form.isPublic,
        food: form.food,
        foodItems: form.food ? form.foodItems.filter((s) => s.trim()) : [],
        carpool: form.carpool,
        carpoolCars: form.carpool ? form.carpoolCars : [],
        schedule: tidySchedule(schedule, scheduleDays.length),
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
        unpublished: saveAsDraft,
        ...(form.taskTemplateId ? { taskTemplateId: form.taskTemplateId } : {}),
        ...(coords ? { _geocodeLat: coords.lat, _geocodeLng: coords.lng } : {}),
      }
      if (instanceKey && editScope === 'instance') {
        await setOverride(instanceKey, {
          title: form.title,
          location: form.location,
          address: form.address,
          city: form.city,
          state: form.state,
          startTime: tidyTime(form.startTime),
          isPublic: form.isPublic,
          isVirtual: form.isVirtual,
          virtualLink: form.isVirtual ? form.virtualLink : '',
          food: form.food,
          foodItems: form.food ? form.foodItems.filter((s) => s.trim()) : [],
          carpool: form.carpool,
          carpoolCars: form.carpool ? form.carpoolCars : [],
          schedule: tidySchedule(schedule, scheduleDays.length),
          lodging: form.lodging,
          lodgingEntries: form.lodging ? lodgingEntries : [],
          flights: form.flights,
          flightEntries: form.flights ? flightEntries : [],
          users: finalUsers,
          groups: form.groups,
          teams,
          dressCode,
          ...(coords ? { _geocodeLat: coords.lat, _geocodeLng: coords.lng } : {}),
        })
        await auditEventSave('occurrenceUpdated', form.title, event?.id ?? instanceKey)
        toast('This date updated', 'success')
        onClose()
      } else if (event) {
        await updateEvent(event.id, payload)
        await persistFoodAssignments(String(event.id), event.date ?? displayToIso(form.date))
        // Only what changed — an event is saved many times and re-announcing
        // every hotel room each save would train people to ignore these.
        notifyLogisticsAssigned(
          newLogisticsAssignments(event, {
            lodgingEntries,
            flightEntries,
            carpoolCars: form.carpoolCars,
          }),
          form.title,
          instanceKey ?? String(event.id)
        )
        await auditEventSave(
          saveAsDraft ? 'draftSaved' : wasDraft ? 'published' : 'updated',
          form.title,
          event.id
        )
        toast(saveAsDraft ? 'Draft saved' : 'Event updated', 'success')
      } else {
        const newEventId = await createEvent(payload)
        notifyLogisticsAssigned(
          newLogisticsAssignments(null, {
            lodgingEntries,
            flightEntries,
            carpoolCars: form.carpoolCars,
          }),
          form.title,
          String(newEventId)
        )
        if (form.taskTemplateId && newEventId) {
          const tpl = taskTemplates.find((tt) => String(tt.id) === form.taskTemplateId)
          if (tpl) {
            const eventDate = form.isRec ? null : displayToIso(form.date) || null
            for (const taskItem of tpl.tasks ?? []) {
              if (!taskItem.title.trim()) continue
              const isPostEvent = (taskItem.daysAfterEvent ?? 0) > 0
              const dueDate = taskDueDate(eventDate, taskItem)
              const newTaskId = await createTask({
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
              // Tasks spawned from a template notify their assignees the same
              // way a hand-assigned task does. This was the gap that made
              // assigning yourself a task through an event silently produce
              // nothing.
              notifyAssignees(taskItem.assignees ?? [], taskItem.title, newTaskId)
            }
          }
        }
        await auditEventSave(saveAsDraft ? 'draftCreated' : 'created', form.title, newEventId)
        toast(saveAsDraft ? 'Draft saved' : 'Event created', 'success')
      }
      if (!form.isVirtual && !coords && !saveAsDraft) {
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

  const isExistingDraft = event?.unpublished === true

  const handleSave = async (mode: 'draft' | 'publish') => {
    if (!form.title.trim()) {
      toast('Title is required', 'error')
      return
    }

    if (mode === 'publish') {
      if (!form.isVirtual && (!form.city.trim() || !form.state.trim())) {
        toast('City and state are required for in-person events', 'error')
        return
      }
      if (!form.isRec && !displayToIso(form.date)) {
        toast('Date is required — use MM/DD/YY format', 'error')
        return
      }
      if (!form.isVirtual && !form.location.trim()) {
        toast('Venue name is required', 'error')
        return
      }
      if (!form.startTime.trim()) {
        toast('Start time is required', 'error')
        return
      }
      // Rows with an unreadable date are dropped on save, so a mistyped one
      // would otherwise disappear without a word.
      if (!form.isRec && extraDays.some((d) => d.date.trim() && !displayToIso(d.date))) {
        toast('An extra day has an invalid date — use MM/DD/YY format', 'error')
        return
      }
      if (form.isVirtual && !form.virtualLink.trim()) {
        toast('Meeting link is required for virtual events', 'error')
        return
      }
      if (form.food && !form.foodItems.some((i) => i.trim())) {
        toast('Add at least one food item or turn off Food', 'error')
        return
      }
    } else {
      // Draft: only check date format if a date was entered
      if (!form.isRec && form.date && !displayToIso(form.date)) {
        toast('Invalid date — use MM/DD/YY format', 'error')
        return
      }
    }

    const saveAsDraft = mode === 'draft'

    // Publishing is a one-way door with no undo: the event becomes visible to
    // everyone on it the moment it saves. It used to happen on a single tap of
    // the most prominent button on the form, which is how a draft went out
    // half-finished without anyone meaning to.
    if (isExistingDraft && !saveAsDraft) {
      const ok = await confirmAsync(
        `Publish "${form.title.trim()}"? It becomes visible to everyone on it.`,
        { title: 'Publish event', confirmLabel: 'Publish' }
      )
      if (!ok) return
    }

    // Check for team members not directly assigned to the event
    const teamMemberUids = [
      ...new Set(teams.flatMap((t) => [...t.leaders, ...t.members].map(String))),
    ]
    const unassignedTeamMembers = teamMemberUids.filter((uid) => !assignedUids.has(uid))

    if (unassignedTeamMembers.length > 0) {
      const names = unassignedTeamMembers.map(nameOf).join(', ')
      const label = unassignedTeamMembers.length > 1 ? 'These people are' : 'This person is'
      const msg = `${names}\n\n${label} on a team but not directly assigned to this event. Add them?`
      const ok = await confirmAsync(msg, {
        title: 'Team Members Not Assigned',
        confirmLabel: 'Add & Save',
        cancelLabel: 'Go Back',
      })
      if (ok) await doSave([...form.users, ...unassignedTeamMembers], saveAsDraft)
      return
    }

    // Check for people not assigned to any lodging (only in publish mode)
    if (mode === 'publish' && form.lodging && assignedUids.size > 0) {
      const placed = new Set(lodgingEntries.flatMap((e) => e.assignees))
      const unassignedLodging = [...assignedUids].filter((uid) => !placed.has(uid))
      if (unassignedLodging.length > 0) {
        const names = unassignedLodging.map(nameOf).join(', ')
        const lodgingLabel = unassignedLodging.length > 1 ? 'These people are' : 'This person is'
        const lodgingMsg = `${names}\n\n${lodgingLabel} not assigned to any lodging. Save anyway?`
        const ok = await confirmAsync(lodgingMsg, {
          title: 'Unassigned Lodging',
          confirmLabel: 'Save Anyway',
          cancelLabel: 'Go Back',
        })
        if (ok) await doSave(form.users, saveAsDraft)
        return
      }
    }

    await doSave(form.users, saveAsDraft)
  }

  const addExtraDay = () =>
    setExtraDays((prev) => [
      ...prev,
      { id: `new_${Date.now()}_${prev.length}`, date: '', startTime: '', location: '' },
    ])

  const updateExtraDay = (id: string, patch: Partial<ExtraDayRow>) =>
    setExtraDays((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))

  const removeExtraDay = (id: string) => setExtraDays((prev) => prev.filter((d) => d.id !== id))

  const handleDelete = async () => {
    if (!event) return
    const isInstanceOnly = !!(instanceKey && editScope === 'instance')
    const msg = isInstanceOnly
      ? `Remove the ${instanceKey!.split('_').pop()} occurrence of "${event.title}"?`
      : `Delete "${event.title}" and all its occurrences? This cannot be undone.`
    const doDelete = async () => {
      try {
        if (isInstanceOnly) {
          await setOverride(instanceKey!, { deleted: true })
          toast('Occurrence removed', 'success')
        } else {
          await deleteEvent(event.id)
          // Removing an occurrence said so and deleting the whole event said
          // nothing, which left the louder of the two actions looking like it
          // had not happened.
          toast('Event deleted', 'success')
        }
        // Always close, then let the caller move on. onDelete used to replace
        // onClose rather than follow it, so a screen that navigated away on
        // delete never marked the form closed — and a Tamagui dialog renders
        // in a portal at the app root, so it stayed on screen over whatever
        // came next, showing the event that had just been deleted.
        onClose()
        onDelete?.()
      } catch {
        toast(isInstanceOnly ? 'Failed to remove occurrence' : 'Failed to delete event', 'error')
      }
    }
    const ok = await confirmAsync(msg, {
      title: isInstanceOnly ? 'Remove Occurrence' : 'Delete Event',
      confirmLabel: isInstanceOnly ? 'Remove' : 'Delete',
      destructive: true,
    })
    if (ok) await doDelete()
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
      title={
        instanceKey
          ? editScope === 'instance'
            ? 'Edit This Date'
            : 'Edit All Occurrences'
          : event
            ? 'Edit Event'
            : 'Create Event'
      }
      scrollable
    >
      <YStack gap="$3" paddingBottom="$4">
        {/* Scope toggle for recurring event instances */}
        {instanceKey && (
          <YStack
            backgroundColor={colors.surface}
            borderWidth={1}
            borderColor={colors.border}
            borderRadius="$3"
            padding="$3"
            gap="$2"
          >
            <Text color={colors.text} fontSize="$3" fontWeight="600">
              What would you like to edit?
            </Text>
            <XStack gap="$2">
              <Pressable style={{ flex: 1 }} onPress={() => setEditScope('instance')}>
                <YStack
                  flex={1}
                  borderWidth={1}
                  borderColor={editScope === 'instance' ? colors.primary : colors.border}
                  backgroundColor={editScope === 'instance' ? colors.primary : 'transparent'}
                  borderRadius="$2"
                  padding="$2"
                  alignItems="center"
                  gap="$1"
                >
                  <Text
                    color={editScope === 'instance' ? 'white' : colors.text}
                    fontSize="$3"
                    fontWeight="600"
                  >
                    This date only
                  </Text>
                  <Text
                    color={editScope === 'instance' ? 'rgba(255,255,255,0.8)' : colors.textMuted}
                    fontSize="$1"
                    textAlign="center"
                  >
                    {instanceKey.split('_').pop()}
                  </Text>
                </YStack>
              </Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => setEditScope('all')}>
                <YStack
                  flex={1}
                  borderWidth={1}
                  borderColor={editScope === 'all' ? colors.primary : colors.border}
                  backgroundColor={editScope === 'all' ? colors.primary : 'transparent'}
                  borderRadius="$2"
                  padding="$2"
                  alignItems="center"
                  gap="$1"
                >
                  <Text
                    color={editScope === 'all' ? 'white' : colors.text}
                    fontSize="$3"
                    fontWeight="600"
                  >
                    All occurrences
                  </Text>
                  <Text
                    color={editScope === 'all' ? 'rgba(255,255,255,0.8)' : colors.textMuted}
                    fontSize="$1"
                    textAlign="center"
                  >
                    Edits the series
                  </Text>
                </YStack>
              </Pressable>
            </XStack>
          </YStack>
        )}

        {/* Filled in by Miriam: what was asked, and what she couldn't do. */}
        {!event && prefill ? (
          <YStack
            backgroundColor={colors.primary + '14'}
            borderWidth={1}
            borderColor={colors.primary}
            borderRadius="$3"
            padding="$3"
            gap="$1"
          >
            <Text color={colors.text} fontSize="$3" fontWeight="600">
              Filled in by Miriam — check it before saving.
            </Text>
            <Text color={colors.textMuted} fontSize="$2" fontStyle="italic">
              “{prefill.heard}”
            </Text>
            {prefill.notes.map((note) => (
              <Text key={note} color={colors.text} fontSize="$2">
                {note}
              </Text>
            ))}
          </YStack>
        ) : null}

        {/* Title */}
        <YStack gap="$1">
          <Text color={colors.text} fontSize="$3">
            Title *
          </Text>
          <Input
            value={form.title}
            onChangeText={field('title')}
            placeholder=""
            backgroundColor={colors.surface}
            color={colors.text}
            borderColor={colors.border}
          />
        </YStack>

        {/* Date — hidden for instance edits (date is fixed) */}
        {!(instanceKey && editScope === 'instance') && (
          <YStack gap="$1">
            <Text color={colors.text} fontSize="$3">
              Date (MM/DD/YY) {!form.isRec ? '*' : ''}
            </Text>
            <Input
              value={form.date}
              onChangeText={field('date')}
              placeholder=""
              backgroundColor={colors.surface}
              color={colors.text}
              borderColor={colors.border}
            />

            {/* Extra days — a trip or a conference is one event across several
                dates, not several events. Hidden for a recurring event, which
                already repeats by rule, and for an instance edit, which is
                about one date that is already fixed. */}
            {!form.isRec && (
              <YStack gap="$2" paddingTop="$2">
                <Text color={colors.textMuted} fontSize="$2">
                  Multi-day event? Add the other dates below.
                </Text>

                {extraDays.map((day, idx) => (
                  <YStack
                    key={day.id}
                    gap="$2"
                    backgroundColor={colors.surface}
                    borderRadius="$2"
                    borderWidth={1}
                    borderColor={colors.border}
                    padding="$3"
                  >
                    <XStack alignItems="center" justifyContent="space-between">
                      <Text color={colors.primary} fontSize="$2" fontWeight="700">
                        Day {idx + 2}
                      </Text>
                      <Pressable onPress={() => removeExtraDay(day.id)}>
                        <Text color="$red10" fontSize="$3">
                          ✕
                        </Text>
                      </Pressable>
                    </XStack>
                    <Input
                      value={day.date}
                      onChangeText={(v) => updateExtraDay(day.id, { date: v })}
                      placeholder="Date (MM/DD/YY)"
                      backgroundColor={colors.background}
                      color={colors.text}
                      borderColor={colors.border}
                    />
                    <Input
                      value={day.startTime}
                      onChangeText={(v) => updateExtraDay(day.id, { startTime: v })}
                      onBlur={() => updateExtraDay(day.id, { startTime: tidyTime(day.startTime) })}
                      placeholder="Start time (blank = same as Day 1)"
                      backgroundColor={colors.background}
                      color={colors.text}
                      borderColor={colors.border}
                    />
                    <Input
                      value={day.location}
                      onChangeText={(v) => updateExtraDay(day.id, { location: v })}
                      placeholder="Venue (blank = same as Day 1)"
                      backgroundColor={colors.background}
                      color={colors.text}
                      borderColor={colors.border}
                    />
                  </YStack>
                ))}

                <Pressable onPress={addExtraDay}>
                  <XStack
                    borderWidth={1}
                    borderColor={colors.primary}
                    borderRadius="$2"
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    alignSelf="flex-start"
                  >
                    <Text color={colors.primary} fontSize="$3">
                      + Add another day
                    </Text>
                  </XStack>
                </Pressable>
              </YStack>
            )}
          </YStack>
        )}

        {/* Venue Name */}
        <YStack gap="$1">
          <Text color={colors.text} fontSize="$3">
            Venue Name {!form.isVirtual ? '*' : ''}
          </Text>
          <Input
            value={form.location}
            onChangeText={field('location')}
            placeholder=""
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
            placeholder=""
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
              placeholder=""
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
              placeholder=""
              backgroundColor={colors.surface}
              color={colors.text}
              borderColor={colors.border}
            />
          </YStack>
        </XStack>

        {/* Start Time */}
        <YStack gap="$1">
          <Text color={colors.text} fontSize="$3">
            Start Time *
          </Text>
          {/* Written however is easiest ("7pm"), and tidied as it is left ("7:00 PM"), as the schedule's are. */}
          <Input
            value={form.startTime}
            onChangeText={field('startTime')}
            onBlur={() => setForm((f) => ({ ...f, startTime: tidyTime(f.startTime) }))}
            placeholder="e.g. 7:00 PM"
            backgroundColor={colors.surface}
            color={colors.text}
            borderColor={colors.border}
          />
        </YStack>

        {/* Schedule — optional, built in its own window */}
        <YStack gap="$2">
          <Text color={colors.text} fontSize="$3">
            Schedule (optional)
          </Text>
          {schedule.length ? (
            <YStack
              gap="$1"
              backgroundColor={colors.surface}
              borderRadius="$2"
              borderWidth={1}
              borderColor={colors.border}
              padding="$3"
            >
              {scheduleByDay(schedule).map(({ day, items }) => (
                <YStack key={day} gap="$1">
                  {scheduleDays.length > 1 ? (
                    <Text color={colors.textMuted} fontSize="$2" fontWeight="700">
                      {scheduleDays[Math.min(day, scheduleDays.length - 1)]}
                    </Text>
                  ) : null}
                  {items.map((it) => (
                    <Text key={it.id} color={colors.text} fontSize="$3" numberOfLines={1}>
                      {whenShown(it) ? `${whenShown(it)} · ` : ''}
                      {it.title}
                    </Text>
                  ))}
                </YStack>
              ))}
            </YStack>
          ) : null}
          <Pressable onPress={() => setBuildingSchedule(true)} accessibilityRole="button">
            <XStack
              borderWidth={1}
              borderColor={colors.primary}
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$2"
              alignSelf="flex-start"
            >
              <Text color={colors.primary} fontSize="$3" fontWeight="600">
                {schedule.length ? 'Edit schedule' : '+ Add a schedule'}
              </Text>
            </XStack>
          </Pressable>
        </YStack>
        {buildingSchedule ? (
          <ScheduleBuilder
            subtitle={form.title.trim() || undefined}
            schedule={schedule}
            days={scheduleDays}
            onSave={(next) => {
              setSchedule(next)
              setBuildingSchedule(false)
            }}
            onClose={() => setBuildingSchedule(false)}
          />
        ) : null}

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
                      {groupDisplayName(g.name)}
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
                        {groupDisplayName(g.name)}
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
            placeholder=""
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
          availOf={(uid) =>
            teamAvailStatus(
              avail,
              event,
              uid,
              instanceKey && editScope === 'instance' ? instanceKey : undefined
            )
          }
        />

        {/* Dress Code */}
        <DressCodeEditor entries={dressCode} onChange={setDressCode} teams={teams} />

        {/* Recurring toggle + settings — hidden when editing a single instance */}
        {!(instanceKey && editScope === 'instance') && (
          <>
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
          </>
        )}

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
              Meeting Link *
            </Text>
            <Input
              value={form.virtualLink}
              onChangeText={field('virtualLink')}
              placeholder=""
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
              <YStack key={i} gap="$1">
                <XStack gap="$2" alignItems="center">
                  <Input
                    flex={1}
                    value={item}
                    onChangeText={(v) => updateFoodItem(i, v)}
                    placeholder=""
                    backgroundColor={colors.surface}
                    color={colors.text}
                    borderColor={colors.border}
                  />
                  <Pressable onPress={() => setFoodPickerIndex(i)}>
                    <XStack
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                      borderRadius="$2"
                      borderWidth={1}
                      borderColor={colors.border}
                    >
                      <Text color={colors.text} fontSize="$2">
                        {foodAssignees[i] ? nameOf(foodAssignees[i]) : 'Assign'}
                      </Text>
                    </XStack>
                  </Pressable>
                  <Pressable onPress={() => removeFoodItem(i)}>
                    <Text color="$red10" fontSize="$3">
                      ✕
                    </Text>
                  </Pressable>
                </XStack>
                {foodPickerIndex === i ? (
                  <YStack
                    gap="$1"
                    padding="$2"
                    backgroundColor={colors.surface}
                    borderRadius="$2"
                    borderWidth={1}
                    borderColor={colors.border}
                  >
                    {foodAssignees[i] ? (
                      <Pressable
                        onPress={() => {
                          setFoodAssignees((prev) => {
                            const next = { ...prev }
                            delete next[i]
                            return next
                          })
                          setFoodPickerIndex(null)
                        }}
                      >
                        <Text color="$red10" fontSize="$2">
                          Clear assignment
                        </Text>
                      </Pressable>
                    ) : null}
                    {allUsers.slice(0, 8).map((u) => (
                      <Pressable
                        key={u.uid}
                        onPress={() => {
                          setFoodAssignees((prev) => ({ ...prev, [i]: String(u.uid) }))
                          setFoodPickerIndex(null)
                        }}
                      >
                        <Text color={colors.text} fontSize="$2">
                          {u.displayName}
                        </Text>
                      </Pressable>
                    ))}
                  </YStack>
                ) : null}
              </YStack>
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
          <CarpoolSummary
            cars={form.carpoolCars}
            nameOf={(uid) => carpoolPeopleOf(uid).name}
            unplaced={unplaced(form.carpoolCars, carpoolUids).map(carpoolPeopleOf)}
            onArrange={() => setArrangingCars(true)}
          />
        ) : null}
        {arrangingCars ? (
          <CarpoolBuilder
            subtitle={form.title.trim() || undefined}
            cars={form.carpoolCars}
            people={carpoolUids.map(carpoolPeopleOf)}
            lookup={carpoolPeopleOf}
            onSave={(cars) => {
              setForm((f) => ({ ...f, carpoolCars: cars }))
              setArrangingCars(false)
            }}
            onClose={() => setArrangingCars(false)}
          />
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
                setLodgingEntries([
                  { id: Date.now().toString(), name: '', room: '', assignees: [] },
                ])
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
            allUsers={allStoreUsers}
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
          <FlightEditor entries={flightEntries} onChange={setFlightEntries} allUsers={allUsers} />
        ) : null}

        {/* Task Template selector — only for series edits */}
        {!(instanceKey && editScope === 'instance') && taskTemplates.length > 0 ? (
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
                    backgroundColor={form.taskTemplateId === t.id ? colors.primary : 'transparent'}
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
        <XStack gap="$2" justifyContent="space-between" alignItems="center" flexWrap="wrap">
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
                  {instanceKey && editScope === 'instance' ? 'Remove Date' : 'Delete'}
                </Text>
              </XStack>
            </Pressable>
          ) : (
            <YStack />
          )}
          <XStack gap="$2" flexWrap="wrap">
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
            {/* For recurring instance edits and published events: single save button */}
            {(instanceKey && editScope === 'instance') || (event && !isExistingDraft) ? (
              <Pressable onPress={() => handleSave('publish')} disabled={saving}>
                <XStack
                  backgroundColor={colors.primary}
                  borderRadius="$2"
                  paddingHorizontal="$4"
                  paddingVertical="$2"
                  opacity={saving ? 0.6 : 1}
                >
                  <Text color="white" fontWeight="600">
                    {saving
                      ? 'Saving…'
                      : instanceKey && editScope === 'instance'
                        ? 'Save This Date'
                        : 'Update'}
                  </Text>
                </XStack>
              </Pressable>
            ) : (
              /* New event or editing a draft: show Save as Draft + Publish.
                 On an existing draft the emphasis is reversed — keeping it a
                 draft is the ordinary act and publishing is the deliberate
                 one, so the prominent button is the safe one. Creating a new
                 event is the opposite: making it is what you came to do. */
              <>
                <Pressable onPress={() => handleSave('draft')} disabled={saving}>
                  <XStack
                    backgroundColor={isExistingDraft ? colors.primary : 'transparent'}
                    borderWidth={isExistingDraft ? 0 : 1}
                    borderColor={colors.border}
                    borderRadius="$2"
                    paddingHorizontal={isExistingDraft ? '$4' : '$3'}
                    paddingVertical="$2"
                    opacity={saving ? 0.6 : 1}
                  >
                    <Text color={isExistingDraft ? 'white' : colors.textMuted} fontWeight="600">
                      {saving ? 'Saving…' : 'Save as Draft'}
                    </Text>
                  </XStack>
                </Pressable>
                <Pressable onPress={() => handleSave('publish')} disabled={saving}>
                  <XStack
                    backgroundColor={isExistingDraft ? 'transparent' : colors.primary}
                    borderWidth={isExistingDraft ? 1 : 0}
                    borderColor={colors.primary}
                    borderRadius="$2"
                    paddingHorizontal="$4"
                    paddingVertical="$2"
                    opacity={saving ? 0.6 : 1}
                  >
                    <Text color={isExistingDraft ? colors.primary : 'white'} fontWeight="600">
                      {saving ? 'Saving…' : isExistingDraft ? 'Publish' : 'Create'}
                    </Text>
                  </XStack>
                </Pressable>
              </>
            )}
          </XStack>
        </XStack>
      </YStack>
    </Modal>
  )
}
