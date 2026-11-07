import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { canLookAround } from '@/lib/localNetwork'
import { saveMultiviewFeed, type MultiviewFeed } from '@/lib/switcher/switcherAddress'
import { Multiview } from './Multiview'
import { lookForEncoder } from './lookAround'

/** An outlined button, as Settings has them. */
export function FindButton({
  label,
  onPress,
  disabled,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  const colors = useThemeColors()
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ alignSelf: 'flex-start' }}>
      <View
        style={{
          minHeight: 40,
          borderRadius: 8,
          paddingHorizontal: 16,
          paddingVertical: 8,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.primary,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text color={colors.primary} fontWeight="700">
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

/**
 * Find the encoder (./lookAround): looks on the phone's network for the
 * multiview's picture and saves it. When several devices give a picture, each
 * is shown, to use the one that's the multiview. Nothing in a build that
 * can't look around the network.
 */
export function FindEncoder({ onSaved }: { onSaved: (feed: MultiviewFeed) => void }) {
  const colors = useThemeColors()
  const [looking, setLooking] = useState(false)
  const [said, setSaid] = useState('')
  const [choices, setChoices] = useState<{ host: string; feed: MultiviewFeed }[]>([])
  if (!canLookAround()) return null

  const look = async () => {
    setLooking(true)
    setChoices([])
    const found = await lookForEncoder(setSaid)
    setLooking(false)
    setSaid(found.said)
    if (found.kind === 'choose') setChoices(found.feeds)
    if (found.kind === 'saved') onSaved(found.feed)
  }
  const choose = async (host: string, feed: MultiviewFeed) => {
    await saveMultiviewFeed(feed)
    setChoices([])
    setSaid(`Saved the picture from ${host}.`)
    onSaved(feed)
  }

  return (
    <YStack gap="$2">
      <FindButton
        label={looking ? 'Looking…' : 'Find the encoder on this network'}
        onPress={() => void look()}
        disabled={looking}
      />
      {said ? (
        <Text color={colors.textMuted} fontSize="$2">
          {said}
        </Text>
      ) : null}
      {choices.map(({ host, feed }) => (
        <YStack key={host} gap="$2">
          <Multiview feed={feed} />
          <XStack alignItems="center" justifyContent="space-between" gap="$2">
            <Text color={colors.textMuted} fontSize="$2" flexShrink={1} numberOfLines={1}>
              {feed.url}
            </Text>
            <FindButton label="Use this" onPress={() => void choose(host, feed)} />
          </XStack>
        </YStack>
      ))}
    </YStack>
  )
}
