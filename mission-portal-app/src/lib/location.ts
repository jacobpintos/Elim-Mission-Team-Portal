import { Linking, Platform } from 'react-native'

export function openLocationInMaps(location: string) {
  const url =
    Platform.OS === 'ios'
      ? `maps:?q=${encodeURIComponent(location)}`
      : `https://maps.google.com/?q=${encodeURIComponent(location)}`
  Linking.openURL(url).catch(() => {
    // fallback to Google Maps web
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(location)}`)
  })
}
