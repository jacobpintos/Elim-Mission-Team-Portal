import { useEffect, useState } from 'react'
import { Image, Linking, Pressable, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { receiptUrl, isPdf } from '@/lib/receiptUpload'
import { FD } from '@/lib/format'

/**
 * A request's receipts or invoices, as thumbnails to open: a photo in the
 * lightbox, a PDF in the browser or a viewer.
 *
 * Links are asked for when shown, not stored (see receiptUpload). Files are
 * kept for two years from when the request was made, then removed by
 * purgeOldReceipts; the line saying so stands in for them after that.
 */
export function ReceiptThumbs({
  paths,
  label,
  removedAt,
}: {
  paths: string[]
  label: string
  /** When the files were removed for age, if they were. */
  removedAt?: number
}) {
  const colors = useThemeColors()
  const [urls, setUrls] = useState<string[]>([])
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    Promise.all(paths.map((p) => receiptUrl(p).catch(() => '')))
      .then((u) => live && setUrls(u))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [paths])

  if (paths.length === 0 && !removedAt) return null

  return (
    <YStack gap="$1">
      <Text color={colors.textMuted} fontSize="$1" textTransform="uppercase">
        {label}
      </Text>
      {paths.length === 0 ? (
        <Text color={colors.textMuted} fontSize="$2">
          {`Removed ${FD(new Date(removedAt as number).toISOString().slice(0, 10))}, two years after it was sent.`}
        </Text>
      ) : (
        <XStack gap="$2" flexWrap="wrap">
          {paths.map((p, i) =>
            urls[i] ? (
              <Pressable
                key={p}
                onPress={() => (isPdf(p) ? void Linking.openURL(urls[i]) : setOpen(urls[i]))}
                accessibilityLabel={`${label} ${i + 1}`}
              >
                {isPdf(p) ? (
                  <YStack
                    style={styles.thumb}
                    backgroundColor={colors.background}
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Text color={colors.primary} fontSize="$2" fontWeight="600">
                      PDF
                    </Text>
                  </YStack>
                ) : (
                  <Image source={{ uri: urls[i] }} style={styles.thumb} resizeMode="cover" />
                )}
              </Pressable>
            ) : (
              <YStack key={p} style={styles.thumb} backgroundColor={colors.background} />
            )
          )}
        </XStack>
      )}
      {open ? (
        <ImageLightbox key={open} uri={open} onClose={() => setOpen(null)} name="receipt" />
      ) : null}
    </YStack>
  )
}

const styles = StyleSheet.create({
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 6,
  },
})
