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
}

export function MessageBubble({ message, isMine, displayName, photoURL }: MessageBubbleProps) {
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
        <Text color={colors.textMuted} fontSize={10} alignSelf={isMine ? 'flex-end' : 'flex-start'}>
          {shortTime(message.ts)}
        </Text>
      </YStack>
    </XStack>
  )
}
