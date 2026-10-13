import { useState } from 'react'
import { Pressable, ActivityIndicator } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import { Image } from '@/components/ui/Image'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { useThemeColors } from '@/theme/useThemeColors'
import { useUIStore } from '@/stores/uiStore'
import { pickAndUploadTravelImage, type TravelImageFolder } from '@/lib/travelImageUpload'

/**
 * The attach / replace / remove control for a boarding pass, itinerary or
 * hotel confirmation in the event form.
 *
 * Once a picture is up, `read` is handed its Storage path to fill the form in
 * from it, and says how many fields it filled. A failed read leaves the
 * picture attached: it is still worth having even when nothing could be read
 * off it.
 */
export function TravelImageField({
  label,
  folder,
  entryId,
  url,
  onChange,
  read,
}: {
  label: string
  folder: TravelImageFolder
  entryId: string
  url?: string
  onChange: (url: string | undefined) => void
  read: (path: string) => Promise<number>
}) {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'reading'>('idle')
  const busy = status !== 'idle'

  const pick = async () => {
    setStatus('uploading')
    let path: string
    try {
      const picked = await pickAndUploadTravelImage(folder, entryId)
      if (!picked) return
      onChange(picked.url)
      path = picked.path
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not upload that picture', 'error')
      return
    } finally {
      setStatus('idle')
    }

    setStatus('reading')
    try {
      const filled = await read(path)
      toast(
        filled > 0
          ? `Filled in ${filled} field${filled === 1 ? '' : 's'} from the picture — please check them`
          : 'Nothing new to fill in from that picture',
        filled > 0 ? 'success' : 'info'
      )
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The picture couldn’t be read', 'error')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <YStack gap="$1">
      <Text color={colors.textMuted} fontSize="$1">
        {label}
      </Text>
      <XStack gap="$2" alignItems="center">
        {url ? <TravelImageThumb url={url} size={64} /> : null}
        <Pressable onPress={pick} disabled={busy}>
          <XStack
            borderWidth={1}
            borderColor={colors.primary}
            borderRadius="$2"
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignItems="center"
            gap="$2"
          >
            {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            <Text color={colors.primary} fontSize="$2">
              {status === 'uploading'
                ? 'Uploading…'
                : status === 'reading'
                  ? 'Reading picture…'
                  : url
                    ? 'Replace image'
                    : '📎 Attach image'}
            </Text>
          </XStack>
        </Pressable>
        {url && !busy ? (
          <Pressable onPress={() => onChange(undefined)}>
            <Text color="$red10" fontSize="$2">
              Remove
            </Text>
          </Pressable>
        ) : null}
      </XStack>
    </YStack>
  )
}

/** A thumbnail that opens full screen when tapped. */
export function TravelImageThumb({ url, size = 120 }: { url: string; size?: number }) {
  const [viewing, setViewing] = useState<string | null>(null)
  return (
    <>
      <Pressable onPress={() => setViewing(url)} style={{ alignSelf: 'flex-start' }}>
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, borderRadius: 8 }}
          contentFit="cover"
        />
      </Pressable>
      {/* key={viewing}: a new picture mounts a fresh viewer at default zoom. */}
      <ImageLightbox key={viewing ?? 'none'} uri={viewing} onClose={() => setViewing(null)} />
    </>
  )
}
