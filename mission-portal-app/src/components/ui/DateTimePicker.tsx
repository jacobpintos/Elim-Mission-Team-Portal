import { Platform } from 'react-native'
import { useState } from 'react'
import { YStack, Text, Button } from 'tamagui'

interface DateTimePickerProps {
  value: Date
  onChange: (date: Date) => void
  mode?: 'date' | 'time' | 'datetime'
  label?: string
}

/**
 * Cross-platform date/time picker.
 * Web: native HTML input elements.
 * Native: @react-native-community/datetimepicker (lazily imported).
 */
export function DateTimePicker({ value, onChange, mode = 'date', label }: DateTimePickerProps) {
  const [showPicker, setShowPicker] = useState(false)

  if (Platform.OS === 'web') {
    const inputType = mode === 'time' ? 'time' : mode === 'datetime' ? 'datetime-local' : 'date'
    const inputValue =
      mode === 'time'
        ? value.toTimeString().slice(0, 5)
        : mode === 'datetime'
          ? value.toISOString().slice(0, 16)
          : value.toISOString().slice(0, 10)

    return (
      <YStack gap="$1">
        {label && <Text fontWeight="600">{label}</Text>}
        {/* web-only input element */}
        <input
          type={inputType}
          value={inputValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            onChange(new Date(e.target.value))
          }}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--borderColor)',
            backgroundColor: 'var(--background)',
            color: 'var(--color)',
            fontSize: 14,
          }}
        />
      </YStack>
    )
  }

  // Native
  return (
    <YStack gap="$1">
      {label && <Text fontWeight="600">{label}</Text>}
      <Button variant="outlined" onPress={() => setShowPicker(true)}>
        {value.toLocaleDateString()}
      </Button>
      {showPicker && (
        <NativeDatePicker
          value={value}
          mode={mode}
          onChange={(date) => {
            setShowPicker(false)
            if (date) onChange(date)
          }}
        />
      )}
    </YStack>
  )
}

function NativeDatePicker({
  value,
  mode,
  onChange,
}: {
  value: Date
  mode: string
  onChange: (date: Date | null) => void
}) {
  // Lazy import to keep it out of the web bundle
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RNDateTimePicker = require('@react-native-community/datetimepicker').default
  return (
    <RNDateTimePicker
      value={value}
      mode={mode}
      onChange={(_: unknown, date: Date | undefined) => onChange(date ?? null)}
    />
  )
}
