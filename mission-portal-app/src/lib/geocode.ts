export async function geocodeCity(
  city: string,
  state: string
): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&country=US&format=json&limit=1`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'mission-portal/2.0' } })
    const data = (await res.json()) as { lat: string; lon: string }[]
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
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
