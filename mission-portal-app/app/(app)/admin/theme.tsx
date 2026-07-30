import { useState } from 'react'
import { Image as RNImage, ScrollView, useWindowDimensions } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { defaults } from '@/theme/defaults'
import { contrastRatio } from '@/theme/contrast'
import { ColorPicker } from '@/features/theme/ColorPicker'
import { PhotoColorExtractor } from '@/features/theme/PhotoColorExtractor'
import { ThemePreview } from '@/features/theme/ThemePreview'
import type { ThemeDoc } from '@/types/theme'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

// Captured once per page load — sufficient precision for a 30-day window display
const PAGE_LOAD_TS = Date.now()

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
  const { theme, publishTheme, setLogo, revertLogo } = useThemeStore()
  const { profile } = useAuthStore()
  const { toast } = useUIStore()
  const { width } = useWindowDimensions()

  const isWide = width >= 768

  const [preview, setPreview] = useState<ThemeDoc>({ ...theme })
  const [publishing, setPublishing] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmRevert, setConfirmRevert] = useState(false)
  const [reverting, setReverting] = useState(false)

  const doPublish = async () => {
    setConfirmPublish(false)
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
  }

  const doReset = () => {
    setConfirmReset(false)
    setPreview({ ...defaults })
  }

  const handleSetLogo = async (blob: Blob, contentType: string) => {
    await setLogo(blob, contentType, profile?.uid ?? '')
    toast('Logo updated!', 'success')
  }

  const doRevertLogo = async () => {
    setConfirmRevert(false)
    setReverting(true)
    try {
      await revertLogo(profile?.uid ?? '')
      toast('Logo reverted!', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to revert logo'
      toast(message, 'error')
    } finally {
      setReverting(false)
    }
  }

  const textOnBgRatio = contrastRatio(preview.dark.text, preview.dark.background)
  const textOnSurfaceRatio = contrastRatio(preview.dark.text, preview.dark.surface)

  const hasBackup = !!theme.logoBackup && theme.logoBackup.expiresAt > PAGE_LOAD_TS
  const backupDaysLeft = hasBackup
    ? Math.ceil((theme.logoBackup!.expiresAt - PAGE_LOAD_TS) / (1000 * 60 * 60 * 24))
    : 0

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

        <PhotoColorExtractor
          onSetPrimary={(v) => setPreview((p) => ({ ...p, primary: v }))}
          onSetSecondary={(v) => setPreview((p) => ({ ...p, accent: v }))}
          onSetLogo={handleSetLogo}
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

        {/* Current logo */}
        {theme.logoUrl ? (
          <YStack
            gap="$2"
            padding="$3"
            backgroundColor="$gray2"
            borderRadius="$3"
            width="100%"
          >
            <Text fontWeight="700" fontSize="$3">
              Current Logo
            </Text>
            {/* Was a web-only <img>, so native admins saw a "Current Logo"
                card with no logo in it — and a revert flow for a logo they
                could not see. */}
            <RNImage
              source={{ uri: theme.logoUrl }}
              accessibilityLabel="Current app logo"
              resizeMode="contain"
              style={{ width: 200, height: 80 }}
            />
            {hasBackup ? (
              <YStack gap="$2">
                <Text fontSize="$2" color="$gray10">
                  Previous logo backed up · {backupDaysLeft} day{backupDaysLeft !== 1 ? 's' : ''} remaining to revert
                </Text>
                {confirmRevert ? (
                  <YStack gap="$2" padding="$2" backgroundColor="$gray3" borderRadius="$2">
                    <Text fontSize="$2" fontWeight="600">Restore the previous logo?</Text>
                    <XStack gap="$2">
                      <Button
                        size="$3"
                        onPress={doRevertLogo}
                        disabled={reverting}
                        theme="gray"
                      >
                        {reverting ? <Spinner size="small" /> : 'Restore'}
                      </Button>
                      <Button
                        size="$3"
                        onPress={() => setConfirmRevert(false)}
                        theme="gray"
                      >
                        Cancel
                      </Button>
                    </XStack>
                  </YStack>
                ) : (
                  <Button size="$3" onPress={() => setConfirmRevert(true)} theme="gray">
                    Revert to Previous Logo
                  </Button>
                )}
              </YStack>
            ) : null}
          </YStack>
        ) : null}

        <ThemePreview theme={preview} />

        {confirmReset ? (
          <YStack gap="$2" padding="$3" backgroundColor="$gray2" borderRadius="$3">
            <Text fontSize="$3" fontWeight="600">Reset preview to default theme?</Text>
            <XStack gap="$2">
              <Button size="$3" onPress={doReset} theme="red">
                Reset
              </Button>
              <Button size="$3" onPress={() => setConfirmReset(false)} theme="gray">
                Cancel
              </Button>
            </XStack>
          </YStack>
        ) : (
          <Button size="$3" onPress={() => setConfirmReset(true)} theme="gray">
            Reset to Defaults
          </Button>
        )}

        {confirmPublish ? (
          <YStack gap="$2" padding="$3" backgroundColor="$gray2" borderRadius="$3">
            <Text fontSize="$3" fontWeight="600">Apply this theme to all users?</Text>
            <XStack gap="$2">
              <Button
                size="$3"
                onPress={doPublish}
                backgroundColor={preview.primary}
              >
                <Text color="white" fontWeight="700">Publish</Text>
              </Button>
              <Button size="$3" onPress={() => setConfirmPublish(false)} theme="gray">
                Cancel
              </Button>
            </XStack>
          </YStack>
        ) : (
          <Button
            size="$3"
            onPress={() => setConfirmPublish(true)}
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
        )}
      </YStack>
    </>
  )

  return (
    <ScrollView>
      <YStack flex={1} padding="$4" gap="$3">
        <ScreenTitle options={{ title: 'Theme Editor', headerShown: false }} />

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
