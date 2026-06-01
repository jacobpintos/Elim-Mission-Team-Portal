import { useState, useEffect } from 'react'
import {
  Modal,
  View,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
} from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import {
  SECTION_TYPES,
  SECTION_LABELS,
  type SectionType,
  type ChordSheetSection,
  type ChordSheet,
} from '@/types/chordSheet'

function makeSection(type: SectionType): ChordSheetSection {
  return {
    id: String(Date.now() + Math.random()),
    type,
    lyrics: '',
    chordLines: [''],
  }
}

function getSectionLabel(sections: ChordSheetSection[], id: string): string {
  const section = sections.find((s) => s.id === id)
  if (!section) return ''
  const ofType = sections.filter((s) => s.type === section.type)
  const base = SECTION_LABELS[section.type]
  if (ofType.length <= 1) return base
  return `${base} ${ofType.findIndex((s) => s.id === id) + 1}`
}

/**
 * Sync chordLines array length to match the number of lyrics lines.
 * When lyrics is empty, ensure a single chord line exists.
 */
function syncChordLines(lyrics: string, chordLines: string[]): string[] {
  if (!lyrics.trim()) {
    return chordLines.length > 0 ? [chordLines[0] ?? ''] : ['']
  }
  const linesCount = lyrics.split('\n').length
  if (linesCount === chordLines.length) return chordLines
  if (linesCount > chordLines.length) {
    return [
      ...chordLines,
      ...Array(linesCount - chordLines.length).fill(''),
    ]
  }
  return chordLines.slice(0, linesCount)
}

interface ChordSheetEditorProps {
  visible: boolean
  onClose: () => void
  onSave: (data: Omit<ChordSheet, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  editSheet?: ChordSheet | null
  createdBy: string | number
}

export function ChordSheetEditor({
  visible,
  onClose,
  onSave,
  editSheet,
  createdBy,
}: ChordSheetEditorProps) {
  const colors = useThemeColors()

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [bpm, setBpm] = useState('')
  const [sections, setSections] = useState<ChordSheetSection[]>([makeSection('verse')])
  const [saving, setSaving] = useState(false)

  // Populate form when editing
  useEffect(() => {
    if (visible) {
      if (editSheet) {
        setTitle(editSheet.title)
        setArtist(editSheet.artist ?? '')
        setBpm(editSheet.bpm != null ? String(editSheet.bpm) : '')
        setSections(editSheet.sections.length > 0 ? editSheet.sections : [makeSection('verse')])
      } else {
        setTitle('')
        setArtist('')
        setBpm('')
        setSections([makeSection('verse')])
      }
    }
  }, [visible, editSheet])

  const reset = () => {
    setTitle('')
    setArtist('')
    setBpm('')
    setSections([makeSection('verse')])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        artist: artist.trim() || undefined,
        bpm: bpm ? parseInt(bpm, 10) || undefined : undefined,
        sections,
        createdBy,
      })
      reset()
    } finally {
      setSaving(false)
    }
  }

  const addSection = (type: SectionType) => {
    setSections((prev) => [...prev, makeSection(type)])
  }

  const removeSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id))
  }

  const updateSectionType = (id: string, type: SectionType) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, type } : s)))
  }

  const updateSectionLyrics = (id: string, lyrics: string) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        const newChordLines = syncChordLines(lyrics, s.chordLines)
        return { ...s, lyrics, chordLines: newChordLines }
      }),
    )
  }

  const updateChordLine = (sectionId: string, lineIdx: number, value: string) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        const newChordLines = [...s.chordLines]
        newChordLines[lineIdx] = value
        return { ...s, chordLines: newChordLines }
      }),
    )
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$4"
          gap="$3"
          width="96%"
          maxWidth={640}
          maxHeight="94%"
        >
          {/* Header */}
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={colors.text} fontSize="$5" fontWeight="700" flex={1}>
              {editSheet ? 'Edit Chord Sheet' : 'New Chord Sheet'}
            </Text>
            <XStack gap="$2" alignItems="center">
              <Pressable
                onPress={handleSave}
                disabled={saving || !title.trim()}
                style={[
                  styles.saveBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: saving || !title.trim() ? 0.5 : 1,
                  },
                ]}
              >
                <Text color="white" fontWeight="700" fontSize="$2">
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </Pressable>
              <Pressable onPress={handleClose}>
                <Text color={colors.textMuted} fontSize="$4" marginLeft="$1">
                  ✕
                </Text>
              </Pressable>
            </XStack>
          </XStack>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <YStack gap="$3" paddingBottom="$4">
              {/* Basic info */}
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  TITLE *
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Song title"
                  placeholderTextColor={colors.textMuted}
                />
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  ARTIST (optional)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  value={artist}
                  onChangeText={setArtist}
                  placeholder="Artist name"
                  placeholderTextColor={colors.textMuted}
                />
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  BPM (optional)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  value={bpm}
                  onChangeText={(v) => setBpm(v.replace(/[^0-9]/g, ''))}
                  placeholder="e.g. 120"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                />
              </YStack>

              {/* Sections */}
              {sections.map((section) => {
                const lyricsLines = section.lyrics ? section.lyrics.split('\n') : []
                const hasLyrics = section.lyrics.trim().length > 0
                return (
                  <YStack
                    key={section.id}
                    backgroundColor={colors.background}
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor={colors.border}
                    padding="$3"
                    gap="$2"
                  >
                    {/* Section label row */}
                    <XStack justifyContent="space-between" alignItems="center">
                      <Text color={colors.primary} fontSize="$3" fontWeight="700">
                        {getSectionLabel(sections, section.id)}
                      </Text>
                      <Pressable onPress={() => removeSection(section.id)}>
                        <Text color="#c0392b" fontSize="$2">
                          Remove
                        </Text>
                      </Pressable>
                    </XStack>

                    {/* Type selector pills */}
                    <XStack flexWrap="wrap" gap="$1">
                      {SECTION_TYPES.map((t) => (
                        <Pressable key={t} onPress={() => updateSectionType(section.id, t)}>
                          <XStack
                            backgroundColor={
                              section.type === t ? colors.primary : colors.surface
                            }
                            borderRadius={99}
                            borderWidth={1}
                            borderColor={
                              section.type === t ? colors.primary : colors.border
                            }
                            paddingHorizontal="$2"
                            paddingVertical="$0.5"
                          >
                            <Text
                              color={section.type === t ? 'white' : colors.textMuted}
                              fontSize="$1"
                              fontWeight={section.type === t ? '700' : '400'}
                            >
                              {SECTION_LABELS[t]}
                            </Text>
                          </XStack>
                        </Pressable>
                      ))}
                    </XStack>

                    {/* Lyrics */}
                    <YStack gap="$1">
                      <TextInput
                        style={[
                          styles.textarea,
                          {
                            color: colors.text,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                          },
                        ]}
                        value={section.lyrics}
                        onChangeText={(v) => updateSectionLyrics(section.id, v)}
                        placeholder="Enter lyrics… leave blank for instrumental"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        numberOfLines={4}
                      />
                    </YStack>

                    {/* Chord lines */}
                    <Text color={colors.textMuted} fontSize="$1" fontWeight="600" marginTop="$1">
                      CHORDS (Nashville Numbers)
                    </Text>

                    {!hasLyrics ? (
                      // Single chord line for instrumental
                      <TextInput
                        style={[
                          styles.chordInput,
                          {
                            color: colors.primary,
                            borderColor: colors.primary,
                            backgroundColor: colors.surface,
                          },
                        ]}
                        value={section.chordLines[0] ?? ''}
                        onChangeText={(v) => updateChordLine(section.id, 0, v)}
                        placeholder="e.g.  1   4   5m"
                        placeholderTextColor={colors.textMuted}
                      />
                    ) : (
                      lyricsLines.map((lyricLine, idx) => (
                        <YStack key={idx} gap={0}>
                          <TextInput
                            style={[
                              styles.chordInput,
                              {
                                color: colors.primary,
                                borderColor: colors.primary,
                                backgroundColor: colors.surface,
                              },
                            ]}
                            value={section.chordLines[idx] ?? ''}
                            onChangeText={(v) => updateChordLine(section.id, idx, v)}
                            placeholder="e.g.  1       4    5m"
                            placeholderTextColor={colors.textMuted}
                          />
                          <Text
                            style={[
                              styles.lyricsLineDisplay,
                              { color: colors.textMuted },
                            ]}
                          >
                            {lyricLine}
                          </Text>
                        </YStack>
                      ))
                    )}
                  </YStack>
                )
              })}

              {/* Add section */}
              <YStack gap="$2">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  ADD SECTION
                </Text>
                <XStack flexWrap="wrap" gap="$1">
                  {SECTION_TYPES.map((t) => (
                    <Pressable key={t} onPress={() => addSection(t)}>
                      <XStack
                        backgroundColor={colors.primary + '18'}
                        borderRadius="$2"
                        borderWidth={1}
                        borderColor={colors.primary}
                        paddingHorizontal="$2"
                        paddingVertical="$1"
                      >
                        <Text color={colors.primary} fontSize="$2" fontWeight="600">
                          + {SECTION_LABELS[t]}
                        </Text>
                      </XStack>
                    </Pressable>
                  ))}
                </XStack>
              </YStack>
            </YStack>
          </ScrollView>
        </YStack>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chordInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    fontFamily: 'Courier New',
  },
  lyricsLineDisplay: {
    fontSize: 13,
    fontFamily: 'Courier New',
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
})
