import { lazy, Suspense } from 'react'
import { ActivityIndicator } from 'react-native'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

const DraftConnectScreen = lazy(() =>
  import('@/features/page-builder/DraftConnectScreen').then((m) => ({
    default: m.DraftConnectScreen,
  }))
)

/**
 * A redesign of Connect, shown with the live page's own content.
 *
 * Like Draft Giving it keeps no blocks of its own: it reads Connect and lays
 * it out differently, so it is always current and there is nothing to keep in
 * step. Edits are still made on Connect itself.
 */
export default function DraftConnectPage() {
  return (
    <>
      <ScreenTitle options={{ title: 'Draft Connect' }} />
      <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
        <DraftConnectScreen />
      </Suspense>
    </>
  )
}
