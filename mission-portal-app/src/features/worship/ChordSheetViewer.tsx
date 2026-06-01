import { useState } from 'react'
import { Modal, View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { NNS_KEYS, nashvilleToChord, getWordSlots } from '@/lib/nashvilleNumbers'
import { SECTION_LABELS } from '@/types/chordSheet'
import type { ChordSheet } from '@/types/chordSheet'

interface KeyPrefs { key: string; isMinor: boolean }

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

function getSectionLabel(sections: ChordSheet['sections'], id: string): string {
  const section = sections.find((s) => s.id === id)
  if (!section) return ''
  const ofType = sections.filter((s) => s.type === section.type)
  const base = SECTION_LABELS[section.type]
  if (ofType.length <= 1) return base
  return `${base} ${ofType.findIndex((s) => s.id === id) + 1}`
}

// Estimate column width in logical px from word length (Courier New 13px ≈ 9px/char)
function colWidth(word: string, chordLen = 0): number {
  return Math.max(word.length * 9 + 8, chordLen * 9 + 8, 36)
}

interface ChordSheetViewerProps {
  sheet: ChordSheet | null
  onClose: () => void
}

export function ChordSheetViewer({ sheet, onClose }: ChordSheetViewerProps) {
  const colors = useThemeColors()
  const [selectedKey, setSelectedKey] = useState(() => getKeyPrefs().key)
  const [isMinor, setIsMinor] = useState(() => getKeyPrefs().isMinor)
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

  const displayToken = (raw: string) => {
    if (!raw || keyIdx < 0) return raw
    return raw.split('/').map((t) => nashvilleToChord(t.trim(), keyIdx, isMinor)).join('/')
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
                    <Pressable
                      key={k === '' ? '__none__' : k}
                      onPress={() => handleSelectKey(k)}
                    >
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
                  <Text
                    color={isMinor ? 'white' : colors.primary}
                    fontSize="$2"
                    fontWeight="600"
                  >
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
                <Text
                  color={chordsOnly ? 'white' : colors.primary}
                  fontSize="$2"
                  fontWeight="600"
                >
                  Chords Only
                </Text>
              </XStack>
            </Pressable>
          </XStack>

          {/* Content */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <YStack gap="$3" paddingBottom="$4">
              {sheet.sections.map((section) => {
                const label = getSectionLabel(sheet.sections, section.id)
                const hasLyrics = section.lyrics.trim().length > 0

                if (chordsOnly) {
                  const allTokens = (section.chordTokens ?? [])
                    .flat()
                    .filter(Boolean)
                    .map(displayToken)
                    .join('  ')
                  return (
                    <YStack key={section.id} gap="$0.5">
                      <Text color={colors.primary} fontWeight="700" fontSize="$3">
                        {label}
                      </Text>
                      {allTokens ? (
                        <Text style={styles.mono} color={colors.text}>
                          {allTokens}
                        </Text>
                      ) : null}
                    </YStack>
                  )
                }

                // Full mode — instrumental
                if (!hasLyrics) {
                  const tokens = (section.chordTokens?.[0] ?? []).filter(Boolean)
                  return (
                    <YStack key={section.id} gap="$1">
                      <Text color={colors.primary} fontWeight="700" fontSize="$3">
                        {label}
                      </Text>
                      {tokens.length > 0 ? (
                        <XStack flexWrap="wrap" gap="$2">
                          {tokens.map((t, i) => (
                            <Text
                              key={i}
                              style={[styles.mono, styles.chordText]}
                              color={colors.primary}
                            >
                              {displayToken(t)}
                            </Text>
                          ))}
                        </XStack>
                      ) : null}
                    </YStack>
                  )
                }

                // Full mode — lyrics section with per-word chord alignment
                const lyricsLines = section.lyrics.split('\n')
                return (
                  <YStack key={section.id} gap="$1">
                    <Text
                      color={colors.primary}
                      fontWeight="700"
                      fontSize="$3"
                      marginBottom="$0.5"
                    >
                      {label}
                    </Text>
                    {lyricsLines.map((lyricLine, lineIdx) => {
                      const slots = getWordSlots(lyricLine)
                      if (!slots.length) return <View key={lineIdx} style={{ height: 8 }} />
                      const lineTokens = section.chordTokens?.[lineIdx] ?? []
                      return (
                        <ScrollView
                          key={lineIdx}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                        >
                          <XStack alignItems="flex-end" gap={0}>
                            {slots.map((slot, wi) => {
                              const raw = lineTokens[wi] ?? ''
                              const chord = displayToken(raw)
                              const cw = colWidth(slot.text, chord.length)
                              return (
                                <XStack key={wi} alignItems="flex-end">
                                  <YStack width={cw} alignItems="center" gap={0}>
                                    <Text
                                      style={[styles.mono, styles.chordText]}
                                      color={chord ? colors.primary : 'transparent'}
                                      numberOfLines={1}
                                    >
                                      {chord || ' '}
                                    </Text>
                                    <Text
                                      style={[styles.mono, styles.lyricText]}
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
                                        { alignSelf: 'flex-end' },
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
                        </ScrollView>
                      )
                    })}
                  </YStack>
                )
              })}
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
