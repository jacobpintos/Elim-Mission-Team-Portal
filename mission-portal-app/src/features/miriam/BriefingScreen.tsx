import { useEffect, useMemo, useRef, type ComponentProps } from 'react'
import { Pressable, ScrollView, StyleSheet, View, type View as ViewType } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { XStack, YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import type { Briefing } from '@/lib/briefing'
import { BriefingView } from './BriefingView'
import { BriefingFocusProvider, type BriefingFocusState } from './briefingFocus'

/**
 * The daily briefing on a screen of its own, read aloud a part at a time.
 *
 * What she covers is listed in the order she says it. As she comes to each
 * part, its rows light up and are scrolled into view, and what she is saying
 * is written out along the bottom. Everything stays tappable: a task ticked
 * off, an event opened, while she reads.
 */
export function BriefingScreen({
  briefing,
  saying,
  speaking,
  onStop,
  onReplay,
  onClose,
  ...view
}: {
  briefing: Briefing
  /** The part being said (briefing.segments), or -1 before she starts. */
  saying: number
  speaking: boolean
  onStop: () => void
  onReplay: () => void
  onClose: () => void
} & Omit<ComponentProps<typeof BriefingView>, 'briefing' | 'speaking' | 'onStop'>) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const scroll = useRef<ScrollView | null>(null)
  const content = useRef<ViewType | null>(null)
  const places = useRef(new Map<string, { y: number; h: number }>())

  const part = saying >= 0 ? briefing.segments[saying] : undefined
  const active = useMemo(() => new Set(part?.ids ?? []), [part])

  const focus: BriefingFocusState = useMemo(
    () => ({
      active,
      accent: colors.primary,
      place: (id, y, h) => places.current.set(id, { y, h }),
      content,
    }),
    [active, colors.primary]
  )

  // To the first row of what she is saying now, a little below the top.
  useEffect(() => {
    if (!part) return
    if (part.ids.includes('head')) {
      scroll.current?.scrollTo({ y: 0, animated: true })
      return
    }
    const ys = part.ids.map((id) => places.current.get(id)?.y).filter((y) => y !== undefined)
    if (ys.length === 0) return
    scroll.current?.scrollTo({ y: Math.max(0, Math.min(...(ys as number[])) - 24), animated: true })
  }, [part])

  const finished = !speaking && saying >= briefing.segments.length - 1

  return (
    <View style={[StyleSheet.absoluteFill, styles.screen, { backgroundColor: colors.background }]}>
      <XStack
        paddingTop={insets.top + 8}
        paddingHorizontal="$4"
        paddingBottom="$2"
        alignItems="center"
        justifyContent="space-between"
        borderBottomWidth={1}
        borderBottomColor={colors.border}
      >
        <Text color={colors.textMuted} fontSize={11} fontWeight="800" letterSpacing={1.5}>
          MIRIAM · YOUR BRIEFING
        </Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close briefing">
          <Text color={colors.text} fontSize="$6">
            ✕
          </Text>
        </Pressable>
      </XStack>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <View ref={content} collapsable={false}>
          <BriefingFocusProvider value={focus}>
            <BriefingView briefing={briefing} speaking={false} onStop={onStop} {...view} />
          </BriefingFocusProvider>
        </View>
      </ScrollView>

      {/* What she is saying, written out as she says it. */}
      <YStack
        paddingHorizontal="$4"
        paddingTop="$3"
        paddingBottom={insets.bottom + 12}
        gap="$2"
        borderTopWidth={1}
        borderTopColor={colors.border}
        backgroundColor={colors.surface}
      >
        <Text color={colors.text} fontSize="$4" lineHeight={24} minHeight={48} numberOfLines={5}>
          {part?.text ?? (speaking ? '…' : 'That’s your briefing.')}
        </Text>
        <XStack alignItems="center" justifyContent="space-between">
          <Text color={colors.textMuted} fontSize="$2">
            {briefing.segments.length
              ? `${Math.max(0, saying) + 1} of ${briefing.segments.length}`
              : ''}
          </Text>
          {speaking ? (
            <Pressable
              onPress={onStop}
              accessibilityRole="button"
              style={[styles.pill, { borderColor: colors.primary }]}
            >
              <Text color={colors.text} fontWeight="700" fontSize="$2">
                ■ Stop
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onReplay}
              accessibilityRole="button"
              style={[styles.pill, { borderColor: colors.primary }]}
            >
              <Text color={colors.text} fontWeight="700" fontSize="$2">
                {finished ? '↻ Read again' : '▶ Read'}
              </Text>
            </Pressable>
          )}
        </XStack>
      </YStack>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    // The layer it is shown in passes touches through to the page (on the
    // web, to everything in it that doesn't take its own): the screen takes
    // them, its ✕ among them — not her bar beneath it.
    pointerEvents: 'auto',
  },
  pill: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
