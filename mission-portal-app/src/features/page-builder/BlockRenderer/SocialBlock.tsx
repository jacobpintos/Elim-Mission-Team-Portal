import { Pressable } from 'react-native'
import { Image } from 'expo-image'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeStore } from '@/stores/themeStore'
import { autoTextColor } from '@/theme/contrast'
import { resolveSocialIcon, type ResolvedIcon } from '@/lib/socialIcon'
import type { SocialData } from '@/types/pages'
import { openExternalUrl } from '@/lib/externalUrl'

interface SocialBlockProps {
  data: SocialData
}

const TILE = 64
const COLUMN = 92

/**
 * Whatever stands in for the platform: its logo, an emoji, or its initial.
 *
 * Note there is no icon component here. @tamagui/lucide-icons is installed
 * but unusable: its newest release is a major version behind the app's
 * tamagui and bundles its own @tamagui/core, so an icon rendered inside the
 * app's provider reads a theme context nothing ever filled in and throws,
 * taking the whole page down with it.
 */
function Mark({ icon, color }: { icon: ResolvedIcon; color: string }) {
  if (icon.kind === 'image') {
    return (
      <Image source={{ uri: icon.uri }} style={{ width: TILE, height: TILE }} contentFit="cover" />
    )
  }

  return (
    <Text fontSize={icon.kind === 'glyph' ? 28 : 24} fontWeight="700" color={color}>
      {icon.text}
    </Text>
  )
}

/**
 * A row of places to go — social accounts, or the ways to give.
 *
 * The mark is the button and the name sits under it, rather than both being
 * crammed into one pill. What a reader recognises first is the logo, and it
 * gives the name somewhere to be that is not next to a repeat of itself.
 */
export function SocialBlock({ data }: SocialBlockProps) {
  const { theme } = useThemeStore()
  const links = data.links ?? []
  const onPrimary = theme.onPrimaryOverride ?? autoTextColor(theme.primary)

  return (
    <YStack padding="$4" gap="$3">
      {data.heading ? (
        <Text fontSize="$5" fontWeight="700">
          {data.heading}
        </Text>
      ) : null}

      <XStack flexWrap="wrap" gap="$4">
        {links.map((link, index) => {
          const icon = resolveSocialIcon(link.icon, link.label)

          return (
            <Pressable
              key={index}
              onPress={() => openExternalUrl(link.url)}
              accessibilityRole="link"
              accessibilityLabel={link.label || link.url}
            >
              <YStack width={COLUMN} alignItems="center" gap="$2">
                <YStack
                  width={TILE}
                  height={TILE}
                  borderRadius={TILE / 2}
                  // A pasted logo brings its own background, and painting the
                  // theme colour behind it would fight whatever that is.
                  backgroundColor={icon.kind === 'image' ? '$gray3' : theme.primary}
                  alignItems="center"
                  justifyContent="center"
                  overflow="hidden"
                >
                  <Mark icon={icon} color={onPrimary} />
                </YStack>

                {link.label ? (
                  <Text fontSize="$2" fontWeight="600" textAlign="center" numberOfLines={2}>
                    {link.label}
                  </Text>
                ) : null}
              </YStack>
            </Pressable>
          )
        })}

        {links.length === 0 && (
          <Text color="$gray10" fontSize="$3">
            No links added
          </Text>
        )}
      </XStack>
    </YStack>
  )
}
