import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useDateNotesStore } from '@/stores/dateNotesStore'
import { DATE_NOTE_MAX, notesOn } from '@/lib/dateNotes'
import { confirmAsync } from '@/lib/confirm'

/** A note's colour on the calendar: its marker, and the bar beside it. */
export const NOTE_COLOR = '#c9a227'

/**
 * Your notes on a day of the calendar (lib/dateNotes): written, changed and
 * taken away here — or by asking Miriam — and seen by nobody else.
 * `onEditor`: the note being written, as it appears and goes — for the screen
 * to keep it above the keyboard.
 */
export function DayNotes({
  date,
  onEditor,
}: {
  date: string
  onEditor?: (editor: View | null) => void
}) {
  const colors = useThemeColors()
  const all = useDateNotesStore((s) => s.notes)
  const notes = notesOn(all, date)
  // The note being written: a new one, or one of these by its id.
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [failed, setFailed] = useState('')

  const start = (id: string, text: string) => {
    setFailed('')
    setEditing(id)
    setDraft(text)
  }
  const stop = () => {
    setEditing(null)
    setDraft('')
  }
  const save = async () => {
    const store = useDateNotesStore.getState()
    try {
      if (editing === 'new') await store.add(date, draft)
      else if (editing) await store.edit(editing, draft)
      stop()
    } catch (err) {
      setFailed(
        err instanceof Error && err.message === 'full'
          ? 'You have as many notes as can be kept — delete some old ones first.'
          : 'That note didn’t save. Try again in a moment.'
      )
    }
  }
  const remove = async (id: string) => {
    // The whole question in the message: a browser shows only that.
    const sure = await confirmAsync('Delete this note? It can’t be brought back.', {
      title: 'Delete note',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!sure) return
    await useDateNotesStore
      .getState()
      .remove([id])
      .catch(() => setFailed('That note didn’t delete. Try again in a moment.'))
    if (editing === id) stop()
  }

  const editor = (
    <View ref={onEditor}>
      <YStack
        gap="$2"
        padding="$2"
        borderRadius="$2"
        borderWidth={1}
        borderColor={NOTE_COLOR}
        backgroundColor={colors.surface}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Bring the projector…"
          placeholderTextColor={colors.textMuted}
          multiline
          autoFocus
          maxLength={DATE_NOTE_MAX}
          style={{ color: colors.text, minHeight: 60, fontSize: 15, textAlignVertical: 'top' }}
        />
        <XStack gap="$2" justifyContent="flex-end" alignItems="center">
          {editing && editing !== 'new' ? (
            <Pressable onPress={() => remove(editing)} hitSlop={6}>
              <Text color="#e74c3c" fontSize="$2" fontWeight="600" paddingHorizontal="$2">
                Delete
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={stop} hitSlop={6}>
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600" paddingHorizontal="$2">
              Cancel
            </Text>
          </Pressable>
          <Pressable onPress={save} disabled={!draft.trim()} hitSlop={6}>
            <XStack
              backgroundColor={draft.trim() ? colors.primary : colors.border}
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$1.5"
            >
              <Text color="white" fontSize="$2" fontWeight="700">
                Save
              </Text>
            </XStack>
          </Pressable>
        </XStack>
      </YStack>
    </View>
  )

  return (
    <YStack gap="$2" marginTop="$3">
      <XStack justifyContent="space-between" alignItems="center">
        <Text color={colors.text} fontWeight="700" fontSize="$3">
          My notes
        </Text>
        {editing === null ? (
          <Pressable onPress={() => start('new', '')} hitSlop={8}>
            <Text color={colors.primary} fontWeight="600" fontSize="$2">
              + Add a note
            </Text>
          </Pressable>
        ) : null}
      </XStack>
      {notes.map((n) =>
        editing === n.id ? (
          <YStack key={n.id}>{editor}</YStack>
        ) : (
          <Pressable key={n.id} onPress={() => start(n.id, n.text)}>
            <XStack
              backgroundColor={colors.surface}
              borderRadius="$2"
              padding="$2"
              borderWidth={1}
              borderColor={colors.border}
              gap="$2"
              alignItems="center"
            >
              <YStack width={4} alignSelf="stretch" backgroundColor={NOTE_COLOR} borderRadius={2} />
              <Text flex={1} color={colors.text} fontSize="$3">
                {n.text}
              </Text>
              <Text color={colors.textMuted} fontSize="$1">
                Edit
              </Text>
            </XStack>
          </Pressable>
        )
      )}
      {editing === 'new' ? editor : null}
      {failed ? (
        <Text color="#e74c3c" fontSize="$2">
          {failed}
        </Text>
      ) : null}
      <Text color={colors.textMuted} fontSize="$1">
        Only you can see your notes. Miriam reads them to you in your briefing.
      </Text>
    </YStack>
  )
}
