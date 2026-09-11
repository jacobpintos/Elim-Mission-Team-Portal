import { useEffect, useState } from 'react'
import { Pressable } from 'react-native'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { YStack, XStack, Text } from 'tamagui'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { isAdmin } from '@/lib/roles'
import { confirmAsync } from '@/lib/confirm'
import { useThemeColors } from '@/theme/useThemeColors'
import { composeDraftConnect } from './draftConnect'
import type { PageBlock } from '@/types/pages'

/**
 * Fills the draft with a rearrangement of the live Connect page.
 *
 * Offered to an admin, and it stays offered. A draft whose whole purpose is to
 * try an arrangement has to be re-runnable: the composer changes, or Connect
 * changes, and the draft needs to be able to catch up. Rebuilding discards
 * what is here, so it asks first.
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
  if (draftCount === null) return null

  const canSeed = (source?.length ?? 0) > 0
  const hasDraft = draftCount > 0

  const seed = async () => {
    if (!source?.length) return
    if (hasDraft) {
      const ok = await confirmAsync(
        'This replaces every block in the draft with a fresh arrangement of the Connect page. Anything edited here is lost. The Connect page itself is not touched.',
        { title: 'Rebuild the draft?', confirmLabel: 'Rebuild', destructive: true }
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      await updateDoc(doc(db, 'config', 'main'), {
        'publicPages.draftconnect': { blocks: composeDraftConnect(source), bgImage: '' },
      })
      toast(hasDraft ? 'Draft rebuilt from Connect' : 'Draft built from Connect', 'success')
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
        {hasDraft ? 'Rebuild this draft from Connect' : 'Start this draft from Connect'}
      </Text>
      <Text color={colors.textMuted} fontSize="$3">
        {!canSeed
          ? 'The Connect page has no blocks to copy yet. Add them there first, or build this draft from scratch with Edit Page.'
          : hasDraft
            ? 'Takes a fresh copy of the Connect page and arranges it again, replacing everything in this draft. Use it after editing Connect, or to start over. The Connect page itself is never touched.'
            : 'Copies every block from the Connect page and lays them out in a different order — welcome, then who we are, then when and where, then who to talk to. The photographs and wording come across unchanged, the hero goes back to white text on a dark scrim, the tagline is centred, and the Connect page itself is untouched. Edit Page works on it afterwards like any other.'}
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
                {busy
                  ? 'Building…'
                  : hasDraft
                    ? 'Rebuild from Connect'
                    : 'Build draft from Connect'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
      ) : null}
    </YStack>
  )
}
