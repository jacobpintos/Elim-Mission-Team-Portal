const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? ''

export async function geocodeCity(
  city: string,
  state: string
): Promise<{ lat: number; lng: number } | null> {
  const query = encodeURIComponent(`${city}, ${state}`)
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?country=US&types=place,locality,neighborhood,district&limit=1&access_token=${MAPBOX_TOKEN}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as {
      features: { geometry: { coordinates: [number, number] } }[]
    }
    if (!data.features?.length) return null
    const [lng, lat] = data.features[0].geometry.coordinates
    return { lat, lng }
  } catch {
    return null
  }
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 0.621371
}
