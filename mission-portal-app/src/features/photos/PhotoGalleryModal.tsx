import { useState, useCallback } from 'react'
import { Modal, Pressable, ScrollView, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { YStack, XStack, Text, Input, Button, Spinner } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { usePhotoAlbumsStore } from '@/stores/photoAlbumsStore'
import { useUIStore } from '@/stores/uiStore'
import { confirmAsync } from '@/lib/confirm'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { PhotoAlbum, PhotoItem } from '@/types/photos'

interface PhotoGalleryModalProps {
  album: PhotoAlbum | null
  isAdmin: boolean
  onClose: () => void
}

const NUM_COLS = 3
const GAP = 3

export function PhotoGalleryModal({ album: opened, isAdmin, onClose }: PhotoGalleryModalProps) {
  const colors = useThemeColors()
  const { addPhoto, removePhoto } = usePhotoAlbumsStore()
  const liveAlbums = usePhotoAlbumsStore((s) => s.albums)

  // The prop is whatever the album looked like when it was tapped, and it is
  // never updated — so adding a photo wrote to Firestore, the store's snapshot
  // listener fired, and this modal went on rendering the copy it was handed.
  // The photo only appeared after closing and reopening. Removing one looked
  // broken for the same reason, even when the write had succeeded.
  const album = opened ? (liveAlbums.find((a) => a.id === opened.id) ?? opened) : null

  const [viewing, setViewing] = useState<string | null>(null)
  const { toast } = useUIStore()
  const { width } = useWindowDimensions()

  const [newUrl, setNewUrl] = useState('')
  const [newCaption, setNewCaption] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  const imgSize = Math.floor((Math.min(width, 600) - 32 - GAP * (NUM_COLS - 1)) / NUM_COLS)

  const handleAddPhoto = useCallback(async () => {
    if (!album || !newUrl.trim()) return
    setAdding(true)
    try {
      const photo: PhotoItem = { url: newUrl.trim() }
      if (newCaption.trim()) photo.caption = newCaption.trim()
      await addPhoto(album.id, photo)
      setNewUrl('')
      setNewCaption('')
      setShowAddForm(false)
      toast('Photo added', 'success')
    } catch {
      toast('Failed to add photo', 'error')
    } finally {
      setAdding(false)
    }
  }, [album, newUrl, newCaption, addPhoto, toast])

  const handleRemovePhoto = useCallback(
    async (photo: PhotoItem) => {
      if (!album) return
      // Alert.alert renders nothing on web, so the prompt never appeared and
      // the delete never ran — the button looked dead. confirmAsync is the
      // cross-platform one this codebase already keeps for the purpose.
      const ok = await confirmAsync('Remove this photo from the album?', {
        title: 'Remove Photo',
        confirmLabel: 'Remove',
        destructive: true,
      })
      if (!ok) return
      try {
        await removePhoto(album.id, photo)
        toast('Photo removed', 'success')
      } catch {
        toast('Failed to remove photo', 'error')
      }
    },
    [album, removePhoto, toast]
  )

  if (!album) return null

  const location = [album.city, album.state].filter(Boolean).join(', ')

  const rows: PhotoItem[][] = []
  for (let i = 0; i < album.photos.length; i += NUM_COLS) {
    rows.push(album.photos.slice(i, i + NUM_COLS))
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <YStack flex={1} backgroundColor={colors.background}>
        {/* Header */}
        <XStack
          backgroundColor={colors.surface}
          borderBottomWidth={1}
          borderBottomColor={colors.border}
          paddingHorizontal="$4"
          paddingTop="$5"
          paddingBottom="$3"
          alignItems="center"
          justifyContent="space-between"
        >
          <YStack flex={1}>
            <Text color={colors.text} fontSize="$5" fontWeight="700" numberOfLines={1}>
              {album.title}
            </Text>
            {(location || album.date) && (
              <Text color={colors.textMuted} fontSize="$2" marginTop={2}>
                {[location, album.date].filter(Boolean).join(' · ')}
              </Text>
            )}
          </YStack>
          <XStack gap="$2" alignItems="center">
            {isAdmin && (
              <Pressable onPress={() => setShowAddForm((v) => !v)}>
                <XStack
                  backgroundColor={colors.primary}
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                >
                  <Text color="white" fontSize="$2" fontWeight="600">
                    + Photo
                  </Text>
                </XStack>
              </Pressable>
            )}
            <Pressable onPress={onClose}>
              <XStack
                borderWidth={1}
                borderColor={colors.border}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$1"
              >
                <Text color={colors.text} fontSize="$2">
                  Close
                </Text>
              </XStack>
            </Pressable>
          </XStack>
        </XStack>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* Admin add photo form */}
          {isAdmin && showAddForm && (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              borderWidth={1}
              borderColor={colors.border}
              padding="$3"
              gap="$2"
              marginBottom="$3"
            >
              <Text color={colors.text} fontWeight="600" fontSize="$3">
                Add Photo
              </Text>
              <Input
                placeholder="Image URL"
                value={newUrl}
                onChangeText={setNewUrl}
                size="$3"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Input
                placeholder="Caption (optional)"
                value={newCaption}
                onChangeText={setNewCaption}
                size="$3"
              />
              <XStack gap="$2" justifyContent="flex-end">
                <Button
                  size="$3"
                  theme="gray"
                  onPress={() => {
                    setShowAddForm(false)
                    setNewUrl('')
                    setNewCaption('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="$3"
                  theme="active"
                  onPress={handleAddPhoto}
                  disabled={adding || !newUrl.trim()}
                >
                  {adding ? <Spinner size="small" /> : 'Add'}
                </Button>
              </XStack>
            </YStack>
          )}

          {album.photos.length === 0 ? (
            <YStack alignItems="center" paddingVertical="$8">
              <Text color={colors.textMuted} fontSize="$3">
                No photos yet
              </Text>
            </YStack>
          ) : (
            <YStack gap={GAP}>
              {rows.map((row, ri) => (
                <XStack key={ri} gap={GAP}>
                  {row.map((photo, ci) => (
                    <YStack key={`${ri}-${ci}`} position="relative">
                      <Pressable onPress={() => setViewing(photo.url)}>
                        <Image
                          source={{ uri: photo.url }}
                          style={{ width: imgSize, height: imgSize }}
                          contentFit="cover"
                        />
                      </Pressable>
                      {photo.caption ? (
                        <Text
                          color={colors.textMuted}
                          fontSize={10}
                          numberOfLines={1}
                          style={{ width: imgSize }}
                        >
                          {photo.caption}
                        </Text>
                      ) : null}
                      {isAdmin && (
                        <Pressable
                          onPress={() => handleRemovePhoto(photo)}
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            backgroundColor: 'rgba(0,0,0,0.55)',
                            borderRadius: 12,
                            width: 22,
                            height: 22,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>×</Text>
                        </Pressable>
                      )}
                    </YStack>
                  ))}
                </XStack>
              ))}
            </YStack>
          )}
        </ScrollView>

        {/* key on the url so each photo opens a fresh viewer at its default
            zoom, rather than inheriting where the last one was left. */}
        <ImageLightbox key={viewing ?? 'none'} uri={viewing} onClose={() => setViewing(null)} />
      </YStack>
    </Modal>
  )
}
