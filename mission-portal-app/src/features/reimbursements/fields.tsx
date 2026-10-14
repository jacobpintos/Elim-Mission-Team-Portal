import { TextInput, StyleSheet } from 'react-native'
import { YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'

/**
 * Small pieces the reimbursement form and panel share.
 *
 * Dates are typed as MM/DD/YY, the way every other date in the app is, and
 * turned into ISO with eventDates.displayToIso at the point they are sent.
 */

/** 103026 → 10/30/26, as it is typed. */
export function maskDate(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 6)
  let out = digits.slice(0, 2)
  if (digits.length > 2) out += '/' + digits.slice(2, 4)
  if (digits.length > 4) out += '/' + digits.slice(4, 6)
  return out
}

export function Label({ children }: { children: string }) {
  const colors = useThemeColors()
  return (
    <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
      {children}
    </Text>
  )
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  maxLength,
}: {
  label?: string
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  multiline?: boolean
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad'
  maxLength?: number
}) {
  const colors = useThemeColors()
  return (
    <YStack gap="$1" flex={label ? undefined : 1}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        style={[
          multiline ? styles.textarea : styles.input,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={maxLength}
      />
    </YStack>
  )
}

export const styles = StyleSheet.create({
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
    minHeight: 70,
    textAlignVertical: 'top',
  },
})
