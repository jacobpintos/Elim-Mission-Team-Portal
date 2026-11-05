import { useEffect, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useConfigStore } from '@/stores/configStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { formatPhone, isValidPhone, normalizePhone, stopSaid } from '@/lib/textingList'
import { askToJoin, mySignup, textingNumberOf, type MySignup } from '@/lib/textingListDb'
import { FD } from '@/lib/format'

/**
 * Connect: the texting list — event and meeting reminders by text. A
 * number, and they've asked to join: the Connections Coordinator gets the
 * day's requests and adds them in the service that sends the texts
 * (lib/textingList). Asked before, and it says with what number, and
 * whether it has gone to the coordinator; the number can be changed. How to
 * stop the texts is said either way.
 */
export function TextingListCard() {
  const colors = useThemeColors()
  const profile = useAuthStore((s) => s.profile)
  const textingNumber = useConfigStore((s) => s.textingNumber)
  const uid = String(profile?.uid ?? '')
  // undefined: not read yet, or couldn't be; null: never asked.
  const [signup, setSignup] = useState<MySignup | null | undefined>(undefined)
  const [read, setRead] = useState(false)
  const [editing, setEditing] = useState(false)
  const [phone, setPhone] = useState('')
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    useConfigStore.getState().subscribe()
    return () => useConfigStore.getState().unsubscribe()
  }, [])

  useEffect(() => {
    let live = true
    if (!uid) return
    mySignup(uid).then((s) => {
      if (!live) return
      setSignup(s)
      setRead(true)
    })
    return () => {
      live = false
    }
  }, [uid])

  if (!profile) return null

  const valid = isValidPhone(phone)
  const join = async () => {
    setTried(true)
    if (!valid) return
    setSaving(true)
    setFailed(false)
    try {
      await askToJoin(uid, profile.displayName ?? '', phone)
      setSignup({ phone: normalizePhone(phone) ?? phone, status: 'pending', at: Date.now() })
      setEditing(false)
      setTried(false)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const asking = editing || !signup
  const muted = (text: string) => (
    <Text color={colors.textMuted} fontSize="$3">
      {text}
    </Text>
  )

  return (
    <YStack
      padding={16}
      gap={10}
      borderRadius={14}
      borderWidth={1}
      borderColor={colors.border}
      backgroundColor={colors.surface}
    >
      <Text color={colors.text} fontSize="$6" fontWeight="700">
        Texting list
      </Text>
      {muted('Event and meeting reminders, by text.')}

      {!read ? (
        <Spinner size="small" alignSelf="flex-start" />
      ) : asking ? (
        <YStack gap={8}>
          <XStack gap={8} alignItems="center" flexWrap="wrap">
            <TextInput
              value={phone}
              onChangeText={(t) => {
                setPhone(t)
                setFailed(false)
              }}
              onSubmitEditing={join}
              placeholder="Your cell number"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              accessibilityLabel="Your cell number, for the texting list"
              style={{
                flex: 1,
                minWidth: 200,
                minHeight: 42,
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 12,
                fontSize: 16,
                color: colors.text,
                backgroundColor: colors.background,
                borderColor: tried && !valid ? '#DC2626' : colors.border,
              }}
            />
            <Pressable
              onPress={join}
              disabled={saving}
              accessibilityRole="button"
              style={{
                minHeight: 42,
                paddingHorizontal: 18,
                borderRadius: 21,
                justifyContent: 'center',
                backgroundColor: colors.primary,
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Text color={colors.onPrimary} fontSize="$3" fontWeight="700">
                {signup ? 'Save number' : 'Add me'}
              </Text>
            </Pressable>
            {editing ? (
              <Pressable
                onPress={() => {
                  setEditing(false)
                  setTried(false)
                }}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text color={colors.primary} fontSize="$3" fontWeight="600">
                  Cancel
                </Text>
              </Pressable>
            ) : null}
          </XStack>
          {tried && !valid ? (
            <Text color="$red10" fontSize="$2" fontWeight="600">
              That doesn’t look like a US number — include the area code.
            </Text>
          ) : null}
          {failed ? (
            <Text color="$red10" fontSize="$2" fontWeight="600">
              That didn’t save — try again in a moment.
            </Text>
          ) : null}
        </YStack>
      ) : (
        <YStack gap={6}>
          <Text color={colors.text} fontSize="$3">
            {signup.status === 'added'
              ? `You’re on the texting list, with ${formatPhone(signup.phone)}.`
              : `You’ve asked to join with ${formatPhone(signup.phone)}${signup.at ? ` on ${FD(new Date(signup.at).toISOString().slice(0, 10))}` : ''}. The Connections Coordinator adds you.`}
          </Text>
          <Pressable
            onPress={() => {
              setPhone(formatPhone(signup.phone))
              setEditing(true)
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text color={colors.primary} fontSize="$3" fontWeight="600">
              Change number
            </Text>
          </Pressable>
        </YStack>
      )}

      <View style={{ height: 1, backgroundColor: colors.border }} />
      {muted(stopSaid(textingNumberOf(textingNumber)))}
    </YStack>
  )
}
