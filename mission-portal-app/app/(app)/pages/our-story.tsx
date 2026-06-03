import { lazy, Suspense } from 'react'
import { ActivityIndicator } from 'react-native'

const PageBuilderScreen = lazy(() =>
  import('@/features/page-builder/PageBuilderScreen').then((m) => ({ default: m.PageBuilderScreen }))
)

export default function OurStoryPage() {
  return (
    <>
      <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
        <PageBuilderScreen pageKey="ourstory" pageTitle="Our Story" />
      </Suspense>
    </>
  )
}
