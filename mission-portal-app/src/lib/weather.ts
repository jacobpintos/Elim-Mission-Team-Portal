import { fetchNWSDaily, fetchNWSHourly, NWS_FORECAST_DAYS } from './nwsForecast'

/**
 * Who produced a forecast.
 *
 * Carried through rather than assumed, because the two sources disagree by a
 * degree or two and the app now shows both — a reader comparing a card
 * against the news deserves to know which one they are looking at.
 */
export type ForecastSource = 'nws' | 'open-meteo'

export interface WeatherData {
  high: number
  low: number
  precipPct: number
  /** Strongest sustained wind of the day, mph. */
  windMph: number
  /** Strongest gust of the day, mph. Higher than windMph, often much higher. */
  gustMph: number
  icon: string
  label: string
  source: ForecastSource
}

export interface HourlyPoint {
  time: string
  hour: number
  temp: number
  precipPct: number
  /** Sustained wind for the hour, mph. */
  windMph: number
  /** Gust for the hour, mph. */
  gustMph: number
  icon: string
  label: string
  source: ForecastSource
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

  // The National Weather Service forecast has been through a meteorologist,
  // so it wins wherever it reaches — about a week ahead, inside the US only.
  // Open-Meteo covers everything past that, and stands in whenever NWS has
  // nothing to say, so a failed lookup costs a moment rather than a forecast.
  if (d <= NWS_FORECAST_DAYS) {
    const nws = await fetchNWSDaily(lat, lng, date)
    if (nws) {
      const data: WeatherData = { ...nws, source: 'nws' }
      dailyCache.set(key, data)
      return data
    }
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
      `,wind_speed_10m_max,wind_gusts_10m_max` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=16`
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
        wind_speed_10m_max?: number[]
        wind_gusts_10m_max?: number[]
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
    const windMph = Math.round((json.daily?.wind_speed_10m_max ?? [])[idx] ?? 0)
    const gustMph = Math.round((json.daily?.wind_gusts_10m_max ?? [])[idx] ?? 0)
    const { icon, label } = wmoIcon((json.daily?.weathercode ?? [])[idx] ?? 0)
    const data: WeatherData = {
      high,
      low,
      precipPct,
      windMph,
      gustMph,
      icon,
      label,
      source: 'open-meteo',
    }
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

  if (d <= NWS_FORECAST_DAYS) {
    const nws = await fetchNWSHourly(lat, lng, date)
    if (nws.length > 0) {
      const points: HourlyPoint[] = nws.map((h) => ({ ...h, source: 'nws' }))
      hourlyCache.set(key, points)
      return points
    }
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&hourly=temperature_2m,precipitation_probability,weathercode` +
      `,wind_speed_10m,wind_gusts_10m` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=16`
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
        wind_speed_10m?: number[]
        wind_gusts_10m?: number[]
      }
    }
    const times: string[] = json.hourly?.time ?? []
    const temps: number[] = json.hourly?.temperature_2m ?? []
    const precips: number[] = json.hourly?.precipitation_probability ?? []
    const codes: number[] = json.hourly?.weathercode ?? []
    const winds: number[] = json.hourly?.wind_speed_10m ?? []
    const gusts: number[] = json.hourly?.wind_gusts_10m ?? []

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
        windMph: Math.round(winds[i] ?? 0),
        gustMph: Math.round(gusts[i] ?? 0),
        icon,
        label,
        source: 'open-meteo',
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

/**
 * Does this alert cover the day an event happens?
 *
 * api.weather.gov returns everything currently active for a location, with no
 * regard for when the event is. Showing that unfiltered put a warning issued
 * for this afternoon on an event three months out, on every card in the same
 * area — which is how a warning stops meaning anything.
 *
 * Compared by calendar day rather than instant: an event has a date but no
 * end time, so "does the alert window touch that day" is the most it can
 * honestly answer.
 */
export function alertCoversDate(
  alert: Pick<NWSAlert, 'effective' | 'expires'>,
  eventDate: string
): boolean {
  if (!eventDate) return false

  const day = (iso: string): string | null => {
    if (!iso) return null
    const ts = Date.parse(iso)
    return Number.isNaN(ts) ? null : new Date(ts).toISOString().split('T')[0]
  }

  const from = day(alert.effective)
  const to = day(alert.expires)

  // An alert with no window at all cannot be placed, so it is shown rather
  // than hidden — a warning missed is worse than one shown early.
  if (!from && !to) return true

  if (from && eventDate < from) return false
  if (to && eventDate > to) return false
  return true
}

/** The alerts among `alerts` that cover the day of `eventDate`. */
export function alertsForDate<T extends Pick<NWSAlert, 'effective' | 'expires'>>(
  alerts: T[],
  eventDate: string
): T[] {
  return alerts.filter((a) => alertCoversDate(a, eventDate))
}
