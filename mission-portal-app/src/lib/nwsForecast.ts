import {
  dailyFromPeriods,
  expandGustSeries,
  gustAt,
  gustPeak,
  iconForShortForecast,
  parseWindMph,
  type GustSpan,
  type NWSPeriod,
} from './nwsParse'

/**
 * Forecasts from api.weather.gov.
 *
 * Preferred over Open-Meteo where it reaches, because it is the forecast a
 * meteorologist has actually looked at — the same one the team would see on
 * the news — rather than raw model output. It only reaches about seven days
 * out and only inside the United States, which is why the caller still keeps
 * Open-Meteo for everything past that.
 *
 * Every function here returns null or an empty list on any failure. A missing
 * forecast is a blank space on a card; a thrown error would be a blank screen.
 */

/** api.weather.gov asks for a User-Agent identifying the caller. */
const HEADERS = { 'User-Agent': 'MissionPortalApp/1.0', Accept: 'application/geo+json' }

/** How far ahead NWS issues a forecast. Past this it has nothing to say. */
export const NWS_FORECAST_DAYS = 7

interface GridPoint {
  forecast: string
  forecastHourly: string
  /** The raw grid feed, which is the only place gusts appear. */
  grid: string
}

const gridCache = new Map<string, GridPoint | null>()
const periodCache = new Map<string, NWSPeriod[]>()
const hourlyCache = new Map<string, NWSPeriod[]>()
const gustCache = new Map<string, GustSpan[]>()

function pointKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`
}

/**
 * Resolve coordinates to a forecast grid.
 *
 * NWS addresses forecasts by grid square rather than by latitude, so this
 * lookup comes first and its result is cached — a square does not move, and a
 * screen full of events at one location should cost one request.
 */
async function fetchGridPoint(lat: number, lng: number): Promise<GridPoint | null> {
  const key = pointKey(lat, lng)
  if (gridCache.has(key)) return gridCache.get(key) ?? null

  try {
    const res = await fetch(`https://api.weather.gov/points/${key}`, { headers: HEADERS })
    if (!res.ok) {
      // Outside the United States this is a 404, which is the expected answer
      // rather than a fault.
      gridCache.set(key, null)
      return null
    }
    const json = (await res.json()) as {
      properties?: { forecast?: string; forecastHourly?: string; forecastGridData?: string }
    }
    const p = json.properties
    if (!p?.forecast || !p.forecastHourly || !p.forecastGridData) {
      gridCache.set(key, null)
      return null
    }
    const grid: GridPoint = {
      forecast: p.forecast,
      forecastHourly: p.forecastHourly,
      grid: p.forecastGridData,
    }
    gridCache.set(key, grid)
    return grid
  } catch {
    gridCache.set(key, null)
    return null
  }
}

async function fetchPeriods(url: string, cache: Map<string, NWSPeriod[]>): Promise<NWSPeriod[]> {
  if (cache.has(url)) return cache.get(url)!
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) {
      cache.set(url, [])
      return []
    }
    const json = (await res.json()) as { properties?: { periods?: NWSPeriod[] } }
    const periods = json.properties?.periods ?? []
    cache.set(url, periods)
    return periods
  } catch {
    cache.set(url, [])
    return []
  }
}

/**
 * Gusts, which the forecast endpoints leave out entirely.
 *
 * Only the raw grid feed carries them, as a series of time ranges. Worth the
 * extra request: a steady 12 mph gusting to 30 is the afternoon that takes a
 * tent over, and the sustained figure alone hides it.
 */
async function fetchGusts(url: string): Promise<GustSpan[]> {
  if (gustCache.has(url)) return gustCache.get(url)!
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) {
      gustCache.set(url, [])
      return []
    }
    const json = (await res.json()) as {
      properties?: {
        windGust?: { uom?: string; values?: { validTime?: string; value?: number | null }[] }
      }
    }
    const gust = json.properties?.windGust
    const spans = expandGustSeries(gust?.values, gust?.uom ?? '')
    gustCache.set(url, spans)
    return spans
  } catch {
    gustCache.set(url, [])
    return []
  }
}

export interface NWSDaily {
  high: number
  low: number
  precipPct: number
  windMph: number
  gustMph: number
  icon: string
  label: string
}

export async function fetchNWSDaily(
  lat: number,
  lng: number,
  date: string
): Promise<NWSDaily | null> {
  const grid = await fetchGridPoint(lat, lng)
  if (!grid) return null

  const periods = await fetchPeriods(grid.forecast, periodCache)
  const day = dailyFromPeriods(periods, date)
  if (!day) return null

  const gusts = await fetchGusts(grid.grid)
  const { icon, label } = iconForShortForecast(day.shortForecast)

  return {
    high: day.high,
    low: day.low,
    precipPct: day.precipPct,
    windMph: day.windMph,
    // Local midnight, matching how the rest of the app reads a date.
    gustMph: gustPeak(gusts, new Date(`${date}T00:00:00`).getTime()),
    icon,
    label,
  }
}

export interface NWSHour {
  time: string
  hour: number
  temp: number
  precipPct: number
  windMph: number
  gustMph: number
  icon: string
  label: string
}

export async function fetchNWSHourly(lat: number, lng: number, date: string): Promise<NWSHour[]> {
  const grid = await fetchGridPoint(lat, lng)
  if (!grid) return []

  const periods = await fetchPeriods(grid.forecastHourly, hourlyCache)
  if (periods.length === 0) return []
  const gusts = await fetchGusts(grid.grid)

  const result: NWSHour[] = []
  for (const period of periods) {
    const start = period.startTime ?? ''
    if (!start.startsWith(date)) continue
    const timePart = start.split('T')[1] ?? ''
    const hour = parseInt(timePart.split(':')[0], 10)
    // The same waking hours the Open-Meteo path shows, so switching source
    // does not silently change how much of the day appears.
    if (Number.isNaN(hour) || hour < 5 || hour > 22) continue

    const { icon, label } = iconForShortForecast(period.shortForecast ?? '')
    result.push({
      time: timePart,
      hour,
      temp: Math.round(period.temperature ?? 0),
      precipPct: period.probabilityOfPrecipitation?.value ?? 0,
      windMph: parseWindMph(period.windSpeed),
      gustMph: gustAt(gusts, Date.parse(start)),
      icon,
      label,
    })
  }

  return result
}
