import { useState } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { YStack, XStack, Text } from 'tamagui'
import { toExternalUrl, openExternalUrl } from '@/lib/externalUrl'
import type { EmbedData } from '@/types/pages'

interface EmbedBlockProps {
  data: EmbedData
}

/** A page with no declared height still needs to occupy something sensible. */
export const DEFAULT_EMBED_HEIGHT = 420
export const MIN_EMBED_HEIGHT = 160
export const MAX_EMBED_HEIGHT = 1200

export function clampEmbedHeight(height: number | undefined): number {
  if (height === undefined || Number.isNaN(height)) return DEFAULT_EMBED_HEIGHT
  return Math.min(MAX_EMBED_HEIGHT, Math.max(MIN_EMBED_HEIGHT, Math.round(height)))
}

/**
 * A web page, shown inside the page.
 *
 * For third-party things there is no native equivalent of — a form, a giving
 * portal, a public calendar. Content you own is better authored as blocks:
 * those render native, follow the theme and work offline, none of which is
 * true here.
 *
 * The embed behaves differently on the two platforms, and the difference is
 * not cosmetic. On native a WebView is a top-level navigation, so a site's
 * X-Frame-Options has no bearing and the page loads. On web this becomes a
 * real iframe, and a host sending SAMEORIGIN — which most hosted platforms do
 * by default — refuses it and leaves an empty rectangle. So an "Open in
 * browser" link sits under every embed rather than only appearing on failure:
 * a blank frame gives the reader nothing to act on, and there is no reliable
 * way to detect the refusal from inside.
 */
export function EmbedBlock({ data }: EmbedBlockProps) {
  const [failed, setFailed] = useState(false)
  const url = toExternalUrl(data.url)
  const height = clampEmbedHeight(data.height)

  if (!url) {
    return (
      <YStack padding="$4" gap="$2">
        <View
          style={{
            height: MIN_EMBED_HEIGHT,
            backgroundColor: '#e0e0e0',
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text color="$gray9" fontSize="$3">
            No address set
          </Text>
        </View>
      </YStack>
    )
  }

  return (
    <YStack padding="$4" gap="$2">
      {data.heading ? (
        <Text fontSize="$5" fontWeight="700">
          {data.heading}
        </Text>
      ) : null}

      <View style={{ height, borderRadius: 8, overflow: 'hidden' }}>
        {failed ? (
          <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$gray3">
            <Text color="$gray10" fontSize="$3">
              This page could not be shown here.
            </Text>
          </YStack>
        ) : Platform.OS === 'web' ? (
          // react-native-webview renders as an iframe on web, and passing the
          // url through `src` is what a browser expects.
          <iframe
            src={url}
            style={{ width: '100%', height: '100%', border: 0 }}
            title={data.heading ?? 'Embedded page'}
          />
        ) : (
          <WebView
            source={{ uri: url }}
            style={{ flex: 1 }}
            // Its own scrolling, inside a page that also scrolls. Unavoidable
            // for an embed, and the reason the height is worth setting well.
            nestedScrollEnabled
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
          />
        )}
      </View>

      <Pressable onPress={() => openExternalUrl(url)} accessibilityLabel="Open in browser">
        <XStack>
          <Text color="$primary" fontSize="$2">
            Open in browser →
          </Text>
        </XStack>
      </Pressable>
    </YStack>
  )
}
