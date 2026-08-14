import { useState } from 'react'
import { Pressable, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { sameId } from '@/lib/ids'
import type { LodgingEntry, EventTeam } from '@/types/events'
import type { UserProfile } from '@/types/user'

interface GroupDoc {
  id: string
  name: string
  members: string[]
}

interface LodgingEditorProps {
  entries: LodgingEntry[]
  onChange: (entries: LodgingEntry[]) => void
  assignedUids: Set<string>
  allUsers: UserProfile[]
  teams: EventTeam[]
  assignedGroups: GroupDoc[]
}

function getName(uid: string, allUsers: UserProfile[]) {
  const u = allUsers.find((u) => sameId(u.uid, uid))
  return u?.displayName || u?.email || uid
}

export function LodgingEditor({
  entries,
  onChange,
  assignedUids,
  allUsers,
  teams,
  assignedGroups,
}: LodgingEditorProps) {
  const colors = useThemeColors()
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const allAssignedArr = [...assignedUids]

  // UIDs already placed in any entry
  const placedAll = new Set(entries.flatMap((e) => e.assignees))

  // UIDs in the event but not placed anywhere
  const unassigned = allAssignedArr.filter((uid) => !placedAll.has(uid))

  const updateEntry = (idx: number, patch: Partial<LodgingEntry>) =>
    onChange(entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)))

  const removeEntry = (idx: number) => {
    onChange(entries.filter((_, i) => i !== idx))
    if (expandedIdx === idx) setExpandedIdx(null)
  }

  const addEntry = () => {
    onChange([...entries, { id: Date.now().toString(), name: '', room: '', assignees: [] }])
    setExpandedIdx(entries.length)
  }

  const toggleAssignee = (idx: number, uid: string) => {
    const entry = entries[idx]
    const has = entry.assignees.includes(uid)
    updateEntry(idx, {
      assignees: has ? entry.assignees.filter((a) => a !== uid) : [...entry.assignees, uid],
    })
  }

  const addBulk = (idx: number, uids: string[]) => {
    const entry = entries[idx]
    // Only add UIDs that are in the event and not already placed elsewhere
    const placedElsewhere = new Set(entries.flatMap((e, i) => (i === idx ? [] : e.assignees)))
    const toAdd = uids.filter(
      (uid) => assignedUids.has(uid) && !placedElsewhere.has(uid) && !entry.assignees.includes(uid)
    )
    if (toAdd.length === 0) return
    updateEntry(idx, { assignees: [...entry.assignees, ...toAdd] })
  }

  return (
    <YStack gap="$3">
      {entries.map((entry, idx) => {
        const placedElsewhere = new Set(entries.flatMap((e, i) => (i === idx ? [] : e.assignees)))
        const isExpanded = expandedIdx === idx
        const q = search.trim().toLowerCase()
        const searchResults = q
          ? allUsers
              .filter(
                (u) =>
                  assignedUids.has(String(u.uid)) &&
                  !placedElsewhere.has(String(u.uid)) &&
                  ((u.displayName ?? '').toLowerCase().includes(q) ||
                    (u.email ?? '').toLowerCase().includes(q))
              )
              .slice(0, 10)
          : []

        return (
          <YStack
            key={entry.id}
            gap="$2"
            backgroundColor={colors.surface}
            borderRadius="$2"
            padding="$3"
            borderWidth={1}
            borderColor={colors.border}
          >
            {/* Name + Room row */}
            <XStack gap="$2" alignItems="center">
              <TextInput
                style={[
                  styles.input,
                  {
                    flex: 2,
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
                value={entry.name}
                onChangeText={(v) => updateEntry(idx, { name: v })}
                placeholder="Hotel / Lodging name"
                placeholderTextColor={colors.textMuted}
              />
              <TextInput
                style={[
                  styles.input,
                  {
                    flex: 1,
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
                value={entry.room ?? ''}
                onChangeText={(v) => updateEntry(idx, { room: v })}
                placeholder="Room / Location"
                placeholderTextColor={colors.textMuted}
              />
              <Pressable onPress={() => removeEntry(idx)}>
                <Text color="$red10" fontSize="$4">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            {/* Assigned chips */}
            {entry.assignees.length > 0 && (
              <XStack flexWrap="wrap" gap="$1">
                {entry.assignees.map((uid) => (
                  <Pressable key={uid} onPress={() => toggleAssignee(idx, uid)}>
                    <XStack
                      backgroundColor={colors.primary + '22'}
                      borderWidth={1}
                      borderColor={colors.primary}
                      borderRadius={99}
                      paddingHorizontal="$2"
                      paddingVertical="$0.5"
                      gap="$1"
                      alignItems="center"
                    >
                      <Text color={colors.primary} fontSize="$2">
                        {getName(uid, allUsers)}
                      </Text>
                      <Text color={colors.primary} fontSize={10}>
                        ✕
                      </Text>
                    </XStack>
                  </Pressable>
                ))}
              </XStack>
            )}

            {/* Expand/collapse picker */}
            <Pressable
              onPress={() => {
                setExpandedIdx(isExpanded ? null : idx)
                setSearch('')
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
                <Text color={colors.primary} fontSize="$2">
                  {isExpanded ? 'Done adding' : '+ Add people'}
                </Text>
              </XStack>
            </Pressable>

            {isExpanded && (
              <YStack gap="$2" paddingTop="$1">
                {/* Quick-add buttons */}
                <XStack flexWrap="wrap" gap="$1">
                  <Pressable onPress={() => addBulk(idx, allAssignedArr)}>
                    <XStack
                      borderWidth={1}
                      borderColor={colors.border}
                      borderRadius={99}
                      paddingHorizontal="$2"
                      paddingVertical="$0.5"
                    >
                      <Text fontSize="$2" color={colors.text}>
                        All event attendees
                      </Text>
                    </XStack>
                  </Pressable>
                  {teams.map((t) => {
                    const teamUids = [...t.members, ...t.leaders].map(String)
                    return (
                      <Pressable key={t.name} onPress={() => addBulk(idx, teamUids)}>
                        <XStack
                          borderWidth={1}
                          borderColor={colors.border}
                          borderRadius={99}
                          paddingHorizontal="$2"
                          paddingVertical="$0.5"
                        >
                          <Text fontSize="$2" color={colors.text}>
                            Team: {t.name}
                          </Text>
                        </XStack>
                      </Pressable>
                    )
                  })}
                  {assignedGroups.map((g) => (
                    <Pressable key={g.id} onPress={() => addBulk(idx, g.members)}>
                      <XStack
                        borderWidth={1}
                        borderColor={colors.border}
                        borderRadius={99}
                        paddingHorizontal="$2"
                        paddingVertical="$0.5"
                      >
                        <Text fontSize="$2" color={colors.text}>
                          Group: {g.name}
                        </Text>
                      </XStack>
                    </Pressable>
                  ))}
                </XStack>

                {/* Individual search */}
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search people…"
                  placeholderTextColor={colors.textMuted}
                />
                {searchResults.map((u) => {
                  const uid = String(u.uid)
                  const isSel = entry.assignees.includes(uid)
                  return (
                    <Pressable key={uid} onPress={() => toggleAssignee(idx, uid)}>
                      <XStack
                        padding="$2"
                        borderRadius="$2"
                        backgroundColor={isSel ? colors.primary + '22' : 'transparent'}
                        alignItems="center"
                        gap="$2"
                      >
                        <Text flex={1} fontSize="$3" color={colors.text}>
                          {u.displayName || u.email || uid}
                        </Text>
                        {isSel && (
                          <Text color={colors.primary} fontSize="$3">
                            ✓
                          </Text>
                        )}
                      </XStack>
                    </Pressable>
                  )
                })}
              </YStack>
            )}
          </YStack>
        )
      })}

      {/* Add another entry */}
      <Pressable onPress={addEntry}>
        <XStack
          borderWidth={1}
          borderColor={colors.primary}
          borderRadius="$2"
          paddingHorizontal="$3"
          paddingVertical="$2"
          alignSelf="flex-start"
        >
          <Text color={colors.primary} fontSize="$3">
            + Add location
          </Text>
        </XStack>
      </Pressable>

      {/* Unassigned tracker */}
      {unassigned.length > 0 && (
        <XStack
          gap="$2"
          alignItems="flex-start"
          backgroundColor="#e67e2222"
          borderWidth={1}
          borderColor="#e67e22"
          borderRadius="$2"
          padding="$2"
        >
          <Text fontSize="$3">⚠</Text>
          <YStack flex={1}>
            <Text fontSize="$2" color="#e67e22" fontWeight="700">
              {unassigned.length} person{unassigned.length !== 1 ? 's' : ''} not yet assigned to
              lodging:
            </Text>
            <Text fontSize="$2" color="#e67e22">
              {unassigned.map((uid) => getName(uid, allUsers)).join(', ')}
            </Text>
          </YStack>
        </XStack>
      )}
    </YStack>
  )
}

const styles = StyleSheet.create({
  input: {
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
  },
})
