import { useState } from 'react'
import { ScrollView } from 'react-native'
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

  const [email, setEmail] = useState(user?.email ?? '')
  const [roles, setRoles] = useState<string[]>(user?.roles ?? ['regular'])
  const [saving, setSaving] = useState(false)

  // Sync with incoming user
  const handleOpen = () => {
    if (user) {
      setEmail(user.email)
      setRoles(user.roles ?? ['regular'])
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
      await updateDoc(doc(db, 'users', user.uid), {
        email: email.trim(),
        roles,
      })
      await audit(
        'user.updated',
        `Updated user ${user.email} → email: ${email.trim()}, roles: ${roles.join(', ')}`,
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
        if (v) handleOpen()
        else onClose()
      }}
      title="Edit User"
    >
      <ScrollView>
        <YStack gap="$3" padding="$2">
          {user && (
            <Text fontSize="$4" fontWeight="700">
              {user.displayName}
            </Text>
          )}

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
      </ScrollView>
    </Modal>
  )
}
