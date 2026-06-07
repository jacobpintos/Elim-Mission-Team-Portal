import { Pressable } from 'react-native'
import { Image } from 'expo-image'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import type { PhotoAlbum } from '@/types/photos'

interface PhotoAlbumCardProps {
  album: PhotoAlbum
  onPress: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export function PhotoAlbumCard({ album, onPress, onEdit, onDelete }: PhotoAlbumCardProps) {
  const colors = useThemeColors()
  const location = [album.city, album.state].filter(Boolean).join(', ')

  return (
    <Pressable onPress={onPress}>
      <YStack
        backgroundColor={colors.surface}
        borderRadius="$3"
        borderWidth={1}
        borderColor={colors.border}
        overflow="hidden"
        marginBottom="$3"
      >
        {album.coverImageUrl ? (
          <Image
            source={{ uri: album.coverImageUrl }}
            style={{ width: '100%', height: 180 }}
            contentFit="cover"
          />
        ) : (
          <YStack
            height={180}
            backgroundColor={colors.border}
            alignItems="center"
            justifyContent="center"
          >
            <Text color={colors.textMuted} fontSize="$3">
              No Cover Photo
            </Text>
          </YStack>
        )}

        <YStack padding="$3" gap="$1">
          <Text color={colors.text} fontWeight="700" fontSize="$4" numberOfLines={2}>
            {album.title}
          </Text>
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            {location ? (
              <Text color={colors.textMuted} fontSize="$2">
                {location}
              </Text>
            ) : null}
            {location && album.date ? (
              <Text color={colors.textMuted} fontSize="$2">
                ·
              </Text>
            ) : null}
            {album.date ? (
              <Text color={colors.textMuted} fontSize="$2">
                {album.date}
              </Text>
            ) : null}
          </XStack>
          {album.description ? (
            <Text color={colors.textMuted} fontSize="$2" numberOfLines={2}>
              {album.description}
            </Text>
          ) : null}
          <Text color={colors.textMuted} fontSize={11} marginTop="$1">
            {album.photos.length} photo{album.photos.length !== 1 ? 's' : ''}
          </Text>

          {(onEdit || onDelete) && (
            <XStack gap="$2" marginTop="$2">
              {onEdit && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.()
                    onEdit()
                  }}
                >
                  <XStack
                    borderWidth={1}
                    borderColor={colors.primary}
                    borderRadius="$2"
                    paddingHorizontal="$2"
                    paddingVertical={4}
                  >
                    <Text color={colors.primary} fontSize="$2">
                      Edit
                    </Text>
                  </XStack>
                </Pressable>
              )}
              {onDelete && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.()
                    onDelete()
                  }}
                >
                  <XStack
                    borderWidth={1}
                    borderColor="#c0392b"
                    borderRadius="$2"
                    paddingHorizontal="$2"
                    paddingVertical={4}
                  >
                    <Text color="#c0392b" fontSize="$2">
                      Delete
                    </Text>
                  </XStack>
                </Pressable>
              )}
            </XStack>
          )}
        </YStack>
      </YStack>
    </Pressable>
  )
}
