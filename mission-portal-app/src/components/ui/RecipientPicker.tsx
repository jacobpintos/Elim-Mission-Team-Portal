import { useMemo, useState } from 'react'
import { TextInput, Pressable, ScrollView, View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'

interface UserLike {
  uid: string | number
  displayName?: string
  email?: string
}

interface GroupLike {
  id: string | number
  name: string
  members: string[]
}

interface RecipientPickerProps {
  users: UserLike[]
  groups?: GroupLike[]
  /** Selected user ids. */
  value: string[]
  onChange: (uids: string[]) => void
  placeholder?: string
}

/**
 * Search-driven recipient selector. Replaces long manual checkbox lists: type
 * to filter people (by name or email) and groups live; tap a person to toggle
 * them, tap a group to add all its members. Selected recipients show as
 * removable chips. Groups are expanded to member ids on selection, so callers
 * still receive a flat list of user ids.
 */
export function RecipientPicker({
  users,
  groups = [],
  value,
  onChange,
  placeholder,
}: RecipientPickerProps) {
  const colors = useThemeColors()
  const [query, setQuery] = useState('')

  const selectedSet = useMemo(() => new Set(value.map(String)), [value])
  const userById = useMemo(() => {
    const m = new Map<string, UserLike>()
    users.forEach((u) => m.set(String(u.uid), u))
    return m
  }, [users])

  const q = query.trim().toLowerCase()
  const matchingGroups = q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups
  const matchingUsers = q
    ? users.filter(
        (u) =>
          (u.displayName ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q)
      )
    : users

  const nameFor = (uid: string) => {
    const u = userById.get(uid)
    return u?.displayName || u?.email || uid
  }

  const toggleUser = (uid: string) => {
    const next = new Set(selectedSet)
    if (next.has(uid)) next.delete(uid)
    else next.add(uid)
    onChange(Array.from(next))
  }

  const addGroup = (g: GroupLike) => {
    const next = new Set(selectedSet)
    g.members.forEach((m) => next.add(String(m)))
    onChange(Array.from(next))
  }

  return (
    <YStack gap="$2">
      {/* Selected chips */}
      {value.length > 0 ? (
        <XStack flexWrap="wrap" gap="$1.5">
          {value.map((uid) => (
            <Pressable key={uid} onPress={() => toggleUser(uid)}>
              <XStack
                backgroundColor={colors.primary + '22'}
                borderRadius="$4"
                paddingHorizontal="$2.5"
                paddingVertical="$1"
                gap="$1.5"
                alignItems="center"
              >
                <Text color={colors.primary} fontSize={12} numberOfLines={1}>
                  {nameFor(uid)}
                </Text>
                <Text color={colors.primary} fontSize={11}>
                  ✕
                </Text>
              </XStack>
            </Pressable>
          ))}
        </XStack>
      ) : null}

      {/* Search box */}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder ?? 'Search people or groups…'}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          color: colors.text,
          backgroundColor: colors.background,
          fontSize: 14,
        }}
      />

      {/* Live results */}
      <ScrollView
        style={{ maxHeight: 220 }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {matchingGroups.length > 0 ? (
          <YStack>
            <Text color={colors.textMuted} fontSize={11} fontWeight="700" paddingVertical="$1">
              GROUPS
            </Text>
            {matchingGroups.map((g) => {
              const count = g.members.length
              const allSelected = count > 0 && g.members.every((m) => selectedSet.has(String(m)))
              return (
                <Pressable key={String(g.id)} onPress={() => addGroup(g)}>
                  <XStack
                    paddingVertical="$2"
                    paddingHorizontal="$2"
                    gap="$2"
                    alignItems="center"
                    borderBottomWidth={1}
                    borderBottomColor={colors.border}
                  >
                    <Text fontSize={14}>👥</Text>
                    <Text color={colors.text} fontSize={13} flex={1} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text color={allSelected ? colors.primary : colors.textMuted} fontSize={11}>
                      {allSelected ? 'All added' : `+ ${count}`}
                    </Text>
                  </XStack>
                </Pressable>
              )
            })}
          </YStack>
        ) : null}

        <Text color={colors.textMuted} fontSize={11} fontWeight="700" paddingVertical="$1">
          PEOPLE
        </Text>
        {matchingUsers.map((u) => {
          const uid = String(u.uid)
          const selected = selectedSet.has(uid)
          return (
            <Pressable key={uid} onPress={() => toggleUser(uid)}>
              <XStack
                paddingVertical="$2"
                paddingHorizontal="$2"
                gap="$2"
                alignItems="center"
                borderBottomWidth={1}
                borderBottomColor={colors.border}
                backgroundColor={selected ? colors.primary + '18' : 'transparent'}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primary : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected ? (
                    <Text color="white" fontSize={11}>
                      ✓
                    </Text>
                  ) : null}
                </View>
                <Text color={colors.text} fontSize={13} flex={1} numberOfLines={1}>
                  {u.displayName || u.email || uid}
                </Text>
              </XStack>
            </Pressable>
          )
        })}
        {matchingUsers.length === 0 && matchingGroups.length === 0 ? (
          <Text color={colors.textMuted} fontSize={12} paddingVertical="$2">
            No matches
          </Text>
        ) : null}
      </ScrollView>
    </YStack>
  )
}
