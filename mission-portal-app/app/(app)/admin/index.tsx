import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { YStack, Spinner } from 'tamagui'

export default function AdminIndex() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/(app)/admin/users')
  }, [])

  return (
    <YStack flex={1} alignItems="center" justifyContent="center">
      <Spinner size="large" />
    </YStack>
  )
}
