import { lazy, Suspense } from 'react'
import { ActivityIndicator } from 'react-native'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

const DraftStoryScreen = lazy(() =>
  import('@/features/page-builder/DraftStoryScreen').then((m) => ({
    default: m.DraftStoryScreen,
  }))
)

/**
 * A redesign of Our Story, shown with the live page's own content and pictures.
 *
 * Like Draft Giving and Draft Connect it keeps no blocks of its own: it reads
 * Our Story and lays it out differently, so it is always current and there is
 * nothing to keep in step. Edits are still made on Our Story itself.
 */
export default function DraftStoryPage() {
  return (
    <>
      <ScreenTitle options={{ title: 'Draft Our Story' }} />
      <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
        <DraftStoryScreen />
      </Suspense>
    </>
  )
}
