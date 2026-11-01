import { useState } from 'react'
import { ActivityIndicator, Platform, Pressable, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { Text, YStack } from 'tamagui'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { openExternalUrl } from '@/lib/externalUrl'
import { useThemeColors } from '@/theme/useThemeColors'
import {
  PRODUCTION_CHECKLIST_URL,
  staysInChecklist,
} from '@/features/production/productionChecklist'

/**
 * Operations' first screen, the Production Checklist: a church member's site,
 * shown here as it is (features/production), filling the space under
 * Operations' tabs. On the web it is an iframe; on the phone a WebView, where
 * a link to anywhere else opens in the browser instead. The Issues list is
 * Operations' next tab (./list).
 */
export default function ProductionChecklist() {
  const colors = useThemeColors()
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  // Changed to load it again, after it failed.
  const [attempt, setAttempt] = useState(0)

  const retry = () => {
    setFailed(false)
    setLoaded(false)
    setAttempt((n) => n + 1)
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Operations' }} />

      <View style={{ flex: 1 }}>
        {failed ? (
          <YStack flex={1} alignItems="center" justifyContent="center" padding="$5" gap="$3">
            <Text color={colors.text} fontWeight="600" textAlign="center">
              The Production Checklist didn’t load.
            </Text>
            <Text color={colors.textMuted} fontSize="$3" textAlign="center">
              Check your connection and try again.
            </Text>
            <Pressable onPress={retry} accessibilityRole="button">
              <Text color={colors.primary} fontWeight="700">
                Try again
              </Text>
            </Pressable>
          </YStack>
        ) : Platform.OS === 'web' ? (
          <iframe
            key={attempt}
            src={PRODUCTION_CHECKLIST_URL}
            title="Production Checklist"
            onLoad={() => setLoaded(true)}
            allow="clipboard-read; clipboard-write; fullscreen"
            style={{ flex: 1, width: '100%', height: '100%', border: 0, display: 'block' }}
          />
        ) : (
          <WebView
            key={attempt}
            source={{ uri: PRODUCTION_CHECKLIST_URL }}
            style={{ flex: 1, backgroundColor: colors.background }}
            onLoadEnd={() => setLoaded(true)}
            onError={() => setFailed(true)}
            onHttpError={(e) => {
              // Only the page itself failing, not a picture or script inside it.
              if (staysInChecklist(e.nativeEvent.url) && e.nativeEvent.statusCode >= 500)
                setFailed(true)
            }}
            onShouldStartLoadWithRequest={(req) => {
              if (staysInChecklist(req.url)) return true
              openExternalUrl(req.url)
              return false
            }}
            // A link meant for a new window opens in the same place, so it
            // goes through the check above rather than nowhere.
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures
            pullToRefreshEnabled
          />
        )}
        {!loaded && !failed ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
      </View>
    </YStack>
  )
}
