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
  /** Opens the report/block menu. Omitted for the viewer's own messages. */
  onLongPress?: () => void
}

export function MessageBubble({
  message,
  isMine,
  displayName,
  photoURL,
  onLongPress,
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
      {!isMine ? <Avatar uri={photoURL} displayName={displayName} size={32} /> : null}
      <YStack gap={2} maxWidth="75%">
        {!isMine && displayName ? (
          <Text color={colors.textMuted} fontSize="$2" paddingLeft="$1">
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
          onLongPress={onLongPress}
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
        <XStack gap="$2" alignItems="center" alignSelf={isMine ? 'flex-end' : 'flex-start'}>
          <Text color={colors.textMuted} fontSize={10}>
            {shortTime(message.ts)}
          </Text>
          {/* Visible entry point to report/block — a long-press-only affordance
              is too easy for a user (or an App Review tester) to miss. */}
          {onLongPress ? (
            <Pressable onPress={onLongPress} hitSlop={8} accessibilityLabel="Report or block">
              <Text color={colors.textMuted} fontSize={12}>
                ⋯
              </Text>
            </Pressable>
          ) : null}
        </XStack>
      </YStack>
    </XStack>
  )
}
