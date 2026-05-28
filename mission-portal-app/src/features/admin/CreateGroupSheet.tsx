import { useState } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Input, Button, Spinner } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { MemberPicker } from './MemberPicker'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { collection, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface CreateGroupSheetProps {
  open: boolean
  onClose: () => void
}

export function CreateGroupSheet({ open, onClose }: CreateGroupSheetProps) {
  const { toast } = useUIStore()
  const { profile } = useAuthStore()

  const [name, setName] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) {
      toast('Group name is required', 'error')
      return
    }
    setSaving(true)
    try {
      await addDoc(collection(db, 'groups'), {
        name: name.trim(),
        members,
        createdAt: new Date(),
      })
      await audit(
        'group.created',
        `Created group "${name.trim()}" with ${members.length} members`,
        profile?.displayName ?? ''
      )
      toast('Group created!', 'success')
      onClose()
      setName('')
      setMembers([])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create group'
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title="Create Group">
      <ScrollView>
        <YStack gap="$3" padding="$2">
          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600">
              Group Name *
            </Text>
            <Input
              placeholder="Group Name"
              value={name}
              onChangeText={setName}
              size="$3"
            />
          </YStack>

          <MemberPicker selected={members} onChange={setMembers} label="Members" />

          <XStack gap="$2" justifyContent="flex-end">
            <Button size="$3" onPress={onClose} theme="gray">
              Cancel
            </Button>
            <Button size="$3" onPress={handleCreate} disabled={saving} theme="active">
              {saving ? <Spinner size="small" /> : 'Create Group'}
            </Button>
          </XStack>
        </YStack>
      </ScrollView>
    </Modal>
  )
}
