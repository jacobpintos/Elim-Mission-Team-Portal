import { useState } from 'react'
import { Pressable, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { sameId } from '@/lib/ids'
import type { FlightEntry } from '@/types/events'
import type { UserProfile } from '@/types/user'

interface FlightEditorProps {
  entries: FlightEntry[]
  onChange: (entries: FlightEntry[]) => void
  assignedUids: Set<string>
  allUsers: UserProfile[]
}

function getName(uid: string, allUsers: UserProfile[]) {
  const u = allUsers.find((u) => sameId(u.uid, uid))
  return u?.displayName || u?.email || uid
}

function FlightSection({
  label,
  prefix,
  entry,
  onUpdate,
}: {
  label: string
  prefix: 'out' | 'ret'
  entry: FlightEntry
  onUpdate: (patch: Partial<FlightEntry>) => void
}) {
  const colors = useThemeColors()
  const f = (key: keyof FlightEntry) => (entry[key] as string) ?? ''

  return (
    <YStack gap="$2">
      <Text color={colors.primary} fontSize="$2" fontWeight="700">
        {label}
      </Text>

      <XStack gap="$2">
        <TextInput
          style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          value={f(`${prefix}Date`)}
          onChangeText={(v) => onUpdate({ [`${prefix}Date`]: v })}
          placeholder="Date (MM/DD/YY)"
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          value={f(`${prefix}Time`)}
          onChangeText={(v) => onUpdate({ [`${prefix}Time`]: v })}
          placeholder="Time (10:00 AM)"
          placeholderTextColor={colors.textMuted}
        />
      </XStack>

      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        value={f(`${prefix}Airport`)}
        onChangeText={(v) => onUpdate({ [`${prefix}Airport`]: v })}
        placeholder="Departing airport address"
        placeholderTextColor={colors.textMuted}
      />

      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        value={f(`${prefix}Airline`)}
        onChangeText={(v) => onUpdate({ [`${prefix}Airline`]: v })}
        placeholder="Airline name"
        placeholderTextColor={colors.textMuted}
      />

      <XStack gap="$2">
        <TextInput
          style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          value={f(`${prefix}Flight`)}
          onChangeText={(v) => onUpdate({ [`${prefix}Flight`]: v })}
          placeholder="Flight #"
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          value={f(`${prefix}StatusLink`)}
          onChangeText={(v) => onUpdate({ [`${prefix}StatusLink`]: v })}
          placeholder="Flight status URL"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="url"
        />
      </XStack>

      <XStack gap="$2">
        <TextInput
          style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          value={f(`${prefix}Ticket`)}
          onChangeText={(v) => onUpdate({ [`${prefix}Ticket`]: v })}
          placeholder="Ticket #"
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          value={f(`${prefix}Confirmation`)}
          onChangeText={(v) => onUpdate({ [`${prefix}Confirmation`]: v })}
          placeholder="Confirmation #"
          placeholderTextColor={colors.textMuted}
        />
      </XStack>

      <XStack gap="$2">
        <TextInput
          style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          value={f(`${prefix}Arrival`)}
          onChangeText={(v) => onUpdate({ [`${prefix}Arrival`]: v })}
          placeholder="Est. arrival time"
          placeholderTextColor={colors.textMuted}
        />
        {prefix === 'out' ? (
          <TextInput
            style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={f('outContact')}
            onChangeText={(v) => onUpdate({ outContact: v })}
            placeholder="Contact"
            placeholderTextColor={colors.textMuted}
          />
        ) : (
          <YStack flex={1} />
        )}
      </XStack>
    </YStack>
  )
}

export function FlightEditor({ entries, onChange, assignedUids, allUsers }: FlightEditorProps) {
  const colors = useThemeColors()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch] = useState('')

  const usedUids = new Set(entries.map((e) => e.uid))
  const availableUsers = allUsers.filter(
    (u) => assignedUids.has(String(u.uid)) && !usedUids.has(String(u.uid))
  )
  const searchResults = search.trim()
    ? availableUsers
        .filter(
          (u) =>
            (u.displayName ?? '').toLowerCase().includes(search.toLowerCase()) ||
            (u.email ?? '').toLowerCase().includes(search.toLowerCase())
        )
        .slice(0, 10)
    : availableUsers.slice(0, 10)

  const addEntry = (uid: string) => {
    const newEntry: FlightEntry = { id: Date.now().toString(), uid }
    onChange([...entries, newEntry])
    setExpandedId(newEntry.id)
    setShowPicker(false)
    setSearch('')
  }

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const updateEntry = (id: string, patch: Partial<FlightEntry>) =>
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)))

  return (
    <YStack gap="$3">
      {entries.map((entry) => {
        const isExpanded = expandedId === entry.id
        const name = getName(entry.uid, allUsers)

        return (
          <YStack
            key={entry.id}
            backgroundColor={colors.surface}
            borderRadius="$2"
            borderWidth={1}
            borderColor={colors.border}
            overflow="hidden"
          >
            {/* Header */}
            <XStack padding="$3" alignItems="center" gap="$2">
              <Pressable
                style={{ flex: 1 }}
                onPress={() => setExpandedId(isExpanded ? null : entry.id)}
              >
                <XStack alignItems="center" gap="$2" flex={1}>
                  <Text color={colors.text} fontSize="$3" fontWeight="600" flex={1}>
                    {name}
                  </Text>
                  <Text color={colors.textMuted} fontSize="$2">
                    {isExpanded ? '▲' : '▼'}
                  </Text>
                </XStack>
              </Pressable>
              <Pressable onPress={() => removeEntry(entry.id)}>
                <Text color="$red10" fontSize="$4">✕</Text>
              </Pressable>
            </XStack>

            {isExpanded && (
              <YStack
                gap="$3"
                padding="$3"
                paddingTop="$2"
                borderTopWidth={1}
                borderTopColor={colors.border}
              >
                <FlightSection
                  label="OUTBOUND FLIGHT"
                  prefix="out"
                  entry={entry}
                  onUpdate={(patch) => updateEntry(entry.id, patch)}
                />
                <FlightSection
                  label="RETURN FLIGHT"
                  prefix="ret"
                  entry={entry}
                  onUpdate={(patch) => updateEntry(entry.id, patch)}
                />
              </YStack>
            )}
          </YStack>
        )
      })}

      {/* Add person picker */}
      {!showPicker ? (
        <Pressable onPress={() => setShowPicker(true)}>
          <XStack
            borderWidth={1}
            borderColor={colors.primary}
            borderRadius="$2"
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignSelf="flex-start"
          >
            <Text color={colors.primary} fontSize="$3">+ Add person</Text>
          </XStack>
        </Pressable>
      ) : (
        <YStack
          gap="$2"
          backgroundColor={colors.surface}
          borderRadius="$2"
          padding="$3"
          borderWidth={1}
          borderColor={colors.border}
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={colors.text} fontSize="$3" fontWeight="600">Select person</Text>
            <Pressable onPress={() => { setShowPicker(false); setSearch('') }}>
              <Text color={colors.textMuted} fontSize="$3">✕</Text>
            </Pressable>
          </XStack>

          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search people…"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />

          {searchResults.length === 0 ? (
            <Text color={colors.textMuted} fontSize="$2">
              {availableUsers.length === 0
                ? 'All assigned people already have entries'
                : 'No matches'}
            </Text>
          ) : (
            searchResults.map((u) => {
              const uid = String(u.uid)
              return (
                <Pressable key={uid} onPress={() => addEntry(uid)}>
                  <XStack padding="$2" borderRadius="$2" alignItems="center">
                    <Text flex={1} fontSize="$3" color={colors.text}>
                      {u.displayName || u.email || uid}
                    </Text>
                  </XStack>
                </Pressable>
              )
            })
          )}
        </YStack>
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
