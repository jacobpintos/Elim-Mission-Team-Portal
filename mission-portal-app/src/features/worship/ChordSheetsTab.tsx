import { useState } from 'react'
import { ScrollView, Pressable, TextInput, StyleSheet, Alert } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useChordSheetsStore } from '@/stores/chordSheetsStore'
import { useUIStore } from '@/stores/uiStore'
import { ChordSheetEditor } from './ChordSheetEditor'
import { ChordSheetViewer } from './ChordSheetViewer'
import type { ChordSheet } from '@/types/chordSheet'

interface ChordSheetsTabProps {
  createdBy: string | number
}

export function ChordSheetsTab({ createdBy }: ChordSheetsTabProps) {
  const colors = useThemeColors()
  const { chordSheets, createChordSheet, deleteChordSheet } = useChordSheetsStore()
  const toast = useUIStore((s) => s.toast)

  const [search, setSearch] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [editSheet, setEditSheet] = useState<ChordSheet | null>(null)
  const [viewSheet, setViewSheet] = useState<ChordSheet | null>(null)

  const filtered = [...chordSheets]
    .filter((s) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        s.title.toLowerCase().includes(q) ||
        (s.artist ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => String(a.title).localeCompare(String(b.title)))

  const handleSave = async (data: Omit<ChordSheet, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await createChordSheet(data)
      toast('Chord sheet saved!', 'success')
      setShowEditor(false)
      setEditSheet(null)
    } catch {
      toast('Failed to save chord sheet', 'error')
    }
  }

  const handleDelete = (sheet: ChordSheet) => {
    Alert.alert(
      'Delete Chord Sheet',
      `Delete "${sheet.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteChordSheet(sheet.id)
              toast('Deleted', 'success')
            } catch {
              toast('Failed to delete', 'error')
            }
          },
        },
      ],
    )
  }

  const openNew = () => {
    setEditSheet(null)
    setShowEditor(true)
  }

  return (
    <YStack flex={1}>
      {/* Search + New button */}
      <XStack
        paddingHorizontal="$3"
        paddingTop="$3"
        paddingBottom="$2"
        gap="$2"
        alignItems="center"
      >
        <TextInput
          style={[
            styles.searchInput,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              flex: 1,
            },
          ]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search chord sheets…"
          placeholderTextColor={colors.textMuted}
        />
        <Pressable
          onPress={openNew}
          style={[styles.newBtn, { backgroundColor: colors.primary }]}
        >
          <Text color="white" fontWeight="700" fontSize="$2">
            + New
          </Text>
        </Pressable>
      </XStack>

      {/* List */}
      {filtered.length === 0 ? (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
          <Text color={colors.textMuted} textAlign="center">
            {search.trim() ? 'No chord sheets match your search.' : 'No chord sheets yet.'}
          </Text>
          {!search.trim() ? (
            <Text color={colors.textMuted} fontSize="$2" textAlign="center" marginTop="$2">
              Tap + New to create one.
            </Text>
          ) : null}
        </YStack>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <YStack padding="$3" paddingBottom="$8" gap="$2">
            {filtered.map((sheet) => (
              <Pressable key={String(sheet.id)} onPress={() => setViewSheet(sheet)}>
                <YStack
                  backgroundColor={colors.surface}
                  borderRadius="$3"
                  padding="$3"
                  borderWidth={1}
                  borderColor={colors.border}
                  gap="$1"
                >
                  <XStack justifyContent="space-between" alignItems="flex-start">
                    <YStack flex={1} gap="$0.5">
                      <Text color={colors.text} fontWeight="700" fontSize="$4" numberOfLines={1}>
                        {sheet.title}
                      </Text>
                      {sheet.artist ? (
                        <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                          {sheet.artist}
                        </Text>
                      ) : null}
                      <XStack gap="$2">
                        {sheet.bpm != null ? (
                          <Text color={colors.textMuted} fontSize="$1">
                            ♩ {sheet.bpm} BPM
                          </Text>
                        ) : null}
                        <Text color={colors.textMuted} fontSize="$1">
                          {sheet.sections.length} section{sheet.sections.length !== 1 ? 's' : ''}
                        </Text>
                      </XStack>
                    </YStack>
                    <Pressable onPress={() => handleDelete(sheet)}>
                      <XStack
                        backgroundColor="#c0392b18"
                        borderRadius="$2"
                        paddingHorizontal="$2"
                        paddingVertical="$1"
                        marginLeft="$2"
                      >
                        <Text color="#c0392b" fontSize="$2">
                          Delete
                        </Text>
                      </XStack>
                    </Pressable>
                  </XStack>
                </YStack>
              </Pressable>
            ))}
          </YStack>
        </ScrollView>
      )}

      <ChordSheetEditor
        visible={showEditor}
        onClose={() => {
          setShowEditor(false)
          setEditSheet(null)
        }}
        onSave={handleSave}
        editSheet={editSheet}
        createdBy={createdBy}
      />

      <ChordSheetViewer
        sheet={viewSheet}
        onClose={() => setViewSheet(null)}
      />
    </YStack>
  )
}

const styles = StyleSheet.create({
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  newBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
})
