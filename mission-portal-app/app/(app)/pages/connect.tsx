import { lazy, Suspense } from 'react'
import { ActivityIndicator } from 'react-native'
import { Stack } from 'expo-router'

const PageBuilderScreen = lazy(() =>
  import('@/features/page-builder/PageBuilderScreen').then((m) => ({ default: m.PageBuilderScreen }))
)

export default function ConnectPage() {
  return (
    <>
      <Stack.Screen options={{ title: 'Connect' }} />
      <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
        <PageBuilderScreen pageKey="connect" pageTitle="Connect" />
      </Suspense>
    </>
  )
}
