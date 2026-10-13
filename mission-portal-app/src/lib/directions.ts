/**
 * The way to a place, in the maps it opens in: kept free of react-native, for
 * tests. Opened by lib/location: openDirections; asked of Miriam in
 * lib/miriamDirections.
 */

/** Where an event is, as maps are asked for it: its venue, street, city and state. */
export function placeOf(ev: {
  location?: string
  address?: string
  city?: string
  state?: string
}) {
  return [ev.location, ev.address, ev.city, ev.state].filter(Boolean).join(', ')
}

/** Google Maps' directions to a place, from wherever they are: in a browser, or any phone. */
export const googleDirectionsUrl = (place: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`

/**
 * Directions in the maps a phone opens by itself — Apple Maps on an iPhone;
 * on Android whichever app opens map links (Google Maps, Waze), as they have
 * chosen — and in a browser, Google Maps.
 */
export function directionsUrl(place: string, os: string): string {
  const q = encodeURIComponent(place)
  if (os === 'ios') return `maps://?daddr=${q}`
  if (os === 'android') return `geo:0,0?q=${q}`
  return googleDirectionsUrl(place)
}
