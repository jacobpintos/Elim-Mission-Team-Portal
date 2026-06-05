export interface WeatherData {
  high: number
  low: number
  precipPct: number
  icon: string
  label: string
}

const cache = new Map<string, WeatherData | null>()

function wmoIcon(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: 'Clear' }
  if (code <= 2) return { icon: '🌤️', label: 'Partly Cloudy' }
  if (code === 3) return { icon: '☁️', label: 'Overcast' }
  if (code <= 48) return { icon: '🌫️', label: 'Foggy' }
  if (code <= 57) return { icon: '🌦️', label: 'Drizzle' }
  if (code <= 67) return { icon: '🌧️', label: 'Rain' }
  if (code <= 77) return { icon: '🌨️', label: 'Snow' }
  if (code <= 82) return { icon: '🌧️', label: 'Showers' }
  if (code <= 86) return { icon: '🌨️', label: 'Snow Showers' }
  return { icon: '⛈️', label: 'Thunderstorm' }
}

export async function fetchWeather(
  lat: number,
  lng: number,
  date: string
): Promise<WeatherData | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${date}`
  if (cache.has(key)) return cache.get(key) ?? null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const eventDay = new Date(date + 'T00:00:00')
  const daysOut = Math.round((eventDay.getTime() - today.getTime()) / 86400000)
  if (daysOut < 0 || daysOut > 15) {
    cache.set(key, null)
    return null
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
      `&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`
    const res = await fetch(url)
    if (!res.ok) {
      cache.set(key, null)
      return null
    }
    const json = await res.json()
    const dates: string[] = json.daily?.time ?? []
    const idx = dates.indexOf(date)
    if (idx < 0) {
      cache.set(key, null)
      return null
    }
    const high = Math.round(json.daily.temperature_2m_max[idx])
    const low = Math.round(json.daily.temperature_2m_min[idx])
    const precipPct = json.daily.precipitation_probability_max[idx] ?? 0
    const { icon, label } = wmoIcon(json.daily.weathercode[idx] ?? 0)
    const data: WeatherData = { high, low, precipPct, icon, label }
    cache.set(key, data)
    return data
  } catch {
    cache.set(key, null)
    return null
  }
}
