import { useState } from 'react'
import { useRouter } from 'expo-router'
import { ScrollView, Pressable, View } from 'react-native'
import { YStack, XStack, H2, H3, Text, Button, Input, Switch, Label, Separator } from 'tamagui'
import { SafeAreaView } from 'react-native-safe-area-context'
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import * as ImagePicker from 'expo-image-picker'
import { db, storage } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { Avatar } from '@/components/ui/Avatar'
import { isPublic } from '@/lib/roles'
import type { NotificationPrefs } from '@/types/user'

type NotifKey = keyof Pick<
  NotificationPrefs,
  'newAssignment' | 'newMessage' | 'eventReminder' | 'announcement' | 'issueAssigned'
>

const NOTIF_LABELS: Record<NotifKey, string> = {
  newAssignment: 'New assignment',
  newMessage: 'New message',
  eventReminder: 'Event reminder',
  announcement: 'Announcement',
  issueAssigned: 'Issue assigned',
}

export default function ProfileScreen() {
  const router = useRouter()
  const { fbUser, profile, signOutNow } = useAuthStore()
  const { mode, setMode } = useThemeStore()
  const { toast } = useUIStore()
  const colors = useThemeColors()

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  if (!profile || !fbUser) return null

  const pickAndUploadPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    })
    if (result.canceled || !result.assets[0]) return
    setUploadingPhoto(true)
    try {
      const asset = result.assets[0]
      const response = await fetch(asset.uri)
      const blob = await response.blob()
      const storageRef = ref(storage, `avatars/${fbUser.uid}`)
      const contentType = asset.mimeType ?? 'image/jpeg'
      await uploadBytes(storageRef, blob, { contentType })
      const downloadURL = await getDownloadURL(storageRef)
      await updateDoc(doc(db, 'users', fbUser.uid), { photoURL: downloadURL })
      toast('Photo updated', 'success')
    } catch {
      toast('Failed to upload photo', 'error')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const prefs = profile.notificationPrefs

  const saveDisplayName = async () => {
    const trimmed = displayName.trim()
    if (!trimmed) {
      toast('Name cannot be empty', 'error')
      return
    }
    setSaving(true)
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('displayName', '==', trimmed))
      )
      const taken = snap.docs.some((d) => d.id !== fbUser.uid)
      if (taken) {
        toast('That display name is already taken', 'error')
        return
      }
      await updateDoc(doc(db, 'users', fbUser.uid), { displayName: trimmed })
      toast('Name updated', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update name'
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleEmailPref = async (key: NotifKey, value: boolean) => {
    const updated = {
      ...prefs,
      [key]: { ...(prefs?.[key] ?? {}), email: value },
    }
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), {
        notificationPrefs: updated,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update preferences'
      toast(message, 'error')
    }
  }

  const togglePushPref = async (key: NotifKey, value: boolean) => {
    const updated = {
      ...prefs,
      [key]: { ...(prefs?.[key] ?? {}), push: value },
    }
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), {
        notificationPrefs: updated,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update preferences'
      toast(message, 'error')
    }
  }

  const toggleDigest = async (key: 'weeklyDigest' | 'monthlyDigest', value: boolean) => {
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), {
        [`notificationPrefs.${key}`]: value,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update preferences'
      toast(message, 'error')
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView>
        <YStack padding="$4" gap="$5">
          <H2>Profile</H2>

          {/* Avatar + name */}
          <YStack gap="$3" alignItems="center">
            <Pressable onPress={pickAndUploadPhoto} disabled={uploadingPhoto}>
              <View style={{ position: 'relative' }}>
                <Avatar uri={profile.photoURL} displayName={profile.displayName} size={80} />
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: colors.background,
                  }}
                >
                  <Text color="white" fontSize={13} lineHeight={16}>
                    {uploadingPhoto ? '…' : '📷'}
                  </Text>
                </View>
              </View>
            </Pressable>
            <YStack gap="$2" width="100%">
              <Label htmlFor="displayName">Display name</Label>
              <XStack gap="$2">
                <Input
                  id="displayName"
                  flex={1}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                />
                <Button
                  backgroundColor="$primary"
                  onPress={saveDisplayName}
                  disabled={saving || displayName === profile.displayName}
                  opacity={saving || displayName === profile.displayName ? 0.6 : 1}
                >
                  Save
                </Button>
              </XStack>
            </YStack>
            <YStack width="100%" gap="$1">
              <Label>Email</Label>
              <XStack gap="$2" alignItems="center">
                <Text color="$colorMuted">{fbUser.email}</Text>
                <YStack
                  backgroundColor={fbUser.emailVerified ? '$green9' : '$orange9'}
                  borderRadius="$2"
                  paddingHorizontal="$2"
                  paddingVertical="$1"
                >
                  <Text color="white" fontSize="$1">
                    {fbUser.emailVerified ? 'Verified' : 'Unverified'}
                  </Text>
                </YStack>
              </XStack>
            </YStack>
          </YStack>

          <Separator />

          {/* Appearance */}
          <YStack gap="$3">
            <H3>Appearance</H3>
            <XStack alignItems="center" justifyContent="space-between">
              <Label>Dark mode</Label>
              <Switch
                checked={mode === 'dark'}
                onCheckedChange={(v) => setMode(v ? 'dark' : 'light')}
              >
                <Switch.Thumb />
              </Switch>
            </XStack>
          </YStack>

          <Separator />

          {/* Notification preferences */}
          <YStack gap="$3">
            <H3>Notification preferences</H3>

            {/* Per-event toggles */}
            <XStack paddingBottom="$2">
              <Text flex={1} fontWeight="600" fontSize="$3">
                Event
              </Text>
              <XStack gap="$4" width={120}>
                <Text flex={1} fontWeight="600" fontSize="$3" textAlign="center">
                  Push
                </Text>
                <Text flex={1} fontWeight="600" fontSize="$3" textAlign="center">
                  Email
                </Text>
              </XStack>
            </XStack>

            {(Object.keys(NOTIF_LABELS) as NotifKey[]).map((key) => (
              <XStack key={key} alignItems="center">
                <Label flex={1}>{NOTIF_LABELS[key]}</Label>
                <XStack gap="$4" width={120} alignItems="center">
                  {/* Push — functional */}
                  <YStack flex={1} alignItems="center">
                    <Switch
                      checked={prefs?.[key]?.push ?? false}
                      onCheckedChange={(v) => togglePushPref(key, v)}
                    >
                      <Switch.Thumb />
                    </Switch>
                  </YStack>
                  {/* Email — functional */}
                  <YStack flex={1} alignItems="center">
                    <Switch
                      checked={prefs?.[key]?.email ?? false}
                      onCheckedChange={(v) => toggleEmailPref(key, v)}
                    >
                      <Switch.Thumb />
                    </Switch>
                  </YStack>
                </XStack>
              </XStack>
            ))}

            <Separator />

            {/* Digest toggles */}
            <XStack alignItems="center" justifyContent="space-between">
              <Label>Weekly digest</Label>
              <Switch
                checked={prefs?.weeklyDigest ?? false}
                onCheckedChange={(v) => toggleDigest('weeklyDigest', v)}
              >
                <Switch.Thumb />
              </Switch>
            </XStack>

            {isPublic(profile) && (
              <XStack alignItems="center" justifyContent="space-between">
                <Label>Monthly digest</Label>
                <Switch
                  checked={prefs?.monthlyDigest ?? false}
                  onCheckedChange={(v) => toggleDigest('monthlyDigest', v)}
                >
                  <Switch.Thumb />
                </Switch>
              </XStack>
            )}
          </YStack>

          <Separator />

          {/* Account actions */}
          <YStack gap="$3">
            <H3>Account</H3>
            <Button
              variant="outlined"
              onPress={async () => {
                await signOutNow()
                router.replace('/(auth)/login')
              }}
            >
              Sign out
            </Button>
            <Button variant="outlined" borderColor="$red9" color="$red9" opacity={0.7} disabled>
              Delete account (contact admin)
            </Button>
          </YStack>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  )
}
