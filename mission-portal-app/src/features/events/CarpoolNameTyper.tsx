import { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { Text, YStack } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import type { CarpoolPerson } from './CarpoolBuilder'
import { CARD_COLORS, matchesSearch } from './carpoolCards'

/**
 * A name typed into a seat, for anyone who would rather type than drag: the
 * people it could be, as it is typed, to put there with a tap — or Enter,
 * when it is plainly one of them. In the passengers', a name that is no one
 * on the event can be added as a child.
 */
export function NameTyper({
  placeholder,
  candidates,
  where,
  onPick,
  onChild,
}: {
  placeholder: string
  candidates: CarpoolPerson[]
  /** Where someone is now ("in Car 2", "driving Andy’s van"), or '' if not in a car. */
  where: (uid: string) => string
  onPick: (uid: string) => void
  onChild?: (name: string) => void
}) {
  const colors = useThemeColors()
  const [text, setText] = useState('')
  const typed = text.trim()
  const found = typed ? candidates.filter((p) => matchesSearch(p.name, typed)).slice(0, 5) : []
  const pick = (uid: string) => {
    onPick(uid)
    setText('')
  }
  const addChild = () => {
    onChild?.(typed)
    setText('')
  }
  // Enter: the one it fits, or the one it names in full — never a guess among several.
  const enter = () => {
    const exact = found.filter((p) => p.name.trim().toLowerCase() === typed.toLowerCase())
    if (found.length === 1) pick(found[0].uid)
    else if (exact.length === 1) pick(exact[0].uid)
    else if (found.length === 0 && typed && onChild) addChild()
  }
  return (
    <View style={styles.typer}>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={enter}
        // Kept open for the next name.
        blurOnSubmit={false}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="done"
        style={[
          styles.typerInput,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
        ]}
        accessibilityLabel={placeholder}
      />
      {typed ? (
        <YStack gap="$1">
          {found.map((p) => (
            <Pressable
              key={p.uid}
              onPress={() => pick(p.uid)}
              accessibilityRole="button"
              accessibilityLabel={`Put ${p.name} here`}
              style={[styles.suggestion, { borderColor: colors.border }]}
            >
              <Text
                color={colors.text}
                fontSize="$3"
                fontWeight="600"
                numberOfLines={1}
                flexShrink={1}
              >
                {p.name}
              </Text>
              {where(p.uid) ? (
                <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                  {where(p.uid)}
                </Text>
              ) : null}
            </Pressable>
          ))}
          {found.length === 0 ? (
            onChild ? (
              <Pressable
                onPress={addChild}
                accessibilityRole="button"
                style={[styles.suggestion, { borderColor: CARD_COLORS.child.border }]}
              >
                <Text color={colors.primary} fontSize="$3" fontWeight="600" numberOfLines={1}>
                  + Add “{typed}” as a child
                </Text>
              </Pressable>
            ) : (
              <Text color={colors.textMuted} fontSize="$2">
                No one on this event matches “{typed}”.
              </Text>
            )
          ) : null}
        </YStack>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  typer: {
    width: '100%',
    marginTop: 4,
    gap: 6,
  },
  typerInput: {
    minHeight: 36,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
})
