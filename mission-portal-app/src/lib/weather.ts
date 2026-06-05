export interface WeatherData {
  high: number
  low: number
  precipPct: number
  icon: string
  label: string
}

export interface HourlyPoint {
  time: string
  hour: number
  temp: number
  precipPct: number
  icon: string
  label: string
}

export interface NWSAlert {
  id: string
  event: string
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown'
  headline: string
  description: string
  instruction?: string
  effective: string
  expires: string
  areaDesc: string
}

interface NWSFeature {
  id?: string
  properties: {
    id?: string
    event?: string
    severity?: string
    headline?: string
    description?: string
    instruction?: string
    effective?: string
    expires?: string
    areaDesc?: string
  }
}

const dailyCache = new Map<string, WeatherData | null>()
const hourlyCache = new Map<string, HourlyPoint[]>()
const alertCache = new Map<string, { data: NWSAlert[]; fetchedAt: number }>()

const ALERT_CACHE_MS = 10 * 60 * 1000

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

function daysFromToday(date: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const eventDay = new Date(date + 'T00:00:00')
  return Math.round((eventDay.getTime() - today.getTime()) / 86400000)
}

export async function fetchWeather(
  lat: number,
  lng: number,
  date: string
): Promise<WeatherData | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${date}`
  if (dailyCache.has(key)) return dailyCache.get(key) ?? null

  const d = daysFromToday(date)
  if (d < 0 || d > 15) {
    dailyCache.set(key, null)
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
      dailyCache.set(key, null)
      return null
    }
    const json = (await res.json()) as {
      daily?: {
        time?: string[]
        temperature_2m_max?: number[]
        temperature_2m_min?: number[]
        precipitation_probability_max?: number[]
        weathercode?: number[]
      }
    }
    const dates: string[] = json.daily?.time ?? []
    const idx = dates.indexOf(date)
    if (idx < 0) {
      dailyCache.set(key, null)
      return null
    }
    const high = Math.round((json.daily?.temperature_2m_max ?? [])[idx])
    const low = Math.round((json.daily?.temperature_2m_min ?? [])[idx])
    const precipPct = (json.daily?.precipitation_probability_max ?? [])[idx] ?? 0
    const { icon, label } = wmoIcon((json.daily?.weathercode ?? [])[idx] ?? 0)
    const data: WeatherData = { high, low, precipPct, icon, label }
    dailyCache.set(key, data)
    return data
  } catch {
    dailyCache.set(key, null)
    return null
  }
}

export async function fetchHourlyForecast(
  lat: number,
  lng: number,
  date: string
): Promise<HourlyPoint[]> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${date}`
  if (hourlyCache.has(key)) return hourlyCache.get(key)!

  const d = daysFromToday(date)
  if (d < 0 || d > 15) {
    hourlyCache.set(key, [])
    return []
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&hourly=temperature_2m,precipitation_probability,weathercode` +
      `&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`
    const res = await fetch(url)
    if (!res.ok) {
      hourlyCache.set(key, [])
      return []
    }
    const json = (await res.json()) as {
      hourly?: {
        time?: string[]
        temperature_2m?: number[]
        precipitation_probability?: number[]
        weathercode?: number[]
      }
    }
    const times: string[] = json.hourly?.time ?? []
    const temps: number[] = json.hourly?.temperature_2m ?? []
    const precips: number[] = json.hourly?.precipitation_probability ?? []
    const codes: number[] = json.hourly?.weathercode ?? []

    const result: HourlyPoint[] = []
    for (let i = 0; i < times.length; i++) {
      if (!times[i].startsWith(date)) continue
      const timePart = times[i].split('T')[1]
      const hour = parseInt(timePart.split(':')[0], 10)
      if (hour < 5 || hour > 22) continue
      const { icon, label } = wmoIcon(codes[i] ?? 0)
      result.push({
        time: timePart,
        hour,
        temp: Math.round(temps[i]),
        precipPct: precips[i] ?? 0,
        icon,
        label,
      })
    }

    hourlyCache.set(key, result)
    return result
  } catch {
    hourlyCache.set(key, [])
    return []
  }
}

export async function fetchNWSAlerts(lat: number, lng: number): Promise<NWSAlert[]> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
  const cached = alertCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < ALERT_CACHE_MS) return cached.data

  try {
    const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MissionPortalApp/1.0' },
    })
    if (!res.ok) {
      alertCache.set(key, { data: [], fetchedAt: Date.now() })
      return []
    }
    const json = (await res.json()) as { features?: NWSFeature[] }
    const validSeverities = new Set<string>(['Extreme', 'Severe', 'Moderate', 'Minor'])
    const alerts: NWSAlert[] = (json.features ?? []).map((f) => {
      const p = f.properties
      return {
        id: f.id ?? p.id ?? '',
        event: p.event ?? '',
        severity: (validSeverities.has(p.severity ?? '')
          ? p.severity
          : 'Unknown') as NWSAlert['severity'],
        headline: p.headline ?? p.event ?? '',
        description: p.description ?? '',
        instruction: p.instruction ?? undefined,
        effective: p.effective ?? '',
        expires: p.expires ?? '',
        areaDesc: p.areaDesc ?? '',
      }
    })
    alertCache.set(key, { data: alerts, fetchedAt: Date.now() })
    return alerts
  } catch {
    alertCache.set(key, { data: [], fetchedAt: Date.now() })
    return []
  }
}

