import { useState, useCallback } from 'react'
import { View, TextInput as RNTextInput } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (hex: string) => void
}

// Convert hex to HSL
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

// Convert HSL to hex
function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100
  const ll = l / 100
  const a = sl * Math.min(ll, 1 - ll)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex)
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const colors = useThemeColors()
  const safeHex = isValidHex(value) ? value : '#888888'
  const [hsl, setHsl] = useState<[number, number, number]>(() => hexToHsl(safeHex))
  const [hexInput, setHexInput] = useState(safeHex)

  const [h, s, l] = hsl

  const updateFromHsl = useCallback(
    (newH: number, newS: number, newL: number) => {
      const hex = hslToHex(newH, newS, newL)
      setHsl([newH, newS, newL])
      setHexInput(hex)
      onChange(hex)
    },
    [onChange]
  )

  const handleHexChange = (text: string) => {
    setHexInput(text)
    const normalized = text.startsWith('#') ? text : '#' + text
    if (isValidHex(normalized)) {
      const newHsl = hexToHsl(normalized)
      setHsl(newHsl)
      onChange(normalized)
    }
  }

  return (
    <YStack gap="$2" padding="$3" backgroundColor="$gray2" borderRadius="$3">
      <Text fontWeight="700" fontSize="$3">
        {label}
      </Text>

      <XStack alignItems="center" gap="$3">
        {/* Color swatch */}
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            backgroundColor: safeHex,
            borderWidth: 1,
            borderColor: '#ccc',
          }}
        />

        {/* Hex input */}
        <YStack flex={1} gap="$1">
          <Text fontSize="$2" color="$gray10">
            Hex
          </Text>
          <RNTextInput
            value={hexInput}
            onChangeText={handleHexChange}
            autoCapitalize="none"
            maxLength={7}
            style={{
              fontSize: 15,
              fontFamily: 'monospace',
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 6,
              backgroundColor: colors.surface,
              color: colors.text,
            }}
          />
        </YStack>
      </XStack>

      {/* Hue */}
      <YStack gap="$1">
        <XStack justifyContent="space-between">
          <Text fontSize="$2" color="$gray10">
            Hue
          </Text>
          <Text fontSize="$2" color="$gray10">
            {h}°
          </Text>
        </XStack>
        <XStack gap="$2" alignItems="center">
          <Text fontSize="$2" color="$gray10">
            0
          </Text>
          <View style={{ flex: 1 }}>
            <RNTextInput
              value={String(h)}
              onChangeText={(v) => {
                const num = Math.max(0, Math.min(360, parseInt(v) || 0))
                updateFromHsl(num, s, l)
              }}
              keyboardType="numeric"
              style={{
                textAlign: 'center',
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 4,
                paddingVertical: 4,
                fontSize: 13,
                backgroundColor: colors.surface,
                color: colors.text,
              }}
            />
          </View>
          <Text fontSize="$2" color="$gray10">
            360
          </Text>
        </XStack>
      </YStack>

      {/* Saturation */}
      <YStack gap="$1">
        <XStack justifyContent="space-between">
          <Text fontSize="$2" color="$gray10">
            Saturation
          </Text>
          <Text fontSize="$2" color="$gray10">
            {s}%
          </Text>
        </XStack>
        <XStack gap="$2" alignItems="center">
          <Text fontSize="$2" color="$gray10">
            0
          </Text>
          <View style={{ flex: 1 }}>
            <RNTextInput
              value={String(s)}
              onChangeText={(v) => {
                const num = Math.max(0, Math.min(100, parseInt(v) || 0))
                updateFromHsl(h, num, l)
              }}
              keyboardType="numeric"
              style={{
                textAlign: 'center',
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 4,
                paddingVertical: 4,
                fontSize: 13,
                backgroundColor: colors.surface,
                color: colors.text,
              }}
            />
          </View>
          <Text fontSize="$2" color="$gray10">
            100
          </Text>
        </XStack>
      </YStack>

      {/* Lightness */}
      <YStack gap="$1">
        <XStack justifyContent="space-between">
          <Text fontSize="$2" color="$gray10">
            Lightness
          </Text>
          <Text fontSize="$2" color="$gray10">
            {l}%
          </Text>
        </XStack>
        <XStack gap="$2" alignItems="center">
          <Text fontSize="$2" color="$gray10">
            0
          </Text>
          <View style={{ flex: 1 }}>
            <RNTextInput
              value={String(l)}
              onChangeText={(v) => {
                const num = Math.max(0, Math.min(100, parseInt(v) || 0))
                updateFromHsl(h, s, num)
              }}
              keyboardType="numeric"
              style={{
                textAlign: 'center',
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 4,
                paddingVertical: 4,
                fontSize: 13,
                backgroundColor: colors.surface,
                color: colors.text,
              }}
            />
          </View>
          <Text fontSize="$2" color="$gray10">
            100
          </Text>
        </XStack>
      </YStack>
    </YStack>
  )
}
