import { useState } from 'react'
import { YStack, XStack, Text, Input, Button, Spinner } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { usePhotoAlbumsStore } from '@/stores/photoAlbumsStore'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import type { PhotoAlbum } from '@/types/photos'

interface PhotoAlbumFormModalProps {
  open: boolean
  onClose: () => void
  editAlbum?: PhotoAlbum | null
  defaultCategory?: 'general' | 'baptisms'
}

export function PhotoAlbumFormModal({
  open,
  onClose,
  editAlbum,
  defaultCategory = 'general',
}: PhotoAlbumFormModalProps) {
  const { createAlbum, updateAlbum } = usePhotoAlbumsStore()
  const { toast } = useUIStore()
  const { profile } = useAuthStore()

  const [title, setTitle] = useState(editAlbum?.title ?? '')
  const [coverImageUrl, setCoverImageUrl] = useState(editAlbum?.coverImageUrl ?? '')
  const [city, setCity] = useState(editAlbum?.city ?? '')
  const [stateVal, setStateVal] = useState(editAlbum?.state ?? '')
  const [date, setDate] = useState(editAlbum?.date ?? '')
  const [description, setDescription] = useState(editAlbum?.description ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim()) {
      toast('Title is required', 'error')
      return
    }
    setSaving(true)
    try {
      if (editAlbum) {
        await updateAlbum(editAlbum.id, {
          title: title.trim(),
          coverImageUrl: coverImageUrl.trim(),
          city: city.trim(),
          state: stateVal.trim(),
          date: date.trim(),
          description: description.trim() || undefined,
        })
        await audit(
          'photoAlbum.updated',
          `Updated album "${title.trim()}"`,
          profile?.displayName ?? ''
        )
        toast('Album updated', 'success')
      } else {
        await createAlbum({
          title: title.trim(),
          coverImageUrl: coverImageUrl.trim(),
          city: city.trim(),
          state: stateVal.trim(),
          date: date.trim(),
          description: description.trim() || undefined,
          photos: [],
          category: defaultCategory,
        })
        await audit(
          'photoAlbum.created',
          `Created album "${title.trim()}"`,
          profile?.displayName ?? ''
        )
        toast('Album created', 'success')
      }
      onClose()
    } catch {
      toast('Failed to save album', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={editAlbum ? 'Edit Album' : 'New Album'}
      scrollable
    >
      <YStack gap="$3" padding="$2">
        <YStack gap="$1">
          <Text fontSize="$3" fontWeight="600">
            Title *
          </Text>
          <Input placeholder="Album title" value={title} onChangeText={setTitle} size="$3" />
        </YStack>

        <YStack gap="$1">
          <Text fontSize="$3" fontWeight="600">
            Cover Image URL
          </Text>
          <Input
            placeholder="https://..."
            value={coverImageUrl}
            onChangeText={setCoverImageUrl}
            size="$3"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </YStack>

        <XStack gap="$2">
          <YStack flex={1} gap="$1">
            <Text fontSize="$3" fontWeight="600">
              City
            </Text>
            <Input placeholder="City" value={city} onChangeText={setCity} size="$3" />
          </YStack>
          <YStack flex={1} gap="$1">
            <Text fontSize="$3" fontWeight="600">
              State
            </Text>
            <Input placeholder="State" value={stateVal} onChangeText={setStateVal} size="$3" />
          </YStack>
        </XStack>

        <YStack gap="$1">
          <Text fontSize="$3" fontWeight="600">
            Date
          </Text>
          <Input
            placeholder="e.g. March 2024 or Jan 2024 - Mar 2024"
            value={date}
            onChangeText={setDate}
            size="$3"
          />
        </YStack>

        <YStack gap="$1">
          <Text fontSize="$3" fontWeight="600">
            Description
          </Text>
          <Input
            placeholder="Optional description"
            value={description}
            onChangeText={setDescription}
            size="$3"
          />
        </YStack>

        <XStack gap="$2" justifyContent="flex-end">
          <Button size="$3" theme="gray" onPress={onClose}>
            Cancel
          </Button>
          <Button size="$3" theme="active" onPress={handleSave} disabled={saving}>
            {saving ? <Spinner size="small" /> : editAlbum ? 'Save' : 'Create'}
          </Button>
        </XStack>
      </YStack>
    </Modal>
  )
}
