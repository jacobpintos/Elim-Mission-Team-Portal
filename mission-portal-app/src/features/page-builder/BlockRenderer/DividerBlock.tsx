import { YStack } from 'tamagui'

export function DividerBlock() {
  return (
    <YStack paddingHorizontal="$4" paddingVertical="$2">
      <YStack height={1} backgroundColor="$borderColor" />
    </YStack>
  )
}
