import { useEffect, useState } from 'react'
import { Pressable, ScrollView, TextInput, View } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useUIStore } from '@/stores/uiStore'
import { useUsersStore } from '@/stores/usersStore'
import { MemberPicker } from '@/features/admin/MemberPicker'
import { DAY_NAMES, newItemId, tidied, type Checklist, type ChecklistItem } from './checklist'
import { saveChecklist } from './preServiceDb'

/**
 * Building the Pre-service Checklist (admins; ./PreServiceChecklist): the
 * days services are on, and each item, with its heading and the people it's
 * given to, in order. Nothing is saved until Save.
 */
export function ChecklistEditor({
  list,
  uid,
  onDone,
}: {
  list: Checklist
  uid: string
  onDone: () => void
}) {
  const colors = useThemeColors()
  const { toast } = useUIStore()
  const users = useUsersStore((s) => s.users)
  const [draft, setDraft] = useState<Checklist>(() => ({
    items: list.items.map((i) => ({ ...i, assignees: [...i.assignees] })),
    serviceDays: [...list.serviceDays],
  }))
  // The item whose people are being chosen.
  const [choosing, setChoosing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    useUsersStore.getState().subscribe()
    return () => useUsersStore.getState().unsubscribe()
  }, [])

  const nameOf = (u: string) =>
    users.find((p) => String(p.uid) === u)?.displayName ?? 'Removed account'

  const change = (id: string, patch: Partial<ChecklistItem>) =>
    setDraft((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
  const move = (index: number, by: -1 | 1) =>
    setDraft((d) => {
      const to = index + by
      if (to < 0 || to >= d.items.length) return d
      const items = [...d.items]
      ;[items[index], items[to]] = [items[to], items[index]]
      return { ...d, items }
    })
  const remove = (id: string) => {
    setDraft((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }))
    if (choosing === id) setChoosing(null)
  }
  const add = () => {
    const last = draft.items.at(-1)
    const item: ChecklistItem = {
      id: newItemId(),
      text: '',
      // Under the same heading as the one before it, the usual next one.
      section: last?.section ?? '',
      order: draft.items.length,
      assignees: [],
    }
    setDraft((d) => ({ ...d, items: [...d.items, item] }))
  }
  const toggleDay = (day: number) =>
    setDraft((d) => {
      const has = d.serviceDays.includes(day)
      // At least one: a checklist is for some service.
      if (has && d.serviceDays.length === 1) return d
      return {
        ...d,
        serviceDays: has ? d.serviceDays.filter((x) => x !== day) : [...d.serviceDays, day],
      }
    })

  const save = async () => {
    setSaving(true)
    try {
      await saveChecklist(tidied(draft), uid)
      onDone()
    } catch {
      toast('The checklist didn’t save. Try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const input = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
    backgroundColor: colors.background,
  } as const
  const small = (label: string, onPress: () => void, disabled = false) => (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6}>
      <Text color={disabled ? colors.border : colors.primary} fontWeight="700" fontSize="$2">
        {label}
      </Text>
    </Pressable>
  )
  const button = (label: string, onPress: () => void, filled: boolean, disabled = false) => (
    <Pressable onPress={onPress} disabled={disabled}>
      <View
        style={{
          minHeight: 40,
          borderRadius: 8,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.primary,
          backgroundColor: filled ? colors.primary : 'transparent',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text color={filled ? 'white' : colors.primary} fontWeight="700">
          {label}
        </Text>
      </View>
    </Pressable>
  )

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <YStack padding="$4" gap="$4">
        <Text fontSize="$6" fontWeight="700" color={colors.text}>
          Build the checklist
        </Text>

        <YStack gap="$2">
          <Text color={colors.textMuted} fontSize="$2">
            Services are on (the list starts fresh for each one):
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            {DAY_NAMES.map((name, day) => {
              const on = draft.serviceDays.includes(day)
              return (
                <Pressable
                  key={name}
                  onPress={() => toggleDay(day)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <View
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 99,
                      borderWidth: 1,
                      borderColor: on ? colors.primary : colors.border,
                      backgroundColor: on ? colors.primary : colors.surface,
                    }}
                  >
                    <Text color={on ? 'white' : colors.textMuted} fontWeight={on ? '700' : '400'}>
                      {name.slice(0, 3)}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </XStack>
        </YStack>

        {draft.items.map((item, index) => (
          <YStack
            key={item.id}
            gap="$2"
            padding="$3"
            borderRadius="$3"
            borderWidth={1}
            borderColor={colors.border}
            backgroundColor={colors.surface}
          >
            <TextInput
              style={input}
              value={item.text}
              onChangeText={(text) => change(item.id, { text })}
              placeholder="What has to be done"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={input}
              value={item.section}
              onChangeText={(section) => change(item.id, { section })}
              placeholder="Heading, if any (Sound, Stage…)"
              placeholderTextColor={colors.textMuted}
            />
            <Text color={colors.textMuted} fontSize="$2">
              {item.assignees.length
                ? `Given to ${item.assignees.map(nameOf).join(', ')}`
                : 'Not given to anyone: an admin checks it.'}
            </Text>
            {choosing === item.id ? (
              <MemberPicker
                selected={item.assignees}
                onChange={(assignees) => change(item.id, { assignees })}
              />
            ) : null}
            <XStack gap="$4" flexWrap="wrap">
              {small(choosing === item.id ? 'Done choosing' : 'Choose people', () =>
                setChoosing(choosing === item.id ? null : item.id)
              )}
              {small('Move up', () => move(index, -1), index === 0)}
              {small('Move down', () => move(index, 1), index === draft.items.length - 1)}
              {small('Remove', () => remove(item.id))}
            </XStack>
          </YStack>
        ))}

        {button('+ Add an item', add, false)}

        <XStack gap="$2">
          {button(saving ? 'Saving…' : 'Save', () => void save(), true, saving)}
          {button('Cancel', onDone, false, saving)}
        </XStack>
      </YStack>
    </ScrollView>
  )
}
