import { useEffect, useState } from 'react'
import { ScrollView, TextInput, Pressable, StyleSheet, View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useConfigStore } from '@/stores/configStore'
import { useUIStore } from '@/stores/uiStore'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

/**
 * Organization licensing settings.
 *
 * The CCLI license number is stamped onto every chord sheet and its PDF/print
 * export — CCLI requires the number to appear on reproduced worship material.
 */
export default function AdminLicensing() {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const { ccliLicense, setCcliLicense, subscribe, unsubscribe } = useConfigStore()

  // `null` means "untouched" — the field then shows whatever the config store
  // holds, so it picks up the value when the snapshot arrives without needing
  // an effect to copy store state into local state.
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = draft ?? ccliLicense
  const dirty = draft !== null && draft.trim() !== ccliLicense

  const handleSave = async () => {
    setSaving(true)
    try {
      await setCcliLicense(value.trim())
      setDraft(null) // fall back to the stored value again
      toast('CCLI license saved', 'success')
    } catch {
      toast('Failed to save CCLI license', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Licensing' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$3"
          borderWidth={1}
          borderColor={colors.border}
          padding="$4"
          gap="$3"
        >
          <YStack gap="$1">
            <Text color={colors.text} fontSize="$4" fontWeight="700">
              CCLI License Number
            </Text>
            <Text color={colors.textMuted} fontSize="$2">
              Shown at the bottom of every chord sheet and included on PDF and printed
              exports. Leave blank to hide the attribution entirely.
            </Text>
          </YStack>

          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
            value={value}
            onChangeText={setDraft}
            placeholder="e.g. 1234567"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="number-pad"
          />

          <Pressable onPress={handleSave} disabled={!dirty || saving}>
            <XStack
              backgroundColor={colors.primary}
              borderRadius="$2"
              paddingVertical="$3"
              justifyContent="center"
              opacity={!dirty || saving ? 0.5 : 1}
            >
              <Text color="white" fontWeight="700" fontSize="$3">
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </XStack>
          </Pressable>

          {ccliLicense ? (
            <YStack
              backgroundColor={colors.background}
              borderRadius="$2"
              borderWidth={1}
              borderColor={colors.border}
              padding="$3"
              gap="$1"
            >
              <Text color={colors.textMuted} fontSize={11} fontWeight="700">
                PREVIEW
              </Text>
              <Text color={colors.textMuted} fontSize={11}>
                Reproduced under CCLI License No. {ccliLicense}
              </Text>
            </YStack>
          ) : null}
        </YStack>

        <View style={{ height: 24 }} />
      </ScrollView>
    </YStack>
  )
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
})
