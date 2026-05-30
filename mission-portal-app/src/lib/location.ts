import { Linking, Platform } from 'react-native'
import type { EventTemplate } from '@/types/events'

export function eventMapQuery(
  ev: Pick<EventTemplate, 'location' | 'address' | 'city' | 'state'>
): string {
  return [ev.location, ev.address, ev.city, ev.state].filter(Boolean).join(', ')
}

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
