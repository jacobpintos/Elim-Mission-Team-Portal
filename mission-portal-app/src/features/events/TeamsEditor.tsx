import { useState } from 'react'
import { Pressable } from 'react-native'
import { YStack, XStack, Text, Input } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { sameId } from '@/lib/ids'
import { confirmAsync } from '@/lib/confirm'
import { AVAIL_COLORS, AVAIL_LABELS, availPickRank } from '@/lib/availability'
import type { EventTeam, CommonTeam, AvailResponse } from '@/types/events'
import type { UserProfile } from '@/types/user'

interface TeamsEditorProps {
  teams: EventTeam[]
  onChange: (teams: EventTeam[]) => void
  assignedUids: Set<string>
  allUsers: UserProfile[]
  commonTeams: CommonTeam[]
  /**
   * What each person said about this event's availability, or null when they
   * have not answered. Leaders assign roles from people's answers, so the
   * answer is shown where the assigning happens rather than on a screen of its
   * own they would have to keep checking against.
   */
  availOf?: (uid: string) => AvailResponse['status'] | null
}

export function TeamsEditor({
  teams,
  onChange,
  assignedUids,
  allUsers,
  commonTeams,
  availOf = () => null,
}: TeamsEditorProps) {
  const colors = useThemeColors()
  const [pickerIdx, setPickerIdx] = useState<number | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [showCommon, setShowCommon] = useState(false)

  const updateTeam = (idx: number, patch: Partial<EventTeam>) =>
    onChange(teams.map((t, i) => (i === idx ? { ...t, ...patch } : t)))

  const removeMember = (teamIdx: number, uid: string) =>
    updateTeam(teamIdx, {
      members: teams[teamIdx].members.filter((m) => !sameId(m, uid)),
    })

  const addMember = async (teamIdx: number, uid: string) => {
    if (teams[teamIdx].members.some((m) => sameId(m, uid))) return
    // Asked, not refused: a leader may know something the answer does not —
    // that the person has since changed their plans, say.
    if (availOf(uid) === 'no') {
      const ok = await confirmAsync(`${getName(uid)} said they are not available for this event.`, {
        title: 'Not available',
        confirmLabel: 'Add anyway',
      })
      if (!ok) return
    }
    updateTeam(teamIdx, { members: [...teams[teamIdx].members, uid] })
  }

  const addFromCommon = (ct: CommonTeam) => {
    onChange([...teams, { name: ct.name, leaders: [], members: ct.members }])
    setShowCommon(false)
  }

  const getName = (uid: string | number) =>
    allUsers.find((u) => sameId(u.uid, uid))?.displayName ??
    allUsers.find((u) => sameId(u.uid, uid))?.email ??
    String(uid)

  return (
    <YStack gap="$2">
      <Text color={colors.text} fontSize="$3" fontWeight="600">
        Teams
      </Text>

      {teams.map((team, idx) => {
        const isPickingThis = pickerIdx === idx
        const searchResults = allUsers
          .filter(
            (u) =>
              !team.members.some((m) => sameId(m, u.uid)) &&
              (pickerSearch.trim()
                ? (u.displayName ?? '').toLowerCase().includes(pickerSearch.toLowerCase())
                : true)
          )
          // Available people first, those who said no last. A stable sort, so
          // within an answer people keep the order the directory has them in.
          .sort((a, b) => availPickRank(availOf(a.uid)) - availPickRank(availOf(b.uid)))
          .slice(0, 8)

        return (
          <YStack
            key={idx}
            borderWidth={1}
            borderColor={colors.border}
            borderRadius="$2"
            padding="$3"
            gap="$2"
          >
            <XStack gap="$2" alignItems="center">
              <Input
                flex={1}
                value={team.name}
                onChangeText={(v) => updateTeam(idx, { name: v })}
                placeholder="Team name"
                backgroundColor={colors.surface}
                color={colors.text}
                borderColor={colors.border}
                size="$3"
              />
              <Pressable onPress={() => onChange(teams.filter((_, i) => i !== idx))}>
                <Text color="$red10" fontSize="$3">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            {team.members.length > 0 && (
              <XStack flexWrap="wrap" gap="$1">
                {team.members.map((m) => {
                  const uidStr = String(m)
                  const assigned = assignedUids.has(uidStr)
                  const status = availOf(uidStr)
                  return (
                    <Pressable key={uidStr} onPress={() => removeMember(idx, uidStr)}>
                      <XStack
                        borderWidth={1}
                        borderColor={assigned ? colors.primary : '#d4a017'}
                        backgroundColor={assigned ? colors.primary + '22' : '#d4a01722'}
                        borderRadius={99}
                        paddingHorizontal="$2"
                        paddingVertical="$1"
                        gap="$1"
                        alignItems="center"
                      >
                        {status ? (
                          <AvailDot status={status} />
                        ) : null}
                        <Text color={assigned ? colors.primary : '#d4a017'} fontSize="$2">
                          {getName(m)}
                        </Text>
                        <Text color={assigned ? colors.primary : '#d4a017'} fontSize="$1">
                          ✕
                        </Text>
                      </XStack>
                    </Pressable>
                  )
                })}
              </XStack>
            )}

            {isPickingThis ? (
              <YStack
                borderWidth={1}
                borderColor={colors.primary}
                borderRadius="$2"
                padding="$2"
                backgroundColor={colors.background}
                gap="$1"
              >
                <Input
                  value={pickerSearch}
                  onChangeText={setPickerSearch}
                  placeholder="Search members…"
                  backgroundColor={colors.surface}
                  color={colors.text}
                  borderColor={colors.border}
                  size="$3"
                />
                {searchResults.map((u) => {
                  const status = availOf(u.uid)
                  return (
                    <Pressable
                      key={u.uid}
                      onPress={() => {
                        addMember(idx, u.uid)
                        setPickerSearch('')
                      }}
                    >
                      <XStack
                        padding="$2"
                        borderRadius="$1"
                        backgroundColor={colors.surface}
                        alignItems="center"
                        gap="$2"
                      >
                        <Text color={colors.text} fontSize="$3" flex={1}>
                          {u.displayName ?? u.email ?? u.uid}
                        </Text>
                        <Text
                          color={status ? AVAIL_COLORS[status] : colors.textMuted}
                          fontSize="$2"
                          fontWeight={status ? '600' : '400'}
                        >
                          {status ? AVAIL_LABELS[status] : 'No answer'}
                        </Text>
                      </XStack>
                    </Pressable>
                  )
                })}
                <Pressable onPress={() => setPickerIdx(null)}>
                  <Text color={colors.textMuted} fontSize="$2" textAlign="right">
                    Done
                  </Text>
                </Pressable>
              </YStack>
            ) : (
              <Pressable
                onPress={() => {
                  setPickerIdx(idx)
                  setPickerSearch('')
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
                    + Add member
                  </Text>
                </XStack>
              </Pressable>
            )}
          </YStack>
        )
      })}

      <XStack gap="$2" flexWrap="wrap">
        <Pressable onPress={() => onChange([...teams, { name: '', leaders: [], members: [] }])}>
          <XStack
            borderWidth={1}
            borderColor={colors.primary}
            borderRadius="$2"
            paddingHorizontal="$3"
            paddingVertical="$2"
          >
            <Text color={colors.primary} fontSize="$3">
              + New Team
            </Text>
          </XStack>
        </Pressable>

        {commonTeams.length > 0 && (
          <Pressable onPress={() => setShowCommon((s) => !s)}>
            <XStack
              borderWidth={1}
              borderColor={colors.border}
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$2"
            >
              <Text color={colors.text} fontSize="$3">
                + From Common Teams
              </Text>
            </XStack>
          </Pressable>
        )}
      </XStack>

      {showCommon && (
        <YStack
          borderWidth={1}
          borderColor={colors.border}
          borderRadius="$2"
          backgroundColor={colors.surface}
          overflow="hidden"
        >
          {commonTeams.filter((ct) => !teams.some((t) => t.name === ct.name)).length > 0 ? (
            commonTeams
              .filter((ct) => !teams.some((t) => t.name === ct.name))
              .map((ct) => (
                <Pressable key={ct.name} onPress={() => addFromCommon(ct)}>
                  <XStack padding="$3" borderBottomWidth={1} borderBottomColor={colors.border}>
                    <YStack>
                      <Text color={colors.text} fontSize="$3">
                        {ct.name}
                      </Text>
                      {ct.members.length > 0 && (
                        <Text color={colors.textMuted} fontSize="$2">
                          {ct.members.length} member{ct.members.length !== 1 ? 's' : ''}
                        </Text>
                      )}
                    </YStack>
                  </XStack>
                </Pressable>
              ))
          ) : (
            <XStack padding="$3">
              <Text color={colors.textMuted} fontSize="$3">
                All common teams already added.
              </Text>
            </XStack>
          )}
        </YStack>
      )}

      {teams.length === 0 && (
        <Text color={colors.textMuted} fontSize="$2">
          No teams yet.
        </Text>
      )}
    </YStack>
  )
}

/** A person's answer as a coloured dot, for the chips where a label won't fit. */
function AvailDot({ status }: { status: AvailResponse['status'] }) {
  return (
    <XStack
      width={8}
      height={8}
      borderRadius={99}
      backgroundColor={AVAIL_COLORS[status]}
      accessibilityLabel={AVAIL_LABELS[status]}
    />
  )
}
