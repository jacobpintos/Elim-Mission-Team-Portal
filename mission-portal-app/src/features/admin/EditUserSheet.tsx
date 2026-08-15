import { useState } from 'react'
import { YStack, XStack, Text, Input, Button, Spinner } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { RoleCheckboxes } from './RoleCheckboxes'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { doc, updateDoc } from 'firebase/firestore'
import { db, functions } from '@/lib/firebase'
import { httpsCallable } from 'firebase/functions'
import { confirmAsync } from '@/lib/confirm'
import type { UserProfile } from '@/types/user'

interface EditUserSheetProps {
  open: boolean
  onClose: () => void
  user: UserProfile | null
}

export function EditUserSheet({ open, onClose, user }: EditUserSheetProps) {
  const { toast } = useUIStore()
  const { profile } = useAuthStore()

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [roles, setRoles] = useState<string[]>(user?.roles ?? ['regular'])
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [loadedUid, setLoadedUid] = useState(user?.uid)

  // Reload the form when a different user is opened.
  //
  // This used to be done by keying the component on the uid from the parent,
  // which threw the sheet away and mounted a fresh one already open — leaving
  // the dialog's enter transition nothing to animate from, so nothing
  // appeared. Adjusting state during render is React's supported way to
  // derive state from props, and it keeps the sheet mounted so `open` can
  // simply toggle.
  if (user && user.uid !== loadedUid) {
    setLoadedUid(user.uid)
    setDisplayName(user.displayName ?? '')
    setEmail(user.email ?? '')
    setRoles(user.roles ?? ['regular'])
  }

  const handleResetPassword = async () => {
    if (!user) return
    const ok = await confirmAsync(
      `Reset password for "${user.displayName ?? user.email}" to 12345678?`,
      { destructive: true }
    )
    if (!ok) return
    setResetting(true)
    try {
      const resetUserPassword = httpsCallable(functions, 'resetUserPassword')
      await resetUserPassword({ uid: user.uid })
      await audit(
        'user.passwordReset',
        `Reset password for ${user.email}`,
        profile?.displayName ?? ''
      )
      toast('Password reset to 12345678', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reset password'
      toast(message, 'error')
    } finally {
      setResetting(false)
    }
  }

  const handleSave = async () => {
    if (!user) return
    if (!email.trim()) {
      toast('Email is required', 'error')
      return
    }
    if (roles.length === 0) {
      toast('Select at least one role', 'error')
      return
    }
    setSaving(true)
    try {
      const emailChanged = email.trim().toLowerCase() !== (user.email ?? '').toLowerCase()
      if (emailChanged) {
        const updateUserEmail = httpsCallable(functions, 'updateUserEmail')
        await updateUserEmail({ uid: user.uid, newEmail: email.trim() })
      }
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: displayName.trim(),
        email: email.trim(),
        roles,
      })
      await audit(
        'user.updated',
        `Updated user ${user.email} → name: ${displayName.trim()}, email: ${email.trim()}, roles: ${roles.join(', ')}`,
        profile?.displayName ?? ''
      )
      toast('User updated!', 'success')
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update user'
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title="Edit User"
    >
      <YStack gap="$3" padding="$2">
        <Text fontSize="$2" color="$gray9" selectable>
          UID: {user?.uid}
        </Text>

        <YStack gap="$1">
          <Text fontSize="$3" fontWeight="600">
            Name
          </Text>
          <Input
            placeholder="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            size="$3"
          />
        </YStack>

        <YStack gap="$1">
          <Text fontSize="$3" fontWeight="600">
            Email
          </Text>
          <Input
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            size="$3"
          />
        </YStack>

        <YStack gap="$1">
          <Text fontSize="$3" fontWeight="600">
            Roles
          </Text>
          <RoleCheckboxes selected={roles} onChange={setRoles} />
        </YStack>

        <XStack gap="$2" justifyContent="space-between" alignItems="center">
          <Button size="$3" onPress={handleResetPassword} disabled={resetting} theme="yellow">
            {resetting ? <Spinner size="small" /> : 'Reset Password'}
          </Button>
          <XStack gap="$2">
            <Button size="$3" onPress={onClose} theme="gray">
              Cancel
            </Button>
            <Button size="$3" onPress={handleSave} disabled={saving} theme="active">
              {saving ? <Spinner size="small" /> : 'Save'}
            </Button>
          </XStack>
        </XStack>
      </YStack>
    </Modal>
  )
}
