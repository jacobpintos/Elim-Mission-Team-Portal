import { lazy, Suspense } from 'react'
import { ActivityIndicator } from 'react-native'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

const ElimStoreScreen = lazy(() =>
  import('@/features/store/ElimStoreScreen').then((m) => ({ default: m.ElimStoreScreen }))
)

export default function StorePage() {
  return (
    <>
      <ScreenTitle options={{ title: 'Elim Store' }} />
      <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
        <ElimStoreScreen />
      </Suspense>
    </>
  )
}
