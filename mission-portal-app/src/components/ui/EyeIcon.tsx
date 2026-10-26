import Svg, { Circle, Path } from 'react-native-svg'

/**
 * The eye of a password field's show/hide button: crossed out while the
 * password is hidden, open while it shows. Lucide's Eye and EyeOff (ISC),
 * drawn here because @tamagui/lucide-icons can't be used with this app's
 * tamagui (page-builder SocialBlock).
 */
export function EyeIcon({ off, size = 20, color }: { off: boolean; size?: number; color: string }) {
  const stroke = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {off ? (
        <>
          <Path
            d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"
            {...stroke}
          />
          <Path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" {...stroke} />
          <Path
            d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"
            {...stroke}
          />
          <Path d="m2 2 20 20" {...stroke} />
        </>
      ) : (
        <>
          <Path
            d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
            {...stroke}
          />
          <Circle cx={12} cy={12} r={3} {...stroke} />
        </>
      )}
    </Svg>
  )
}
