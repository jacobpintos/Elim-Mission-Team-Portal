import { Pressable } from 'react-native'
import { Image } from 'expo-image'
import { Text, XStack, YStack } from 'tamagui'
import { Arrow } from '@/components/ui/Brand'
import { openExternalUrl } from '@/lib/externalUrl'
import { resolveSocialIcon } from '@/lib/socialIcon'
import { useThemeColors } from '@/theme/useThemeColors'
import type { PageBlock } from '@/types/pages'
import type { GiveWay } from './givingLayout'
import { ImageBlock } from './BlockRenderer/ImageBlock'
import { EmbedBlock } from './BlockRenderer/EmbedBlock'
import { GalleryBlock } from './BlockRenderer/GalleryBlock'
import { TwoColBlock } from './BlockRenderer/TwoColBlock'
import { TimelineBlock } from './BlockRenderer/TimelineBlock'
import { MeetingBlock } from './BlockRenderer/MeetingBlock'
import { HeroBlock } from './BlockRenderer/HeroBlock'
import { QuoteBlock } from './BlockRenderer/QuoteBlock'

/**
 * Pieces the designed pages — Giving, Connect and Our Story — have in common.
 */

/** A button in the dark band: solid coral for the main way on, outlined for the other. */
export function HeroPill({
  label,
  onPress,
  solid,
  primary,
  onPrimary,
}: {
  label: string
  onPress: () => void
  solid: boolean
  primary: string
  onPrimary: string
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <XStack
        backgroundColor={solid ? primary : 'transparent'}
        borderWidth={solid ? 0 : 1.5}
        borderColor="rgba(255,255,255,0.55)"
        borderRadius={999}
        paddingHorizontal={24}
        paddingVertical={solid ? 15 : 13.5}
        gap={10}
        alignItems="center"
      >
        {/* Shrinks to wrap a long label rather than run off a phone's edge. */}
        <Text
          color={solid ? onPrimary : '#ffffff'}
          fontSize={16}
          fontWeight="800"
          letterSpacing={0.3}
          flexShrink={1}
        >
          {label}
        </Text>
        {solid ? <Arrow color={onPrimary} /> : null}
      </XStack>
    </Pressable>
  )
}

/**
 * A place to go, as a card: its mark, its name, the account people know it by,
 * and an arrow. Ways to give on Giving; the church's accounts on Connect.
 */
export function LinkCard({
  link,
  width,
  verb,
}: {
  link: GiveWay
  width: number | '100%'
  /** How the card is announced to a screen reader: "Give with", "Open". */
  verb: string
}) {
  const colors = useThemeColors()
  const icon = resolveSocialIcon(link.icon, link.label)

  return (
    <Pressable
      onPress={() => openExternalUrl(link.url)}
      accessibilityRole="link"
      accessibilityLabel={`${verb} ${link.label}`}
      style={(state) => {
        // react-native-web adds `hovered`; native has no such state.
        const hovered = (state as { hovered?: boolean }).hovered
        return {
          width,
          opacity: state.pressed ? 0.85 : 1,
          transform: [{ translateY: hovered ? -2 : 0 }],
        }
      }}
    >
      <XStack
        alignItems="center"
        gap={14}
        padding={18}
        borderRadius={18}
        borderWidth={1}
        borderColor={colors.border}
        backgroundColor={colors.surface}
      >
        <YStack
          width={52}
          height={52}
          borderRadius={14}
          alignItems="center"
          justifyContent="center"
          overflow="hidden"
          backgroundColor={icon.kind === 'image' ? colors.border : colors.primary + '1f'}
        >
          {icon.kind === 'image' ? (
            <Image
              source={{ uri: icon.uri }}
              style={{ width: 52, height: 52 }}
              contentFit="cover"
            />
          ) : (
            <Text
              fontSize={icon.kind === 'glyph' ? 24 : 22}
              fontWeight="800"
              color={colors.primary}
            >
              {icon.text}
            </Text>
          )}
        </YStack>
        <YStack flex={1} gap={2}>
          <Text fontSize={17} fontWeight="700" color={colors.text} numberOfLines={1}>
            {link.label}
          </Text>
          {link.handle && link.handle !== link.label.toLowerCase() ? (
            <Text fontSize={14} color={colors.textMuted} numberOfLines={1}>
              {link.handle}
            </Text>
          ) : null}
        </YStack>
        <YStack
          width={36}
          height={36}
          borderRadius={18}
          alignItems="center"
          justifyContent="center"
          backgroundColor={colors.primary + '1f'}
        >
          <Arrow color={colors.primary} />
        </YStack>
      </XStack>
    </Pressable>
  )
}

/** A block the design has no section for, drawn as the page builder draws it. */
export function renderRestBlock(block: PageBlock) {
  switch (block.type) {
    case 'image':
      return <ImageBlock key={block.id} data={block.data as never} />
    case 'embed':
      return <EmbedBlock key={block.id} data={block.data as never} />
    case 'gallery':
      return <GalleryBlock key={block.id} data={block.data as never} />
    case 'twocol':
      return <TwoColBlock key={block.id} data={block.data as never} />
    case 'timeline':
      return <TimelineBlock key={block.id} data={block.data as never} />
    case 'meeting':
      return <MeetingBlock key={block.id} data={block.data as never} />
    case 'hero':
      return <HeroBlock key={block.id} data={block.data as never} />
    case 'quote':
      return <QuoteBlock key={block.id} data={block.data as never} />
    default:
      return null
  }
}
