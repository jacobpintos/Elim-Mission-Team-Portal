import { useState, useMemo } from 'react'
import { Pressable, TextInput, ScrollView, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useEventsStore } from '@/stores/eventsStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { AVAIL_LABELS, AVAIL_COLORS, availKey, seriesAvailKey } from '@/lib/availability'
import { allInstances, todayStr } from '@/lib/events'
import { sameId } from '@/lib/ids'
import { FD } from '@/lib/format'
import type { AvailResponse, EventInstance } from '@/types/events'

const STATUSES: AvailResponse['status'][] = ['yes', 'no', 'partial', 'tbd']

interface AvailQueueBannerProps {
  uid: string
}

type QueueItem =
  | { kind: 'series'; templateId: string | number; rep: EventInstance }
  | { kind: 'instance'; event: EventInstance }

// ──────────────────────────────────────────────────────────────────────────────
// Status button
// ──────────────────────────────────────────────────────────────────────────────
function StatusBtn({
  s,
  selected,
  disabled,
  onPress,
}: {
  s: AvailResponse['status']
  selected: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled}>
      <XStack
        backgroundColor={selected ? AVAIL_COLORS[s] : 'transparent'}
        borderWidth={2}
        borderColor={AVAIL_COLORS[s]}
        borderRadius="$2"
        paddingHorizontal="$3"
        paddingVertical="$1"
        opacity={disabled ? 0.5 : 1}
      >
        <Text color={selected ? 'white' : AVAIL_COLORS[s]} fontWeight="600" fontSize="$2">
          {AVAIL_LABELS[s]}
        </Text>
      </XStack>
    </Pressable>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Conflict sheet – shown when series response would overwrite manual instances
// ──────────────────────────────────────────────────────────────────────────────
function ConflictSheet({
  conflicts,
  newStatus,
  checked,
  onToggle,
  onConfirm,
  onCancel,
}: {
  conflicts: EventInstance[]
  newStatus: AvailResponse['status']
  checked: Set<string>
  onToggle: (key: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const colors = useThemeColors()
  return (
    <YStack padding="$3" gap="$3" borderTopWidth={1} borderTopColor={colors.border}>
      <Text color={colors.text} fontWeight="700" fontSize="$3">
        Some dates have responses
      </Text>
      <Text color={colors.textMuted} fontSize="$2">
        These dates already have a response. Check the ones you want to revert to your new series
        response ({AVAIL_LABELS[newStatus]}).
      </Text>
      <ScrollView style={{ maxHeight: 200 }}>
        <YStack gap="$1">
          {conflicts.map((ev) => (
            <Pressable key={ev.instanceKey} onPress={() => onToggle(ev.instanceKey)}>
              <XStack
                paddingVertical="$2"
                paddingHorizontal="$1"
                gap="$3"
                alignItems="center"
                borderBottomWidth={1}
                borderBottomColor={colors.border}
              >
                <XStack
                  width={20}
                  height={20}
                  borderRadius={4}
                  borderWidth={2}
                  borderColor={colors.primary}
                  backgroundColor={checked.has(ev.instanceKey) ? colors.primary : 'transparent'}
                  alignItems="center"
                  justifyContent="center"
                >
                  {checked.has(ev.instanceKey) ? (
                    <Text color="white" fontSize={12} fontWeight="700">
                      ✓
                    </Text>
                  ) : null}
                </XStack>
                <Text color={colors.text} fontSize="$3" flex={1}>
                  {FD(ev.date, { weekday: true })}
                </Text>
              </XStack>
            </Pressable>
          ))}
        </YStack>
      </ScrollView>
      <XStack gap="$2" justifyContent="flex-end">
        <Pressable onPress={onCancel}>
          <XStack
            borderWidth={1}
            borderColor={colors.border}
            borderRadius="$2"
            paddingHorizontal="$3"
            paddingVertical="$2"
          >
            <Text color={colors.textMuted} fontSize="$3">
              Keep all
            </Text>
          </XStack>
        </Pressable>
        <Pressable onPress={onConfirm} disabled={checked.size === 0}>
          <XStack
            backgroundColor={checked.size > 0 ? colors.primary : colors.border}
            borderRadius="$2"
            paddingHorizontal="$3"
            paddingVertical="$2"
          >
            <Text color="white" fontWeight="700" fontSize="$3">
              Revert selected
            </Text>
          </XStack>
        </Pressable>
      </XStack>
    </YStack>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Series RSVP form (sets series-level availability)
// ──────────────────────────────────────────────────────────────────────────────
function SeriesRsvpForm({
  templateId,
  rep,
  uid,
  queueCount,
  onSaved,
}: {
  templateId: string | number
  rep: EventInstance
  uid: string
  queueCount: number
  onSaved: () => void
}) {
  const colors = useThemeColors()
  const { avail, setSeriesAvail, checkSeriesConflicts } = useEventsStore()
  const toast = useUIStore((s) => s.toast)

  const existing = avail[seriesAvailKey(templateId)]?.[uid] ?? null
  const [status, setStatus] = useState<AvailResponse['status'] | null>(existing?.status ?? null)
  const [note, setNote] = useState(existing?.note ?? '')
  const [saving, setSaving] = useState(false)

  // Conflict state
  const [conflicts, setConflicts] = useState<EventInstance[]>([])
  const [conflictChecked, setConflictChecked] = useState<Set<string>>(new Set())
  const [pendingStatus, setPendingStatus] = useState<AvailResponse['status'] | null>(null)
  const [pendingNote, setPendingNote] = useState('')
  const [showConflicts, setShowConflicts] = useState(false)

  const needsNote = status === 'partial' || status === 'tbd'

  const doSave = async (
    saveStatus: AvailResponse['status'],
    saveNote: string,
    forceKeys: string[] = []
  ) => {
    setSaving(true)
    try {
      await setSeriesAvail(templateId, uid, saveStatus, saveNote, forceKeys)
      onSaved()
    } catch {
      toast('Failed to save RSVP', 'error')
    } finally {
      setSaving(false)
    }
  }

  const attemptSave = (saveStatus: AvailResponse['status'], saveNote: string) => {
    const c = checkSeriesConflicts(templateId, uid, saveStatus)
    if (c.length > 0) {
      setPendingStatus(saveStatus)
      setPendingNote(saveNote)
      setConflicts(c)
      setConflictChecked(new Set())
      setShowConflicts(true)
    } else {
      doSave(saveStatus, saveNote)
    }
  }

  const handleStatusSelect = (s: AvailResponse['status']) => {
    setStatus(s)
    if (s !== 'partial' && s !== 'tbd') {
      attemptSave(s, note)
    }
  }

  if (showConflicts && pendingStatus) {
    return (
      <ConflictSheet
        conflicts={conflicts}
        newStatus={pendingStatus}
        checked={conflictChecked}
        onToggle={(key) =>
          setConflictChecked((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
          })
        }
        onConfirm={() => {
          setShowConflicts(false)
          doSave(pendingStatus, pendingNote, Array.from(conflictChecked))
        }}
        onCancel={() => {
          setShowConflicts(false)
          doSave(pendingStatus, pendingNote, [])
        }}
      />
    )
  }

  return (
    <YStack padding="$3" gap="$3" borderTopWidth={1} borderTopColor={colors.border}>
      <XStack justifyContent="space-between" alignItems="flex-start">
        <YStack flex={1} gap="$0.5">
          <Text color={colors.text} fontWeight="700" fontSize="$4">
            {rep.title}
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            All occurrences
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            {FD(rep.date, { weekday: true })} and beyond
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
          <StatusBtn
            key={s}
            s={s}
            selected={status === s}
            disabled={saving}
            onPress={() => handleStatusSelect(s)}
          />
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
            <Pressable onPress={() => attemptSave(status ?? 'tbd', note)} disabled={saving}>
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

// ──────────────────────────────────────────────────────────────────────────────
// Instance RSVP form (for one-time events in queue / pick mode)
// ──────────────────────────────────────────────────────────────────────────────
function InstanceRsvpForm({
  event,
  uid,
  queueCount,
  onSaved,
  onFailed,
}: {
  event: EventInstance
  uid: string
  queueCount: number
  onSaved: () => void
  onFailed?: () => void
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
      onSaved()
      setAvail(event, uid, s, note).catch(() => {
        onFailed?.()
        setStatus(existing?.status ?? null)
        toast('Failed to save RSVP — please try again', 'error')
      })
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
          <StatusBtn
            key={s}
            s={s}
            selected={status === s}
            disabled={saving}
            onPress={() => handleStatusSelect(s)}
          />
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

// ──────────────────────────────────────────────────────────────────────────────
// Instance picker – multi-select instances for a recurring event in pick mode
// ──────────────────────────────────────────────────────────────────────────────
function InstancePickerView({
  templateId,
  title,
  uid,
  onBack,
  onDone,
}: {
  templateId: string | number
  title: string
  uid: string
  onBack: () => void
  onDone: () => void
}) {
  const colors = useThemeColors()
  const { templates, overrides, avail, setAvail } = useEventsStore()
  const toast = useUIStore((s) => s.toast)

  const [search, setSearch] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [pickStatus, setPickStatus] = useState<AvailResponse['status'] | null>(null)
  const [pickNote, setPickNote] = useState('')
  const [saving, setSaving] = useState(false)

  const instances = useMemo(() => {
    const tmpl = templates.find((t) => sameId(t.id, templateId))
    if (!tmpl) return []
    return allInstances([tmpl], overrides, todayStr(), '9999-12-31')
  }, [templateId, templates, overrides])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return instances
    return instances.filter(
      (ev) => ev.date.includes(q) || FD(ev.date, { weekday: true }).toLowerCase().includes(q)
    )
  }, [instances, search])

  const toggleAll = () => {
    if (checked.size === filtered.length) {
      setChecked(new Set())
    } else {
      setChecked(new Set(filtered.map((ev) => ev.instanceKey)))
    }
  }

  const handleSave = async () => {
    if (!pickStatus || checked.size === 0) return
    setSaving(true)
    try {
      const toSave = instances.filter((ev) => checked.has(ev.instanceKey))
      await Promise.all(toSave.map((ev) => setAvail(ev, uid, pickStatus, pickNote)))
      toast(`Saved ${toSave.length} date${toSave.length !== 1 ? 's' : ''}`, 'success')
      onDone()
    } catch {
      toast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <YStack borderTopWidth={1} borderTopColor={colors.border}>
      {/* Back row */}
      <Pressable onPress={onBack}>
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
          <Text color={colors.text} fontSize="$3" fontWeight="600">
            {title}
          </Text>
        </XStack>
      </Pressable>

      {/* Search */}
      <YStack paddingHorizontal="$3" paddingTop="$2">
        <TextInput
          style={[
            styles.noteInput,
            { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
          ]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search dates…"
          placeholderTextColor={colors.textMuted}
        />
      </YStack>

      {/* Select all */}
      <Pressable onPress={toggleAll}>
        <XStack
          paddingHorizontal="$3"
          paddingVertical="$2"
          alignItems="center"
          gap="$2"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
        >
          <XStack
            width={20}
            height={20}
            borderRadius={4}
            borderWidth={2}
            borderColor={colors.primary}
            backgroundColor={
              filtered.length > 0 && checked.size === filtered.length
                ? colors.primary
                : 'transparent'
            }
            alignItems="center"
            justifyContent="center"
          >
            {filtered.length > 0 && checked.size === filtered.length ? (
              <Text color="white" fontSize={12} fontWeight="700">
                ✓
              </Text>
            ) : null}
          </XStack>
          <Text color={colors.textMuted} fontSize="$2">
            Select all ({filtered.length})
          </Text>
          {checked.size > 0 ? (
            <Text color={colors.primary} fontSize="$2" fontWeight="600">
              {checked.size} selected
            </Text>
          ) : null}
        </XStack>
      </Pressable>

      {/* Instance list */}
      <ScrollView style={{ maxHeight: 220 }}>
        <YStack>
          {filtered.map((ev) => {
            const r = avail[availKey(ev)]?.[uid] ?? null
            return (
              <Pressable
                key={ev.instanceKey}
                onPress={() =>
                  setChecked((prev) => {
                    const next = new Set(prev)
                    if (next.has(ev.instanceKey)) next.delete(ev.instanceKey)
                    else next.add(ev.instanceKey)
                    return next
                  })
                }
              >
                <XStack
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  gap="$3"
                  alignItems="center"
                  borderBottomWidth={1}
                  borderBottomColor={colors.border}
                >
                  <XStack
                    width={20}
                    height={20}
                    borderRadius={4}
                    borderWidth={2}
                    borderColor={colors.primary}
                    backgroundColor={checked.has(ev.instanceKey) ? colors.primary : 'transparent'}
                    alignItems="center"
                    justifyContent="center"
                  >
                    {checked.has(ev.instanceKey) ? (
                      <Text color="white" fontSize={12} fontWeight="700">
                        ✓
                      </Text>
                    ) : null}
                  </XStack>
                  <Text color={colors.text} fontSize="$3" flex={1}>
                    {FD(ev.date, { weekday: true })}
                  </Text>
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
                  ) : null}
                </XStack>
              </Pressable>
            )
          })}
        </YStack>
      </ScrollView>

      {/* Status selector + save */}
      <YStack padding="$3" gap="$2" borderTopWidth={1} borderTopColor={colors.border}>
        <XStack gap="$2" flexWrap="wrap">
          {STATUSES.map((s) => (
            <StatusBtn
              key={s}
              s={s}
              selected={pickStatus === s}
              disabled={saving}
              onPress={() => setPickStatus(s)}
            />
          ))}
        </XStack>
        {pickStatus === 'partial' || pickStatus === 'tbd' ? (
          <TextInput
            style={[
              styles.noteInput,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
            value={pickNote}
            onChangeText={setPickNote}
            placeholder="Note (optional)"
            placeholderTextColor={colors.textMuted}
          />
        ) : null}
        <XStack justifyContent="flex-end">
          <Pressable onPress={handleSave} disabled={saving || !pickStatus || checked.size === 0}>
            <XStack
              backgroundColor={
                pickStatus && checked.size > 0 ? AVAIL_COLORS[pickStatus] : colors.border
              }
              borderRadius="$2"
              paddingHorizontal="$4"
              paddingVertical="$2"
              opacity={saving ? 0.6 : 1}
            >
              <Text color="white" fontWeight="700" fontSize="$3">
                {saving
                  ? 'Saving…'
                  : checked.size > 0
                    ? `Save ${checked.size} date${checked.size !== 1 ? 's' : ''}`
                    : 'Select dates'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
      </YStack>
    </YStack>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Main banner
// ──────────────────────────────────────────────────────────────────────────────
export function AvailQueueBanner({ uid }: AvailQueueBannerProps) {
  const colors = useThemeColors()
  const { templates, overrides, avail } = useEventsStore()
  const { groups } = useGroupsStore()

  const [collapsed, setCollapsed] = useState(false)
  const [pickMode, setPickMode] = useState(false)
  const [pickSeriesId, setPickSeriesId] = useState<string | number | null>(null)
  const [pickSeriesTitle, setPickSeriesTitle] = useState('')
  const [pickInstanceEvent, setPickInstanceEvent] = useState<EventInstance | null>(null)
  const [skipKeys, setSkipKeys] = useState<Set<string>>(new Set())

  const isAssignedToEvent = (ev: EventInstance) => {
    if (ev.users?.some((x) => sameId(x, uid))) return true
    if (
      ev.groups?.some((gid) => {
        const group = groups.find((g) => g.id === gid)
        return group?.members.some((m) => sameId(m, uid))
      })
    )
      return true
    if (
      ev.teams?.some(
        (team) =>
          team.leaders.some((m) => sameId(m, uid)) || team.members.some((m) => sameId(m, uid))
      )
    )
      return true
    return false
  }

  const today = todayStr()

  // All upcoming instances the user is assigned to
  const allAssigned = useMemo(() => {
    return allInstances(templates, overrides, today, '9999-12-31').filter(isAssignedToEvent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, overrides, uid, groups])

  // Series queue: one entry per recurring template with no/TBD series response
  const seriesQueue = useMemo(() => {
    const seen = new Set<string>()
    const result: { templateId: string | number; rep: EventInstance }[] = []
    for (const ev of allAssigned) {
      if (!ev.isRec) continue
      const tid = String(ev.templateId ?? ev.id)
      if (seen.has(tid)) continue
      seen.add(tid)
      if (skipKeys.has(`series_${tid}`)) continue
      const seriesResp = avail[seriesAvailKey(tid)]?.[uid]
      if (!seriesResp || seriesResp.status === 'tbd') {
        result.push({ templateId: ev.templateId ?? ev.id, rep: ev })
      }
    }
    return result
  }, [allAssigned, avail, uid, skipKeys])

  // One-time queue: instances with no/TBD response
  const oneTimeQueue = useMemo(() => {
    return allAssigned.filter((ev) => {
      if (ev.isRec) return false
      if (skipKeys.has(ev.instanceKey)) return false
      const r = avail[availKey(ev)]?.[uid]
      return !r || r.status === 'tbd'
    })
  }, [allAssigned, avail, uid, skipKeys])

  const queueItems: QueueItem[] = useMemo(() => {
    const series = seriesQueue.map(({ templateId, rep }) => ({
      kind: 'series' as const,
      templateId,
      rep,
    }))
    const instances = oneTimeQueue.map((event) => ({ kind: 'instance' as const, event }))
    return [...series, ...instances]
  }, [seriesQueue, oneTimeQueue])

  // Pick mode lists (separate from queue)
  const pickSeriesTemplates = useMemo(() => {
    const seen = new Set<string>()
    return allAssigned
      .filter((ev) => ev.isRec)
      .reduce<{ templateId: string | number; title: string; rep: EventInstance }[]>((acc, ev) => {
        const tid = String(ev.templateId ?? ev.id)
        if (!seen.has(tid)) {
          seen.add(tid)
          acc.push({ templateId: ev.templateId ?? ev.id, title: ev.title, rep: ev })
        }
        return acc
      }, [])
  }, [allAssigned])

  const pickOneTimeInstances = useMemo(() => allAssigned.filter((ev) => !ev.isRec), [allAssigned])

  const hasQueue = queueItems.length > 0
  const accentColor = hasQueue ? '#f39c12' : '#27ae60'

  // Reset collapsed when queue drains
  const [lastHadQueue, setLastHadQueue] = useState(hasQueue)
  if (hasQueue !== lastHadQueue) {
    setLastHadQueue(hasQueue)
    if (!hasQueue) {
      setCollapsed(false)
      setPickMode(false)
      setPickSeriesId(null)
      setPickInstanceEvent(null)
    }
  }

  const currentItem = queueItems[0] ?? null

  return (
    <YStack
      borderBottomWidth={1}
      borderBottomColor={colors.border}
      backgroundColor={colors.surface}
    >
      {/* Header row */}
      <Pressable
        onPress={() => {
          if (hasQueue) {
            setCollapsed((v) => !v)
          } else {
            if (pickSeriesId) {
              setPickSeriesId(null)
              setPickInstanceEvent(null)
            } else {
              setPickMode((v) => !v)
              setPickInstanceEvent(null)
            }
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
                ? `${queueItems.length} event${queueItems.length !== 1 ? 's' : ''} need your RSVP`
                : 'All RSVPs up to date'}
            </Text>
          </XStack>
          <Text color={colors.textMuted} fontSize="$3">
            {hasQueue ? (collapsed ? '▼' : '▲') : pickMode ? '▲' : 'Update availability ›'}
          </Text>
        </XStack>
      </Pressable>

      {/* Queue mode */}
      {hasQueue && !collapsed && currentItem ? (
        currentItem.kind === 'series' ? (
          <SeriesRsvpForm
            key={`series_${currentItem.templateId}`}
            templateId={currentItem.templateId}
            rep={currentItem.rep}
            uid={uid}
            queueCount={queueItems.length}
            onSaved={() => setSkipKeys((p) => new Set([...p, `series_${currentItem.templateId}`]))}
          />
        ) : (
          <InstanceRsvpForm
            key={currentItem.event.instanceKey}
            event={currentItem.event}
            uid={uid}
            queueCount={queueItems.length}
            onSaved={() => setSkipKeys((p) => new Set([...p, currentItem.event.instanceKey]))}
            onFailed={() =>
              setSkipKeys((p) => {
                const next = new Set(p)
                next.delete(currentItem.event.instanceKey)
                return next
              })
            }
          />
        )
      ) : null}

      {/* Pick mode */}
      {!hasQueue && pickMode ? (
        <YStack borderTopWidth={1} borderTopColor={colors.border}>
          {/* Instance picker for a recurring series */}
          {pickSeriesId !== null ? (
            <InstancePickerView
              templateId={pickSeriesId}
              title={pickSeriesTitle}
              uid={uid}
              onBack={() => setPickSeriesId(null)}
              onDone={() => {
                setPickSeriesId(null)
                setPickMode(false)
              }}
            />
          ) : pickInstanceEvent ? (
            /* RSVP form for a selected one-time event */
            <>
              <Pressable onPress={() => setPickInstanceEvent(null)}>
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
              <InstanceRsvpForm
                key={pickInstanceEvent.instanceKey}
                event={pickInstanceEvent}
                uid={uid}
                queueCount={0}
                onSaved={() => {
                  setPickInstanceEvent(null)
                  setPickMode(false)
                }}
              />
            </>
          ) : (
            /* Event list */
            <ScrollView style={{ maxHeight: 300 }}>
              <YStack>
                {pickSeriesTemplates.length === 0 && pickOneTimeInstances.length === 0 ? (
                  <YStack alignItems="center" padding="$4">
                    <Text color={colors.textMuted} fontSize="$3">
                      No upcoming assigned events.
                    </Text>
                  </YStack>
                ) : (
                  <>
                    {pickSeriesTemplates.map(({ templateId, title, rep }) => {
                      const seriesResp = avail[seriesAvailKey(templateId)]?.[uid] ?? null
                      return (
                        <Pressable
                          key={String(templateId)}
                          onPress={() => {
                            setPickSeriesId(templateId)
                            setPickSeriesTitle(title)
                          }}
                        >
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
                                {title}
                              </Text>
                              <Text color={colors.textMuted} fontSize="$2">
                                Recurring · {FD(rep.date, { weekday: true })} and beyond
                              </Text>
                            </YStack>
                            {seriesResp ? (
                              <XStack
                                backgroundColor={AVAIL_COLORS[seriesResp.status] + '22'}
                                borderRadius="$4"
                                paddingHorizontal="$2"
                                paddingVertical={2}
                              >
                                <Text
                                  color={AVAIL_COLORS[seriesResp.status]}
                                  fontSize={11}
                                  fontWeight="600"
                                >
                                  Series: {AVAIL_LABELS[seriesResp.status]}
                                </Text>
                              </XStack>
                            ) : null}
                            <Text color={colors.textMuted} fontSize="$3">
                              ›
                            </Text>
                          </XStack>
                        </Pressable>
                      )
                    })}
                    {pickOneTimeInstances.map((ev) => {
                      const r = avail[availKey(ev)]?.[uid] ?? null
                      return (
                        <Pressable key={ev.instanceKey} onPress={() => setPickInstanceEvent(ev)}>
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
                    })}
                  </>
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
