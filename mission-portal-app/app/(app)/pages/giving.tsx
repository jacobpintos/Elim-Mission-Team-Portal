import { lazy, Suspense } from 'react'
import { ActivityIndicator } from 'react-native'

const PageBuilderScreen = lazy(() =>
  import('@/features/page-builder/PageBuilderScreen').then((m) => ({ default: m.PageBuilderScreen }))
)

export default function GivingPage() {
  return (
    <>
      <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
        <PageBuilderScreen pageKey="giving" pageTitle="Giving" />
      </Suspense>
    </>
  )
}
