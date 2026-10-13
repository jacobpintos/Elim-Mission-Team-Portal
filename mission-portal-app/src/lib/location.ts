import { Linking, Platform } from 'react-native'
import type { EventTemplate, LodgingEntry } from '@/types/events'
import { directionsUrl, googleDirectionsUrl } from './directions'

/**
 * Directions to a place opened at once — in the phone's own maps (lib/
 * directions: directionsUrl), or Google Maps in a new tab — true when they
 * were. A browser lets a page open a tab only straight after a tap or a key,
 * so there it is false when it can't, for a link to be tapped instead.
 */
export async function openDirections(place: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return false
    const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } })
      .userActivation
    if (activation && !activation.isActive) return false
    const tab = window.open(googleDirectionsUrl(place), '_blank')
    if (!tab) return false
    try {
      tab.opener = null
    } catch {
      // A tab it may not touch: opened all the same.
    }
    return true
  }
  try {
    await Linking.openURL(directionsUrl(place, Platform.OS))
    return true
  } catch {
    return Linking.openURL(googleDirectionsUrl(place)).then(
      () => true,
      () => false
    )
  }
}

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
