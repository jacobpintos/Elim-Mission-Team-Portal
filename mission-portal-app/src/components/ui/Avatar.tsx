import { Avatar as TamaguiAvatar, Text } from 'tamagui'

interface AvatarProps {
  uri?: string
  displayName?: string
  size?: number
}

export function Avatar({ uri, displayName, size = 48 }: AvatarProps) {
  const initials = displayName
    ? displayName
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?'

  return (
    <TamaguiAvatar circular size={size}>
      {uri ? <TamaguiAvatar.Image src={uri} /> : null}
      <TamaguiAvatar.Fallback backgroundColor="$primary">
        <Text color="white" fontWeight="600" fontSize={size * 0.35}>
          {initials}
        </Text>
      </TamaguiAvatar.Fallback>
    </TamaguiAvatar>
  )
}
