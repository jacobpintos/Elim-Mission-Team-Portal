import { useState, useEffect } from 'react'
import { FlashList } from '@shopify/flash-list'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { TaskTemplateCard, type TaskTemplate } from '@/features/admin/TaskTemplateCard'
import { EditTaskTemplateSheet } from '@/features/admin/EditTaskTemplateSheet'
import { audit } from '@/lib/audit'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'

export default function AdminTemplates() {
  const { profile } = useAuthStore()
  const { toast } = useUIStore()

  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<TaskTemplate | null>(null)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'taskTemplates'), (snap) => {
      const data = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as TaskTemplate)
      data.sort((a, b) => a.name.localeCompare(b.name))
      setTemplates(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const handleDelete = async (template: TaskTemplate) => {
    try {
      await deleteDoc(doc(db, 'taskTemplates', String(template.id)))
      await audit(
        'taskTemplate.deleted',
        `Deleted task template "${template.name}"`,
        profile?.displayName ?? ''
      )
      toast('Template deleted', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete template'
      toast(message, 'error')
    }
  }

  return (
    <YStack flex={1} padding="$4" gap="$3">

      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$6" fontWeight="700">
          Task Templates ({templates.length})
        </Text>
        <Button size="$3" onPress={() => setShowCreate(true)} theme="active">
          + New Template
        </Button>
      </XStack>

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" />
        </YStack>
      ) : (
        <FlashList
          data={templates}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <YStack marginBottom="$2">
              <TaskTemplateCard
                template={item}
                onEdit={(t) => setEditTarget(t)}
                onDelete={handleDelete}
              />
            </YStack>
          )}
          ListEmptyComponent={
            <Text color="$gray10" textAlign="center" paddingVertical="$4">
              No templates yet. Create one to get started.
            </Text>
          }
        />
      )}

      <EditTaskTemplateSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        template={null}
      />
      <EditTaskTemplateSheet
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        template={editTarget}
      />
    </YStack>
  )
}
