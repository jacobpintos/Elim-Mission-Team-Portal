import { useState } from 'react'
import { Modal, View, ScrollView, Pressable, StyleSheet, Platform } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { printAsync } from 'expo-print'
import { useThemeColors } from '@/theme/useThemeColors'
import { NNS_KEYS, nashvilleToChord, getWordSlots } from '@/lib/nashvilleNumbers'
import { SECTION_LABELS } from '@/types/chordSheet'
import type { ChordSheet, ChordSheetSection } from '@/types/chordSheet'

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

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Token used to mark the end of one chord progression cycle within a section.
const PROGRESSION_END = '||'

// A trailing "." on a chord token marks the end of a progression (used to
// collapse repeats). It is a hidden marker — never rendered — so strip it
// before displaying the chord.
function stripBoundary(token: string): string {
  return token.endsWith('.') ? token.slice(0, -1) : token
}

// Convert a raw NNS token to a display string.
// "4/1"  → slash chord    (4 chord, 1 in the bass)  e.g. "F/C"
// "4>1"  → passing chord  (moves from 4 to 1)        e.g. "F → C"
// "4 1"  → space-separated chords packed in one box  e.g. "F  C"
function formatToken(raw: string, keyIdx: number, isMinor: boolean): string {
  if (!raw || raw === PROGRESSION_END) return raw
  const tok = stripBoundary(raw)
  if (!tok) return ''
  const conv = (t: string) => keyIdx < 0 ? t.trim() : nashvilleToChord(t.trim(), keyIdx, isMinor)
  if (tok.includes('>')) return tok.split('>').map(conv).join(' → ')
  if (keyIdx < 0) return tok
  // Space-separated: user packed multiple chords into one box — convert each independently
  if (tok.includes(' ')) {
    return tok.trim().split(/\s+/).map((p) => p.split('/').map(conv).join('/')).join('  ')
  }
  return tok.split('/').map(conv).join('/')
}

// Split a flat chord token array into progression groups. A group ends at a
// PROGRESSION_END ("||") marker or right after a token carrying a trailing "."
// boundary. Stored chords have the "." stripped.
function splitByProgressionEnd(tokens: string[]): string[][] {
  const groups: string[][] = []
  let current: string[] = []
  for (const t of tokens) {
    if (t === PROGRESSION_END) {
      if (current.length > 0) { groups.push(current); current = [] }
      continue
    }
    if (!t) continue
    const isBoundary = t.endsWith('.')
    const chord = stripBoundary(t)
    if (chord) current.push(chord)
    if (isBoundary && current.length > 0) { groups.push(current); current = [] }
  }
  if (current.length > 0) groups.push(current)
  return groups
}

// Collapse consecutive identical progression groups into { chords, count } entries.
function compressGroups(groups: string[][]): { chords: string[]; count: number }[] {
  const result: { chords: string[]; count: number }[] = []
  for (const group of groups) {
    const sig = group.join('\x00')
    const last = result[result.length - 1]
    if (last && last.chords.join('\x00') === sig) {
      last.count++
    } else {
      result.push({ chords: [...group], count: 1 })
    }
  }
  return result
}

function buildChordSheetHtml(
  sheet: ChordSheet,
  selectedKey: string,
  isMinor: boolean,
  keyIdx: number,
  primaryColor: string,
): string {
  const disp = (raw: string) => formatToken(raw, keyIdx, isMinor)

  const secLabel = (id: string) => {
    const sec = sheet.sections.find((s) => s.id === id)
    if (!sec) return ''
    const ofType = sheet.sections.filter((s) => s.type === sec.type)
    const base = SECTION_LABELS[sec.type]
    return ofType.length <= 1 ? base : `${base} ${ofType.findIndex((s) => s.id === id) + 1}`
  }

  const prevLabel = (id: string) => {
    const idx = sheet.sections.findIndex((s) => s.id === id)
    if (idx <= 0) return ''
    const sec = sheet.sections[idx]
    const prev = sheet.sections.slice(0, idx).reverse().find((s) => s.type === sec.type)
    return prev ? secLabel(prev.id) : ''
  }

  let body = ''
  for (const section of sheet.sections) {
    const label = secLabel(section.id)

    if (section.sameAsPrevious) {
      const pl = prevLabel(section.id)
      body += `<div class="section"><div class="slabel">${escHtml(label)}</div><div class="same-as">${pl ? `(same as ${escHtml(pl)})` : '(same as previous)'}</div></div>\n`
      continue
    }

    const hasLyrics = section.lyrics.trim().length > 0

    if (!hasLyrics) {
      const toks = (section.chordTokens ?? []).flat().filter(Boolean)
        .map((t) => (t === PROGRESSION_END ? ' | ' : disp(t))).join('  ')
      body += `<div class="section"><div class="slabel">${escHtml(label)}</div>${toks ? `<div class="instrumental">${escHtml(toks)}</div>` : ''}</div>\n`
      continue
    }

    const lyricChordRows = (section.chordTokens ?? []).filter(
      (row) => !(row.length === 1 && row[0] === PROGRESSION_END)
    )
    let linesHtml = ''
    for (let li = 0; li < section.lyrics.split('\n').length; li++) {
      const lyricLine = section.lyrics.split('\n')[li]
      const slots = getWordSlots(lyricLine)
      if (!slots.length) { linesHtml += '<br>'; continue }
      const rowTokens = lyricChordRows[li] ?? []
      let cStr = '', lStr = ''
      for (let wi = 0; wi < slots.length; wi++) {
        const slot = slots[wi]
        const word = slot.text + (slot.trailing === '-' ? '-' : slot.trailing === ' ' ? ' ' : '')
        const chord = rowTokens[wi] ? disp(rowTokens[wi]) : ''
        const w = Math.max(word.length, chord ? chord.length + 1 : 0)
        cStr += chord.padEnd(w, ' ')
        lStr += word.padEnd(w, ' ')
      }
      linesHtml += `<div class="cl">${escHtml(cStr.trimEnd())}</div><div class="ll">${escHtml(lStr.trimEnd())}</div>`
    }
    body += `<div class="section"><div class="slabel">${escHtml(label)}</div>${linesHtml}</div>\n`
  }

  const metaParts: string[] = []
  if (sheet.artist) metaParts.push(sheet.artist)
  if (sheet.bpm != null) metaParts.push(`♩ = ${sheet.bpm} BPM`)
  if (selectedKey) metaParts.push(`Key: ${selectedKey}${isMinor ? ' minor' : ''}`)

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escHtml(sheet.title)}</title>
<style>
  body{font-family:'Courier New',Courier,monospace;padding:28px 32px;color:#222;font-size:13px}
  h1{font-family:sans-serif;margin:0 0 4px;font-size:22px;font-weight:700}
  .meta{color:#888;font-size:12px;font-family:sans-serif;margin-bottom:28px}
  .section{margin-bottom:20px;page-break-inside:avoid}
  .slabel{font-family:sans-serif;font-weight:700;font-size:13px;color:${primaryColor};margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
  .same-as{font-style:italic;color:#888;font-size:12px}
  .cl{color:${primaryColor};font-weight:700;white-space:pre;line-height:1.5;min-height:1em}
  .ll{white-space:pre;line-height:1.5;margin-bottom:4px}
  .instrumental{color:${primaryColor};font-weight:700}
</style></head><body>
<h1>${escHtml(sheet.title)}</h1>
${metaParts.length ? `<div class="meta">${escHtml(metaParts.join(' · '))}</div>` : ''}
${body}
</body></html>`
}

function getSectionLabel(sections: ChordSheet['sections'], id: string): string {
  const section = sections.find((s) => s.id === id)
  if (!section) return ''
  const ofType = sections.filter((s) => s.type === section.type)
  const base = SECTION_LABELS[section.type]
  if (ofType.length <= 1) return base
  return `${base} ${ofType.findIndex((s) => s.id === id) + 1}`
}

function getPrevMatchingLabel(sections: ChordSheet['sections'], id: string): string {
  const idx = sections.findIndex((s) => s.id === id)
  if (idx <= 0) return ''
  const section = sections[idx]
  const prev = sections.slice(0, idx).reverse().find((s) => s.type === section.type)
  if (!prev) return ''
  return getSectionLabel(sections, prev.id)
}

// Estimate column width in logical px from word length (Courier New 13px ≈ 9px/char)
function colWidth(word: string, chordLen = 0): number {
  return Math.max(word.length * 9 + 8, chordLen * 9 + 8, 36)
}

interface SectionGroup {
  section: ChordSheetSection
  count: number
  sig: string
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

  const displayToken = (raw: string) => formatToken(raw, keyIdx, isMinor)

  const handleExportPdf = async () => {
    const html = buildChordSheetHtml(sheet, selectedKey, isMinor, keyIdx, colors.primary)
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
      const sig = (section.chordTokens ?? []).flat()
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
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
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
                              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
                            ) : null}
                            <XStack gap="$2" alignItems="center">
                              <Text style={styles.mono} color={colors.text}>
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
                    const hasLyrics = section.lyrics.trim().length > 0

                    // Full mode: same-as-previous → label only
                    if (section.sameAsPrevious) {
                      const prevLabel = getPrevMatchingLabel(sheet.sections, section.id)
                      return (
                        <YStack key={section.id} gap="$0.5">
                          <Text color={colors.primary} fontWeight="700" fontSize="$3">
                            {label}
                          </Text>
                          <Text color={colors.textMuted} fontSize="$2" fontStyle="italic">
                            {prevLabel ? `(same as ${prevLabel})` : '(same as previous)'}
                          </Text>
                        </YStack>
                      )
                    }

                    // Full mode — instrumental
                    if (!hasLyrics) {
                      const tokens = (section.chordTokens ?? []).flat().filter(Boolean)
                      return (
                        <YStack key={section.id} gap="$1">
                          <Text color={colors.primary} fontWeight="700" fontSize="$3">
                            {label}
                          </Text>
                          {tokens.length > 0 ? (
                            <XStack flexWrap="wrap" gap="$2" alignItems="center">
                              {tokens.map((t, i) =>
                                t === PROGRESSION_END ? (
                                  <Text key={i} style={styles.mono} color={colors.border}>
                                    {'|'}
                                  </Text>
                                ) : (
                                  <Text
                                    key={i}
                                    style={[styles.mono, styles.chordText]}
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
                    const lyricsLines = section.lyrics.split('\n')
                    // Filter break rows so lineIdx maps correctly to lyricsLines
                    const lyricChordRows = (section.chordTokens ?? []).filter(
                      (row) => !(row.length === 1 && row[0] === PROGRESSION_END)
                    )
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
                          const lineTokens = lyricChordRows[lineIdx] ?? []
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
                  })
              }
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
