import { useState } from 'react'
import { ScrollView, Pressable } from 'react-native'
import { XStack, YStack, Text, Input } from 'tamagui'
import { useUsersStore } from '@/stores/usersStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { groupDisplayName } from '@/lib/roles'

interface MemberAndGroupPickerProps {
  selectedUsers: string[]
  onUsersChange: (uids: string[]) => void
  selectedGroups: string[]
  onGroupsChange: (gids: string[]) => void
  label?: string
}

type Tab = 'people' | 'groups'

export function MemberAndGroupPicker({
  selectedUsers,
  onUsersChange,
  selectedGroups,
  onGroupsChange,
  label,
}: MemberAndGroupPickerProps) {
  const [tab, setTab] = useState<Tab>('people')
  const [search, setSearch] = useState('')
  const { users } = useUsersStore()
  const { groups } = useGroupsStore()

  const safeUsers = selectedUsers ?? []
  const safeGroups = selectedGroups ?? []

  const q = search.trim().toLowerCase()
  const filteredUsers = q
    ? users.filter(
        (u) =>
          (u.displayName ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q)
      )
    : users

  const filteredGroups = q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups

  const toggleUser = (uid: string) => {
    onUsersChange(
      safeUsers.includes(uid) ? safeUsers.filter((id) => id !== uid) : [...safeUsers, uid]
    )
  }

  const toggleGroup = (gid: string) => {
    onGroupsChange(
      safeGroups.includes(gid) ? safeGroups.filter((id) => id !== gid) : [...safeGroups, gid]
    )
  }

  const selectedUserObjs = users.filter((u) => safeUsers.includes(u.uid))
  const selectedGroupObjs = groups.filter((g) => safeGroups.includes(g.id))
  const hasSelection = selectedUserObjs.length > 0 || selectedGroupObjs.length > 0

  return (
    <YStack gap="$2">
      {label ? (
        <Text fontWeight="600" fontSize="$3">
          {label}
        </Text>
      ) : null}

      {/* Selected chips */}
      {hasSelection ? (
        <XStack flexWrap="wrap" gap="$1">
          {selectedUserObjs.map((u) => (
            <XStack
              key={u.uid}
              backgroundColor="$primary"
              borderRadius="$6"
              paddingHorizontal="$2"
              paddingVertical="$1"
              alignItems="center"
              gap="$1"
            >
              <Text color="white" fontSize="$2">
                {u.displayName || u.email || u.uid}
              </Text>
              <Pressable onPress={() => toggleUser(u.uid)}>
                <Text color="white" fontSize="$2" fontWeight="700">
                  ×
                </Text>
              </Pressable>
            </XStack>
          ))}
          {selectedGroupObjs.map((g) => (
            <XStack
              key={g.id}
              backgroundColor="$blue9"
              borderRadius="$6"
              paddingHorizontal="$2"
              paddingVertical="$1"
              alignItems="center"
              gap="$1"
            >
              <Text color="white" fontSize="$2">
                ⬡ {groupDisplayName(g.name)}
              </Text>
              <Pressable onPress={() => toggleGroup(g.id)}>
                <Text color="white" fontSize="$2" fontWeight="700">
                  ×
                </Text>
              </Pressable>
            </XStack>
          ))}
        </XStack>
      ) : null}

      {/* Tab toggle */}
      <XStack
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius="$2"
        overflow="hidden"
        alignSelf="flex-start"
      >
        {(['people', 'groups'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => {
              setTab(t)
              setSearch('')
            }}
          >
            <XStack
              paddingHorizontal="$3"
              paddingVertical="$1"
              backgroundColor={tab === t ? '$blue9' : 'transparent'}
            >
              <Text
                fontSize="$2"
                color={tab === t ? 'white' : '$gray10'}
                fontWeight={tab === t ? '700' : '400'}
              >
                {t === 'people' ? 'People' : 'Groups'}
              </Text>
            </XStack>
          </Pressable>
        ))}
      </XStack>

      <Input
        placeholder={tab === 'people' ? 'Search people…' : 'Search groups…'}
        value={search}
        onChangeText={setSearch}
        size="$3"
      />

      {!q ? null : (
        <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
          {tab === 'people'
            ? filteredUsers.slice(0, 50).map((u) => {
                const isSel = safeUsers.includes(u.uid)
                return (
                  <Pressable key={u.uid} onPress={() => toggleUser(u.uid)}>
                    <XStack
                      padding="$2"
                      borderRadius="$2"
                      backgroundColor={isSel ? '$primary' : 'transparent'}
                      alignItems="center"
                      gap="$2"
                    >
                      <YStack
                        width={28}
                        height={28}
                        borderRadius={14}
                        backgroundColor={isSel ? 'rgba(255,255,255,0.3)' : '$gray5'}
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text fontSize="$1" fontWeight="700" color={isSel ? 'white' : '$gray11'}>
                          {(u.displayName || u.email || u.uid).slice(0, 2).toUpperCase()}
                        </Text>
                      </YStack>
                      <YStack flex={1}>
                        <Text fontSize="$3" color={isSel ? 'white' : '$color'}>
                          {u.displayName || u.email || u.uid}
                        </Text>
                        <Text fontSize="$2" color={isSel ? 'rgba(255,255,255,0.7)' : '$gray10'}>
                          {u.email ?? ''}
                        </Text>
                      </YStack>
                      {isSel ? (
                        <Text color="white" fontSize="$3">
                          ✓
                        </Text>
                      ) : null}
                    </XStack>
                  </Pressable>
                )
              })
            : filteredGroups.map((g) => {
                const isSel = safeGroups.includes(g.id)
                return (
                  <Pressable key={g.id} onPress={() => toggleGroup(g.id)}>
                    <XStack
                      padding="$2"
                      borderRadius="$2"
                      backgroundColor={isSel ? '$blue9' : 'transparent'}
                      alignItems="center"
                      gap="$2"
                    >
                      <YStack
                        width={28}
                        height={28}
                        borderRadius={14}
                        backgroundColor={isSel ? 'rgba(255,255,255,0.3)' : '$gray5'}
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text fontSize="$1" fontWeight="700" color={isSel ? 'white' : '$gray11'}>
                          ⬡
                        </Text>
                      </YStack>
                      <YStack flex={1}>
                        <Text fontSize="$3" color={isSel ? 'white' : '$color'}>
                          {groupDisplayName(g.name)}
                        </Text>
                        <Text fontSize="$2" color={isSel ? 'rgba(255,255,255,0.7)' : '$gray10'}>
                          {g.members.length} member{g.members.length !== 1 ? 's' : ''}
                        </Text>
                      </YStack>
                      {isSel ? (
                        <Text color="white" fontSize="$3">
                          ✓
                        </Text>
                      ) : null}
                    </XStack>
                  </Pressable>
                )
              })}
          {tab === 'people' && filteredUsers.length === 0 ? (
            <Text padding="$2" color="$gray10" fontSize="$3">
              No people found
            </Text>
          ) : null}
          {tab === 'groups' && filteredGroups.length === 0 ? (
            <Text padding="$2" color="$gray10" fontSize="$3">
              No groups found
            </Text>
          ) : null}
        </ScrollView>
      )}
    </YStack>
  )
}
