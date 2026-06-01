import { useState } from 'react'
import { Modal, View, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { EventPickerModal } from './EventPickerModal'
import { useChordSheetsStore } from '@/stores/chordSheetsStore'
import type { SetList, SetListSong } from '@/types/worship'
import type { ChordSheet } from '@/types/chordSheet'
import type { EventInstance } from '@/types/events'

function makeSong(): SetListSong {
  return {
    id: String(Date.now() + Math.random()),
    name: '',
    key: '',
    link: '',
    notes: '',
    chordSheetId: null,
  }
}

interface SetListFormModalProps {
  visible: boolean
  onClose: () => void
  onSave: (data: Omit<SetList, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  createdBy: string | number
}

interface ChordSheetPickerProps {
  chordSheets: ChordSheet[]
  selectedId: string | number | null | undefined
  onSelect: (id: string | number | null) => void
  colors: ReturnType<typeof useThemeColors>
}

function ChordSheetPicker({ chordSheets, selectedId, onSelect, colors }: ChordSheetPickerProps) {
  const [open, setOpen] = useState(false)
  const selected = chordSheets.find((c) => String(c.id) === String(selectedId))
  return (
    <YStack gap="$1">
      <Text color={colors.textMuted} fontSize={11} fontWeight="600">
        CHORD SHEET
      </Text>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <XStack
          backgroundColor={colors.surface}
          borderRadius="$2"
          borderWidth={1}
          borderColor={colors.border}
          paddingHorizontal="$3"
          paddingVertical="$2"
          alignItems="center"
          justifyContent="space-between"
        >
          <Text
            color={selected ? colors.primary : colors.textMuted}
            fontSize={13}
            numberOfLines={1}
            flex={1}
          >
            {selected
              ? `${selected.title}${selected.artist ? ` — ${selected.artist}` : ''}`
              : 'None'}
          </Text>
          <Text color={colors.textMuted} fontSize={11}>
            {open ? '▲' : '▼'}
          </Text>
        </XStack>
      </Pressable>
      {open ? (
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$2"
          borderWidth={1}
          borderColor={colors.border}
          maxHeight={160}
          overflow="hidden"
        >
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <Pressable
              onPress={() => {
                onSelect(null)
                setOpen(false)
              }}
            >
              <XStack
                paddingHorizontal="$3"
                paddingVertical="$2"
                backgroundColor={selectedId == null ? colors.primary + '22' : 'transparent'}
              >
                <Text color={selectedId == null ? colors.primary : colors.textMuted} fontSize={13}>
                  None
                </Text>
              </XStack>
            </Pressable>
            {chordSheets.map((cs) => (
              <Pressable
                key={String(cs.id)}
                onPress={() => {
                  onSelect(cs.id)
                  setOpen(false)
                }}
              >
                <XStack
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  backgroundColor={
                    String(selectedId) === String(cs.id) ? colors.primary + '22' : 'transparent'
                  }
                >
                  <Text
                    color={String(selectedId) === String(cs.id) ? colors.primary : colors.text}
                    fontSize={13}
                    numberOfLines={1}
                  >
                    {cs.title}
                    {cs.artist ? ` — ${cs.artist}` : ''}
                  </Text>
                </XStack>
              </Pressable>
            ))}
          </ScrollView>
        </YStack>
      ) : null}
    </YStack>
  )
}

export function SetListFormModal({ visible, onClose, onSave, createdBy }: SetListFormModalProps) {
  const colors = useThemeColors()
  const chordSheets = useChordSheetsStore((s) => s.chordSheets)
  const [title, setTitle] = useState('')
  const [songs, setSongs] = useState<SetListSong[]>([makeSong()])
  const [selectedEvent, setSelectedEvent] = useState<EventInstance | null>(null)
  const [showEventPicker, setShowEventPicker] = useState(false)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setTitle('')
    setSongs([makeSong()])
    setSelectedEvent(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const updateSong = (id: string, field: keyof SetListSong, value: string | number | null) => {
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  }

  const autoLinkChordSheet = (songId: string, songName: string) => {
    if (!songName.trim()) {
      updateSong(songId, 'chordSheetId', null)
      return
    }
    const lower = songName.toLowerCase()
    const matches = chordSheets.filter((cs) => cs.title.toLowerCase() === lower)
    if (matches.length === 1) {
      updateSong(songId, 'chordSheetId', matches[0].id)
    } else if (matches.length === 0) {
      // No exact match — clear any auto-linked sheet
      updateSong(songId, 'chordSheetId', null)
    }
    // Multiple matches: leave existing selection for user to resolve manually
  }

  const addSong = () => {
    setSongs((prev) => [...prev, makeSong()])
  }

  const removeSong = (id: string) => {
    setSongs((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev))
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        songs,
        createdBy,
        eventTemplateId: selectedEvent?.templateId ?? null,
        eventDate: selectedEvent?.date ?? null,
      })
      reset()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
        <View style={styles.overlay}>
          <YStack
            backgroundColor={colors.surface}
            borderRadius="$4"
            padding="$4"
            gap="$3"
            width="92%"
            maxWidth={560}
            maxHeight="90%"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={colors.text} fontSize="$5" fontWeight="700">
                New Set List
              </Text>
              <Pressable onPress={handleClose}>
                <Text color={colors.textMuted} fontSize="$4">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              <YStack gap="$3">
                {/* Title */}
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    TITLE
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
                    placeholder="e.g. Sunday Morning Worship"
                    placeholderTextColor={colors.textMuted}
                  />
                </YStack>

                {/* Event picker */}
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    LINKED EVENT (optional)
                  </Text>
                  <Pressable onPress={() => setShowEventPicker(true)}>
                    <XStack
                      backgroundColor={colors.background}
                      borderRadius="$2"
                      borderWidth={1}
                      borderColor={colors.border}
                      padding="$3"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      {selectedEvent ? (
                        <YStack flex={1}>
                          <Text color={colors.text} fontSize="$3" fontWeight="600">
                            {selectedEvent.title}
                          </Text>
                          <Text color={colors.textMuted} fontSize="$2">
                            {selectedEvent.date}
                          </Text>
                        </YStack>
                      ) : (
                        <Text color={colors.textMuted} fontSize="$3">
                          Tap to pick an event instance…
                        </Text>
                      )}
                      <Text color={colors.primary} fontSize="$3">
                        📅
                      </Text>
                    </XStack>
                  </Pressable>
                  {selectedEvent ? (
                    <Pressable onPress={() => setSelectedEvent(null)}>
                      <Text color={colors.textMuted} fontSize="$2">
                        ✕ Clear event
                      </Text>
                    </Pressable>
                  ) : null}
                </YStack>

                {/* Songs */}
                <YStack gap="$2">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    SONGS
                  </Text>
                  {songs.map((song, i) => (
                    <YStack
                      key={song.id}
                      backgroundColor={colors.background}
                      borderRadius="$3"
                      borderWidth={1}
                      borderColor={colors.border}
                      padding="$3"
                      gap="$2"
                    >
                      <XStack justifyContent="space-between" alignItems="center">
                        <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                          SONG {i + 1}
                        </Text>
                        {songs.length > 1 ? (
                          <Pressable onPress={() => removeSong(song.id)}>
                            <Text color="#c0392b" fontSize="$2">
                              Remove
                            </Text>
                          </Pressable>
                        ) : null}
                      </XStack>

                      <TextInput
                        style={[
                          styles.input,
                          {
                            color: colors.text,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                          },
                        ]}
                        value={song.name}
                        onChangeText={(v) => {
                          updateSong(song.id, 'name', v)
                          autoLinkChordSheet(song.id, v)
                        }}
                        placeholder="Song name"
                        placeholderTextColor={colors.textMuted}
                      />

                      <TextInput
                        style={[
                          styles.input,
                          {
                            color: colors.text,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                          },
                        ]}
                        value={song.key}
                        onChangeText={(v) => updateSong(song.id, 'key', v)}
                        placeholder="Key (e.g. G, Bb, C#)"
                        placeholderTextColor={colors.textMuted}
                      />

                      <TextInput
                        style={[
                          styles.input,
                          {
                            color: colors.text,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                          },
                        ]}
                        value={song.link}
                        onChangeText={(v) => updateSong(song.id, 'link', v)}
                        placeholder="Link (YouTube, Spotify, etc.)"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                      />

                      <TextInput
                        style={[
                          styles.textarea,
                          {
                            color: colors.text,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                          },
                        ]}
                        value={song.notes}
                        onChangeText={(v) => updateSong(song.id, 'notes', v)}
                        placeholder="Notes (optional)"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        numberOfLines={2}
                      />

                      <ChordSheetPicker
                        chordSheets={chordSheets}
                        selectedId={song.chordSheetId}
                        onSelect={(id) => updateSong(song.id, 'chordSheetId', id)}
                        colors={colors}
                      />
                    </YStack>
                  ))}

                  <Pressable onPress={addSong}>
                    <XStack
                      borderRadius="$2"
                      borderWidth={1}
                      borderColor={colors.primary}
                      paddingVertical="$2"
                      justifyContent="center"
                      alignItems="center"
                      gap="$1"
                    >
                      <Text color={colors.primary} fontSize="$3" fontWeight="600">
                        + Add Song
                      </Text>
                    </XStack>
                  </Pressable>
                </YStack>
              </YStack>
            </ScrollView>

            <Pressable onPress={handleSave} disabled={saving || !title.trim()}>
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingVertical="$3"
                justifyContent="center"
                opacity={saving || !title.trim() ? 0.5 : 1}
              >
                <Text color="white" fontWeight="700" fontSize="$3">
                  {saving ? 'Saving…' : 'Save Set List'}
                </Text>
              </XStack>
            </Pressable>
          </YStack>
        </View>
      </Modal>

      <EventPickerModal
        visible={showEventPicker}
        onClose={() => setShowEventPicker(false)}
        onSelect={(ev: EventInstance) => {
          setSelectedEvent(ev)
          setShowEventPicker(false)
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 60,
    textAlignVertical: 'top',
  },
})
