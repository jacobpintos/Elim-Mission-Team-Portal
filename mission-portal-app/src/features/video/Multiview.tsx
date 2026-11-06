import { useMemo } from 'react'
import { View } from 'react-native'
import { WebView } from 'react-native-webview'
import { multiviewHtml } from '@/lib/switcher/multiview'
import type { MultiviewFeed } from '@/lib/switcher/switcherAddress'

/**
 * The ATEM's multiview, as the monitor plugged into it shows it: every
 * camera, with preview and program, from a video encoder on the same
 * network (lib/switcher/multiview). 16:9, black around it.
 */
export function Multiview({ feed }: { feed: MultiviewFeed }) {
  const html = useMemo(() => multiviewHtml(feed), [feed])
  return (
    <View
      style={{
        width: '100%',
        aspectRatio: 16 / 9,
        backgroundColor: '#000',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <WebView
        source={{ html }}
        originWhitelist={['*']}
        // The encoder is on the local network, over plain http.
        mixedContentMode="always"
        scrollEnabled={false}
        bounces={false}
        style={{ backgroundColor: '#000' }}
      />
    </View>
  )
}
