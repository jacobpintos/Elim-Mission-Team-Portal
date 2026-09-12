import { Linking, Platform } from 'react-native'
import type { EventTemplate, LodgingEntry } from '@/types/events'

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

/**
 * A hotel's address alone can be ambiguous ("100 Main St" exists everywhere),
 * so lead with the hotel name — maps resolves the pair far more reliably.
 */
export function lodgingMapQuery(entry: Pick<LodgingEntry, 'name' | 'address'>): string {
  return [entry.name, entry.address].filter(Boolean).join(', ')
}
