import { useRef, useState } from 'react'
import { ScrollView, Pressable, TextInput, StyleSheet, View, Platform } from 'react-native'
import { YStack, XStack, Text, Switch, Label, Separator } from 'tamagui'
import { useRouter } from 'expo-router'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
} from 'firebase/auth'
import { doc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { Avatar } from '@/components/ui/Avatar'
import { isAdmin, isPublic } from '@/lib/roles'
import { geocodeCity } from '@/lib/geocode'
import { pickAndUploadAvatar, uploadAvatarFromFile } from '@/lib/avatarUpload'
import { confirmAsync } from '@/lib/confirm'
import { DEFAULT_FLIGHT_REMINDER_HOURS, type NotificationPrefs } from '@/types/user'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import * as Sentry from '@sentry/react-native'

type NotifKey = keyof Pick<
  NotificationPrefs,
  | 'newAssignment'
  | 'newMessage'
  | 'eventReminder'
  | 'announcement'
  | 'issueAssigned'
  | 'eventJoin'
  | 'eventRemoved'
  | 'worshipSetAssigned'
  | 'taskDueSoon'
  | 'rsvpNonAvailable'
  | 'kaizenSubmission'
  | 'issueSubmission'
  | 'eventHealthBehind'
  | 'chatFlagged'
  | 'securityReport'
  | 'weatherAlertAdmin'
  | 'eventLogistics'
  | 'flightReminder'
>

// Admin-only notification keys — hidden from the toggle list for non-admins,
// same treatment issueAssigned already got.
const ADMIN_ONLY_NOTIF_KEYS: NotifKey[] = [
  'rsvpNonAvailable',
  'kaizenSubmission',
  'issueSubmission',
  'eventHealthBehind',
  'chatFlagged',
  'securityReport',
  'weatherAlertAdmin',
  'eventLogistics',
  'flightReminder',
]

const NOTIF_LABELS: Record<NotifKey, string> = {
  newAssignment: 'New assignment',
  newMessage: 'New message',
  eventReminder: 'Event reminder',
  announcement: 'Announcement',
  issueAssigned: 'Issue assigned',
  eventJoin: 'Added to an event',
  eventRemoved: 'Removed from an event/team',
  worshipSetAssigned: 'Worship set assigned',
  taskDueSoon: 'Task due soon',
  rsvpNonAvailable: 'RSVP: not available',
  kaizenSubmission: 'New Kaizen submission',
  issueSubmission: 'New issue submission',
  eventHealthBehind: 'Event falling behind',
  chatFlagged: 'Chat flagged',
  securityReport: 'Security report',
  weatherAlertAdmin: 'Weather alert',
  eventLogistics: 'Travel details assigned',
  flightReminder: 'Flight reminder',
}

type PublicNotifKey = keyof Pick<
  NotificationPrefs,
  'publicAnnouncement' | 'publicEvent' | 'contentFeatured'
>

const PUBLIC_NOTIF_LABELS: Record<PublicNotifKey, string> = {
  publicAnnouncement: 'Public announcements',
  publicEvent: 'Nearby & virtual events',
  contentFeatured: 'New & featured content',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useThemeColors()
  return (
    <YStack gap="$3">
      <Text
        color={colors.textMuted}
        fontSize="$2"
        fontWeight="700"
        textTransform="uppercase"
        letterSpacing={1}
      >
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
      <Text color={colors.textMuted} fontSize="$2">
        {label}
      </Text>
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
  const prefs: NonNullable<typeof profile.notificationPrefs> = profile.notificationPrefs ?? {
    newAssignment: { push: true, email: false },
    newMessage: { push: true, email: false },
    eventReminder: { push: true, email: true },
    announcement: { push: true, email: false },
    issueAssigned: { push: true, email: false },
    weeklyDigest: true,
    monthlyDigest: false,
    eventJoin: { push: true, email: false },
    eventRemoved: { push: true, email: false },
    worshipSetAssigned: { push: true, email: false },
    taskDueSoon: { push: true, email: false },
    rsvpNonAvailable: { push: true, email: false },
    kaizenSubmission: { push: true, email: false },
    issueSubmission: { push: true, email: false },
    eventHealthBehind: { push: true, email: false },
    chatFlagged: { push: true, email: false },
    securityReport: { push: true, email: false },
    weatherAlertAdmin: { push: true, email: false },
    eventLogistics: { push: true, email: false },
    flightReminder: { push: true, email: false },
    publicAnnouncement: { push: true, email: false },
    publicEvent: { push: true, email: false },
    contentFeatured: { push: true, email: false },
  }

  // ── Photo upload ────────────────────────────────────────────────────────────
  // Web picks through a hidden <input type="file">; native goes straight to the
  // OS photo library via expo-image-picker.
  const handlePickPhoto = async () => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click()
      return
    }
    try {
      const result = await pickAndUploadAvatar(fbUser.uid, {
        onPermissionDenied: () => toast('Photo library permission denied', 'error'),
        onUploadStart: () => setPhotoUploading(true),
      })
      if (result) toast('Photo updated', 'success')
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
    if (!file) return
    setPhotoUploading(true)
    try {
      await uploadAvatarFromFile(fbUser.uid, file)
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
    if (newPw !== confirmPw) {
      toast('Passwords do not match', 'error')
      return
    }
    if (newPw.length < 6) {
      toast('Password must be at least 6 characters', 'error')
      return
    }
    setSavingPw(true)
    try {
      const credential = EmailAuthProvider.credential(fbUser.email!, currentPw)
      await reauthenticateWithCredential(fbUser, credential)
      await updatePassword(fbUser, newPw)
      toast('Password updated', 'success')
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
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
      const locationPref = {
        city,
        state: stateVal,
        radius: Number(radius) || 50,
        ...(coords ?? {}),
      }
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
    } catch {
      toast('Failed', 'error')
    }
  }

  const togglePushPref = async (key: NotifKey, value: boolean) => {
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), {
        notificationPrefs: { ...prefs, [key]: { ...prefs[key], push: value } },
      })
    } catch {
      toast('Failed', 'error')
    }
  }

  // Lives on the profile rather than in notificationPrefs because the
  // scheduled function reads it per user when deciding how early to fire.
  const flightHours = profile?.flightReminderHours ?? DEFAULT_FLIGHT_REMINDER_HOURS
  const saveFlightReminderHours = async (hours: number) => {
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), { flightReminderHours: hours })
    } catch {
      toast('Failed', 'error')
    }
  }

  const toggleDigest = async (key: 'weeklyDigest' | 'monthlyDigest', value: boolean) => {
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), {
        [`notificationPrefs.${key}`]: value,
      })
    } catch {
      toast('Failed', 'error')
    }
  }

  const togglePublicPushPref = async (key: PublicNotifKey, value: boolean) => {
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), {
        notificationPrefs: { ...prefs, [key]: { ...prefs[key], push: value } },
      })
    } catch {
      toast('Failed', 'error')
    }
  }

  const togglePublicEmailPref = async (key: PublicNotifKey, value: boolean) => {
    try {
      await updateDoc(doc(db, 'users', fbUser.uid), {
        notificationPrefs: { ...prefs, [key]: { ...prefs[key], email: value } },
      })
    } catch {
      toast('Failed', 'error')
    }
  }

  // ── Sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    await signOutNow()
    router.replace('/(auth)/login')
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Profile & Settings' }} />

      {/* Hidden file input for photo upload — web only; `input` is not a valid
          React Native host component and throws an invariant on iOS/Android. */}
      {Platform.OS === 'web' ? (
        <input
          ref={fileInputRef as React.RefObject<HTMLInputElement>}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      ) : null}

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
                      style={[
                        styles.input,
                        {
                          color: colors.text,
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                          flex: 1,
                        },
                      ]}
                      value={displayName}
                      onChangeText={setDisplayName}
                      placeholder="Your name"
                      placeholderTextColor={colors.textMuted}
                    />
                    <Pressable
                      onPress={handleSaveName}
                      disabled={savingName || displayName.trim() === profile.displayName}
                    >
                      <View
                        style={[
                          styles.btn,
                          {
                            backgroundColor: colors.primary,
                            opacity:
                              savingName || displayName.trim() === profile.displayName ? 0.5 : 1,
                          },
                        ]}
                      >
                        <Text color="white" fontSize="$2" fontWeight="700">
                          Save
                        </Text>
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
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      flex: 1,
                    },
                  ]}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                  placeholderTextColor={colors.textMuted}
                />
                <Pressable
                  onPress={handleSaveName}
                  disabled={savingName || displayName.trim() === profile.displayName}
                >
                  <View
                    style={[
                      styles.btn,
                      {
                        backgroundColor: colors.primary,
                        opacity: savingName || displayName.trim() === profile.displayName ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text color="white" fontSize="$2" fontWeight="700">
                      Save
                    </Text>
                  </View>
                </Pressable>
              </XStack>
            </Field>
          )}

          <Field label="Email">
            <XStack gap="$2" alignItems="center">
              <Text color={colors.text} fontSize="$3">
                {fbUser.email}
              </Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: fbUser.emailVerified ? '#27ae60' : '#e67e22' },
                ]}
              >
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
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
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
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              value={emailPassword}
              onChangeText={setEmailPassword}
              placeholder="Current password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </Field>
          <Pressable
            onPress={handleChangeEmail}
            disabled={savingEmail || !newEmail.trim() || !emailPassword}
          >
            <View
              style={[
                styles.btn,
                {
                  backgroundColor: colors.primary,
                  opacity: savingEmail || !newEmail.trim() || !emailPassword ? 0.5 : 1,
                },
              ]}
            >
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
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              value={currentPw}
              onChangeText={setCurrentPw}
              placeholder="Current password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </Field>
          <Field label="New password">
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              value={newPw}
              onChangeText={setNewPw}
              placeholder="Min. 6 characters"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </Field>
          <Field label="Confirm new password">
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              value={confirmPw}
              onChangeText={setConfirmPw}
              placeholder="Confirm password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </Field>
          <Pressable
            onPress={handleChangePassword}
            disabled={savingPw || !currentPw || !newPw || !confirmPw}
          >
            <View
              style={[
                styles.btn,
                {
                  backgroundColor: colors.primary,
                  opacity: savingPw || !currentPw || !newPw || !confirmPw ? 0.5 : 1,
                },
              ]}
            >
              <Text color="white" fontWeight="700">
                {savingPw ? 'Updating…' : 'Update password'}
              </Text>
            </View>
          </Pressable>
        </Section>

        {/* Location */}
        <Section title="Location">
          <Text color={colors.textMuted} fontSize="$2">
            Used to show events near you.
          </Text>
          <XStack gap="$2">
            <Field label="City">
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    minWidth: 140,
                  },
                ]}
                value={city}
                onChangeText={setCity}
                placeholder="Iowa City"
                placeholderTextColor={colors.textMuted}
              />
            </Field>
            <Field label="State">
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    width: 60,
                  },
                ]}
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
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    width: 70,
                  },
                ]}
                value={radius}
                onChangeText={setRadius}
                placeholder="50"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </Field>
          </XStack>
          <Pressable onPress={handleSaveLocation} disabled={savingLoc}>
            <View
              style={[
                styles.btn,
                { backgroundColor: colors.primary, opacity: savingLoc ? 0.5 : 1 },
              ]}
            >
              <Text color="white" fontWeight="700">
                {savingLoc ? 'Saving…' : 'Save location'}
              </Text>
            </View>
          </Pressable>
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <XStack alignItems="center" justifyContent="space-between">
            <Label>Dark mode</Label>
            <Switch
              checked={mode === 'dark'}
              onCheckedChange={(v) => setMode(v ? 'dark' : 'light')}
            >
              <Switch.Thumb />
            </Switch>
          </XStack>
        </Section>

        {/* Notifications */}
        {pub ? (
          <Section title="Notifications">
            <XStack marginBottom="$1">
              <Text flex={1} color={colors.textMuted} fontSize="$2" fontWeight="700">
                Type
              </Text>
              <XStack gap="$3" width={110}>
                <Text flex={1} color={colors.textMuted} fontSize="$2" textAlign="center">
                  Push
                </Text>
                <Text flex={1} color={colors.textMuted} fontSize="$2" textAlign="center">
                  Email
                </Text>
              </XStack>
            </XStack>
            {(Object.keys(PUBLIC_NOTIF_LABELS) as PublicNotifKey[]).map((key) => (
              <XStack key={key} alignItems="center">
                <Label flex={1} fontSize="$3">
                  {PUBLIC_NOTIF_LABELS[key]}
                </Label>
                <XStack gap="$3" width={110} alignItems="center">
                  <YStack flex={1} alignItems="center">
                    <Switch
                      size="$2"
                      checked={prefs[key]?.push ?? true}
                      onCheckedChange={(v) => togglePublicPushPref(key, v)}
                    >
                      <Switch.Thumb />
                    </Switch>
                  </YStack>
                  <YStack flex={1} alignItems="center">
                    <Switch
                      size="$2"
                      checked={prefs[key]?.email ?? false}
                      onCheckedChange={(v) => togglePublicEmailPref(key, v)}
                    >
                      <Switch.Thumb />
                    </Switch>
                  </YStack>
                </XStack>
              </XStack>
            ))}
            <XStack alignItems="center" justifyContent="space-between">
              <Label fontSize="$3">Monthly digest</Label>
              <Switch
                size="$2"
                checked={prefs.monthlyDigest ?? false}
                onCheckedChange={(v) => toggleDigest('monthlyDigest', v)}
              >
                <Switch.Thumb />
              </Switch>
            </XStack>
          </Section>
        ) : (
          <Section title="Notifications">
            <XStack marginBottom="$1">
              <Text flex={1} color={colors.textMuted} fontSize="$2" fontWeight="700">
                Event
              </Text>
              <XStack gap="$3" width={110}>
                <Text flex={1} color={colors.textMuted} fontSize="$2" textAlign="center">
                  Push
                </Text>
                <Text flex={1} color={colors.textMuted} fontSize="$2" textAlign="center">
                  Email
                </Text>
              </XStack>
            </XStack>
            {(Object.keys(NOTIF_LABELS) as NotifKey[])
              .filter((k) => {
                if (isAdmin(profile)) return true
                return k !== 'issueAssigned' && !ADMIN_ONLY_NOTIF_KEYS.includes(k)
              })
              .map((key) => (
                <XStack key={key} alignItems="center">
                  <Label flex={1} fontSize="$3">
                    {NOTIF_LABELS[key]}
                  </Label>
                  <XStack gap="$3" width={110} alignItems="center">
                    <YStack flex={1} alignItems="center">
                      <Switch
                        size="$2"
                        checked={prefs[key]?.push ?? false}
                        onCheckedChange={(v) => togglePushPref(key, v)}
                      >
                        <Switch.Thumb />
                      </Switch>
                    </YStack>
                    <YStack flex={1} alignItems="center">
                      <Switch
                        size="$2"
                        checked={prefs[key]?.email ?? false}
                        onCheckedChange={(v) => toggleEmailPref(key, v)}
                      >
                        <Switch.Thumb />
                      </Switch>
                    </YStack>
                  </XStack>
                </XStack>
              ))}
            {/* How far ahead the flight reminder lands. Only worth showing to
                someone who wants the reminder at all. */}
            {prefs.flightReminder?.push || prefs.flightReminder?.email ? (
              <XStack alignItems="center" justifyContent="space-between" gap="$2">
                <Label flex={1} fontSize="$3">
                  Flight reminder lead time
                </Label>
                <XStack gap="$1" alignItems="center">
                  {[1, 3, 6, 12, 24].map((h) => (
                    <Pressable key={h} onPress={() => saveFlightReminderHours(h)}>
                      <XStack
                        paddingHorizontal="$2"
                        paddingVertical="$1"
                        borderRadius="$2"
                        borderWidth={1}
                        backgroundColor={flightHours === h ? colors.primary : 'transparent'}
                        borderColor={flightHours === h ? colors.primary : colors.border}
                      >
                        <Text color={flightHours === h ? 'white' : colors.text} fontSize="$2">
                          {h}h
                        </Text>
                      </XStack>
                    </Pressable>
                  ))}
                </XStack>
              </XStack>
            ) : null}
            <XStack alignItems="center" justifyContent="space-between">
              <Label fontSize="$3">Weekly digest</Label>
              <Switch
                size="$2"
                checked={prefs.weeklyDigest ?? false}
                onCheckedChange={(v) => toggleDigest('weeklyDigest', v)}
              >
                <Switch.Thumb />
              </Switch>
            </XStack>
            <XStack alignItems="center" justifyContent="space-between">
              <Label fontSize="$3">Monthly digest</Label>
              <Switch
                size="$2"
                checked={prefs.monthlyDigest ?? false}
                onCheckedChange={(v) => toggleDigest('monthlyDigest', v)}
              >
                <Switch.Thumb />
              </Switch>
            </XStack>
          </Section>
        )}

        {/* Legal */}
        <Section title="Legal">
          <Pressable onPress={() => router.push('/(auth)/privacy')}>
            <XStack alignItems="center" justifyContent="space-between" paddingVertical="$2">
              <Text color={colors.text} fontSize="$4">
                Privacy Policy
              </Text>
              <Text color={colors.textMuted} fontSize="$4">
                ›
              </Text>
            </XStack>
          </Pressable>
          <Pressable onPress={() => router.push('/(auth)/terms')}>
            <XStack alignItems="center" justifyContent="space-between" paddingVertical="$2">
              <Text color={colors.text} fontSize="$4">
                Terms of Use
              </Text>
              <Text color={colors.textMuted} fontSize="$4">
                ›
              </Text>
            </XStack>
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/blocked')}>
            <XStack alignItems="center" justifyContent="space-between" paddingVertical="$2">
              <Text color={colors.text} fontSize="$4">
                Blocked users
              </Text>
              <Text color={colors.textMuted} fontSize="$4">
                ›
              </Text>
            </XStack>
          </Pressable>
        </Section>

        {/* Account — deletion lives on its own screen so the irreversible action
            is not adjacent to Sign out, where it invites a misclick. */}
        <Section title="Account">
          <Pressable onPress={() => router.push('/(app)/delete-account')}>
            <XStack alignItems="center" justifyContent="space-between" paddingVertical="$2">
              <Text color="#c0392b" fontSize="$4">
                Delete account
              </Text>
              <Text color={colors.textMuted} fontSize="$4">
                ›
              </Text>
            </XStack>
          </Pressable>
        </Section>

        {/* Sign out */}
        <Pressable onPress={handleSignOut}>
          <View style={[styles.signOutBtn, { borderColor: '#c0392b' }]}>
            <Text color="#c0392b" fontWeight="700" fontSize="$4">
              Sign out
            </Text>
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
