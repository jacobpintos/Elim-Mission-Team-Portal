import { lazy, Suspense } from 'react'
import { ActivityIndicator } from 'react-native'
import { Stack } from 'expo-router'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

const PageBuilderScreen = lazy(() =>
  import('@/features/page-builder/PageBuilderScreen').then((m) => ({ default: m.PageBuilderScreen }))
)

export default function GivingPage() {
  return (
    <>
      <ScreenTitle options={{ title: 'Giving' }} />
      <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
        <PageBuilderScreen pageKey="giving" pageTitle="Giving" />
      </Suspense>
    </>
  )
}
