import { useState } from 'react'
import { View, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { useThemeColors } from '@/theme/useThemeColors'
import { NNS_KEYS, getWordSlots } from '@/lib/nashvilleNumbers'
import { formatToken, getSectionLabel, PROGRESSION_END } from './chordSheetFormat'
import type { ChordSheetSection } from '@/types/chordSheet'
import {
  parseChart,
  keyFromName,
  guessKey,
  allChords,
  toSheetSections,
  type ImportedSong,
} from '@/lib/chordImport'
import { pickTextFile } from '@/lib/readTextFile'

export interface ImportedChart {
  title: string
  artist: string
  bpm: string
  sections: ChordSheetSection[]
}

/**
 * Bring a chart in from elsewhere: paste it, or choose a file.
 *
 * Reads ChordPro and chords written over lyrics (see lib/chordImport), shows
 * what it made of it — sections, chords on their words, the key it is
 * reading it in — and hands the result to the builder, where it is checked
 * and saved like any sheet typed by hand. Nothing is saved from here.
 *
 * The key is shown and can be changed because everything depends on it: the
 * sheet stores numbers, and a chart read in the wrong key is a chart of the
 * wrong numbers. When the chart names its key that is used; when it does not,
 * the chords are used to guess, and the preview says so.
 */
export function ChordImportModal({
  visible,
  onClose,
  onImport,
}: {
  visible: boolean
  onClose: () => void
  /** True if the builder took the chart; false if it was declined, so it stays here. */
  onImport: (chart: ImportedChart) => Promise<boolean>
}) {
  const colors = useThemeColors()
  const [text, setText] = useState('')
  const [song, setSong] = useState<ImportedSong | null>(null)
  const [keyIdx, setKeyIdx] = useState(0)
  const [keySource, setKeySource] = useState<'chart' | 'guessed'>('guessed')
  const [writtenIn, setWrittenIn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  // The preview in letters checks the chart was read right; in numbers it
  // checks the key — letters come back the same in any key, numbers do not.
  const [showNumbers, setShowNumbers] = useState(false)

  const read = (source: string) => {
    setError(null)
    if (!source.trim()) {
      setSong(null)
      return
    }
    const parsed = parseChart(source)
    if (parsed.sections.length === 0) {
      setSong(null)
      setError("Couldn't find a song in that. Paste the chart with its chords and words.")
      return
    }
    const named = parsed.key ? keyFromName(parsed.key) : null
    setSong(parsed)
    setKeyIdx(named ? named.keyIdx : guessKey(allChords(parsed)))
    setKeySource(named ? 'chart' : 'guessed')
    setWrittenIn(named?.minor ? (parsed.key ?? null) : null)
  }

  const chooseFile = async () => {
    setError(null)
    setReading(true)
    try {
      const file = await pickTextFile()
      if (!file) return
      setText(file.text)
      read(file.text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setReading(false)
    }
  }

  const close = () => {
    setText('')
    setSong(null)
    setError(null)
    onClose()
  }

  const converted = song ? toSheetSections(song, keyIdx) : null
  const notRead = song ? [...(converted?.unreadable ?? []), ...song.skipped] : []

  const useIt = async () => {
    if (!song || !converted) return
    const taken = await onImport({
      title: song.title ?? '',
      artist: song.artist ?? '',
      bpm: song.bpm ? String(song.bpm) : '',
      sections: converted.sections,
    })
    // Kept if the builder declined it — "don't replace what I have" is not
    // "throw away the chart I just pasted".
    if (!taken) return
    setText('')
    setSong(null)
    setError(null)
  }

  return (
    <FullScreenOverlay visible={visible} animationType="fade" transparent onRequestClose={close}>
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
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={colors.text} fontSize="$5" fontWeight="700" flex={1}>
              Import a chart
            </Text>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close">
              <Text color={colors.textMuted} fontSize="$4" paddingHorizontal="$2">
                ✕
              </Text>
            </Pressable>
          </XStack>

          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
            <YStack gap="$3">
              <Text color={colors.textMuted} fontSize="$2">
                Paste a chart — ChordPro, or chords written over the lyrics the way SongSelect shows
                them — or choose a ChordPro or text file.
              </Text>

              <XStack gap="$2" flexWrap="wrap">
                <ActionButton
                  label={reading ? 'Reading…' : 'Choose a file'}
                  onPress={chooseFile}
                  disabled={reading}
                />
                <ActionButton
                  label="Read pasted chart"
                  onPress={() => read(text)}
                  disabled={!text.trim()}
                />
              </XStack>

              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                placeholder={
                  '{title: Amazing Grace}\n{key: G}\n[G]Amazing [C]grace\n\n…or chords over lyrics'
                }
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.paste,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
                accessibilityLabel="Chart to import"
              />

              {error ? (
                <Text color="#c0392b" fontSize="$2">
                  {error}
                </Text>
              ) : null}

              {song && converted ? (
                <YStack gap="$3">
                  <YStack gap="$1">
                    <Text color={colors.text} fontWeight="700" fontSize="$4">
                      {song.title || 'Untitled — add a title in the builder'}
                    </Text>
                    <Text color={colors.textMuted} fontSize="$2">
                      {[
                        song.artist,
                        song.bpm ? `${song.bpm} BPM` : null,
                        song.format === 'chordpro'
                          ? 'Read as ChordPro'
                          : 'Read as chords over lyrics',
                        `${converted.sections.length} section${converted.sections.length === 1 ? '' : 's'}`,
                        `${converted.chordCount} chord${converted.chordCount === 1 ? '' : 's'}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </YStack>

                  <YStack gap="$1">
                    <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                      KEY IT&apos;S WRITTEN IN
                    </Text>
                    <XStack gap={4} flexWrap="wrap">
                      {NNS_KEYS.map((k, i) => (
                        <Pressable
                          key={k}
                          onPress={() => setKeyIdx(i)}
                          accessibilityRole="button"
                          accessibilityLabel={`Key of ${k}`}
                          // aria-selected rather than accessibilityState: the
                          // web build drops the latter, so the chosen key was
                          // never announced.
                          aria-selected={keyIdx === i}
                        >
                          <XStack
                            minWidth={40}
                            height={36}
                            alignItems="center"
                            justifyContent="center"
                            borderRadius={99}
                            borderWidth={1}
                            borderColor={colors.primary}
                            backgroundColor={keyIdx === i ? colors.primary : 'transparent'}
                          >
                            <Text
                              color={keyIdx === i ? 'white' : colors.primary}
                              fontSize="$2"
                              fontWeight="700"
                            >
                              {k}
                            </Text>
                          </XStack>
                        </Pressable>
                      ))}
                    </XStack>
                    <Text color={colors.textMuted} fontSize="$1">
                      {keySource === 'chart'
                        ? writtenIn
                          ? `The chart is in ${writtenIn}. Numbered from its relative major, ${NNS_KEYS[keyIdx]}, so ${writtenIn} is the 6m.`
                          : 'From the chart.'
                        : 'Guessed from the chords. Check it with the preview in Numbers: in the right key a song is mostly 1, 4, 5 and 6m.'}
                    </Text>
                  </YStack>

                  {notRead.length > 0 ? (
                    <Text color="#c0392b" fontSize="$2">
                      Left out, not read as chords: {[...new Set(notRead)].join(', ')}
                    </Text>
                  ) : null}

                  <XStack gap={4}>
                    {(['Chords', 'Numbers'] as const).map((mode) => {
                      const on = (mode === 'Numbers') === showNumbers
                      return (
                        <Pressable
                          key={mode}
                          onPress={() => setShowNumbers(mode === 'Numbers')}
                          accessibilityRole="button"
                          accessibilityLabel={`Preview as ${mode.toLowerCase()}`}
                          aria-selected={on}
                        >
                          <XStack
                            height={32}
                            paddingHorizontal="$3"
                            alignItems="center"
                            borderRadius={99}
                            borderWidth={1}
                            borderColor={colors.border}
                            backgroundColor={on ? colors.primary + '22' : 'transparent'}
                          >
                            <Text
                              color={on ? colors.primary : colors.textMuted}
                              fontSize="$2"
                              fontWeight="600"
                            >
                              {mode}
                            </Text>
                          </XStack>
                        </Pressable>
                      )
                    })}
                  </XStack>

                  <YStack gap="$3">
                    {converted.sections.map((section) => (
                      <SectionPreview
                        key={section.id}
                        label={getSectionLabel(converted.sections, section.id)}
                        section={section}
                        keyIdx={showNumbers ? -1 : keyIdx}
                      />
                    ))}
                  </YStack>
                </YStack>
              ) : null}
            </YStack>
          </ScrollView>

          <XStack gap="$2" justifyContent="flex-end">
            <ActionButton label="Cancel" onPress={close} />
            <ActionButton label="Use this chart" onPress={useIt} disabled={!song} primary />
          </XStack>
        </YStack>
      </View>
    </FullScreenOverlay>
  )
}

/**
 * A section as the viewer would draw it: each chord over its word. A keyIdx
 * below zero shows the numbers as stored rather than chords in a key.
 */
function SectionPreview({
  label,
  section,
  keyIdx,
}: {
  label: string
  section: ChordSheetSection
  keyIdx: number
}) {
  const colors = useThemeColors()
  const lines = section.lyrics ? section.lyrics.split('\n') : []
  return (
    <YStack gap="$1">
      <Text color={colors.primary} fontWeight="700" fontSize="$3">
        {label}
      </Text>
      {lines.length === 0 ? (
        <Text style={styles.mono} color={colors.primary}>
          {(section.chordTokens[0] ?? [])
            .map((t) => (t === PROGRESSION_END ? '|' : formatToken(t, keyIdx, false)))
            .join('  ')}
        </Text>
      ) : (
        lines.map((line, li) => (
          <XStack key={li} flexWrap="wrap" alignItems="flex-end">
            {getWordSlots(line).map((slot, si) => (
              <YStack key={si} marginRight={slot.trailing === ' ' ? 8 : 2}>
                <Text style={styles.mono} color={colors.primary} fontWeight="700">
                  {formatToken(section.chordTokens[li]?.[si] ?? '', keyIdx, false) || ' '}
                </Text>
                <Text style={styles.mono} color={colors.text}>
                  {slot.text}
                  {slot.trailing === '-' ? '-' : ''}
                </Text>
              </YStack>
            ))}
          </XStack>
        ))
      )}
    </YStack>
  )
}

function ActionButton({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  primary?: boolean
}) {
  const colors = useThemeColors()
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button">
      <XStack
        minHeight={40}
        paddingHorizontal="$3"
        alignItems="center"
        borderRadius="$2"
        borderWidth={1}
        borderColor={colors.primary}
        backgroundColor={primary ? colors.primary : 'transparent'}
        opacity={disabled ? 0.45 : 1}
      >
        <Text color={primary ? 'white' : colors.primary} fontWeight="700" fontSize="$2">
          {label}
        </Text>
      </XStack>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paste: {
    minHeight: 160,
    maxHeight: 260,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontFamily: 'Courier New',
    fontSize: 13,
    textAlignVertical: 'top',
  },
  mono: {
    fontFamily: 'Courier New',
    fontSize: 13,
  },
})
