import { YStack, Spinner } from 'tamagui'

interface LoaderProps {
  fullScreen?: boolean
  size?: 'small' | 'large'
}

export function Loader({ fullScreen, size = 'large' }: LoaderProps) {
  if (fullScreen) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Spinner size={size} color="$primary" />
      </YStack>
    )
  }
  return <Spinner size={size} color="$primary" />
}
