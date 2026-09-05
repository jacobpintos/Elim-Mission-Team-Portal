import { useState, useEffect, useRef } from 'react'
import {
  Modal,
  View,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { getWordSlots } from '@/lib/nashvilleNumbers'
import { ChordKeypad } from './ChordKeypad'
import { confirmAsync } from '@/lib/confirm'
import { clearChordTokens, hasAnyChord } from '@/lib/chordSheetEdit'
import { appendChordKey, backspaceChordToken, pinExtension } from '@/lib/chordKeypad'
import {
  SECTION_TYPES,
  SECTION_LABELS,
  type SectionType,
  type ChordSheetSection,
  type ChordSheet,
} from '@/types/chordSheet'

const PROGRESSION_END = '||'

/** The red the rest of the app uses for actions that cannot be undone. */
const DESTRUCTIVE = '#c0392b'

/** Gap left between a revealed chord box and the top of the pad. */
const REVEAL_MARGIN = 24

/** Which chord box the keypad is editing. */
interface SelectedSlot {
  sectionId: string
  rowIdx: number
  wordIdx: number
  /** The lyric the chord sits over, shown on the pad for orientation. */
  context?: string
}

/**
 * Is the web app being touched rather than pointed at?
 *
 * Checked per render rather than once: a tablet with a keyboard attached can
 * change its answer, and the check is a media query lookup.
 */
function isTouchWeb(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches ?? false
}

/**
 * One chord box.
 *
 * Two shapes for one job, because the platforms differ in a way that cannot
 * be papered over: React Native's showSoftInputOnFocus is Android-only, so on
 * iOS a focused TextInput raises the system keyboard no matter what, and the
 * chord pad would arrive underneath a keyboard nobody asked for. So on a
 * device the box is not a text field at all — it is a button that selects
 * itself, and the pad is the only way to type in it.
 *
 * On the web it depends on what is pointing at it. With a mouse it stays a
 * real input, because a sheet built at a desk is faster typed than tapped.
 * Under a finger it becomes the same button as on a device: Safari zooms the
 * page whenever an input smaller than 16px takes focus, and never zooms back,
 * so every chord box tapped on a phone left the page magnified. The boxes are
 * 13px so a token fits over a word, and growing them to 16 would cost the
 * alignment that makes the grid readable — so the fix is to stop focusing an
 * input at all where that is what happens.
 */
function ChordSlot({
  value,
  width,
  selected,
  onSelect,
  onChangeText,
  colors,
  placeholder,
  onReveal,
}: {
  value: string
  width?: number
  selected: boolean
  onSelect: () => void
  onChangeText: (v: string) => void
  colors: ReturnType<typeof useThemeColors>
  placeholder?: string
  /** Where this box ended up on screen, so the editor can lift it clear. */
  onReveal?: (pageY: number, height: number) => void
}) {
  const ref = useRef<View>(null)

  /**
   * Report the box's position a moment after it is chosen.
   *
   * A moment, because the pad is what covers it and the pad is only laid out
   * once the selection exists — measuring in the same tick reads the screen
   * as it was before the pad arrived.
   */
  const select = () => {
    onSelect()
    setTimeout(() => {
      ref.current?.measureInWindow((_x, y, _w, h) => onReveal?.(y, h))
    }, 80)
  }
  const boxStyle = [
    styles.chordBox,
    {
      width,
      color: colors.primary,
      borderColor: selected ? colors.primary : colors.primary + '80',
      borderWidth: selected ? 2 : 1,
      backgroundColor: selected ? colors.primary + '18' : colors.surface,
    },
  ]

  if (Platform.OS === 'web' && !isTouchWeb()) {
    return (
      <View ref={ref}>
        <TextInput
          style={boxStyle}
          value={value}
          onChangeText={onChangeText}
          onFocus={select}
          placeholder={placeholder ?? ''}
          placeholderTextColor={colors.textMuted}
          // The web app is used on phones as much as at a desk, and a focused
          // input there raises the browser's own keyboard on top of this one's.
          // inputMode="none" reaches the DOM attribute that tells a touch
          // browser not to, while leaving a physical keyboard free to type —
          // which is the whole reason this stays an input on web.
          inputMode="none"
        />
      </View>
    )
  }

  return (
    <Pressable onPress={select} accessibilityRole="button">
      <View ref={ref} style={[...boxStyle, styles.chordSlotButton]}>
        <Text
          style={{ fontFamily: 'Courier New', fontSize: 13 }}
          color={value ? colors.primary : colors.textMuted}
          numberOfLines={1}
        >
          {value || placeholder || ''}
        </Text>
      </View>
    </Pressable>
  )
}

function isBreakRow(row: string[]): boolean {
  return row.length === 1 && row[0] === PROGRESSION_END
}

function makeSection(type: SectionType): ChordSheetSection {
  return {
    id: String(Date.now() + Math.random()),
    type,
    lyrics: '',
    chordTokens: [[]],
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

// Sync chordTokens to match the current lyrics lines, preserving break rows.
function syncSectionTokens(lyrics: string, existing: string[][]): string[][] {
  if (!lyrics.trim()) {
    return [existing[0] ?? []]
  }
  const lines = lyrics.split('\n')
  const result: string[][] = []
  let lyricIdx = 0

  for (const row of existing) {
    if (isBreakRow(row)) {
      result.push([PROGRESSION_END])
      continue
    }
    if (lyricIdx < lines.length) {
      const count = getWordSlots(lines[lyricIdx]).length
      const prev = row
      if (count === prev.length) result.push(prev)
      else if (count > prev.length) result.push([...prev, ...Array(count - prev.length).fill('')])
      else result.push(prev.slice(0, count))
      lyricIdx++
    }
    // rows past the end of lyrics are dropped (lyrics were deleted)
  }

  // Add rows for any new lyrics lines beyond existing rows
  while (lyricIdx < lines.length) {
    const count = getWordSlots(lines[lyricIdx]).length
    result.push(Array(count).fill(''))
    lyricIdx++
  }

  return result
}

// Estimate column width from word character count (Courier New 13px ≈ 8px/char)
function colWidth(word: string, minW = 40): number {
  return Math.max(word.length * 9 + 8, minW)
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
  const [showChordHelp, setShowChordHelp] = useState(false)
  const [selected, setSelected] = useState<SelectedSlot | null>(null)
  // Lives only as long as the editor: a pinned key is a convenience, not a
  // setting anyone should have to manage.
  const [pinnedExtensions, setPinnedExtensions] = useState<string[]>([])
  // How tall the pad is, measured rather than assumed: it is a different size
  // on each pane, and a row taller once an extension is pinned.
  const [padHeight, setPadHeight] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const scrollYRef = useRef(0)
  const [revealTarget, setRevealTarget] = useState<{ contentY: number; height: number } | null>(
    null
  )
  // Where the scroll view sits on screen and how tall it is, so a box
  // measured against the window can be placed within the view's own content.
  const scrollTopRef = useRef(0)
  const scrollHeightRef = useRef(0)
  const scrollWrapRef = useRef<View>(null)

  useEffect(() => {
    if (!visible) return
    /* eslint-disable react-hooks/set-state-in-effect */
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
    /* eslint-enable react-hooks/set-state-in-effect */
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
        sections: sections.map((s) => ({
          ...s,
          // Strip trailing empty tokens from instrumentals (keep || markers)
          chordTokens: !s.lyrics.trim()
            ? [(s.chordTokens[0] ?? []).filter(Boolean)]
            : s.chordTokens,
        })),
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
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      const hasPrevOfType = prev.slice(0, idx).some((s) => s.type === type)
      return prev.map((s) =>
        s.id === id ? { ...s, type, sameAsPrevious: hasPrevOfType ? s.sameAsPrevious : false } : s
      )
    })
  }

  const toggleSameAsPrevious = (id: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, sameAsPrevious: !s.sameAsPrevious } : s))
    )
  }

  const updateSectionLyrics = (id: string, lyrics: string) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        return { ...s, lyrics, chordTokens: syncSectionTokens(lyrics, s.chordTokens) }
      })
    )
  }

  /**
   * Scroll a chosen box out from under the pad.
   *
   * Runs again whenever the pad's height changes, which covers the two cases
   * one measurement misses: the first tap, where the pad has not been laid
   * out and reports nothing, and pinning an extension, which grows the pad by
   * a row and can put the box back underneath it.
   *
   * Works out where the view must be scrolled to rather than by how much, so
   * running twice lands in the same place instead of scrolling twice.
   */
  useEffect(() => {
    if (!revealTarget || !scrollRef.current) return
    const visibleHeight = scrollHeightRef.current - padHeight - REVEAL_MARGIN
    if (visibleHeight <= 0) return

    const bottom = revealTarget.contentY + revealTarget.height
    const needed = bottom - visibleHeight
    if (needed <= scrollYRef.current) return

    scrollRef.current.scrollTo({ y: needed, animated: true })
  }, [revealTarget, padHeight])

  const selectedToken = (() => {
    if (!selected) return ''
    const section = sections.find((s) => s.id === selected.sectionId)
    return section?.chordTokens[selected.rowIdx]?.[selected.wordIdx] ?? ''
  })()

  /**
   * Lift a chosen chord box clear of the pad.
   *
   * The pad is docked at the bottom of the modal, so a box in the lower third
   * of the screen ends up behind it — and it is the box being edited, which
   * is the one thing that has to stay visible. Nothing scrolls on its own
   * here: the boxes sit in a scroll view that has no idea a pad appeared.
   */
  /**
   * Ask for a box to be lifted clear of the pad.
   *
   * Stored in the scroll view's own coordinates rather than the screen's, so
   * the figure stays true after the view scrolls. The effect below can then
   * run as many times as it likes — on the first tap, when the pad reports
   * its height, and again if the pad grows — and arrive at the same answer
   * instead of chasing a number that moved.
   */
  const revealSlot = (pageY: number, height: number) => {
    setRevealTarget({
      contentY: pageY - scrollTopRef.current + scrollYRef.current,
      height,
    })
  }

  const handleKey = (key: string) => {
    if (!selected) return
    updateChordToken(
      selected.sectionId,
      selected.rowIdx,
      selected.wordIdx,
      appendChordKey(selectedToken, key)
    )
  }

  const handleBackspace = () => {
    if (!selected) return
    updateChordToken(
      selected.sectionId,
      selected.rowIdx,
      selected.wordIdx,
      backspaceChordToken(selectedToken)
    )
  }

  const handleClearSlot = () => {
    if (!selected) return
    updateChordToken(selected.sectionId, selected.rowIdx, selected.wordIdx, '')
  }

  /**
   * Empty every chord in the song, keeping the words and the arrangement.
   *
   * Confirmed first because there is no undo in this editor and a sheet is
   * many minutes of work — and the button sits next to the ones that add a
   * section, where a mis-tap is easy.
   */
  const clearAllChords = async () => {
    const ok = await confirmAsync(
      'Remove every chord from this song? The words, sections and progression breaks stay as they are.',
      { title: 'Clear all chords', confirmLabel: 'Clear chords', destructive: true }
    )
    if (!ok) return
    setSelected(null)
    setSections((prev) => prev.map((s) => ({ ...s, chordTokens: clearChordTokens(s.chordTokens) })))
  }

  const updateChordToken = (sectionId: string, rowIdx: number, wordIdx: number, value: string) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        const newTokens = s.chordTokens.map((row, ri) => {
          if (ri !== rowIdx) return row
          const newRow = [...row]
          newRow[wordIdx] = value
          return newRow
        })
        return { ...s, chordTokens: newTokens }
      })
    )
  }

  const addInstrumentalSlot = (sectionId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id !== sectionId ? s : { ...s, chordTokens: [[...(s.chordTokens[0] ?? []), '']] }
      )
    )
  }

  const addProgressionBreak = (sectionId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id !== sectionId
          ? s
          : { ...s, chordTokens: [[...(s.chordTokens[0] ?? []), PROGRESSION_END]] }
      )
    )
  }

  const removeInstrumentalSlot = (sectionId: string, idx: number) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        const newRow = (s.chordTokens[0] ?? []).filter((_, i) => i !== idx)
        return { ...s, chordTokens: [newRow] }
      })
    )
  }

  // Insert a break row after the given rowIdx in a lyrics section's chordTokens.
  const addBreakAfterRow = (sectionId: string, rowIdx: number) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        const newTokens = [...s.chordTokens]
        newTokens.splice(rowIdx + 1, 0, [PROGRESSION_END])
        return { ...s, chordTokens: newTokens }
      })
    )
  }

  // Remove a break row at the given rowIdx in a lyrics section's chordTokens.
  const removeBreakRow = (sectionId: string, rowIdx: number) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        return { ...s, chordTokens: s.chordTokens.filter((_, i) => i !== rowIdx) }
      })
    )
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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

          {/* The wrapper exists to be measured: a ScrollView ref exposes
              scrolling but not measureInWindow, and placing a box within the
              view's own content needs to know where the view starts. */}
          <View
            style={{ flexShrink: 1 }}
            onLayout={(e) => {
              scrollHeightRef.current = e.nativeEvent.layout.height
              scrollWrapRef.current?.measureInWindow((_x, y) => {
                scrollTopRef.current = y
              })
            }}
            ref={scrollWrapRef}
          >
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
              onScroll={(e) => {
                scrollYRef.current = e.nativeEvent.contentOffset.y
              }}
              scrollEventThrottle={16}
            >
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

                {/* Sits with the song's own details rather than with the section
                    buttons: it acts on the whole song, and one place for it
                    means it cannot be hit while reaching for a section. Shown
                    only when there is something to clear. */}
                {hasAnyChord(sections.map((s) => s.chordTokens)) ? (
                  <Pressable onPress={clearAllChords}>
                    <XStack
                      alignSelf="flex-start"
                      borderRadius="$2"
                      borderWidth={1}
                      borderColor={DESTRUCTIVE}
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                    >
                      <Text color={DESTRUCTIVE} fontSize="$2" fontWeight="600">
                        Clear all chords
                      </Text>
                    </XStack>
                  </Pressable>
                ) : null}

                {/* Sections */}
                {sections.map((section) => {
                  const hasLyrics = section.lyrics.trim().length > 0
                  const lyricsLines = hasLyrics ? section.lyrics.split('\n') : []
                  const sectionIdx = sections.findIndex((s) => s.id === section.id)
                  const prevOfType =
                    sections
                      .slice(0, sectionIdx)
                      .reverse()
                      .find((s) => s.type === section.type) ?? null
                  const prevLabel = prevOfType ? getSectionLabel(sections, prevOfType.id) : null
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
                              backgroundColor={section.type === t ? colors.primary : colors.surface}
                              borderRadius={99}
                              borderWidth={1}
                              borderColor={section.type === t ? colors.primary : colors.border}
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

                      {/* Same-as-previous toggle */}
                      {prevLabel ? (
                        <Pressable onPress={() => toggleSameAsPrevious(section.id)}>
                          <XStack
                            backgroundColor={
                              section.sameAsPrevious ? colors.primary + '22' : colors.surface
                            }
                            borderRadius="$2"
                            borderWidth={1}
                            borderColor={section.sameAsPrevious ? colors.primary : colors.border}
                            paddingHorizontal="$2"
                            paddingVertical="$1"
                            alignSelf="flex-start"
                            alignItems="center"
                            gap="$1"
                          >
                            <Text
                              color={section.sameAsPrevious ? colors.primary : colors.textMuted}
                              fontSize="$1"
                              fontWeight={section.sameAsPrevious ? '700' : '400'}
                            >
                              {section.sameAsPrevious
                                ? `✓ Same as ${prevLabel}`
                                : `Same as ${prevLabel}`}
                            </Text>
                          </XStack>
                        </Pressable>
                      ) : null}

                      {/* Lyrics + chords — hidden when marked same-as-previous */}
                      {!section.sameAsPrevious ? (
                        <>
                          {/* Lyrics */}
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

                          {/* Chord inputs */}
                          <XStack alignItems="center" gap="$1" marginTop="$1">
                            <Text color={colors.textMuted} fontSize="$1" fontWeight="600">
                              CHORDS (Nashville Numbers)
                            </Text>
                            <Pressable onPress={() => setShowChordHelp((v) => !v)}>
                              <XStack
                                width={16}
                                height={16}
                                borderRadius={99}
                                borderWidth={1}
                                borderColor={colors.textMuted}
                                alignItems="center"
                                justifyContent="center"
                              >
                                <Text color={colors.textMuted} fontSize={10} lineHeight={14}>
                                  ?
                                </Text>
                              </XStack>
                            </Pressable>
                          </XStack>

                          {showChordHelp ? (
                            <YStack
                              backgroundColor={colors.surface}
                              borderRadius="$3"
                              borderWidth={1}
                              borderColor={colors.border}
                              padding="$3"
                              gap="$2"
                            >
                              <Text color={colors.text} fontSize="$2" fontWeight="700">
                                Token format: [b or #][number][quality]
                              </Text>
                              <YStack gap="$1">
                                {[
                                  ['1', 'Plain chord (the 1 chord)'],
                                  ['b7', 'Flat 7'],
                                  ['#4', 'Sharp 4'],
                                  ['5m', 'Minor chord'],
                                  ['4maj7', 'Major 7'],
                                  ['17', 'Dominant 7 (or two boxes: 1 and 7)'],
                                  ['b7m', 'Flat 7 minor'],
                                  ['2sus4', 'Sus 4'],
                                  ['7dim', 'Diminished'],
                                  ['5aug', 'Augmented'],
                                  ['4/1', 'Slash chord — 4 over 1 bass (e.g. F/C)'],
                                  [
                                    '4>1',
                                    'Passing chord — moves from 4 to 1 on same syllable (displays as F → C)',
                                  ],
                                ].map(([token, desc]) => (
                                  <XStack key={token} gap="$2" alignItems="center">
                                    <Text
                                      style={{ fontFamily: 'Courier New', fontSize: 12 }}
                                      color={colors.primary}
                                      fontWeight="700"
                                    >
                                      {token}
                                    </Text>
                                    <Text color={colors.textMuted} fontSize="$1" flex={1}>
                                      {desc}
                                    </Text>
                                  </XStack>
                                ))}
                              </YStack>
                              <Text color={colors.textMuted} fontSize="$1">
                                The Major/Minor toggle in the viewer affects scale degrees, not
                                chord quality. Add m yourself for minor chords (e.g. 5m).
                              </Text>
                              <YStack
                                borderTopWidth={1}
                                borderColor={colors.border}
                                paddingTop="$2"
                                gap="$1"
                              >
                                <Text color={colors.text} fontSize="$2" fontWeight="700">
                                  Progression breaks
                                </Text>
                                <Text color={colors.textMuted} fontSize="$1">
                                  In a lyrics section, type a period after a chord (e.g. 1.) to mark
                                  where a progression ends. The dot is hidden in the chord sheet and
                                  Chords Only view — it only controls where repeats collapse. In
                                  Chords Only view, identical consecutive cycles collapse to ×2, ×3,
                                  etc. (The ‖ buttons mark the same kind of break.)
                                </Text>
                              </YStack>
                            </YStack>
                          ) : null}

                          {!hasLyrics ? (
                            /* Instrumental: individual add/remove chord boxes + progression break */
                            <XStack flexWrap="wrap" gap="$1" alignItems="center">
                              {(section.chordTokens[0] ?? []).map((token, wi) =>
                                token === PROGRESSION_END ? (
                                  <YStack key={wi} alignItems="center" gap={2}>
                                    <Pressable
                                      onPress={() => removeInstrumentalSlot(section.id, wi)}
                                    >
                                      <Text
                                        color={colors.textMuted}
                                        fontSize="$1"
                                        style={{ textAlign: 'center' }}
                                      >
                                        ×
                                      </Text>
                                    </Pressable>
                                    <View
                                      style={[
                                        styles.progressionBreak,
                                        { borderColor: colors.border },
                                      ]}
                                    />
                                  </YStack>
                                ) : (
                                  <YStack key={wi} alignItems="center" gap={2}>
                                    <Pressable
                                      onPress={() => removeInstrumentalSlot(section.id, wi)}
                                    >
                                      <Text
                                        color={colors.textMuted}
                                        fontSize="$1"
                                        style={{ textAlign: 'center' }}
                                      >
                                        ×
                                      </Text>
                                    </Pressable>
                                    <ChordSlot
                                      value={token}
                                      colors={colors}
                                      placeholder="—"
                                      selected={
                                        selected?.sectionId === section.id &&
                                        selected.rowIdx === 0 &&
                                        selected.wordIdx === wi
                                      }
                                      onSelect={() =>
                                        setSelected({
                                          sectionId: section.id,
                                          rowIdx: 0,
                                          wordIdx: wi,
                                        })
                                      }
                                      onChangeText={(v) => updateChordToken(section.id, 0, wi, v)}
                                      onReveal={revealSlot}
                                    />
                                  </YStack>
                                )
                              )}
                              <Pressable onPress={() => addInstrumentalSlot(section.id)}>
                                <XStack
                                  backgroundColor={colors.primary + '18'}
                                  borderRadius="$2"
                                  borderWidth={1}
                                  borderColor={colors.primary}
                                  paddingHorizontal="$2"
                                  paddingVertical="$1"
                                >
                                  <Text color={colors.primary} fontSize="$1" fontWeight="600">
                                    + Add
                                  </Text>
                                </XStack>
                              </Pressable>
                              <Pressable onPress={() => addProgressionBreak(section.id)}>
                                <XStack
                                  backgroundColor={colors.surface}
                                  borderRadius="$2"
                                  borderWidth={1}
                                  borderColor={colors.border}
                                  paddingHorizontal="$2"
                                  paddingVertical="$1"
                                >
                                  <Text color={colors.textMuted} fontSize="$1" fontWeight="600">
                                    ‖ Break
                                  </Text>
                                </XStack>
                              </Pressable>
                            </XStack>
                          ) : (
                            /* Lyrics sections: per-row chord boxes, with break row support */
                            <YStack gap="$2">
                              {(() => {
                                // Build mapping: chordTokens rowIdx → lyrics lineIdx (null for break rows)
                                const rowToLyricIdx: (number | null)[] = []
                                let li = 0
                                for (const row of section.chordTokens) {
                                  rowToLyricIdx.push(isBreakRow(row) ? null : li++)
                                }

                                return section.chordTokens.map((row, rowIdx) => {
                                  // Break row — render as a thin divider with remove option
                                  if (isBreakRow(row)) {
                                    return (
                                      <XStack
                                        key={rowIdx}
                                        alignItems="center"
                                        gap="$2"
                                        paddingVertical="$0.5"
                                      >
                                        <View
                                          style={[
                                            styles.breakDivider,
                                            { borderColor: colors.border },
                                          ]}
                                        />
                                        <Pressable
                                          onPress={() => removeBreakRow(section.id, rowIdx)}
                                        >
                                          <Text color={colors.textMuted} fontSize="$1">
                                            × break
                                          </Text>
                                        </Pressable>
                                        <View
                                          style={[
                                            styles.breakDivider,
                                            { borderColor: colors.border },
                                          ]}
                                        />
                                      </XStack>
                                    )
                                  }

                                  const lyricIdx = rowToLyricIdx[rowIdx]!
                                  const lyricLine = lyricsLines[lyricIdx] ?? ''
                                  const slots = getWordSlots(lyricLine)

                                  if (!slots.length) {
                                    return <View key={rowIdx} style={{ height: 6 }} />
                                  }

                                  const nextRow = section.chordTokens[rowIdx + 1]
                                  const nextIsBreak = nextRow ? isBreakRow(nextRow) : false

                                  return (
                                    <XStack key={rowIdx} alignItems="flex-start" gap="$1">
                                      <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        style={{ flex: 1 }}
                                      >
                                        <XStack alignItems="flex-end" gap={0}>
                                          {slots.map((slot, wi) => {
                                            const token = row[wi] ?? ''
                                            const cw = colWidth(slot.text)
                                            return (
                                              <XStack key={wi} alignItems="flex-end">
                                                <YStack width={cw} alignItems="center" gap={2}>
                                                  <ChordSlot
                                                    value={token}
                                                    width={cw - 4}
                                                    colors={colors}
                                                    selected={
                                                      selected?.sectionId === section.id &&
                                                      selected.rowIdx === rowIdx &&
                                                      selected.wordIdx === wi
                                                    }
                                                    onSelect={() =>
                                                      setSelected({
                                                        sectionId: section.id,
                                                        rowIdx,
                                                        wordIdx: wi,
                                                        context: slot.text,
                                                      })
                                                    }
                                                    onChangeText={(v) =>
                                                      updateChordToken(section.id, rowIdx, wi, v)
                                                    }
                                                    onReveal={revealSlot}
                                                  />
                                                  <Text
                                                    style={[
                                                      styles.wordLabel,
                                                      { color: colors.text },
                                                    ]}
                                                    numberOfLines={1}
                                                  >
                                                    {slot.text}
                                                  </Text>
                                                </YStack>
                                                {slot.trailing === '-' ? (
                                                  <Text
                                                    style={[
                                                      styles.wordLabel,
                                                      {
                                                        color: colors.text,
                                                        alignSelf: 'flex-end',
                                                        paddingHorizontal: 1,
                                                      },
                                                    ]}
                                                  >
                                                    -
                                                  </Text>
                                                ) : slot.trailing === ' ' ? (
                                                  <View style={{ width: 8 }} />
                                                ) : null}
                                              </XStack>
                                            )
                                          })}
                                        </XStack>
                                      </ScrollView>
                                      {/* ‖ button — insert a break after this row */}
                                      {!nextIsBreak ? (
                                        <Pressable
                                          onPress={() => addBreakAfterRow(section.id, rowIdx)}
                                          style={styles.breakAfterBtn}
                                        >
                                          <Text
                                            color={colors.border}
                                            style={styles.breakAfterBtnText}
                                          >
                                            ‖
                                          </Text>
                                        </Pressable>
                                      ) : null}
                                    </XStack>
                                  )
                                })
                              })()}
                            </YStack>
                          )}
                        </>
                      ) : null}
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
          </View>

          {selected ? (
            <ChordKeypad
              onLayout={(h) => setPadHeight(h)}
              token={selectedToken}
              context={selected.context}
              onKey={handleKey}
              onBackspace={handleBackspace}
              onClear={handleClearSlot}
              onDone={() => {
                setRevealTarget(null)
                setSelected(null)
              }}
              pinned={pinnedExtensions}
              onPin={(key) => setPinnedExtensions((prev) => pinExtension(prev, key))}
            />
          ) : null}
        </YStack>
      </KeyboardAvoidingView>
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
  chordSlotButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chordBox: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 4,
    fontSize: 13,
    fontFamily: 'Courier New',
    textAlign: 'center',
    height: 28,
    minWidth: 36,
  },
  wordLabel: {
    fontFamily: 'Courier New',
    fontSize: 13,
    paddingHorizontal: 2,
  },
  progressionBreak: {
    height: 28,
    width: 2,
    borderRightWidth: 2,
    borderStyle: 'dashed',
    marginHorizontal: 6,
  },
  breakDivider: {
    flex: 1,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  breakAfterBtn: {
    paddingTop: 2,
    paddingHorizontal: 6,
    alignSelf: 'flex-start',
  },
  breakAfterBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
