import { useState, useMemo, useEffect } from 'react'
import { ScrollView, Pressable, TextInput, StyleSheet, Modal as RNModal } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useEventsStore } from '@/stores/eventsStore'
import { useUsersStore } from '@/stores/usersStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { AVAIL_COLORS, AVAIL_LABELS, availKey, seriesAvailKey } from '@/lib/availability'
import { allInstances, todayStr } from '@/lib/events'
import { sameId } from '@/lib/ids'
import { FD } from '@/lib/format'
import type { AvailResponse, EventTemplate, EventInstance } from '@/types/events'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

type ResponseFilter = 'all' | AvailResponse['status'] | 'none'

const FILTER_OPTIONS: { key: ResponseFilter; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: '#888' },
  { key: 'yes', label: 'Yes', color: AVAIL_COLORS.yes },
  { key: 'no', label: 'No', color: AVAIL_COLORS.no },
  { key: 'partial', label: 'Partial', color: AVAIL_COLORS.partial },
  { key: 'tbd', label: 'TBD', color: AVAIL_COLORS.tbd },
  { key: 'none', label: 'No Response', color: '#aaa' },
]

type UserEntry = { uid: string; name: string; response: AvailResponse | null }

// ──────────────────────────────────────────────────────────────────────────────
// Full list modal (for yes / no-response counts)
// ──────────────────────────────────────────────────────────────────────────────
function FullListModal({
  title,
  users,
  color,
  onClose,
}: {
  title: string
  users: UserEntry[]
  color: string
  onClose: () => void
}) {
  const colors = useThemeColors()
  return (
    <RNModal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.modalBox, { backgroundColor: colors.surface }]}>
          <XStack justifyContent="space-between" alignItems="center" marginBottom={12}>
            <Text color={color} fontWeight="700" fontSize="$4">
              {title}
            </Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4" paddingHorizontal="$2">
                ✕
              </Text>
            </Pressable>
          </XStack>
          <ScrollView style={{ maxHeight: 320 }}>
            <YStack gap="$0">
              {users.map(({ uid, name, response }) => (
                <XStack
                  key={uid}
                  paddingVertical="$2"
                  borderBottomWidth={1}
                  borderBottomColor={colors.border}
                  gap="$2"
                  alignItems="center"
                >
                  <Text color={colors.text} fontSize="$3" flex={1}>
                    {name}
                  </Text>
                  {response?.note ? (
                    <Text color={colors.textMuted} fontSize={11}>
                      {response.note}
                    </Text>
                  ) : null}
                </XStack>
              ))}
            </YStack>
          </ScrollView>
        </Pressable>
      </Pressable>
    </RNModal>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Category row – one status category within an event card
// ──────────────────────────────────────────────────────────────────────────────
function CategoryRow({
  status,
  users,
  onShowList,
}: {
  status: AvailResponse['status'] | 'none'
  users: UserEntry[]
  onShowList: (users: UserEntry[], label: string, color: string) => void
}) {
  const colors = useThemeColors()
  const [noteUid, setNoteUid] = useState<string | null>(null)

  if (users.length === 0) return null

  const color = status === 'none' ? '#aaa' : AVAIL_COLORS[status]
  const label = status === 'none' ? 'No Response' : AVAIL_LABELS[status]
  const showCount = status === 'yes' || status === 'none'

  if (showCount) {
    return (
      <Pressable onPress={() => onShowList(users, label, color)}>
        <XStack
          paddingVertical="$1.5"
          paddingHorizontal="$1"
          justifyContent="space-between"
          alignItems="center"
        >
          <XStack gap="$1.5" alignItems="center">
            <YStack width={8} height={8} borderRadius={4} backgroundColor={color} />
            <Text color={color} fontSize="$2" fontWeight="600">
              {users.length} {label}
            </Text>
          </XStack>
          <Text color={colors.textMuted} fontSize={11}>
            tap for list ›
          </Text>
        </XStack>
      </Pressable>
    )
  }

  // Horizontal name chips (no/partial/tbd)
  return (
    <YStack gap="$1">
      <XStack gap="$1.5" alignItems="center">
        <YStack width={8} height={8} borderRadius={4} backgroundColor={color} />
        <Text color={color} fontSize="$2" fontWeight="600">
          {label}:
        </Text>
      </XStack>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap="$1" paddingLeft="$1">
          {users.map(({ uid, name, response }) => (
            <Pressable
              key={uid}
              onPress={() => {
                if (response?.note) setNoteUid(uid === noteUid ? null : uid)
              }}
            >
              <XStack
                backgroundColor={color + '22'}
                borderRadius="$4"
                paddingHorizontal="$2"
                paddingVertical={3}
                borderWidth={response?.note ? 1 : 0}
                borderColor={color}
              >
                <Text color={color} fontSize={12} fontWeight="600">
                  {name}
                  {response?.note ? ' *' : ''}
                </Text>
              </XStack>
            </Pressable>
          ))}
        </XStack>
      </ScrollView>
      {noteUid ? (
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$2"
          padding="$2"
          borderWidth={1}
          borderColor={colors.border}
        >
          <Text color={colors.textMuted} fontSize={11} fontWeight="600" marginBottom={2}>
            {users.find((u) => u.uid === noteUid)?.name}
          </Text>
          <Text color={colors.text} fontSize={12}>
            {users.find((u) => u.uid === noteUid)?.response?.note}
          </Text>
        </YStack>
      ) : null}
    </YStack>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Response summary for a card (used for both series and instance cards)
// ──────────────────────────────────────────────────────────────────────────────
function ResponseSummary({
  assignedUids,
  responses,
  onShowList,
}: {
  assignedUids: string[]
  responses: Record<string, AvailResponse | null>
  onShowList: (users: UserEntry[], label: string, color: string) => void
}) {
  const { displayName } = useUsersStore()

  const grouped = useMemo(() => {
    const g: Record<string, UserEntry[]> = { yes: [], no: [], partial: [], tbd: [], none: [] }
    assignedUids.forEach((uid) => {
      const r = responses[uid] ?? null
      const bucket = r?.status ?? 'none'
      g[bucket].push({ uid, name: displayName(uid), response: r })
    })
    return g
  }, [assignedUids, responses])

  const allYes = assignedUids.length > 0 && grouped.yes.length === assignedUids.length

  if (allYes) {
    return (
      <Text color={AVAIL_COLORS.yes} fontSize="$2" fontWeight="600" paddingVertical="$1">
        Everyone is available ✓
      </Text>
    )
  }

  return (
    <YStack gap="$1.5">
      {(['yes', 'no', 'partial', 'tbd', 'none'] as const).map((s) => (
        <CategoryRow key={s} status={s} users={grouped[s]} onShowList={onShowList} />
      ))}
    </YStack>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Exception row within a series card
// ──────────────────────────────────────────────────────────────────────────────
function ExceptionRow({
  date,
  entries,
}: {
  date: string
  entries: { uid: string; name: string; response: AvailResponse; seriesStatus?: string }[]
}) {
  const colors = useThemeColors()
  const [open, setOpen] = useState(false)

  return (
    <YStack>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <XStack
          paddingVertical="$1.5"
          paddingHorizontal="$2"
          justifyContent="space-between"
          alignItems="center"
        >
          <Text color={colors.text} fontSize="$2">
            {FD(date, { weekday: true })}
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            {open ? '▲' : '▼'}
          </Text>
        </XStack>
      </Pressable>
      {open ? (
        <YStack paddingHorizontal="$3" gap="$1" paddingBottom="$1">
          {entries.map(({ uid, name, response }) => (
            <XStack key={uid} gap="$2" alignItems="center" paddingVertical="$0.5">
              <Text color={colors.text} fontSize="$2" flex={1}>
                {name}
              </Text>
              <XStack
                backgroundColor={AVAIL_COLORS[response.status] + '22'}
                borderRadius="$4"
                paddingHorizontal="$2"
                paddingVertical={2}
              >
                <Text color={AVAIL_COLORS[response.status]} fontSize={11} fontWeight="600">
                  {AVAIL_LABELS[response.status]}
                </Text>
              </XStack>
              {response.note ? (
                <Text color={colors.textMuted} fontSize={11}>
                  {response.note}
                </Text>
              ) : null}
            </XStack>
          ))}
        </YStack>
      ) : null}
    </YStack>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin screen
// ──────────────────────────────────────────────────────────────────────────────
export default function AdminAvailScreen() {
  const colors = useThemeColors()
  const {
    templates,
    overrides,
    avail,
    subscribe: subEvents,
    unsubscribe: unsubEvents,
  } = useEventsStore()
  const {
    users,
    loading: usersLoading,
    subscribe: subUsers,
    unsubscribe: unsubUsers,
    displayName,
  } = useUsersStore()
  const { groups, subscribe: subGroups, unsubscribe: unsubGroups } = useGroupsStore()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ResponseFilter>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [exceptionsExpanded, setExceptionsExpanded] = useState<Set<string>>(new Set())
  const [listModal, setListModal] = useState<{
    users: UserEntry[]
    label: string
    color: string
  } | null>(null)

  useEffect(() => {
    subEvents()
    subUsers()
    subGroups()
    return () => {
      unsubEvents()
      unsubUsers()
      unsubGroups()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = search.trim().toLowerCase()

  const getAssignedUids = (tmpl: EventTemplate | EventInstance): string[] => {
    const set = new Set<string>()
    tmpl.users?.forEach((uid) => set.add(String(uid)))
    tmpl.groups?.forEach((gid) => {
      const group = groups.find((g) => sameId(g.id, gid))
      group?.members.forEach((m) => set.add(String(m)))
    })
    tmpl.teams?.forEach((team) => {
      team.leaders.forEach((m) => set.add(String(m)))
      team.members.forEach((m) => set.add(String(m)))
    })
    return Array.from(set)
  }

  type SeriesCard = {
    kind: 'series'
    templateId: string | number
    title: string
    assignedUids: string[]
    nextDate: string
    recDesc: string
  }

  type InstanceCard = {
    kind: 'instance'
    event: EventInstance
    assignedUids: string[]
  }

  type AdminCard = SeriesCard | InstanceCard

  // Build cards: one per recurring template + one per one-time instance
  const allCards = useMemo<AdminCard[]>(() => {
    const result: AdminCard[] = []
    const seenTemplates = new Set<string>()
    const today = todayStr()

    const instances = allInstances(templates, overrides, today, '9999-12-31')

    for (const ev of instances) {
      if (ev.isRec) {
        const tid = String(ev.templateId ?? ev.id)
        if (!seenTemplates.has(tid)) {
          seenTemplates.add(tid)
          const tmpl = templates.find((t) => sameId(t.id, ev.templateId ?? ev.id))
          if (!tmpl) continue
          const assignedUids = getAssignedUids(tmpl)
          if (assignedUids.length === 0) continue

          const recDesc =
            ev.recur === 'biweekly'
              ? 'Every 2 weeks'
              : ev.recur === 'monthly'
                ? 'Monthly'
                : 'Weekly'

          result.push({
            kind: 'series',
            templateId: ev.templateId ?? ev.id,
            title: ev.title,
            assignedUids,
            nextDate: ev.date,
            recDesc,
          })
        }
      } else {
        const assignedUids = getAssignedUids(ev)
        if (assignedUids.length === 0) continue
        result.push({ kind: 'instance', event: ev, assignedUids })
      }
    }

    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, overrides, groups])

  const getResponses = (card: AdminCard): Record<string, AvailResponse | null> => {
    const result: Record<string, AvailResponse | null> = {}
    if (card.kind === 'series') {
      const key = seriesAvailKey(card.templateId)
      card.assignedUids.forEach((uid) => {
        result[uid] = avail[key]?.[uid] ?? null
      })
    } else {
      const key = availKey(card.event)
      card.assignedUids.forEach((uid) => {
        result[uid] = avail[key]?.[uid] ?? null
      })
    }
    return result
  }

  const getCounts = (responses: Record<string, AvailResponse | null>) => {
    const counts: Record<string, number> = { yes: 0, no: 0, partial: 0, tbd: 0, none: 0 }
    Object.values(responses).forEach((r) => {
      if (!r) counts.none++
      else counts[r.status] = (counts[r.status] ?? 0) + 1
    })
    return counts
  }

  // Filter: applies to both search text and response filter chip
  const filteredCards = useMemo(() => {
    return allCards.filter((card) => {
      // Search filter
      if (q) {
        const titleMatch =
          card.kind === 'series'
            ? card.title.toLowerCase().includes(q)
            : card.event.title.toLowerCase().includes(q)
        const locationMatch =
          card.kind === 'instance' && card.event.location?.toLowerCase().includes(q)
        const userMatch = card.assignedUids.some((uid) =>
          displayName(uid).toLowerCase().includes(q)
        )
        if (!titleMatch && !locationMatch && !userMatch) return false
      }

      // Response filter chip
      if (filter !== 'all') {
        const responses = getResponses(card)
        const counts = getCounts(responses)
        if (filter === 'none') return counts.none > 0
        return (counts[filter] ?? 0) > 0
      }

      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCards, q, filter, avail, users, groups])

  // Exceptions for a series card
  const getExceptions = (
    templateId: string | number,
    assignedUids: string[]
  ): Record<string, { uid: string; name: string; response: AvailResponse }[]> => {
    const tmpl = templates.find((t) => sameId(t.id, templateId))
    if (!tmpl) return {}
    const instances = allInstances([tmpl], overrides, todayStr(), '9999-12-31')
    const byDate: Record<string, { uid: string; name: string; response: AvailResponse }[]> = {}

    for (const ev of instances) {
      for (const uid of assignedUids) {
        const instResp = avail[availKey(ev)]?.[uid]
        if (!instResp) continue
        const seriesResp = avail[seriesAvailKey(templateId)]?.[uid]
        if (!seriesResp || instResp.status !== seriesResp.status) {
          if (!byDate[ev.date]) byDate[ev.date] = []
          byDate[ev.date].push({ uid, name: displayName(uid), response: instResp })
        }
      }
    }
    return byDate
  }

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleExceptions = (key: string) => {
    setExceptionsExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (usersLoading && users.length === 0) {
    return (
      <YStack
        flex={1}
        backgroundColor={colors.background}
        alignItems="center"
        justifyContent="center"
      >
        <ScreenTitle options={{ title: 'Availability Tracker' }} />
        <Text color={colors.textMuted}>Loading…</Text>
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Availability Tracker' }} />

      {/* Search + filter */}
      <YStack padding="$3" gap="$2" borderBottomWidth={1} borderBottomColor={colors.border}>
        <TextInput
          style={[
            styles.search,
            { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
          ]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by event, location, or person…"
          placeholderTextColor={colors.textMuted}
          clearButtonMode="while-editing"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap="$2">
            {FILTER_OPTIONS.map((opt) => (
              <Pressable key={opt.key} onPress={() => setFilter(opt.key)}>
                <XStack
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                  borderRadius="$4"
                  backgroundColor={filter === opt.key ? opt.color : 'transparent'}
                  borderWidth={1}
                  borderColor={opt.color}
                >
                  <Text
                    color={filter === opt.key ? 'white' : opt.color}
                    fontSize="$2"
                    fontWeight="600"
                  >
                    {opt.label}
                  </Text>
                </XStack>
              </Pressable>
            ))}
          </XStack>
        </ScrollView>
      </YStack>

      <ScrollView style={{ flex: 1 }}>
        <YStack padding="$3" gap="$2">
          {filteredCards.length === 0 ? (
            <YStack alignItems="center" padding="$6">
              <Text color={colors.textMuted} textAlign="center">
                {q ? 'No events match your search.' : 'No upcoming events with assigned users.'}
              </Text>
            </YStack>
          ) : (
            filteredCards.map((card) => {
              const cardKey =
                card.kind === 'series' ? `series_${card.templateId}` : card.event.instanceKey
              const isOpen = expanded.has(cardKey)
              const responses = getResponses(card)
              const counts = getCounts(responses)

              return (
                <YStack
                  key={cardKey}
                  backgroundColor={colors.surface}
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor={colors.border}
                  overflow="hidden"
                >
                  {/* Card header */}
                  <Pressable onPress={() => toggleExpand(cardKey)}>
                    <YStack padding="$3" gap="$1.5">
                      <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                        <YStack flex={1} gap="$0.5">
                          <XStack gap="$1.5" alignItems="center">
                            <Text color={colors.text} fontWeight="700" fontSize="$3">
                              {card.kind === 'series' ? card.title : card.event.title}
                            </Text>
                            {card.kind === 'series' ? (
                              <Text color={colors.textMuted} fontSize={11}>
                                ⟳
                              </Text>
                            ) : null}
                          </XStack>
                          <Text color={colors.textMuted} fontSize="$2">
                            {card.kind === 'series'
                              ? `${card.recDesc} · Next: ${FD(card.nextDate, { weekday: true })}`
                              : `${FD(card.event.date, { weekday: true })}${card.event.startTime ? ` · ${card.event.startTime}` : ''}${card.event.location ? ` · ${card.event.location}` : ''}`}
                          </Text>
                        </YStack>
                        <Text color={colors.textMuted} fontSize="$3">
                          {isOpen ? '▲' : '▼'}
                        </Text>
                      </XStack>

                      {/* Mini summary dots */}
                      <XStack gap="$2" flexWrap="wrap">
                        {(
                          [
                            ['yes', AVAIL_COLORS.yes],
                            ['no', AVAIL_COLORS.no],
                            ['partial', AVAIL_COLORS.partial],
                            ['tbd', AVAIL_COLORS.tbd],
                            ['none', '#aaa'],
                          ] as [string, string][]
                        ).map(([key, color]) =>
                          counts[key] > 0 ? (
                            <XStack
                              key={key}
                              backgroundColor={color + '22'}
                              borderRadius="$4"
                              paddingHorizontal="$2"
                              paddingVertical={2}
                              gap="$1"
                              alignItems="center"
                            >
                              <YStack
                                width={6}
                                height={6}
                                borderRadius={3}
                                backgroundColor={color}
                              />
                              <Text color={color} fontSize={11} fontWeight="600">
                                {counts[key]}{' '}
                                {key === 'none'
                                  ? 'N/A'
                                  : AVAIL_LABELS[key as AvailResponse['status']]}
                              </Text>
                            </XStack>
                          ) : null
                        )}
                      </XStack>
                    </YStack>
                  </Pressable>

                  {/* Expanded: detailed response breakdown */}
                  {isOpen ? (
                    <YStack borderTopWidth={1} borderTopColor={colors.border} padding="$3" gap="$2">
                      <ResponseSummary
                        assignedUids={card.assignedUids}
                        responses={responses}
                        onShowList={(users, label, color) => setListModal({ users, label, color })}
                      />

                      {/* Exceptions for series cards */}
                      {card.kind === 'series'
                        ? (() => {
                            const exceptions = getExceptions(card.templateId, card.assignedUids)
                            const exDates = Object.keys(exceptions).sort()
                            if (exDates.length === 0) return null
                            const exKey = `ex_${card.templateId}`
                            const exOpen = exceptionsExpanded.has(exKey)
                            return (
                              <YStack
                                marginTop="$1"
                                borderTopWidth={1}
                                borderTopColor={colors.border}
                                paddingTop="$2"
                              >
                                <Pressable onPress={() => toggleExceptions(exKey)}>
                                  <XStack justifyContent="space-between" alignItems="center">
                                    <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                                      EXCEPTIONS ({exDates.length} date
                                      {exDates.length !== 1 ? 's' : ''})
                                    </Text>
                                    <Text color={colors.textMuted} fontSize="$2">
                                      {exOpen ? '▲' : '▼'}
                                    </Text>
                                  </XStack>
                                </Pressable>
                                {exOpen ? (
                                  <YStack marginTop="$1" gap="$0.5">
                                    {exDates.map((date) => (
                                      <ExceptionRow
                                        key={date}
                                        date={date}
                                        entries={exceptions[date]}
                                      />
                                    ))}
                                  </YStack>
                                ) : null}
                              </YStack>
                            )
                          })()
                        : null}
                    </YStack>
                  ) : null}
                </YStack>
              )
            })
          )}
        </YStack>
      </ScrollView>

      {/* Full list modal */}
      {listModal ? (
        <FullListModal
          title={listModal.label}
          users={listModal.users}
          color={listModal.color}
          onClose={() => setListModal(null)}
        />
      ) : null}
    </YStack>
  )
}

const styles = StyleSheet.create({
  search: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    padding: 20,
  },
})
