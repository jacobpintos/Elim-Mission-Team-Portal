import { useRef, useState } from 'react'
import { Platform } from 'react-native'
import { YStack, XStack, H1, H2, Paragraph, Button, Switch, Text, Label } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { Avatar } from '@/components/ui/Avatar'
import { pickAndUploadAvatar, uploadAvatarFromFile } from '@/lib/avatarUpload'
import {
  registerForPushNotifications,
  persistPushToken,
  clearPushToken,
  platformKey,
} from '@/lib/notifications'
import type { NotificationPrefs } from '@/types/user'
import * as Sentry from '@sentry/react-native'

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

  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [photoURL, setPhotoURL] = useState<string | undefined>(profile?.photoURL)
  const [photoUploading, setPhotoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleTogglePush = async (next: boolean) => {
    if (!fbUser) return
    setPushBusy(true)
    try {
      if (next) {
        const result = await registerForPushNotifications()
        if (!result) {
          toast('Enable notifications for Mission Portal in your device settings', 'info')
          setPushEnabled(false)
          return
        }
        await persistPushToken(fbUser.uid, result.token, result.platform)
        setPushEnabled(true)
      } else {
        await clearPushToken(fbUser.uid, platformKey())
        setPushEnabled(false)
      }
    } catch {
      toast('Could not update notification settings', 'error')
      setPushEnabled(!next)
    } finally {
      setPushBusy(false)
    }
  }

  const handlePickPhoto = async () => {
    if (!fbUser) return
    if (Platform.OS === 'web') {
      fileInputRef.current?.click()
      return
    }
    setPhotoUploading(true)
    try {
      const url = await pickAndUploadAvatar(fbUser.uid)
      if (url) {
        setPhotoURL(url)
        toast('Photo updated', 'success')
      }
    } catch (err: unknown) {
      // Was a bare "Failed to upload photo" with the actual cause discarded,
      // which made a real device failure unreportable. Sentry.captureException
      // gets the real reason into the dashboard; the toast now shows it too.
      Sentry.captureException(err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast(`Failed to upload photo: ${message}`, 'error')
    } finally {
      setPhotoUploading(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !fbUser) return
    setPhotoUploading(true)
    try {
      setPhotoURL(await uploadAvatarFromFile(fbUser.uid, file))
      toast('Photo updated', 'success')
    } catch {
      toast('Failed to upload photo', 'error')
    } finally {
      setPhotoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
            >
              <XStack gap="$2" alignItems="center" justifyContent="space-between" marginBottom="$2">
                <Text fontWeight="600">Push notifications</Text>
                <Switch checked={pushEnabled} onCheckedChange={handleTogglePush} disabled={pushBusy}>
                  <Switch.Thumb />
                </Switch>
              </XStack>
              <Paragraph color="$colorMuted" fontSize="$2">
                Real-time alerts for assignments, messages, and events. You can change this any
                time in Profile &amp; Settings.
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

            <YStack alignSelf="center">
              {photoURL ? (
                <Avatar uri={photoURL} displayName={profile?.displayName} size={120} />
              ) : (
                <YStack
                  width={120}
                  height={120}
                  borderRadius={60}
                  backgroundColor="$borderColor"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text color="$colorMuted" fontSize="$7">
                    👤
                  </Text>
                </YStack>
              )}
            </YStack>

            {Platform.OS === 'web' ? (
              <input
                ref={fileInputRef as React.RefObject<HTMLInputElement>}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            ) : null}

            <Button variant="outlined" onPress={handlePickPhoto} disabled={photoUploading}>
              {photoUploading ? 'Uploading…' : photoURL ? 'Change photo' : 'Upload photo'}
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
