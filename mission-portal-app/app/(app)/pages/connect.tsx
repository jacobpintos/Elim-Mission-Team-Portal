import { lazy, Suspense } from 'react'
import { ActivityIndicator } from 'react-native'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { TextingListCard } from '@/features/connect/TextingListCard'

const PageBuilderScreen = lazy(() =>
  import('@/features/page-builder/PageBuilderScreen').then((m) => ({
    default: m.PageBuilderScreen,
  }))
)

export default function ConnectPage() {
  return (
    <>
      <ScreenTitle options={{ title: 'Connect' }} />
      <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
        <PageBuilderScreen pageKey="connect" pageTitle="Connect" extra={<TextingListCard />} />
      </Suspense>
    </>
  )
}
