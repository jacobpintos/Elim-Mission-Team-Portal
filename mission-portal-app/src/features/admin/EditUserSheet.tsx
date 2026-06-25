import { useState } from 'react'
import { YStack, XStack, Text, Input, Button, Spinner } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { RoleCheckboxes } from './RoleCheckboxes'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { UserProfile } from '@/types/user'

interface EditUserSheetProps {
  open: boolean
  onClose: () => void
  user: UserProfile | null
}

export function EditUserSheet({ open, onClose, user }: EditUserSheetProps) {
  const { toast } = useUIStore()
  const { profile } = useAuthStore()

  // Initialized from user prop — parent must pass key={user.uid} to reset on user change
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [roles, setRoles] = useState<string[]>(user?.roles ?? ['regular'])
  const [saving, setSaving] = useState(false)

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

        <XStack gap="$2" justifyContent="flex-end">
          <Button size="$3" onPress={onClose} theme="gray">
            Cancel
          </Button>
          <Button size="$3" onPress={handleSave} disabled={saving} theme="active">
            {saving ? <Spinner size="small" /> : 'Save'}
          </Button>
        </XStack>
      </YStack>
    </Modal>
  )
}
