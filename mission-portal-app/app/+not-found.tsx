import { Link, Stack } from 'expo-router'
import { YStack, H2, Paragraph } from 'tamagui'

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$4" gap="$3">
        <H2>404 — Not Found</H2>
        <Paragraph>This screen doesn&apos;t exist.</Paragraph>
        <Link href="/">
          <Paragraph color="$primary">Go home</Paragraph>
        </Link>
      </YStack>
    </>
  )
}
