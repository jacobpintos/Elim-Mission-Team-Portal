import { Pressable, View, Platform, Linking } from 'react-native'
import { WebView } from 'react-native-webview'
import { XStack, Text } from 'tamagui'
import { extractYouTubeId } from '@/stores/musicStore'

/**
 * A YouTube video playing inside the app, on native and on the web.
 *
 * Lifted out of the Content screen when the livestream box needed the same
 * player. The native path below is the whole reason this is worth sharing: it
 * is a specific arrangement of origin, baseUrl and navigation handling that
 * took several rounds against YouTube's player to land, and a second
 * hand-rolled copy of it elsewhere would drift out of step with this one.
 */
export function YouTubeEmbed({ url }: { url: string }) {
  const id = extractYouTubeId(url)
  if (!id) return null

  // React Native has no <iframe> host component. On native, embed the YouTube
  // player inline via a WebView so the video plays inside the app.
  //
  // Loading the embed URL directly with `source={{ uri }}` fails with
  // "Error 153 — Video player configuration error": the WebView has no origin,
  // so YouTube's player rejects the embed. The wrapper below supplies one.
  //
  // That origin has to be a real site we control, not youtube.com. Claiming
  // YouTube's own domain as the referrer satisfies 153 but trips "Error 152",
  // because the player validates the embedding origin and a self-referential
  // one is not accepted. Using the deployed web app's origin — the same one
  // whose iframe plays these videos without complaint — satisfies both, and
  // `origin=` must match `baseUrl` or the player rejects the mismatch.
  if (Platform.OS !== 'web') {
    const origin = process.env.EXPO_PUBLIC_APP_URL ?? 'https://mission-team-portal.web.app'
    const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}iframe{border:0;display:block;width:100%;height:100%}</style>
</head><body>
<iframe src="https://www.youtube.com/embed/${id}?playsinline=1&rel=0&modestbranding=1&autoplay=1&fs=1&origin=${encodeURIComponent(origin)}"
  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
  allowfullscreen></iframe>
</body></html>`
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <WebView
          source={{ html, baseUrl: origin }}
          style={{ flex: 1, backgroundColor: '#000' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          // The player's own "Watch video on YouTube" link tries to navigate the
          // WebView, which either does nothing or strands the user in a bare
          // browser with no way back. Send anything that leaves the embed to the
          // YouTube app instead.
          onShouldStartLoadWithRequest={(req) => {
            const inEmbed =
              req.url.startsWith('https://www.youtube.com/embed/') ||
              req.url.startsWith(origin) ||
              req.url.startsWith('about:') ||
              req.url.startsWith('data:')
            if (inEmbed) return true
            if (/^https?:/.test(req.url)) {
              Linking.openURL(req.url).catch(() => {})
              return false
            }
            return true
          }}
        />
        {/* A backstop for the cases origin config cannot cover: a video whose
            owner really has disabled embedding, or one restricted by region or
            age. The player refuses those no matter how the embed is set up, so
            there is always a way through to YouTube itself. */}
        <Pressable onPress={() => Linking.openURL(url).catch(() => {})}>
          <XStack
            paddingVertical="$3"
            justifyContent="center"
            alignItems="center"
            gap="$2"
            backgroundColor="#000"
          >
            <Text color="white" fontSize="$3" fontWeight="600">
              ▶ Open in YouTube
            </Text>
            <Text color="#aaa" fontSize="$2">
              (if the video will not play here)
            </Text>
          </XStack>
        </Pressable>
      </View>
    )
  }

  const embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1`
  return (
    <iframe
      src={embedUrl}
      style={{ width: '100%', height: '100%', border: 'none' }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  )
}
