import { Avatar as TamaguiAvatar, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'

interface AvatarProps {
  uri?: string
  displayName?: string
  size?: number
}

/**
 * A person's photo, or their initials when there is no photo.
 *
 * The fallback used to render as bare letters clipped by the circle, with no
 * disc behind them. Two reasons, both fixed here: it asked for `$primary`,
 * which is not a token in tamagui.config.ts — every other component in the app
 * reads that colour through useThemeColors — so the background resolved to
 * nothing; and Tamagui's Fallback does not centre its child, so the initials
 * sat at the top edge and the circle cropped their upper half.
 */
export function Avatar({ uri, displayName, size = 48 }: AvatarProps) {
  const colors = useThemeColors()

  // Initials from the first and last word rather than the first two, so a
  // shared entry like "Pastor Ajai & Maureena Prakash" reads as PP rather
  // than PA, and a middle name does not displace the surname.
  const words = displayName?.trim().split(/\s+/).filter(Boolean) ?? []
  const initials =
    words.length === 0
      ? '?'
      : words.length === 1
        ? words[0].slice(0, 2).toUpperCase()
        : (words[0][0] + words[words.length - 1][0]).toUpperCase()

  return (
    <TamaguiAvatar circular size={size}>
      {uri ? <TamaguiAvatar.Image src={uri} accessibilityLabel={displayName} /> : null}
      <TamaguiAvatar.Fallback
        backgroundColor={colors.primary}
        alignItems="center"
        justifyContent="center"
      >
        <Text
          color="white"
          fontWeight="700"
          fontSize={size * 0.36}
          lineHeight={size * 0.44}
          textAlign="center"
        >
          {initials}
        </Text>
      </TamaguiAvatar.Fallback>
    </TamaguiAvatar>
  )
}
