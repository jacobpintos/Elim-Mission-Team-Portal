import { useEffect, useState } from 'react'
import { Pressable } from 'react-native'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { YStack, XStack, Text } from 'tamagui'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { isAdmin } from '@/lib/roles'
import { useThemeColors } from '@/theme/useThemeColors'
import { composeDraftConnect } from './draftConnect'
import type { PageBlock } from '@/types/pages'

/**
 * Fills the draft with a rearrangement of the live Connect page.
 *
 * Offered only while the draft is empty, and only to an admin. Once there are
 * blocks it takes itself away, because everything past that point is the
 * builder's job — this exists to save an admin retyping four blocks and two
 * image addresses that the app can already read for itself.
 *
 * It never touches the Connect page. The draft is a separate key in the same
 * config document, so this can be run, edited, thrown away and run again
 * without the live page noticing.
 */
export function DraftConnectSeed() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const toast = useUIStore((s) => s.toast)
  const [source, setSource] = useState<PageBlock[] | null>(null)
  const [draftCount, setDraftCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'main'), (snap) => {
      const pages = snap.data()?.publicPages as
        | Record<string, { blocks?: PageBlock[] } | undefined>
        | undefined
      setSource(pages?.connect?.blocks ?? [])
      setDraftCount(pages?.draftconnect?.blocks?.length ?? 0)
    })
    return unsub
  }, [])

  if (!isAdmin(profile)) return null
  // Still loading, or the draft already has content and this has done its job.
  if (draftCount === null || draftCount > 0) return null

  const canSeed = (source?.length ?? 0) > 0

  const seed = async () => {
    if (!source?.length) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'config', 'main'), {
        'publicPages.draftconnect': { blocks: composeDraftConnect(source), bgImage: '' },
      })
      toast('Draft built from Connect', 'success')
    } catch (err) {
      const reason = err instanceof Error ? err.message : ''
      toast(reason ? `Could not build draft: ${reason}` : 'Could not build draft', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <YStack
      margin="$4"
      padding="$4"
      gap="$2"
      borderRadius="$4"
      borderWidth={1}
      borderColor={colors.border}
      backgroundColor={colors.surface}
    >
      <Text color={colors.text} fontSize="$4" fontWeight="700">
        Start this draft from Connect
      </Text>
      <Text color={colors.textMuted} fontSize="$3">
        {canSeed
          ? 'Copies every block from the Connect page and lays them out in a different order — welcome, then who we are, then when and where, then who to talk to. The photographs and wording come across unchanged, the hero goes back to white text on a dark scrim, and the Connect page itself is untouched. Edit Page works on it afterwards like any other.'
          : 'The Connect page has no blocks to copy yet. Add them there first, or build this draft from scratch with Edit Page.'}
      </Text>
      {canSeed ? (
        <XStack marginTop="$1">
          <Pressable onPress={seed} disabled={busy}>
            <XStack
              paddingHorizontal="$4"
              paddingVertical="$2"
              borderRadius="$2"
              backgroundColor={colors.primary}
              opacity={busy ? 0.6 : 1}
            >
              <Text color="white" fontSize="$3" fontWeight="600">
                {busy ? 'Building…' : 'Build draft from Connect'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
      ) : null}
    </YStack>
  )
}
