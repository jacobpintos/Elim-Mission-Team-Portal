import { lazy, Suspense } from 'react'
import { ActivityIndicator } from 'react-native'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

const DraftGivingScreen = lazy(() =>
  import('@/features/page-builder/DraftGivingScreen').then((m) => ({
    default: m.DraftGivingScreen,
  }))
)

/**
 * A redesign of Giving, shown with the live page's own content.
 *
 * Unlike Draft Connect it keeps no blocks of its own: it reads Giving and
 * lays it out differently, so it is always current and there is nothing to
 * keep in step. Edits are still made on Giving itself.
 */
export default function DraftGivingPage() {
  return (
    <>
      <ScreenTitle options={{ title: 'Draft Giving' }} />
      <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
        <DraftGivingScreen />
      </Suspense>
    </>
  )
}
