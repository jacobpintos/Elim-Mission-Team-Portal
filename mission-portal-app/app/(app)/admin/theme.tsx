import { useState } from 'react'
import { Alert, useWindowDimensions } from 'react-native'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Stack } from 'expo-router'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { defaults } from '@/theme/defaults'
import { contrastRatio } from '@/theme/contrast'
import { ColorPicker } from '@/features/theme/ColorPicker'
import { ThemePreview } from '@/features/theme/ThemePreview'
import type { ThemeDoc } from '@/types/theme'

function ContrastBadge({ ratio }: { ratio: number }) {
  const pass4_5 = ratio >= 4.5
  const pass7 = ratio >= 7
  return (
    <XStack gap="$1">
      <XStack
        backgroundColor={pass4_5 ? '#27ae60' : '#e74c3c'}
        borderRadius="$4"
        paddingHorizontal="$2"
        paddingVertical="$0.5"
      >
        <Text fontSize="$1" color="white" fontWeight="600">
          AA {pass4_5 ? '✓' : '✗'}
        </Text>
      </XStack>
      <XStack
        backgroundColor={pass7 ? '#27ae60' : '#95a5a6'}
        borderRadius="$4"
        paddingHorizontal="$2"
        paddingVertical="$0.5"
      >
        <Text fontSize="$1" color="white" fontWeight="600">
          AAA {pass7 ? '✓' : '✗'}
        </Text>
      </XStack>
    </XStack>
  )
}

export default function AdminTheme() {
  const { theme, publishTheme } = useThemeStore()
  const { profile } = useAuthStore()
  const { toast } = useUIStore()
  const { width } = useWindowDimensions()

  const isWide = width >= 768

  const [preview, setPreview] = useState<ThemeDoc>({ ...theme })
  const [publishing, setPublishing] = useState(false)

  const handlePublish = async () => {
    Alert.alert(
      'Publish Theme',
      'Apply this theme to all users?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            setPublishing(true)
            try {
              await publishTheme(preview, profile?.uid ?? '')
              toast('Theme published!', 'success')
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Failed to publish'
              toast(message, 'error')
            } finally {
              setPublishing(false)
            }
          },
        },
      ]
    )
  }

  const handleReset = () => {
    Alert.alert('Reset to Defaults', 'Reset preview to default theme?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        onPress: () => setPreview({ ...defaults }),
      },
    ])
  }

  const textOnBgRatio = contrastRatio(preview.dark.text, preview.dark.background)
  const textOnSurfaceRatio = contrastRatio(preview.dark.text, preview.dark.surface)

  const content = (
    <>
      <YStack gap="$3" flex={isWide ? 1 : undefined}>
        <Text fontWeight="700" fontSize="$4">
          Color Settings
        </Text>

        <ColorPicker
          label="Primary Color"
          value={preview.primary}
          onChange={(v) => setPreview((p) => ({ ...p, primary: v }))}
        />

        <ColorPicker
          label="Accent Color"
          value={preview.accent}
          onChange={(v) => setPreview((p) => ({ ...p, accent: v }))}
        />

        <ColorPicker
          label="Dark Background"
          value={preview.dark.background}
          onChange={(v) =>
            setPreview((p) => ({ ...p, dark: { ...p.dark, background: v } }))
          }
        />

        <ColorPicker
          label="Dark Surface"
          value={preview.dark.surface}
          onChange={(v) =>
            setPreview((p) => ({ ...p, dark: { ...p.dark, surface: v } }))
          }
        />

        <ColorPicker
          label="Dark Text"
          value={preview.dark.text}
          onChange={(v) =>
            setPreview((p) => ({ ...p, dark: { ...p.dark, text: v } }))
          }
        />

        {/* Contrast checks */}
        <YStack gap="$2" padding="$3" backgroundColor="$gray2" borderRadius="$3">
          <Text fontWeight="700" fontSize="$3">
            WCAG Contrast
          </Text>
          <XStack alignItems="center" gap="$2">
            <Text fontSize="$2" color="$gray10" flex={1}>
              Text on Background ({textOnBgRatio.toFixed(2)}:1)
            </Text>
            <ContrastBadge ratio={textOnBgRatio} />
          </XStack>
          <XStack alignItems="center" gap="$2">
            <Text fontSize="$2" color="$gray10" flex={1}>
              Text on Surface ({textOnSurfaceRatio.toFixed(2)}:1)
            </Text>
            <ContrastBadge ratio={textOnSurfaceRatio} />
          </XStack>
        </YStack>
      </YStack>

      <YStack gap="$3" flex={isWide ? 1 : undefined} alignItems={isWide ? 'center' : 'flex-start'}>
        <Text fontWeight="700" fontSize="$4">
          Preview
        </Text>
        <ThemePreview theme={preview} />

        <XStack gap="$2" flexWrap="wrap">
          <Button size="$3" onPress={handleReset} theme="gray">
            Reset to Defaults
          </Button>
          <Button
            size="$3"
            onPress={handlePublish}
            disabled={publishing}
            backgroundColor={preview.primary}
          >
            {publishing ? (
              <Spinner size="small" />
            ) : (
              <Text color="white" fontWeight="700">
                Publish
              </Text>
            )}
          </Button>
        </XStack>
      </YStack>
    </>
  )

  return (
    <ScrollView>
      <YStack flex={1} padding="$4" gap="$3">
        <Stack.Screen options={{ title: 'Theme Editor', headerShown: false }} />

        <Text fontSize="$6" fontWeight="700">
          Theme Editor
        </Text>

        {isWide ? (
          <XStack gap="$4" alignItems="flex-start">
            {content}
          </XStack>
        ) : (
          <YStack gap="$4">{content}</YStack>
        )}
      </YStack>
    </ScrollView>
  )
}
