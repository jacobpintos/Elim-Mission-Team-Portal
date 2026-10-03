import { useEffect, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { useThemeColors } from '@/theme/useThemeColors'
import { useThemeStore } from '@/stores/themeStore'
import { NOTE_MAX, type SheetNotes } from '@/stores/sheetNotesStore'
import type { ChordSheet } from '@/types/chordSheet'
import { getSectionLabel, getSectionShortLabel } from './chordSheetFormat'
import { WithDictation } from '@/components/ui/Dictation'

/** What a note is on: the song as a whole, or one of its sections by id. */
export const SONG = 'song'

/**
 * Amber for notes, in a shade readable on the theme's surface: light on dark,
 * dark on light. Not the theme's own colours, which the chart already uses —
 * a note must never be mistaken for a chord or a heading.
 */
export function useNoteColors() {
  const mode = useThemeStore((s) => s.mode)
  return mode === 'dark'
    ? { text: '#f5c04a', bg: 'rgba(245,192,74,0.12)', onText: '#1a1a1a' }
    : { text: '#8a5a00', bg: 'rgba(196,140,20,0.12)', onText: '#ffffff' }
}

/** A note on the sheet. Tapping it opens it for editing. */
export function NoteLine({
  text,
  label = null,
  banner = false,
  onPress,
}: {
  text: string
  label?: string | null
  banner?: boolean
  onPress: () => void
}) {
  const c = useNoteColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Your note${label ? ` for ${label}` : ''}: ${text}. Edit`}
      style={
        banner
          ? { backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }
          : { paddingVertical: 1 }
      }
    >
      <Text color={c.text} fontSize={banner ? '$3' : '$2'} fontWeight={banner ? '600' : '500'}>
        ✎ {label ? `${label}: ` : ''}
        {text}
      </Text>
    </Pressable>
  )
}

/**
 * Writing notes — on a screen of its own, with the one field at the top.
 *
 * The first notes were written in fields under each heading, inside the
 * scrolling sheet. On an iPhone, a field the keyboard would cover makes the
 * browser shift the whole page up to keep it in sight — and a field halfway
 * down a chord sheet is one the keyboard covers, so typing a note pushed the
 * sheet off the top of the screen, with the song list showing beneath it.
 * Two attempts at following the shifted page did not hold on the phone.
 *
 * So there is nothing here for the keyboard to cover. One field, directly
 * under a one-line header at the top of the screen — above where the
 * keyboard reaches even on a phone held sideways — and what it is a note on
 * is chosen with a row of buttons beneath it: Song, V1, C1… The page never
 * has a reason to move. The screen is opaque, so the sheet is not glimpsed
 * through it, and on closing, the field lets go of the keyboard and any
 * offset the browser left behind is put back.
 *
 * Saved a moment after typing stops, on switching to another section, and
 * on Done; empty removes the note.
 */
export function SheetNotesEditor({
  sheet,
  notes,
  startAt,
  hidden,
  onToggleHidden,
  onSaveSong,
  onSaveSection,
  onClose,
}: {
  /** The sheet whose notes are open, or null when closed. */
  sheet: ChordSheet | null
  notes: SheetNotes | undefined
  /** What to open on: SONG, or a section's id. */
  startAt: string
  hidden: boolean
  onToggleHidden: () => void
  onSaveSong: (text: string) => void
  onSaveSection: (sectionId: string, text: string) => void
  onClose: () => void
}) {
  const colors = useThemeColors()
  const c = useNoteColors()
  const insets = useSafeAreaInsets()
  // A phone on its side: the keyboard takes most of the height, so the
  // header is tighter and the field two lines, to keep it above it.
  const short = useWindowDimensions().height < 500
  const [target, setTarget] = useState(startAt)
  // Each opening starts where it was asked to.
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  const opening = sheet ? `${String(sheet.id)}:${startAt}` : null
  if (opening !== openedFor) {
    setOpenedFor(opening)
    setTarget(startAt)
  }

  if (!sheet) return null

  const targets = [
    { id: SONG, short: 'Song', long: 'Song' },
    ...sheet.sections.map((s) => ({
      id: s.id,
      short: getSectionShortLabel(sheet.sections, s.id),
      long: getSectionLabel(sheet.sections, s.id),
    })),
  ]
  const current = targets.find((t) => t.id === target) ?? targets[0]
  const textFor = (id: string) => (id === SONG ? notes?.song : notes?.sections?.[id]) ?? ''

  const done = () => {
    settlePage()
    onClose()
  }

  return (
    <FullScreenOverlay visible animationType="fade" transparent onRequestClose={done}>
      <View
        style={[
          styles.screen,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <YStack
          paddingHorizontal="$3"
          paddingVertical={short ? '$1.5' : '$3'}
          gap={short ? '$1.5' : '$2'}
          width="100%"
          maxWidth={640}
          alignSelf="center"
        >
          <XStack alignItems="center" gap="$2">
            <Text color={c.text} fontSize="$4" fontWeight="700" flex={1} numberOfLines={1}>
              ✎ {current.long}
              <Text color={colors.textMuted} fontSize="$3" fontWeight="400">
                {`  ·  ${sheet.title}`}
              </Text>
            </Text>
            <Pressable
              onPress={done}
              accessibilityRole="button"
              accessibilityLabel="Done editing notes"
              style={short ? styles.chip : styles.touch}
            >
              <XStack
                backgroundColor={c.text}
                borderRadius={99}
                paddingHorizontal="$3"
                alignItems="center"
                flexGrow={1}
              >
                <Text color={c.onText} fontSize="$2" fontWeight="700">
                  ✓ Done
                </Text>
              </XStack>
            </Pressable>
          </XStack>

          <NoteField
            key={`${String(sheet.id)}:${current.id}`}
            lines={short ? 2 : 3}
            initial={textFor(current.id)}
            placeholder={
              current.id === SONG
                ? 'A note for the song: capo, count-in, who starts…'
                : `A note for ${current.long}`
            }
            onSave={(text) =>
              current.id === SONG ? onSaveSong(text) : onSaveSection(current.id, text)
            }
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <XStack gap="$1.5">
              {targets.map((t) => {
                const on = t.id === current.id
                const has = textFor(t.id) !== ''
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setTarget(t.id)}
                    accessibilityRole="button"
                    aria-selected={on}
                    accessibilityLabel={`Note for ${t.long}${has ? ', has a note' : ''}`}
                    style={styles.chip}
                  >
                    <XStack
                      backgroundColor={on ? c.text : has ? c.bg : 'transparent'}
                      borderWidth={1}
                      borderColor={c.text}
                      borderRadius={99}
                      paddingHorizontal="$2.5"
                      alignItems="center"
                      flexGrow={1}
                    >
                      <Text color={on ? c.onText : c.text} fontSize="$2" fontWeight="600">
                        {t.short}
                        {has ? ' ✎' : ''}
                      </Text>
                    </XStack>
                  </Pressable>
                )
              })}
            </XStack>
          </ScrollView>

          <XStack alignItems="center" justifyContent="space-between" gap="$2">
            <Text color={colors.textMuted} fontSize="$2" flexShrink={1}>
              Only you see your notes.
            </Text>
            <Pressable
              onPress={onToggleHidden}
              accessibilityRole="switch"
              aria-checked={!hidden}
              accessibilityLabel="Show notes on the sheet"
              style={styles.chip}
            >
              <Text color={c.text} fontSize="$2" fontWeight="600">
                Show on the sheet: {hidden ? 'Off' : 'On'}
              </Text>
            </Pressable>
          </XStack>
        </YStack>
      </View>
    </FullScreenOverlay>
  )
}

/**
 * A note being written. Saved a moment after typing stops, and whatever is
 * unsaved when the field goes — another section chosen, or Done — is saved
 * then. Empty, the note is removed.
 *
 * A fixed three lines tall (two on a phone on its side), scrolling inside itself past that, so it never
 * grows down towards the keyboard. 16pt text: smaller, and an iPhone zooms
 * the page in on the field when it is tapped.
 */
function NoteField({
  initial,
  placeholder,
  lines,
  onSave,
}: {
  initial: string
  placeholder: string
  lines: number
  onSave: (text: string) => void
}) {
  const c = useNoteColors()
  const colors = useThemeColors()
  const [text, setText] = useState(initial)
  const saved = useRef(initial)
  const latest = useRef(initial)
  const save = useRef(onSave)
  useEffect(() => {
    save.current = onSave
  }, [onSave])
  useEffect(() => {
    latest.current = text
    if (text === saved.current) return
    const timer = setTimeout(() => {
      saved.current = text
      save.current(text)
    }, 600)
    return () => clearTimeout(timer)
  }, [text])
  useEffect(
    () => () => {
      if (latest.current !== saved.current) save.current(latest.current)
    },
    []
  )
  return (
    <WithDictation value={text} onChangeText={setText} multiline>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        maxLength={NOTE_MAX}
        multiline
        scrollEnabled
        textAlignVertical="top"
        accessibilityLabel={placeholder}
        style={{
          color: colors.text,
          backgroundColor: c.bg,
          borderColor: c.text,
          borderWidth: 1,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
          fontSize: 16,
          lineHeight: 21,
          height: lines * 21 + 16 + 2,
        }}
      />
    </WithDictation>
  )
}

/**
 * Put the page back as it was before the keyboard: let go of the field, and
 * undo any scroll the browser made to keep it in sight. Nothing to do on
 * native, where the keyboard never moves the screen.
 */
function settlePage() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return
  const active = document.activeElement as HTMLElement | null
  active?.blur?.()
  const back = () => {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    const root = document.scrollingElement
    if (root && root.scrollTop) root.scrollTop = 0
  }
  back()
  // Again once the keyboard has gone, which takes the browser a moment.
  setTimeout(back, 300)
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  touch: {
    minHeight: 44,
    justifyContent: 'center',
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
  },
})
