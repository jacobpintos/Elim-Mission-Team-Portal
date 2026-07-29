import { Pressable } from 'react-native'
import { XStack, YStack, Text, Image } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { shortTime } from '@/lib/format'
import { Avatar } from './Avatar'
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
        <Pressable onPress={onShowActions} accessibilityLabel={`Options for ${displayName ?? 'this person'}`}>
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
            <Image
              source={{ uri: message.attachment.url }}
              width={200}
              height={150}
              borderRadius="$2"
            />
          ) : message.attachment?.type === 'file' ? (
            <Text color={textColor} fontSize="$2" textDecorationLine="underline">
              📎 {message.attachment.name ?? 'File'}
            </Text>
          ) : null}
        </YStack>
        <Text
          color={colors.textMuted}
          fontSize={10}
          alignSelf={isMine ? 'flex-end' : 'flex-start'}
        >
          {shortTime(message.ts)}
        </Text>
      </YStack>
    </XStack>
  )
}
