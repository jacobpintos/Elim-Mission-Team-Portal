import { useState } from 'react'
import { ScrollView, Pressable } from 'react-native'
import { XStack, YStack, Text, Input, Button } from 'tamagui'
import { useUsersStore } from '@/stores/usersStore'
import type { UserProfile } from '@/types/user'

interface MemberPickerProps {
  selected: string[]
  onChange: (uids: string[]) => void
  label?: string
}

export function MemberPicker({ selected, onChange, label }: MemberPickerProps) {
  const [search, setSearch] = useState('')
  const { users } = useUsersStore()
  const safeSelected = Array.isArray(selected) ? selected.map(String) : []

  const nonPublic = users.filter((u) => !u.roles?.includes('public'))

  const filtered = search.trim()
    ? nonPublic.filter(
        (u) =>
          (u.displayName ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (u.email ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : nonPublic

  const toggle = (uid: string) => {
    if (safeSelected.includes(uid)) onChange(safeSelected.filter((id) => id !== uid))
    else onChange([...safeSelected, uid])
  }

  const removeSelected = (uid: string) => {
    onChange(safeSelected.filter((id) => id !== uid))
  }

  const selectedUsers = nonPublic.filter((u) => safeSelected.includes(u.uid))

  return (
    <YStack gap="$2">
      {label && (
        <Text fontWeight="600" fontSize="$3">
          {label}
        </Text>
      )}

      {/* Selected chips */}
      {selectedUsers.length > 0 && (
        <XStack flexWrap="wrap" gap="$1">
          {selectedUsers.map((u) => (
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
              <Pressable onPress={() => removeSelected(u.uid)}>
                <Text color="white" fontSize="$2" fontWeight="700">
                  ×
                </Text>
              </Pressable>
            </XStack>
          ))}
        </XStack>
      )}

      {/* Search input */}
      <Input placeholder="Search users..." value={search} onChangeText={setSearch} size="$3" />

      {/* User list */}
      <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
        {filtered.slice(0, 50).map((u) => {
          const isSelected = safeSelected.includes(u.uid)
          return (
            <Pressable key={u.uid} onPress={() => toggle(u.uid)}>
              <XStack
                padding="$2"
                borderRadius="$2"
                backgroundColor={isSelected ? '$primary' : 'transparent'}
                alignItems="center"
                gap="$2"
              >
                <YStack
                  width={32}
                  height={32}
                  borderRadius={16}
                  backgroundColor={isSelected ? 'rgba(255,255,255,0.3)' : '$gray5'}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize="$2" fontWeight="700" color={isSelected ? 'white' : '$gray11'}>
                    {(u.displayName || u.email || u.uid).slice(0, 2).toUpperCase()}
                  </Text>
                </YStack>
                <YStack flex={1}>
                  <Text fontSize="$3" color={isSelected ? 'white' : '$color'}>
                    {u.displayName || u.email || u.uid}
                  </Text>
                  <Text fontSize="$2" color={isSelected ? 'rgba(255,255,255,0.7)' : '$gray10'}>
                    {u.email ?? ''}
                  </Text>
                </YStack>
                {isSelected && (
                  <Text color="white" fontSize="$3">
                    ✓
                  </Text>
                )}
              </XStack>
            </Pressable>
          )
        })}
        {filtered.length === 0 && (
          <Text padding="$2" color="$gray10" fontSize="$3">
            No users found
          </Text>
        )}
      </ScrollView>
    </YStack>
  )
}
