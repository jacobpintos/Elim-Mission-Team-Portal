/**
 * Lets the Android app load plain http from the local network: the video
 * encoder's preview of the ATEM's multiview (src/features/video/Multiview)
 * is served by a box on the church's network, by address, with no https.
 *
 * Android blocks plain http unless the app allows it, and a network
 * security config can't name the addresses (they're whatever the router
 * gives), so the app allows it. Everything the app sends over the internet
 * is https all the same.
 */
const { withAndroidManifest } = require('expo/config-plugins')

module.exports = function withLocalNetworkHttp(config) {
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0]
    if (app) app.$['android:usesCleartextTraffic'] = 'true'
    return c
  })
}
