import { useState, useEffect } from 'react'
import { Modal, View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { NNS_KEYS, convertChordLine } from '@/lib/nashvilleNumbers'
import { SECTION_LABELS } from '@/types/chordSheet'
import type { ChordSheet } from '@/types/chordSheet'

const getLastKey = (): string => {
  try {
    return (typeof window !== 'undefined' && window.localStorage?.getItem('chordsheet_last_key')) || ''
  } catch {
    return ''
  }
}

const saveLastKey = (key: string) => {
  try {
    if (typeof window !== 'undefined') window.localStorage?.setItem('chordsheet_last_key', key)
  } catch {}
}

function getSectionLabel(
  sections: ChordSheet['sections'],
  id: string,
): string {
  const section = sections.find((s) => s.id === id)
  if (!section) return ''
  const ofType = sections.filter((s) => s.type === section.type)
  const base = SECTION_LABELS[section.type]
  if (ofType.length <= 1) return base
  return `${base} ${ofType.findIndex((s) => s.id === id) + 1}`
}

interface ChordSheetViewerProps {
  sheet: ChordSheet | null
  onClose: () => void
}

export function ChordSheetViewer({ sheet, onClose }: ChordSheetViewerProps) {
  const colors = useThemeColors()
  const [selectedKey, setSelectedKey] = useState('')
  const [chordsOnly, setChordsOnly] = useState(false)
  const [showKeyDropdown, setShowKeyDropdown] = useState(false)

  useEffect(() => {
    if (sheet) {
      setSelectedKey(getLastKey())
    }
  }, [sheet])

  if (!sheet) return null

  const keyOptions: string[] = ['', ...NNS_KEYS]
  const keyIdx = selectedKey === '' ? -1 : NNS_KEYS.indexOf(selectedKey as (typeof NNS_KEYS)[number])

  const handleSelectKey = (key: string) => {
    setSelectedKey(key)
    saveLastKey(key)
    setShowKeyDropdown(false)
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

          {/* Controls bar */}
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

              {/* Inline dropdown */}
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
                        backgroundColor={
                          selectedKey === k ? colors.primary + '22' : 'transparent'
                        }
                        alignItems="center"
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

            {/* Chords only toggle */}
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

                if (chordsOnly) {
                  // Gather all non-whitespace tokens from chordLines and convert
                  const allTokens = section.chordLines
                    .flatMap((line) => line.trim().split(/\s+/).filter(Boolean))
                    .map((token) =>
                      keyIdx >= 0
                        ? convertChordLine(token, keyIdx)
                        : token,
                    )
                    .join('  ')

                  return (
                    <YStack key={section.id} gap="$0.5">
                      <Text
                        color={colors.primary}
                        fontWeight="700"
                        fontSize="$3"
                      >
                        {label}
                      </Text>
                      {allTokens ? (
                        <Text
                          style={styles.mono}
                          color={colors.text}
                        >
                          {allTokens}
                        </Text>
                      ) : null}
                    </YStack>
                  )
                }

                // Full mode
                const lyricsLines = section.lyrics ? section.lyrics.split('\n') : []
                const lineCount = Math.max(section.chordLines.length, lyricsLines.length)

                return (
                  <YStack key={section.id} gap="$0.5">
                    <Text
                      color={colors.primary}
                      fontWeight="700"
                      fontSize="$3"
                      marginBottom="$0.5"
                    >
                      {label}
                    </Text>
                    {Array.from({ length: lineCount }, (_, i) => {
                      const chordLine = section.chordLines[i] ?? ''
                      const lyricLine = lyricsLines[i] ?? ''
                      if (!chordLine.trim() && !lyricLine.trim()) return null
                      const displayChord = convertChordLine(chordLine, keyIdx)
                      return (
                        <YStack key={i} gap={0}>
                          {chordLine.trim() ? (
                            <Text
                              style={[styles.mono, styles.chordText]}
                              color={colors.primary}
                            >
                              {displayChord}
                            </Text>
                          ) : null}
                          {lyricLine.trim() ? (
                            <Text style={styles.mono} color={colors.text}>
                              {lyricLine}
                            </Text>
                          ) : null}
                        </YStack>
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
  },
})
