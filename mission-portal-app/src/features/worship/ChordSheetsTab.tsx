import { useState } from 'react'
import { ScrollView, Pressable, TextInput, StyleSheet, View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useChordSheetsStore } from '@/stores/chordSheetsStore'
import { useUIStore } from '@/stores/uiStore'
import { ChordSheetEditor } from './ChordSheetEditor'
import { ChordSheetViewer } from './ChordSheetViewer'
import type { ChordSheet } from '@/types/chordSheet'

interface ChordSheetsTabProps {
  createdBy: string | number
  /** Guests may read chord sheets but not add or change them. */
  readOnly?: boolean
}

export function ChordSheetsTab({ createdBy, readOnly = false }: ChordSheetsTabProps) {
  const colors = useThemeColors()
  const { chordSheets, createChordSheet, updateChordSheet, deleteChordSheet } =
    useChordSheetsStore()
  const toast = useUIStore((s) => s.toast)

  const [search, setSearch] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [editSheet, setEditSheet] = useState<ChordSheet | null>(null)
  const [viewSheet, setViewSheet] = useState<ChordSheet | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null)

  const filtered = [...chordSheets]
    .filter((s) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q)
    })
    .sort((a, b) => String(a.title).localeCompare(String(b.title)))

  const handleSave = async (data: Omit<ChordSheet, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (editSheet) {
        await updateChordSheet(editSheet.id, data)
        toast('Chord sheet updated!', 'success')
      } else {
        await createChordSheet(data)
        toast('Chord sheet saved!', 'success')
      }
      setShowEditor(false)
      setEditSheet(null)
    } catch (err) {
      console.error('[ChordSheetsTab] save failed:', err)
      toast('Failed to save chord sheet', 'error')
    }
  }

  const handleDeleteConfirmed = async (sheet: ChordSheet) => {
    try {
      await deleteChordSheet(sheet.id)
      toast('Deleted', 'success')
    } catch {
      toast('Failed to delete', 'error')
    } finally {
      setConfirmDeleteId(null)
    }
  }

  const openNew = () => {
    setEditSheet(null)
    setShowEditor(true)
  }

  const openEdit = (sheet: ChordSheet) => {
    setEditSheet(sheet)
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
        {readOnly ? null : (
          <Pressable onPress={openNew} style={[styles.newBtn, { backgroundColor: colors.primary }]}>
            <Text color="white" fontWeight="700" fontSize="$2">
              + New
            </Text>
          </Pressable>
        )}
      </XStack>

      {/* List */}
      {filtered.length === 0 ? (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
          <Text color={colors.textMuted} textAlign="center">
            {search.trim() ? 'No chord sheets match your search.' : 'No chord sheets yet.'}
          </Text>
          {!search.trim() && !readOnly ? (
            <Text color={colors.textMuted} fontSize="$2" textAlign="center" marginTop="$2">
              Tap + New to create one.
            </Text>
          ) : null}
        </YStack>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <YStack padding="$3" paddingBottom="$8" gap="$2">
            {filtered.map((sheet) => (
              <View
                key={String(sheet.id)}
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {/* Content area — tappable to view */}
                <Pressable style={styles.cardContent} onPress={() => setViewSheet(sheet)}>
                  <Text color={colors.text} fontWeight="700" fontSize={16} numberOfLines={1}>
                    {sheet.title}
                  </Text>
                  {sheet.artist ? (
                    <Text color={colors.textMuted} fontSize={13} numberOfLines={1}>
                      {sheet.artist}
                    </Text>
                  ) : null}
                  <XStack gap={8} marginTop={2}>
                    {sheet.bpm != null ? (
                      <Text color={colors.textMuted} fontSize={11}>
                        ♩ {sheet.bpm} BPM
                      </Text>
                    ) : null}
                    <Text color={colors.textMuted} fontSize={11}>
                      {sheet.sections.length} section{sheet.sections.length !== 1 ? 's' : ''}
                    </Text>
                  </XStack>
                </Pressable>

                {/* Action buttons — siblings of the content Pressable */}
                <XStack gap={4} alignItems="center" paddingRight={8}>
                  {confirmDeleteId === sheet.id ? (
                    <>
                      <Pressable onPress={() => setConfirmDeleteId(null)}>
                        <View
                          style={[
                            styles.actionBtn,
                            { backgroundColor: colors.surface, borderColor: colors.border },
                          ]}
                        >
                          <Text style={[styles.actionBtnText, { color: colors.textMuted }]}>
                            Cancel
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable onPress={() => handleDeleteConfirmed(sheet)}>
                        <View
                          style={[
                            styles.actionBtn,
                            { backgroundColor: '#c0392b', borderColor: '#c0392b' },
                          ]}
                        >
                          <Text style={[styles.actionBtnText, { color: 'white' }]}>Confirm</Text>
                        </View>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable onPress={() => openEdit(sheet)}>
                        <View
                          style={[
                            styles.actionBtn,
                            {
                              backgroundColor: colors.primary + '18',
                              borderColor: colors.primary + '44',
                            },
                          ]}
                        >
                          <Text style={[styles.actionBtnText, { color: colors.primary }]}>
                            Edit
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable onPress={() => setConfirmDeleteId(sheet.id)}>
                        <View
                          style={[
                            styles.actionBtn,
                            { backgroundColor: '#c0392b18', borderColor: '#c0392b44' },
                          ]}
                        >
                          <Text style={[styles.actionBtnText, { color: '#c0392b' }]}>Delete</Text>
                        </View>
                      </Pressable>
                    </>
                  )}
                </XStack>
              </View>
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

      <ChordSheetViewer sheet={viewSheet} onClose={() => setViewSheet(null)} />
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
  card: {
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionBtn: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
})
