import { useState } from 'react'
import { Pressable } from 'react-native'
import { XStack, YStack, Text, Image } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { shortTime } from '@/lib/format'
import { Avatar } from './Avatar'
import { ImageLightbox } from './ImageLightbox'
import type { Message } from '@/types/events'

interface MessageBubbleProps {
  message: Message
  isMine: boolean
  displayName?: string
  photoURL?: string
  /**
   * Opens the report/block menu. Omitted for the viewer's own messages, which
   * is what makes the avatar tappable only on other people's.
   */
  onShowActions?: () => void
}

export function MessageBubble({
  message,
  isMine,
  displayName,
  photoURL,
  onShowActions,
}: MessageBubbleProps) {
  const colors = useThemeColors()
  const [viewing, setViewing] = useState<string | null>(null)
  const bubbleColor = isMine ? colors.primary : colors.surface
  const textColor = isMine ? 'white' : colors.text

  return (
    <XStack
      gap="$2"
      flexDirection={isMine ? 'row-reverse' : 'row'}
      paddingVertical="$1"
      paddingHorizontal="$2"
      alignItems="flex-end"
    >
      {/* Tapping someone's avatar opens report/block. Dims and shows a pointer
          on hover so the target reads as interactive on web; long-pressing the
          bubble does the same thing on touch. */}
      {!isMine ? (
        <Pressable
          onPress={onShowActions}
          accessibilityLabel={`Options for ${displayName ?? 'this person'}`}
        >
          <XStack
            borderRadius={999}
            cursor="pointer"
            hoverStyle={{ opacity: 0.7 }}
            pressStyle={{ opacity: 0.5 }}
          >
            <Avatar uri={photoURL} displayName={displayName} size={32} />
          </XStack>
        </Pressable>
      ) : null}
      <YStack gap={2} maxWidth="75%">
        {!isMine && displayName ? (
          <Text
            color={colors.textMuted}
            fontSize="$2"
            paddingLeft="$1"
            cursor="pointer"
            hoverStyle={{ textDecorationLine: 'underline' }}
            onPress={onShowActions}
          >
            {displayName}
          </Text>
        ) : null}
        <YStack
          backgroundColor={bubbleColor}
          borderRadius="$3"
          borderBottomLeftRadius={isMine ? '$3' : '$1'}
          borderBottomRightRadius={isMine ? '$1' : '$3'}
          padding="$2"
          gap="$1"
          onLongPress={onShowActions}
        >
          {message.text ? (
            <Text color={textColor} fontSize="$3">
              {message.text}
            </Text>
          ) : null}
          {message.attachment?.type === 'image' ? (
            // Tapping opens it full screen, where it can be zoomed, saved and
            // copied. Long-press still reaches the report/block menu, which is
            // why this is a tap rather than swallowing both.
            <Pressable
              onPress={() => setViewing(message.attachment?.url ?? null)}
              onLongPress={onShowActions}
              accessibilityLabel="Open image"
            >
              {/* `src`, not `source`. Tamagui's Image does not destructure
                  `source` at all — it builds one from `src` and sets it after
                  spreading the rest of the props, so a `source` passed in is
                  overwritten with { uri: undefined } and the image renders as
                  an empty box at exactly the width and height requested. */}
              <Image src={message.attachment.url} width={200} height={150} borderRadius="$2" />
            </Pressable>
          ) : message.attachment?.type === 'file' ? (
            <Text color={textColor} fontSize="$2" textDecorationLine="underline">
              📎 {message.attachment.name ?? 'File'}
            </Text>
          ) : null}
        </YStack>
        <Text color={colors.textMuted} fontSize={10} alignSelf={isMine ? 'flex-end' : 'flex-start'}>
          {shortTime(message.ts)}
        </Text>
      </YStack>

      {/* key={viewing} on purpose: a new picture mounts a fresh viewer, so
          its zoom and pan start at their defaults. Reopening an image still
          zoomed from last time, with no visible reason why, reads as a bug —
          and remounting is cheaper than an effect that writes shared values,
          which is what the previous version did. */}
      <ImageLightbox
        key={viewing ?? 'none'}
        uri={viewing}
        name={message.attachment?.name}
        onClose={() => setViewing(null)}
      />
    </XStack>
  )
}
