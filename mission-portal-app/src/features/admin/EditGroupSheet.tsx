import { useState, useEffect } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Input, Button, Spinner } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { MemberPicker } from './MemberPicker'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { GroupDoc } from './GroupCard'

interface EditGroupSheetProps {
  open: boolean
  onClose: () => void
  group: GroupDoc | null
}

export function EditGroupSheet({ open, onClose, group }: EditGroupSheetProps) {
  const { toast } = useUIStore()
  const { profile } = useAuthStore()

  const [name, setName] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (group) {
      setName(group.name)
      setMembers(group.members ?? [])
    }
  }, [group])

  const handleSave = async () => {
    if (!group) return
    if (!name.trim()) {
      toast('Group name is required', 'error')
      return
    }
    setSaving(true)
    try {
      await updateDoc(doc(db, 'groups', group.id), {
        name: name.trim(),
        members,
        updatedAt: new Date(),
      })
      await audit(
        'group.updated',
        `Updated group "${group.name}" → "${name.trim()}", ${members.length} members`,
        profile?.displayName ?? ''
      )
      toast('Group updated!', 'success')
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update group'
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title="Edit Group">
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
            <Button size="$3" onPress={handleSave} disabled={saving} theme="active">
              {saving ? <Spinner size="small" /> : 'Save'}
            </Button>
          </XStack>
        </YStack>
      </ScrollView>
    </Modal>
  )
}
