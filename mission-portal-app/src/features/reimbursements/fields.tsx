import { TextInput, StyleSheet } from 'react-native'
import { YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { DateField } from '@/components/ui/DateField'

/**
 * Small pieces the reimbursement form and panel share.
 *
 * Dates are typed however they come — 11/4/26, 11/04/2026, 11/4 — or picked
 * from the calendar (components/ui/DateField), and turned into ISO with
 * eventDates.typedDateToIso at the point they are sent.
 */

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

/** A date, labelled: typed as it comes or picked from a calendar. */
export function DateInput({
  label,
  value,
  onChange,
  min,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  /** The earliest day the calendar offers, YYYY-MM-DD. */
  min?: string
}) {
  const colors = useThemeColors()
  return (
    <YStack gap="$1">
      <Label>{label}</Label>
      <DateField
        value={value}
        onChange={onChange}
        min={min}
        accessibilityLabel={label}
        inputStyle={[
          styles.input,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
        ]}
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
