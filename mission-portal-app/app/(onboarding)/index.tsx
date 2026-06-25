import { useState } from 'react'
import { YStack, XStack, H1, H2, Paragraph, Button, Switch, Text, Label } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import type { NotificationPrefs } from '@/types/user'

const STEP_COUNT = 3

export default function OnboardingScreen() {
  const { fbUser, profile } = useAuthStore()
  const { toast } = useUIStore()
  const [step, setStep] = useState(0)
  const [completing, setCompleting] = useState(false)

  const [notifPrefs, setNotifPrefs] = useState<
    Pick<NotificationPrefs, 'weeklyDigest' | 'monthlyDigest'>
  >({
    weeklyDigest: true,
    monthlyDigest: false,
  })

  const complete = async () => {
    if (!fbUser) return
    setCompleting(true)
    try {
      // Only assign 'public' if they have no team role; preserve existing non-public roles.
      const hasTeamRole = profile?.roles?.some((r) => r !== 'public') ?? false
      await setDoc(
        doc(db, 'users', fbUser.uid),
        {
          onboardingComplete: true,
          ...(!hasTeamRole && { roles: ['public'] }),
          notificationPrefs: {
            ...(profile?.notificationPrefs ?? {}),
            weeklyDigest: notifPrefs.weeklyDigest,
            monthlyDigest: notifPrefs.monthlyDigest,
          },
        },
        { merge: true }
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to complete onboarding'
      toast(message, 'error')
    } finally {
      setCompleting(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack flex={1} padding="$6" gap="$4">
        {/* Progress indicator */}
        <XStack gap="$2">
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <YStack
              key={i}
              flex={1}
              height={4}
              borderRadius="$2"
              backgroundColor={i <= step ? '$primary' : '$borderColor'}
            />
          ))}
        </XStack>

        {/* Step content */}
        {step === 0 && (
          <YStack flex={1} gap="$4" justifyContent="center">
            <H1>Welcome to{'\n'}Mission Portal</H1>
            <Paragraph color="$colorMuted" fontSize="$5" lineHeight="$7">
              Your all-in-one platform for mission team coordination — events, assignments,
              messages, and more. All in one place.
            </Paragraph>
            <Paragraph color="$colorMuted">
              Let&apos;s take a moment to set up your preferences.
            </Paragraph>
          </YStack>
        )}

        {step === 1 && (
          <YStack flex={1} gap="$4">
            <H2>Notification preferences</H2>
            <Paragraph color="$colorMuted">
              Choose how you&apos;d like to receive updates. Push notifications will be available in
              a future update.
            </Paragraph>

            <YStack gap="$4" backgroundColor="$surface" borderRadius="$4" padding="$4">
              <XStack alignItems="center" justifyContent="space-between">
                <YStack flex={1} gap="$1">
                  <Label fontWeight="600">Weekly digest</Label>
                  <Text color="$colorMuted" fontSize="$2">
                    Summary of the week&apos;s activities
                  </Text>
                </YStack>
                <Switch
                  checked={notifPrefs.weeklyDigest}
                  onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, weeklyDigest: v }))}
                >
                  <Switch.Thumb />
                </Switch>
              </XStack>

              <XStack alignItems="center" justifyContent="space-between">
                <YStack flex={1} gap="$1">
                  <XStack gap="$2" alignItems="center">
                    <Label fontWeight="600">Monthly digest</Label>
                    <YStack
                      backgroundColor="$primary"
                      borderRadius="$2"
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                    >
                      <Text color="white" fontSize="$1">
                        Public users
                      </Text>
                    </YStack>
                  </XStack>
                  <Text color="$colorMuted" fontSize="$2">
                    Monthly summary for public visitors
                  </Text>
                </YStack>
                <Switch
                  checked={notifPrefs.monthlyDigest}
                  onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, monthlyDigest: v }))}
                >
                  <Switch.Thumb />
                </Switch>
              </XStack>
            </YStack>

            <YStack
              backgroundColor="$surface"
              borderRadius="$4"
              padding="$4"
              borderColor="$borderColor"
              borderWidth={1}
              opacity={0.6}
            >
              <XStack gap="$2" alignItems="center" marginBottom="$2">
                <Text fontWeight="600">Push notifications</Text>
                <YStack
                  backgroundColor="$borderColor"
                  borderRadius="$2"
                  paddingHorizontal="$2"
                  paddingVertical="$1"
                >
                  <Text fontSize="$1" color="$colorMuted">
                    Coming soon
                  </Text>
                </YStack>
              </XStack>
              <Paragraph color="$colorMuted" fontSize="$2">
                Real-time push alerts for assignments, messages, and events will be available in a
                future update.
              </Paragraph>
            </YStack>
          </YStack>
        )}

        {step === 2 && (
          <YStack flex={1} gap="$4">
            <H2>Profile photo</H2>
            <Paragraph color="$colorMuted">
              Add a profile photo so your teammates can recognize you. You can skip this and add one
              later from your profile settings.
            </Paragraph>

            <YStack
              width={120}
              height={120}
              borderRadius={60}
              backgroundColor="$borderColor"
              alignSelf="center"
              alignItems="center"
              justifyContent="center"
            >
              <Text color="$colorMuted" fontSize="$7">
                👤
              </Text>
            </YStack>

            <Button variant="outlined" opacity={0.6} disabled>
              Upload photo (coming soon)
            </Button>
          </YStack>
        )}

        {/* Navigation buttons */}
        <XStack gap="$3">
          {step > 0 && (
            <Button flex={1} variant="outlined" onPress={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {step < STEP_COUNT - 1 ? (
            <Button flex={1} backgroundColor="$primary" onPress={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button
              flex={1}
              backgroundColor="$primary"
              onPress={complete}
              disabled={completing}
              opacity={completing ? 0.7 : 1}
            >
              {completing ? 'Setting up…' : "Let's go!"}
            </Button>
          )}
        </XStack>
      </YStack>
    </SafeAreaView>
  )
}
