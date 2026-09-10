import { lazy, Suspense } from 'react'
import { ActivityIndicator } from 'react-native'
import { YStack } from 'tamagui'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { DraftConnectSeed } from '@/features/page-builder/DraftConnectSeed'

const PageBuilderScreen = lazy(() =>
  import('@/features/page-builder/PageBuilderScreen').then((m) => ({
    default: m.PageBuilderScreen,
  }))
)

/**
 * A rehearsal copy of Connect.
 *
 * Its own key in the same config document, so it carries its own blocks and
 * the live page is never touched by anything done here. It is the ordinary
 * builder underneath — Edit Page, the block palette, reordering and deleting
 * all behave exactly as they do on Connect — with one extra offer above it
 * while it is still empty.
 *
 * When the arrangement is right, the way to adopt it is to make the same
 * changes on Connect. Nothing here promotes itself.
 */
export default function DraftConnectPage() {
  return (
    <>
      <ScreenTitle options={{ title: 'Draft Connect' }} />
      <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
        <YStack flex={1}>
          {/* Takes no room at all once the draft has blocks — it returns null. */}
          <DraftConnectSeed />
          <PageBuilderScreen pageKey="draftconnect" pageTitle="Draft Connect" />
        </YStack>
      </Suspense>
    </>
  )
}
