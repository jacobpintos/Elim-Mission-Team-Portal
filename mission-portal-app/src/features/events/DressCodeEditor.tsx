import { useState } from 'react'
import { Pressable } from 'react-native'
import { YStack, XStack, Text, Input } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import type { DressCodeEntry, EventTeam } from '@/types/events'

interface DressCodeEditorProps {
  entries: DressCodeEntry[]
  onChange: (entries: DressCodeEntry[]) => void
  teams: EventTeam[]
}

export function DressCodeEditor({ entries, onChange, teams }: DressCodeEditorProps) {
  const colors = useThemeColors()
  const [pickerOpen, setPickerOpen] = useState<number | null>(null)
  const [searches, setSearches] = useState<string[]>([])

  const teamNames = teams.map((t) => t.name).filter((n) => n.trim())
  const allGroups = [...teamNames, 'Unassigned']

  const labelFor = (group: string, idx: number): string => {
    if (group !== '_remainder_') return group
    const hasOtherSpecific = entries.some(
      (e, i) => i !== idx && e.group !== '_remainder_' && e.group !== ''
    )
    return hasOtherSpecific ? 'Remaining' : 'All'
  }

  const availableFor = (idx: number): string[] => {
    const used = new Set(
      entries
        .filter((_, i) => i !== idx)
        .map((e) => e.group)
        .filter(Boolean)
    )
    const remUsedElsewhere = entries.some(
      (e, i) => i !== idx && e.group === '_remainder_'
    )
    const result: string[] = []
    if (!remUsedElsewhere) result.push('_remainder_')
    for (const g of allGroups) {
      if (!used.has(g)) result.push(g)
    }
    return result
  }

  const allCovered = (() => {
    if (entries.some((e) => e.group === '_remainder_')) return true
    const assigned = new Set(entries.map((e) => e.group))
    return allGroups.length > 0 && allGroups.every((g) => assigned.has(g))
  })()

  const updateEntry = (idx: number, patch: Partial<DressCodeEntry>) =>
    onChange(entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)))

  const setSearch = (idx: number, val: string) =>
    setSearches((s) => {
      const n = [...s]
      n[idx] = val
      return n
    })

  return (
    <YStack gap="$2">
      <Text color={colors.text} fontSize="$3" fontWeight="600">
        Dress Code
      </Text>

      {entries.map((entry, idx) => {
        const available = availableFor(idx)
        const searchVal = searches[idx] ?? ''
        const filtered = searchVal.trim()
          ? available.filter((g) =>
              labelFor(g, idx).toLowerCase().includes(searchVal.toLowerCase())
            )
          : available

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
              <Pressable
                style={{ flex: 1 }}
                onPress={() => setPickerOpen(pickerOpen === idx ? null : idx)}
              >
                <XStack
                  borderWidth={1}
                  borderColor={pickerOpen === idx ? colors.primary : colors.border}
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical={8}
                  backgroundColor={colors.surface}
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Text
                    color={entry.group ? colors.text : colors.textMuted}
                    fontSize="$3"
                  >
                    {entry.group ? labelFor(entry.group, idx) : 'Select group…'}
                  </Text>
                  <Text color={colors.textMuted} fontSize="$2">
                    ▾
                  </Text>
                </XStack>
              </Pressable>
              <Pressable
                onPress={() => onChange(entries.filter((_, i) => i !== idx))}
              >
                <Text color="$red10" fontSize="$3">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            {pickerOpen === idx && (
              <YStack
                borderWidth={1}
                borderColor={colors.primary}
                borderRadius="$2"
                backgroundColor={colors.surface}
                overflow="hidden"
              >
                <Input
                  value={searchVal}
                  onChangeText={(v) => setSearch(idx, v)}
                  placeholder="Filter groups…"
                  backgroundColor={colors.surface}
                  color={colors.text}
                  borderColor={colors.border}
                  size="$3"
                />
                {filtered.map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => {
                      updateEntry(idx, { group: g })
                      setPickerOpen(null)
                    }}
                  >
                    <XStack
                      padding="$2"
                      borderTopWidth={1}
                      borderTopColor={colors.border}
                      backgroundColor={
                        entry.group === g ? colors.primary + '22' : 'transparent'
                      }
                    >
                      <Text color={colors.text} fontSize="$3">
                        {labelFor(g, idx)}
                      </Text>
                    </XStack>
                  </Pressable>
                ))}
                {filtered.length === 0 && (
                  <XStack padding="$3">
                    <Text color={colors.textMuted} fontSize="$3">
                      No groups available.
                    </Text>
                  </XStack>
                )}
              </YStack>
            )}

            <Input
              value={entry.text}
              onChangeText={(v) => updateEntry(idx, { text: v })}
              placeholder="Dress code description…"
              backgroundColor={colors.surface}
              color={colors.text}
              borderColor={colors.border}
            />
          </YStack>
        )
      })}

      {!allCovered && (
        <Pressable
          onPress={() => {
            onChange([...entries, { group: '', text: '' }])
            setSearches((s) => [...s, ''])
          }}
        >
          <XStack
            borderWidth={1}
            borderColor={colors.primary}
            borderRadius="$2"
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignSelf="flex-start"
          >
            <Text color={colors.primary} fontSize="$3">
              + Add entry
            </Text>
          </XStack>
        </Pressable>
      )}

      {entries.length === 0 && (
        <Text color={colors.textMuted} fontSize="$2">
          No dress code set.
        </Text>
      )}
    </YStack>
  )
}
