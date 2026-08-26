import { useState } from 'react'
import { Pressable, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { YStack, XStack, Text } from 'tamagui'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { clampColumns, toRows } from '@/lib/galleryGrid'
import { openExternalUrl } from '@/lib/externalUrl'
import type { GalleryData } from '@/types/pages'

interface GalleryBlockProps {
  data: GalleryData
}

const GAP = 8
const PAGE_PADDING = 32
const MAX_WIDTH = 600

/**
 * Several pictures in a grid.
 *
 * Stacking them as separate Image blocks was the alternative, and it turns a
 * set of four book covers into four full-width pictures and a lot of
 * scrolling. Tapping one opens the same full-screen viewer the rest of the app
 * uses — a cover is unreadable at a quarter of the screen width — unless that
 * picture has been given a link, in which case it stands for a page and goes
 * there instead.
 */
export function GalleryBlock({ data }: GalleryBlockProps) {
  const [viewing, setViewing] = useState<string | null>(null)
  const { width } = useWindowDimensions()

  const images = (data.images ?? []).filter((u) => typeof u === 'string' && u.trim() !== '')
  const links = data.links ?? []
  const columns = clampColumns(data.columns)
  if (images.length === 0) return null

  const available = Math.min(width, MAX_WIDTH) - PAGE_PADDING
  const cell = Math.floor((available - GAP * (columns - 1)) / columns)
  const rows = toRows(
    images.map((src, i) => ({ src, link: links[i] ?? '' })),
    columns
  )

  return (
    // The grid is only ever as wide as MAX_WIDTH allows, so on a desktop
    // browser it would otherwise sit in the left corner of a 1900px page.
    // Centring the column also lines the covers up with the Image blocks
    // above and below, which cap at the same width.
    <YStack padding="$4" gap="$2" width="100%" maxWidth={MAX_WIDTH} alignSelf="center">
      {data.heading ? (
        <Text fontSize="$5" fontWeight="700">
          {data.heading}
        </Text>
      ) : null}

      <YStack gap={GAP}>
        {rows.map((row, ri) => (
          <XStack key={ri} gap={GAP}>
            {row.map(({ src, link }, ci) => (
              <Pressable
                key={`${ri}-${ci}`}
                onPress={() => (link ? openExternalUrl(link) : setViewing(src))}
              >
                <Image
                  source={{ uri: src }}
                  style={{ width: cell, height: cell, borderRadius: 6 }}
                  // The cells are square and book covers are not, so filling
                  // one meant cutting the title off the top or the author off
                  // the bottom. Fitting inside leaves a margin instead, which
                  // costs nothing but space.
                  contentFit="contain"
                />
              </Pressable>
            ))}
          </XStack>
        ))}
      </YStack>

      <ImageLightbox key={viewing ?? 'none'} uri={viewing} onClose={() => setViewing(null)} />
    </YStack>
  )
}
