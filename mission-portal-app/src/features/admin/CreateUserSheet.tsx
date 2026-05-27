import { useState } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Input, Button, Spinner } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { RoleCheckboxes } from './RoleCheckboxes'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { collection, addDoc, getDocs, query, where, updateDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface CreateUserSheetProps {
  open: boolean
  onClose: () => void
}

export function CreateUserSheet({ open, onClose }: CreateUserSheetProps) {
  const { toast } = useUIStore()
  const { profile } = useAuthStore()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roles, setRoles] = useState<string[]>(['regular'])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Name is required'
    if (!email.trim()) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email'
    if (!password) e.password = 'Password is required'
    else if (password.length < 8) e.password = 'Password must be at least 8 characters'
    if (roles.length === 0) e.roles = 'Select at least one role'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const functions = getFunctions()
      const createPortalUser = httpsCallable(functions, 'createPortalUser')
      const result = await createPortalUser({
        name: name.trim(),
        email: email.trim(),
        password,
        recoveryEmail: recoveryEmail.trim() || email.trim(),
        roles,
      })
      const { uid } = result.data as { uid: string }

      // Add uid to "All" group
      const groupsQuery = query(collection(db, 'groups'), where('name', '==', 'All'))
      const groupsSnap = await getDocs(groupsQuery)
      if (!groupsSnap.empty) {
        const groupDoc = groupsSnap.docs[0]
        const existing: string[] = groupDoc.data().members ?? []
        if (!existing.includes(uid)) {
          await updateDoc(doc(db, 'groups', groupDoc.id), {
            members: [...existing, uid],
          })
        }
      }

      await audit('user.created', `Created user ${email.trim()}`, profile?.displayName ?? '')
      toast('User created!', 'success')
      onClose()
      setName('')
      setEmail('')
      setRecoveryEmail('')
      setPassword('')
      setRoles(['regular'])
      setErrors({})
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create user'
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title="Add User">
      <ScrollView>
        <YStack gap="$3" padding="$2">
          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600">
              Full Name *
            </Text>
            <Input
              placeholder="Full Name"
              value={name}
              onChangeText={setName}
              size="$3"
            />
            {errors.name && (
              <Text fontSize="$2" color="$red10">
                {errors.name}
              </Text>
            )}
          </YStack>

          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600">
              Login Email *
            </Text>
            <Input
              placeholder="Login Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              size="$3"
            />
            {errors.email && (
              <Text fontSize="$2" color="$red10">
                {errors.email}
              </Text>
            )}
          </YStack>

          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600">
              Recovery Email (optional)
            </Text>
            <Input
              placeholder="Recovery Email"
              value={recoveryEmail}
              onChangeText={setRecoveryEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              size="$3"
            />
          </YStack>

          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600">
              Initial Password *
            </Text>
            <Input
              placeholder="Password (min 8 characters)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              size="$3"
            />
            {errors.password && (
              <Text fontSize="$2" color="$red10">
                {errors.password}
              </Text>
            )}
          </YStack>

          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600">
              Roles *
            </Text>
            <RoleCheckboxes selected={roles} onChange={setRoles} />
            {errors.roles && (
              <Text fontSize="$2" color="$red10">
                {errors.roles}
              </Text>
            )}
          </YStack>

          <XStack gap="$2" justifyContent="flex-end">
            <Button size="$3" onPress={onClose} theme="gray">
              Cancel
            </Button>
            <Button size="$3" onPress={handleSubmit} disabled={saving} theme="active">
              {saving ? <Spinner size="small" /> : 'Create User'}
            </Button>
          </XStack>
        </YStack>
      </ScrollView>
    </Modal>
  )
}
