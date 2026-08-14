import { useEffect, useState } from 'react'
import { Modal, View, ScrollView, Pressable, StyleSheet, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { YStack, XStack, Text } from 'tamagui'
import { printAsync } from 'expo-print'
import { useThemeColors } from '@/theme/useThemeColors'
import { useConfigStore } from '@/stores/configStore'
import { NNS_KEYS, getWordSlots } from '@/lib/nashvilleNumbers'
import type { ChordSheet, ChordSheetSection } from '@/types/chordSheet'
import {
  PROGRESSION_END,
  formatToken,
  stripBoundary,
  splitByProgressionEnd,
  compressGroups,
  buildChordSheetHtml,
  getSectionLabel,
  getPrevMatchingLabel,
  getPrevMatchingSection,
} from './chordSheetFormat'
import { buildChordSheetPdfBlob } from './chordSheetPdf'

interface KeyPrefs {
  key: string
  isMinor: boolean
}

const getKeyPrefs = (): KeyPrefs => {
  try {
    if (typeof window === 'undefined') return { key: '', isMinor: false }
    const raw = window.localStorage?.getItem('chordsheet_key_prefs')
    if (!raw) return { key: '', isMinor: false }
    return JSON.parse(raw) as KeyPrefs
  } catch {
    return { key: '', isMinor: false }
  }
}

const saveKeyPrefs = (prefs: KeyPrefs) => {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem('chordsheet_key_prefs', JSON.stringify(prefs))
    }
  } catch {}
}

// Chord/lyric text is monospaced and hand-aligned by measuring characters, so
// the font size and the per-character width must scale together — changing one
// without the other breaks chord positioning.
const BASE_FONT = 13
const BASE_CHAR_W = 9 // Courier New at BASE_FONT ≈ 9px/char
const FONT_SCALES = [0.85, 1, 1.15, 1.3, 1.5] as const
const DEFAULT_SCALE_IDX = 1
const FONT_SCALE_KEY = 'chordsheet_font_scale_idx'

// The stored size is read asynchronously, which would make the first sheet
// opened each session flash at the default size before snapping to the saved
// one. Caching it in module scope means that read happens at most once — every
// later sheet opens at the right size immediately.
let cachedScaleIdx: number | null = null

// Estimate column width in logical px from word length, at the current scale.
function colWidth(word: string, chordLen = 0, scale = 1): number {
  const charW = BASE_CHAR_W * scale
  const pad = 8 * scale
  return Math.max(word.length * charW + pad, chordLen * charW + pad, 36 * scale)
}

interface SectionGroup {
  section: ChordSheetSection
  count: number
  sig: string
}

interface ChordSheetViewerProps {
  sheet: ChordSheet | null
  onClose: () => void
  initialKey?: string
}

export function ChordSheetViewer({ sheet, onClose, initialKey }: ChordSheetViewerProps) {
  const colors = useThemeColors()

  // CCLI requires the license number on every sheet we reproduce, so this
  // screen loads it itself. It used to only read the value and rely on some
  // other screen having subscribed, which meant the number was missing until
  // someone happened to open the admin licensing tab — reproducing songs
  // without the credit CCLI licenses us to print.
  const ccliLicense = useConfigStore((s) => s.ccliLicense)
  const subConfig = useConfigStore((s) => s.subscribe)
  const unsubConfig = useConfigStore((s) => s.unsubscribe)
  useEffect(() => {
    subConfig()
    return () => unsubConfig()
  }, [subConfig, unsubConfig])

  // Text size is a per-reader preference (stage lighting, eyesight, phone vs
  // tablet), so it's adjustable and persisted rather than a fixed size.
  // AsyncStorage (not localStorage like the key prefs above) so it works on
  // native too.
  const [scaleIdx, setScaleIdx] = useState(cachedScaleIdx ?? DEFAULT_SCALE_IDX)
  useEffect(() => {
    if (cachedScaleIdx !== null) return // already loaded earlier this session
    let cancelled = false
    AsyncStorage.getItem(FONT_SCALE_KEY)
      .then((raw) => {
        if (raw == null) return
        const idx = Number(raw)
        if (!Number.isInteger(idx) || idx < 0 || idx >= FONT_SCALES.length) return
        cachedScaleIdx = idx
        if (!cancelled) setScaleIdx(idx)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const fontScale = FONT_SCALES[scaleIdx]
  const monoSize = Math.round(BASE_FONT * fontScale)

  const changeScale = (delta: number) => {
    const next = Math.min(FONT_SCALES.length - 1, Math.max(0, scaleIdx + delta))
    if (next === scaleIdx) return
    cachedScaleIdx = next
    setScaleIdx(next)
    AsyncStorage.setItem(FONT_SCALE_KEY, String(next)).catch(() => {})
  }

  const [selectedKey, setSelectedKey] = useState(() => {
    if (initialKey && (NNS_KEYS as readonly string[]).includes(initialKey)) return initialKey
    return getKeyPrefs().key
  })
  const [isMinor, setIsMinor] = useState(() => {
    if (initialKey && (NNS_KEYS as readonly string[]).includes(initialKey)) return false
    return getKeyPrefs().isMinor
  })
  const [chordsOnly, setChordsOnly] = useState(false)
  const [showKeyDropdown, setShowKeyDropdown] = useState(false)

  if (!sheet) return null

  const keyOptions: string[] = ['', ...NNS_KEYS]
  const keyIdx =
    selectedKey === '' ? -1 : NNS_KEYS.indexOf(selectedKey as (typeof NNS_KEYS)[number])

  const handleSelectKey = (key: string) => {
    setSelectedKey(key)
    saveKeyPrefs({ key, isMinor })
    setShowKeyDropdown(false)
  }

  const handleToggleMinor = () => {
    const newIsMinor = !isMinor
    setIsMinor(newIsMinor)
    saveKeyPrefs({ key: selectedKey, isMinor: newIsMinor })
  }

  const displayToken = (raw: string) => formatToken(raw, keyIdx, isMinor)

  const handleExportPdf = async () => {
    // expo-print has no way to produce an actual file on web — its web shim just
    // calls window.print() on the current page regardless of the `html` option,
    // which opens the OS print/printer chooser rather than creating a PDF. So on
    // web we build a real PDF client-side and hand it to the user directly: via
    // the share sheet where available (so it can be saved to Files, AirDropped,
    // etc.), or as a plain download otherwise.
    if (Platform.OS === 'web') {
      const blob = buildChordSheetPdfBlob(
        sheet,
        selectedKey,
        isMinor,
        keyIdx,
        colors.primary,
        ccliLicense
      )
      const filename = `${sheet.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'chord-sheet'}.pdf`
      const file = new File([blob], filename, { type: 'application/pdf' })

      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean
        share?: (data: { files: File[]; title?: string }) => Promise<void>
      }
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        try {
          await nav.share({ files: [file], title: sheet.title })
          return
        } catch {
          // user cancelled or share failed — fall through to direct download
        }
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return
    }

    const html = buildChordSheetHtml(
      sheet,
      selectedKey,
      isMinor,
      keyIdx,
      colors.primary,
      ccliLicense
    )
    await printAsync({ html })
  }

  // In Chords Only mode, group consecutive sections with the same type + chord progression.
  // sameAsPrevious sections increment the current group's repeat count.
  const sectionGroups: SectionGroup[] = []
  if (chordsOnly) {
    for (const section of sheet.sections) {
      if (section.sameAsPrevious) {
        if (sectionGroups.length > 0) sectionGroups[sectionGroups.length - 1].count++
        continue
      }
      const sig = (section.chordTokens ?? [])
        .flat()
        .filter((t) => Boolean(t) && t !== PROGRESSION_END)
        .map(stripBoundary)
        .join('\x00')
      const last = sectionGroups[sectionGroups.length - 1]
      if (last && last.section.type === section.type && sig && sig === last.sig) {
        last.count++
      } else {
        sectionGroups.push({ section, count: 1, sig })
      }
    }
  }

  return (
    <Modal visible={!!sheet} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$4"
          gap="$2"
          width="96%"
          maxWidth={640}
          maxHeight="94%"
        >
          {/* Header */}
          <XStack justifyContent="space-between" alignItems="flex-start">
            <YStack flex={1} gap="$0.5">
              <Text color={colors.text} fontSize="$5" fontWeight="700" numberOfLines={2}>
                {sheet.title}
              </Text>
              {sheet.artist ? (
                <Text color={colors.textMuted} fontSize="$3">
                  {sheet.artist}
                </Text>
              ) : null}
              {sheet.bpm != null ? (
                <Text color={colors.textMuted} fontSize="$2">
                  ♩ = {sheet.bpm} BPM
                </Text>
              ) : null}
            </YStack>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text color={colors.textMuted} fontSize="$4">
                ✕
              </Text>
            </Pressable>
          </XStack>

          {/* Controls */}
          <XStack gap="$2" alignItems="flex-start" flexWrap="wrap">
            {/* Key selector */}
            <YStack>
              <Pressable onPress={() => setShowKeyDropdown((v) => !v)}>
                <XStack
                  backgroundColor={colors.primary + '18'}
                  borderRadius={99}
                  borderWidth={1}
                  borderColor={colors.primary}
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                  alignItems="center"
                  gap="$1"
                >
                  <Text color={colors.primary} fontSize="$2" fontWeight="600">
                    {selectedKey === '' ? 'Nashville #s' : `Key: ${selectedKey}`}
                  </Text>
                  <Text color={colors.primary} fontSize="$1">
                    {showKeyDropdown ? '▲' : '▼'}
                  </Text>
                </XStack>
              </Pressable>
              {showKeyDropdown ? (
                <YStack
                  backgroundColor={colors.surface}
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor={colors.border}
                  marginTop="$1"
                  overflow="hidden"
                >
                  {keyOptions.map((k) => (
                    <Pressable key={k === '' ? '__none__' : k} onPress={() => handleSelectKey(k)}>
                      <XStack
                        paddingHorizontal="$3"
                        paddingVertical="$2"
                        backgroundColor={selectedKey === k ? colors.primary + '22' : 'transparent'}
                      >
                        <Text
                          color={selectedKey === k ? colors.primary : colors.text}
                          fontSize="$2"
                          fontWeight={selectedKey === k ? '700' : '400'}
                        >
                          {k === '' ? 'Nashville #s' : k}
                        </Text>
                      </XStack>
                    </Pressable>
                  ))}
                </YStack>
              ) : null}
            </YStack>

            {/* Major/Minor toggle — only when a key is selected */}
            {selectedKey !== '' ? (
              <Pressable onPress={handleToggleMinor}>
                <XStack
                  backgroundColor={isMinor ? colors.primary : colors.primary + '18'}
                  borderRadius={99}
                  borderWidth={1}
                  borderColor={colors.primary}
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                >
                  <Text color={isMinor ? 'white' : colors.primary} fontSize="$2" fontWeight="600">
                    {isMinor ? 'Minor' : 'Major'}
                  </Text>
                </XStack>
              </Pressable>
            ) : null}

            {/* Chords Only toggle */}
            <Pressable onPress={() => setChordsOnly((v) => !v)}>
              <XStack
                backgroundColor={chordsOnly ? colors.primary : colors.primary + '18'}
                borderRadius={99}
                borderWidth={1}
                borderColor={colors.primary}
                paddingHorizontal="$3"
                paddingVertical="$1"
              >
                <Text color={chordsOnly ? 'white' : colors.primary} fontSize="$2" fontWeight="600">
                  Chords Only
                </Text>
              </XStack>
            </Pressable>

            {/* Text size — persists across sessions so a reader sets it once.
                Labelled "Size" rather than A−/A+ because A–G read as key names
                in a chord sheet. */}
            <XStack
              borderRadius={99}
              borderWidth={1}
              borderColor={colors.primary}
              backgroundColor={colors.primary + '18'}
              alignItems="center"
              overflow="hidden"
            >
              <Pressable
                onPress={() => changeScale(-1)}
                disabled={scaleIdx === 0}
                hitSlop={6}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  opacity: scaleIdx === 0 ? 0.4 : 1,
                }}
              >
                <Text color={colors.primary} fontSize={16} fontWeight="700">
                  −
                </Text>
              </Pressable>
              <Text color={colors.primary} fontSize="$2" fontWeight="600" paddingHorizontal="$1">
                Size
              </Text>
              <Pressable
                onPress={() => changeScale(1)}
                disabled={scaleIdx === FONT_SCALES.length - 1}
                hitSlop={6}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  opacity: scaleIdx === FONT_SCALES.length - 1 ? 0.4 : 1,
                }}
              >
                <Text color={colors.primary} fontSize={16} fontWeight="700">
                  +
                </Text>
              </Pressable>
            </XStack>

            {/* Export PDF — available on all platforms via expo-print */}
            <Pressable onPress={handleExportPdf}>
              <XStack
                backgroundColor={colors.primary + '18'}
                borderRadius={99}
                borderWidth={1}
                borderColor={colors.primary}
                paddingHorizontal="$3"
                paddingVertical="$1"
                alignItems="center"
                gap="$1"
              >
                <Text color={colors.primary} fontSize="$2" fontWeight="600">
                  Export PDF
                </Text>
              </XStack>
            </Pressable>
          </XStack>

          {/* Content */}
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            <YStack gap="$3" paddingBottom="$4">
              {chordsOnly
                ? sectionGroups.map(({ section, count }) => {
                    const fullLabel = getSectionLabel(sheet.sections, section.id)
                    const rangeMatch = count > 1 ? fullLabel.match(/^(.+?)\s+(\d+)$/) : null
                    const label = rangeMatch
                      ? `${rangeMatch[1]} ${parseInt(rangeMatch[2], 10)}-${parseInt(rangeMatch[2], 10) + count - 1}`
                      : fullLabel
                    const allTokens = (section.chordTokens ?? []).flat()
                    const progGroups = splitByProgressionEnd(allTokens)
                    const compressed = compressGroups(progGroups)
                    return (
                      <YStack key={section.id} gap="$0.5">
                        <XStack gap="$2" alignItems="center">
                          <Text color={colors.primary} fontWeight="700" fontSize="$3">
                            {label}
                          </Text>
                        </XStack>
                        {compressed.map(({ chords, count: pc }, gi) => (
                          <YStack key={gi}>
                            {gi > 0 && compressed.length > 1 ? (
                              <View
                                style={{
                                  height: 1,
                                  backgroundColor: colors.border,
                                  marginVertical: 4,
                                }}
                              />
                            ) : null}
                            <XStack gap="$2" alignItems="center">
                              <Text
                                style={[styles.mono, { fontSize: monoSize }]}
                                color={colors.text}
                              >
                                {chords.map(displayToken).join('  ')}
                              </Text>
                              {pc > 1 ? (
                                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                                  ×{pc}
                                </Text>
                              ) : null}
                            </XStack>
                          </YStack>
                        ))}
                      </YStack>
                    )
                  })
                : sheet.sections.map((section) => {
                    const label = getSectionLabel(sheet.sections, section.id)

                    // A "same as previous" section renders the FULL content it
                    // repeats (lyrics + aligned chords), not just a label and a
                    // chord list — a repeated chorus should be singable in place
                    // without scrolling back to find the words. The italic
                    // "(same as X)" note is kept so the relationship stays clear.
                    const repeatSource = section.sameAsPrevious
                      ? getPrevMatchingSection(sheet.sections, section.id)
                      : null
                    const content = repeatSource ?? section
                    const repeatNote = section.sameAsPrevious
                      ? getPrevMatchingLabel(sheet.sections, section.id)
                      : null
                    const hasLyrics = content.lyrics.trim().length > 0

                    // Full mode — instrumental
                    if (!hasLyrics) {
                      const tokens = (content.chordTokens ?? []).flat().filter(Boolean)
                      return (
                        <YStack key={section.id} gap="$1">
                          <Text color={colors.primary} fontWeight="700" fontSize="$3">
                            {label}
                          </Text>
                          {repeatNote ? (
                            <Text color={colors.textMuted} fontSize="$2" fontStyle="italic">
                              (same as {repeatNote})
                            </Text>
                          ) : null}
                          {tokens.length > 0 ? (
                            <XStack flexWrap="wrap" gap="$2" alignItems="center">
                              {tokens.map((t, i) =>
                                t === PROGRESSION_END ? (
                                  <Text
                                    key={i}
                                    style={[styles.mono, { fontSize: monoSize }]}
                                    color={colors.border}
                                  >
                                    {'|'}
                                  </Text>
                                ) : (
                                  <Text
                                    key={i}
                                    style={[styles.mono, styles.chordText, { fontSize: monoSize }]}
                                    color={colors.primary}
                                  >
                                    {displayToken(t)}
                                  </Text>
                                )
                              )}
                            </XStack>
                          ) : null}
                        </YStack>
                      )
                    }

                    // Full mode — lyrics section with per-word chord alignment
                    const lyricsLines = content.lyrics.split('\n')
                    // Filter break rows so lineIdx maps correctly to lyricsLines
                    const lyricChordRows = (content.chordTokens ?? []).filter(
                      (row) => !(row.length === 1 && row[0] === PROGRESSION_END)
                    )
                    return (
                      <YStack key={section.id} gap="$2">
                        <Text
                          color={colors.primary}
                          fontWeight="700"
                          fontSize="$3"
                          marginBottom={repeatNote ? 0 : '$0.5'}
                        >
                          {label}
                        </Text>
                        {repeatNote ? (
                          <Text
                            color={colors.textMuted}
                            fontSize="$2"
                            fontStyle="italic"
                            marginBottom="$0.5"
                          >
                            (same as {repeatNote})
                          </Text>
                        ) : null}
                        {lyricsLines.map((lyricLine, lineIdx) => {
                          const slots = getWordSlots(lyricLine)
                          if (!slots.length) return <View key={lineIdx} style={{ height: 8 }} />
                          const lineTokens = lyricChordRows[lineIdx] ?? []
                          return (
                            <YStack key={lineIdx} gap={0} paddingBottom="$1">
                              <XStack alignItems="flex-end" gap={0} flexWrap="wrap">
                                {slots.map((slot, wi) => {
                                  const raw = lineTokens[wi] ?? ''
                                  const chord = displayToken(raw)
                                  const cw = colWidth(slot.text, chord.length, fontScale)
                                  return (
                                    <XStack key={wi} alignItems="flex-end">
                                      <YStack width={cw} alignItems="center" gap={0}>
                                        <Text
                                          style={[
                                            styles.mono,
                                            styles.chordText,
                                            { fontSize: monoSize },
                                          ]}
                                          color={chord ? colors.primary : 'transparent'}
                                          numberOfLines={1}
                                        >
                                          {chord || ' '}
                                        </Text>
                                        <Text
                                          style={[
                                            styles.mono,
                                            styles.lyricText,
                                            { fontSize: monoSize },
                                          ]}
                                          color={colors.text}
                                          numberOfLines={1}
                                        >
                                          {slot.text}
                                        </Text>
                                      </YStack>
                                      {slot.trailing === '-' ? (
                                        <Text
                                          style={[
                                            styles.mono,
                                            styles.lyricText,
                                            { alignSelf: 'flex-end', fontSize: monoSize },
                                          ]}
                                          color={colors.text}
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
                              <View
                                style={{
                                  height: 1,
                                  backgroundColor: colors.border,
                                  opacity: 0.35,
                                  marginTop: 3,
                                }}
                              />
                            </YStack>
                          )
                        })}
                      </YStack>
                    )
                  })}
            </YStack>

            {/* CCLI attribution — required on reproduced worship material. */}
            {ccliLicense ? (
              <Text
                color={colors.textMuted}
                fontSize={11}
                marginTop="$4"
                paddingTop="$2"
                borderTopWidth={1}
                borderTopColor={colors.border}
              >
                Reproduced under CCLI License No. {ccliLicense}
              </Text>
            ) : null}
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
  closeBtn: {
    marginLeft: 8,
    padding: 4,
  },
  mono: {
    fontFamily: 'Courier New',
    fontSize: 13,
  },
  chordText: {
    fontWeight: '700',
    fontSize: 13,
  },
  lyricText: {
    fontSize: 13,
  },
})
