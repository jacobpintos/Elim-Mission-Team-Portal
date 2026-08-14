import { useState, useCallback } from 'react'
import {
  View,
  TextInput as RNTextInput,
  Modal,
  Pressable,
  Platform,
  ScrollView,
} from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { ColorWheel } from './ColorWheel'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (hex: string) => void
}

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

function HslInput({
  label,
  value,
  max,
  unit,
  onCommit,
}: {
  label: string
  value: number
  max: number
  unit: string
  onCommit: (n: number) => void
}) {
  const colors = useThemeColors()
  return (
    <YStack gap="$1">
      <XStack justifyContent="space-between">
        <Text fontSize="$2" color="$gray10">
          {label}
        </Text>
        <Text fontSize="$2" color="$gray10">
          {value}
          {unit}
        </Text>
      </XStack>
      <XStack gap="$2" alignItems="center">
        <Text fontSize="$2" color="$gray10">
          0
        </Text>
        <View style={{ flex: 1 }}>
          <RNTextInput
            value={String(value)}
            onChangeText={(v) => {
              const num = Math.max(0, Math.min(max, parseInt(v) || 0))
              onCommit(num)
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
          {max}
        </Text>
      </XStack>
    </YStack>
  )
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const colors = useThemeColors()
  const safeHex = isValidHex(value) ? value : '#888888'
  const [hsl, setHsl] = useState<[number, number, number]>(() => hexToHsl(safeHex))
  const [hexInput, setHexInput] = useState(safeHex)
  const [open, setOpen] = useState(false)

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

  const handleWheelChange = (hex: string) => {
    if (isValidHex(hex)) {
      const newHsl = hexToHsl(hex)
      setHsl(newHsl)
      setHexInput(hex)
      onChange(hex)
    }
  }

  return (
    <YStack gap="$2" padding="$3" backgroundColor="$gray2" borderRadius="$3">
      <Text fontWeight="700" fontSize="$3">
        {label}
      </Text>

      <XStack alignItems="center" gap="$3">
        {/* Clickable color swatch — opens color wheel */}
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Open color picker for ${label}`}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              backgroundColor: safeHex,
              borderWidth: 2,
              borderColor: '#ccc',
            }}
          />
        </Pressable>

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

      {/* Color wheel modal */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Backdrop */}
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setOpen(false)}
        >
          {/* Panel — stop propagation */}
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 14,
                padding: 20,
                width: Platform.OS === 'web' ? 300 : 280,
                maxHeight: '80%',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
                elevation: 10,
              }}
            >
              {/* Header */}
              <XStack justifyContent="space-between" alignItems="center" marginBottom={16}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{label}</Text>
                {/* Live swatch */}
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    backgroundColor: safeHex,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              </XStack>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Color wheel (web) / H/S/L controls (native) */}
                <ColorWheel color={safeHex} onChange={handleWheelChange} />

                {/* H/S/L numeric controls — always shown for fine-tuning, primary on native */}
                <YStack gap="$2" marginTop={Platform.OS === 'web' ? 12 : 0}>
                  <HslInput
                    label="Hue"
                    value={h}
                    max={360}
                    unit="°"
                    onCommit={(n) => updateFromHsl(n, s, l)}
                  />
                  <HslInput
                    label="Saturation"
                    value={s}
                    max={100}
                    unit="%"
                    onCommit={(n) => updateFromHsl(h, n, l)}
                  />
                  <HslInput
                    label="Lightness"
                    value={l}
                    max={100}
                    unit="%"
                    onCommit={(n) => updateFromHsl(h, s, n)}
                  />
                </YStack>

                {/* Hex input */}
                <YStack gap="$1" marginTop={12}>
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
                      paddingVertical: 8,
                      backgroundColor: colors.background,
                      color: colors.text,
                    }}
                  />
                </YStack>
              </ScrollView>

              {/* Done */}
              <Pressable
                onPress={() => setOpen(false)}
                style={{
                  marginTop: 16,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: safeHex,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </YStack>
  )
}
