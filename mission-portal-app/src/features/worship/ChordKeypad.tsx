import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { EXTENSION_KEYS } from '@/lib/chordKeypad'

interface ChordKeypadProps {
  /** The token being edited, shown back so the pad is not typing blind. */
  token: string
  /** The word or slot the token belongs to, for orientation. */
  context?: string
  onKey: (key: string) => void
  onBackspace: () => void
  onClear: () => void
  onDone: () => void
  /** Extensions used already this session, kept to hand on the main pane. */
  pinned: string[]
  onPin: (key: string) => void
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7']
/** Everything a chord needs that is not a number. */
const MODIFIERS = ['b', '#', 'm', 'Maj', '/', '>', '.']

/** What each key inserts, where that differs from its face. */
const INSERTS: Record<string, string> = {
  // The sheet's own convention: M forces major on a degree that would
  // otherwise be read as diatonically minor. maj7 lives on the second pane.
  Maj: 'M',
}

/** One key. Defined here rather than inside the pad so it is one component
 *  across renders instead of a new one each time, which would remount every
 *  key on every press. */
function Key({
  label,
  onPress,
  colors,
  wide,
  muted,
}: {
  label: string
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
  wide?: boolean
  muted?: boolean
}) {
  return (
    <Pressable onPress={onPress} style={{ flex: wide ? 2 : 1 }}>
      <View
        style={[
          styles.key,
          {
            backgroundColor: muted ? colors.background : colors.surface,
            borderColor: muted ? colors.border : colors.primary,
          },
        ]}
      >
        <Text
          color={muted ? colors.textMuted : colors.primary}
          fontSize={16}
          fontWeight="700"
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

/**
 * A keyboard with only the keys a chord can be made of.
 *
 * The boxes take Nashville tokens — "b7", "4maj7", "5m", "4/1" — and typing
 * those on a phone means a system keyboard where the useful characters are
 * spread across two or three shifted layouts, next to a thousand that are
 * illegal here. This replaces it with the seventeen that are not.
 *
 * The second pane holds the qualities that are real but occasional. Choosing
 * one pins it to the main pane for the rest of the session, because a song
 * wanting one sus4 usually wants several, and a trip through a second pane
 * each time is what would make this slower than the keyboard it replaced.
 */
export function ChordKeypad({
  token,
  context,
  onKey,
  onBackspace,
  onClear,
  onDone,
  pinned,
  onPin,
}: ChordKeypadProps) {
  const colors = useThemeColors()
  const [pane, setPane] = useState<'main' | 'more'>('main')

  const press = (label: string) => onKey(INSERTS[label] ?? label)

  return (
    <YStack
      backgroundColor={colors.surface}
      borderTopWidth={1}
      borderTopColor={colors.border}
      paddingHorizontal="$2"
      paddingTop="$2"
      paddingBottom="$3"
      gap="$2"
    >
      {/* What is being edited. Without it the pad is a set of buttons with no
          visible effect — the box being changed can be scrolled out of sight. */}
      <XStack alignItems="center" gap="$2" paddingHorizontal="$1">
        <Text color={colors.textMuted} fontSize="$1" flex={1} numberOfLines={1}>
          {context ? `Chord over “${context}”` : 'Chord'}
        </Text>
        <Text
          color={colors.primary}
          fontWeight="700"
          fontSize="$4"
          style={{ fontFamily: 'Courier New' }}
        >
          {token || '—'}
        </Text>
      </XStack>

      {pane === 'main' ? (
        <>
          <XStack gap="$1">
            {DIGITS.map((d) => (
              <Key key={d} label={d} colors={colors} onPress={() => press(d)} />
            ))}
          </XStack>

          <XStack gap="$1">
            {MODIFIERS.map((m) => (
              <Key key={m} label={m} colors={colors} onPress={() => press(m)} />
            ))}
          </XStack>

          {pinned.length > 0 ? (
            <XStack gap="$1">
              {pinned.map((p) => (
                <Key key={p} label={p} colors={colors} onPress={() => press(p)} />
              ))}
              {/* Keeps a short row of pinned keys the same width as a full
                  one, so they do not stretch into slabs. */}
              {Array.from({ length: Math.max(0, 4 - pinned.length) }).map((_, i) => (
                <View key={`gap-${i}`} style={{ flex: 1 }} />
              ))}
            </XStack>
          ) : null}

          <XStack gap="$1">
            <Key label="sus, add…" colors={colors} onPress={() => setPane('more')} wide muted />
            <Key label="⌫" colors={colors} onPress={onBackspace} muted />
            <Key label="Clear" colors={colors} onPress={onClear} muted />
            <Key label="Done" colors={colors} onPress={onDone} muted />
          </XStack>
        </>
      ) : (
        <>
          <XStack gap="$1" flexWrap="wrap">
            {EXTENSION_KEYS.map((ext) => (
              <View key={ext} style={{ width: '24%' }}>
                <Key
                  label={ext}
                  colors={colors}
                  onPress={() => {
                    press(ext)
                    onPin(ext)
                    setPane('main')
                  }}
                />
              </View>
            ))}
          </XStack>

          <XStack gap="$1">
            <Key label="← Back" colors={colors} onPress={() => setPane('main')} wide muted />
            <Key label="⌫" colors={colors} onPress={onBackspace} muted />
            <Key label="Done" colors={colors} onPress={onDone} muted />
          </XStack>
        </>
      )}
    </YStack>
  )
}

const styles = StyleSheet.create({
  key: {
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
})
