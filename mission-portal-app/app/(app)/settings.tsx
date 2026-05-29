import { useRef, useState } from 'react'
import { ScrollView, Pressable, TextInput, StyleSheet, View } from 'react-native'
import { YStack, XStack, Text, Switch, Label, Separator } from 'tamagui'
import { Stack, useRouter } from 'expo-router'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
} from 'firebase/auth'
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage'
import { doc, updateDoc } from 'firebase/firestore'
import { auth, db, storage } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { Avatar } from '@/components/ui/Avatar'
import { isAdmin, isPublic } from '@/lib/roles'
import { geocodeCity } from '@/lib/geocode'
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

async function compressImage(dataUrl: string, maxDim = 512, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1)
      const w = Math.round(img.width * ratio)
      const h = Math.round(img.height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas unavailable')); return }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useThemeColors()
  return (
    <YStack gap="$3">
      <Text color={colors.textMuted} fontSize="$2" fontWeight="700" textTransform="uppercase" letterSpacing={1}>
        {title}
      </Text>
      {children}
      <Separator />
    </YStack>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useThemeColors()
  return (
    <YStack gap="$1">
      <Text color={colors.textMuted} fontSize="$2">{label}</Text>
      {children}
    </YStack>
  )
}

export default function SettingsScreen() {
  const colors = useThemeColors()
  const router = useRouter()
  const { fbUser, profile, signOutNow } = useAuthStore()
  const { mode, setMode } = useThemeStore()
  const { toast } = useUIStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [savingName, setSavingName] = useState(false)

  // Email change
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  // Password change
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  // Location
  const [city, setCity] = useState(profile?.locationPref?.city ?? '')
  const [stateVal, setStateVal] = useState(profile?.locationPref?.state ?? '')
  const [radius, setRadius] = useState(String(profile?.locationPref?.radius ?? 50))
  const [savingLoc, setSavingLoc] = useState(false)

  if (!profile || !fbUser) return null

  const pub = isPublic(profile)
  const prefs = profile.notificationPrefs

  // ── Photo upload ────────────────────────────────────────────────────────────
  const handlePickPhoto = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoUploading(true)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const compressed = await compressImage(dataUrl)
      const sref = storageRef(storage, `avatars/${fbUser.uid}.jpg`)
      await uploadString(sref, compressed, 'data_url')
      const photoURL = await getDownloadURL(sref)
      await updateDoc(doc(db, 'users', fbUser.uid), { photoURL })
      toast('Photo updated', 'success')
    } catch {
      toast('Failed to upload photo', 'error')
    } finally {
      setPhotoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Display name ─────────────────────────────────────────────────────────
  const handleSaveName = async () => {
    if (!displayName.trim()) return
    setSavingName(true)
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), { displayName: displayName.trim() })
      toast('Name updated', 'success')
    } catch {
      toast('Failed to update name', 'error')
    } finally {
      setSavingName(false)
    }
  }

  // ── Change email ─────────────────────────────────────────────────────────
  const handleChangeEmail = async () => {
    if (!newEmail.trim() || !emailPassword) return
    setSavingEmail(true)
    try {
      const credential = EmailAuthProvider.credential(fbUser.email!, emailPassword)
      await reauthenticateWithCredential(fbUser, credential)
      await verifyBeforeUpdateEmail(fbUser, newEmail.trim())
      toast('Verification sent to new email — check your inbox', 'success')
      setNewEmail('')
      setEmailPassword('')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to update email', 'error')
    } finally {
      setSavingEmail(false)
    }
  }

  // ── Change password ───────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) return
    if (newPw !== confirmPw) { toast('Passwords do not match', 'error'); return }
    if (newPw.length < 6) { toast('Password must be at least 6 characters', 'error'); return }
    setSavingPw(true)
    try {
      const credential = EmailAuthProvider.credential(fbUser.email!, currentPw)
      await reauthenticateWithCredential(fbUser, credential)
      await updatePassword(fbUser, newPw)
      toast('Password updated', 'success')
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to update password', 'error')
    } finally {
      setSavingPw(false)
    }
  }

  // ── Location ──────────────────────────────────────────────────────────────
  const handleSaveLocation = async () => {
    setSavingLoc(true)
    try {
      const coords = await geocodeCity(city, stateVal)
      const locationPref = { city, state: stateVal, radius: Number(radius) || 50, ...(coords ?? {}) }
      await updateDoc(doc(db, 'users', fbUser.uid), { locationPref })
      toast('Location saved', 'success')
    } catch {
      toast('Failed to save location', 'error')
    } finally {
      setSavingLoc(false)
    }
  }

  // ── Notification prefs ────────────────────────────────────────────────────
  const toggleEmailPref = async (key: NotifKey, value: boolean) => {
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), {
        notificationPrefs: { ...prefs, [key]: { ...prefs[key], email: value } },
      })
    } catch { toast('Failed', 'error') }
  }

  const togglePushPref = async (key: NotifKey, value: boolean) => {
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), {
        notificationPrefs: { ...prefs, [key]: { ...prefs[key], push: value } },
      })
    } catch { toast('Failed', 'error') }
  }

  const toggleDigest = async (key: 'weeklyDigest' | 'monthlyDigest', value: boolean) => {
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), {
        [`notificationPrefs.${key}`]: value,
      })
    } catch { toast('Failed', 'error') }
  }

  // ── Sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    await signOutNow()
    router.replace('/(auth)/login')
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Settings' }} />

      {/* Hidden file input for photo upload */}
      <input
        ref={fileInputRef as React.RefObject<HTMLInputElement>}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }}>

        {/* Profile Photo + Name */}
        <Section title="Profile">
          {!pub ? (
            <XStack gap="$4" alignItems="center">
              <Pressable onPress={handlePickPhoto} disabled={photoUploading}>
                <YStack alignItems="center" gap="$1">
                  <Avatar uri={profile.photoURL} displayName={profile.displayName} size={72} />
                  <Text color={colors.primary} fontSize="$2">
                    {photoUploading ? 'Uploading…' : 'Change photo'}
                  </Text>
                </YStack>
              </Pressable>
              <YStack flex={1} gap="$2">
                <Field label="Display name">
                  <XStack gap="$2">
                    <TextInput
                      style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, flex: 1 }]}
                      value={displayName}
                      onChangeText={setDisplayName}
                      placeholder="Your name"
                      placeholderTextColor={colors.textMuted}
                    />
                    <Pressable
                      onPress={handleSaveName}
                      disabled={savingName || displayName.trim() === profile.displayName}
                    >
                      <View style={[styles.btn, { backgroundColor: colors.primary, opacity: savingName || displayName.trim() === profile.displayName ? 0.5 : 1 }]}>
                        <Text color="white" fontSize="$2" fontWeight="700">Save</Text>
                      </View>
                    </Pressable>
                  </XStack>
                </Field>
              </YStack>
            </XStack>
          ) : (
            <Field label="Display name">
              <XStack gap="$2">
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, flex: 1 }]}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                  placeholderTextColor={colors.textMuted}
                />
                <Pressable onPress={handleSaveName} disabled={savingName || displayName.trim() === profile.displayName}>
                  <View style={[styles.btn, { backgroundColor: colors.primary, opacity: savingName || displayName.trim() === profile.displayName ? 0.5 : 1 }]}>
                    <Text color="white" fontSize="$2" fontWeight="700">Save</Text>
                  </View>
                </Pressable>
              </XStack>
            </Field>
          )}

          <Field label="Email">
            <XStack gap="$2" alignItems="center">
              <Text color={colors.text} fontSize="$3">{fbUser.email}</Text>
              <View style={[styles.badge, { backgroundColor: fbUser.emailVerified ? '#27ae60' : '#e67e22' }]}>
                <Text color="white" fontSize={11} fontWeight="700">
                  {fbUser.emailVerified ? '✓ Verified' : 'Unverified'}
                </Text>
              </View>
            </XStack>
          </Field>
        </Section>

        {/* Change Email */}
        <Section title="Change Email">
          <Field label="New email address">
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="new@email.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </Field>
          <Field label="Current password (to confirm)">
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={emailPassword}
              onChangeText={setEmailPassword}
              placeholder="Current password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </Field>
          <Pressable onPress={handleChangeEmail} disabled={savingEmail || !newEmail.trim() || !emailPassword}>
            <View style={[styles.btn, { backgroundColor: colors.primary, opacity: savingEmail || !newEmail.trim() || !emailPassword ? 0.5 : 1 }]}>
              <Text color="white" fontWeight="700">
                {savingEmail ? 'Sending verification…' : 'Update email'}
              </Text>
            </View>
          </Pressable>
        </Section>

        {/* Change Password */}
        <Section title="Change Password">
          <Field label="Current password">
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={currentPw}
              onChangeText={setCurrentPw}
              placeholder="Current password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </Field>
          <Field label="New password">
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={newPw}
              onChangeText={setNewPw}
              placeholder="Min. 6 characters"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </Field>
          <Field label="Confirm new password">
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              value={confirmPw}
              onChangeText={setConfirmPw}
              placeholder="Confirm password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </Field>
          <Pressable onPress={handleChangePassword} disabled={savingPw || !currentPw || !newPw || !confirmPw}>
            <View style={[styles.btn, { backgroundColor: colors.primary, opacity: savingPw || !currentPw || !newPw || !confirmPw ? 0.5 : 1 }]}>
              <Text color="white" fontWeight="700">
                {savingPw ? 'Updating…' : 'Update password'}
              </Text>
            </View>
          </Pressable>
        </Section>

        {/* Location */}
        <Section title="Location">
          <Text color={colors.textMuted} fontSize="$2">Used to show events near you.</Text>
          <XStack gap="$2">
            <Field label="City">
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, minWidth: 140 }]}
                value={city}
                onChangeText={setCity}
                placeholder="Iowa City"
                placeholderTextColor={colors.textMuted}
              />
            </Field>
            <Field label="State">
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, width: 60 }]}
                value={stateVal}
                onChangeText={setStateVal}
                placeholder="IA"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                maxLength={2}
              />
            </Field>
            <Field label="Radius (mi)">
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, width: 70 }]}
                value={radius}
                onChangeText={setRadius}
                placeholder="50"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </Field>
          </XStack>
          <Pressable onPress={handleSaveLocation} disabled={savingLoc}>
            <View style={[styles.btn, { backgroundColor: colors.primary, opacity: savingLoc ? 0.5 : 1 }]}>
              <Text color="white" fontWeight="700">{savingLoc ? 'Saving…' : 'Save location'}</Text>
            </View>
          </Pressable>
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <XStack alignItems="center" justifyContent="space-between">
            <Label>Dark mode</Label>
            <Switch checked={mode === 'dark'} onCheckedChange={(v) => setMode(v ? 'dark' : 'light')}>
              <Switch.Thumb />
            </Switch>
          </XStack>
        </Section>

        {/* Notifications — not shown to public users */}
        {!pub ? (
          <Section title="Notifications">
            <XStack marginBottom="$1">
              <Text flex={1} color={colors.textMuted} fontSize="$2" fontWeight="700">Event</Text>
              <XStack gap="$3" width={110}>
                <Text flex={1} color={colors.textMuted} fontSize="$2" textAlign="center">Push</Text>
                <Text flex={1} color={colors.textMuted} fontSize="$2" textAlign="center">Email</Text>
              </XStack>
            </XStack>
            {(Object.keys(NOTIF_LABELS) as NotifKey[]).filter((k) => {
              if (isAdmin(profile)) return true
              return k !== 'issueAssigned'
            }).map((key) => (
              <XStack key={key} alignItems="center">
                <Label flex={1} fontSize="$3">{NOTIF_LABELS[key]}</Label>
                <XStack gap="$3" width={110} alignItems="center">
                  <YStack flex={1} alignItems="center">
                    <Switch size="$2" checked={prefs[key].push} onCheckedChange={(v) => togglePushPref(key, v)}>
                      <Switch.Thumb />
                    </Switch>
                  </YStack>
                  <YStack flex={1} alignItems="center">
                    <Switch size="$2" checked={prefs[key].email} onCheckedChange={(v) => toggleEmailPref(key, v)}>
                      <Switch.Thumb />
                    </Switch>
                  </YStack>
                </XStack>
              </XStack>
            ))}
            <XStack alignItems="center" justifyContent="space-between">
              <Label fontSize="$3">Weekly digest</Label>
              <Switch size="$2" checked={prefs.weeklyDigest} onCheckedChange={(v) => toggleDigest('weeklyDigest', v)}>
                <Switch.Thumb />
              </Switch>
            </XStack>
            <XStack alignItems="center" justifyContent="space-between">
              <Label fontSize="$3">Monthly digest</Label>
              <Switch size="$2" checked={prefs.monthlyDigest} onCheckedChange={(v) => toggleDigest('monthlyDigest', v)}>
                <Switch.Thumb />
              </Switch>
            </XStack>
          </Section>
        ) : null}

        {/* Sign out */}
        <Pressable onPress={handleSignOut}>
          <View style={[styles.signOutBtn, { borderColor: '#c0392b' }]}>
            <Text color="#c0392b" fontWeight="700" fontSize="$4">Sign out</Text>
          </View>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </YStack>
  )
}

const styles = StyleSheet.create({
  input: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  btn: {
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  signOutBtn: {
    height: 48,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
