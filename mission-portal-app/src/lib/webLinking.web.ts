import { Linking } from 'react-native'
import { followAsLink } from './externalUrl'

/**
 * On the web, every address the app opens with Linking.openURL — a map's
 * directions, a video on YouTube, a Facebook post, a meeting link — followed
 * as a link rather than by window.open, which react-native-web uses: from the
 * app on an iPhone's home screen, a window.open that hands off to another app
 * leaves a blank browser sheet behind (./externalUrl followAsLink). Loaded
 * once, at the start (app/_layout).
 */
const open = Linking.openURL.bind(Linking)
Linking.openURL = (url: string) => (followAsLink(url) ? Promise.resolve() : open(url))
