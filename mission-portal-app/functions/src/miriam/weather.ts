/**
 * An event's forecast for Miriam, from the same sources and in the same order
 * as the app's weather card (src/lib/weather.ts, src/lib/nwsForecast.ts): the
 * National Weather Service where it reaches — about a week ahead, inside the
 * US — and Open-Meteo past that or when it has nothing to say. So what she
 * says is what the card shows. The reading of NWS periods is the app's
 * (src/lib/nwsParse.ts: dailyFromPeriods), kept here in short because the
 * functions are built on their own; change one, change both.
 *
 * Any failure is no forecast, never an error.
 */

export interface Forecast {
  summary: string
  high: number
  low: number
  chanceOfRain: number
  windMph: number
  source: 'National Weather Service' | 'Open-Meteo'
}

/** How far ahead NWS issues a forecast, and how far Open-Meteo reaches. */
export const NWS_DAYS = 7
export const FORECAST_DAYS = 15

const NWS_HEADERS = { 'User-Agent': 'MissionPortalApp/1.0', Accept: 'application/geo+json' }

interface NWSPeriod {
  startTime?: string
  isDaytime?: boolean
  temperature?: number
  probabilityOfPrecipitation?: { value?: number | null }
  windSpeed?: string
  shortForecast?: string
}

/** "10 to 15 mph" → 15: the stronger end, as the card reads it. */
function windOf(text: string | undefined): number {
  const n = (text ?? '').match(/\d+/g)
  return n ? Math.max(...n.map(Number)) : 0
}

/** A date's daytime and night, as one day (nwsParse: dailyFromPeriods). */
export function dayFromPeriods(periods: NWSPeriod[], date: string): Forecast | null {
  const onDate = periods.filter((p) => (p.startTime ?? '').startsWith(date))
  const day = onDate.find((p) => p.isDaytime)
  const night = onDate.find((p) => !p.isDaytime)
  const high = day?.temperature ?? night?.temperature
  const low = night?.temperature ?? day?.temperature
  if (high === undefined || low === undefined) return null
  return {
    summary: day?.shortForecast || night?.shortForecast || '',
    high: Math.round(high),
    low: Math.round(low),
    chanceOfRain: Math.max(...onDate.map((p) => p.probabilityOfPrecipitation?.value ?? 0), 0),
    windMph: Math.max(...onDate.map((p) => windOf(p.windSpeed)), 0),
    source: 'National Weather Service',
  }
}

/** Open-Meteo's weather codes, in the card's words (weather.ts: wmoIcon). */
export function wmoLabel(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 2) return 'Partly Cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 48) return 'Foggy'
  if (code <= 57) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 86) return 'Snow Showers'
  return 'Thunderstorm'
}

async function json(url: string, headers?: Record<string, string>): Promise<any> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

async function fromNWS(lat: number, lng: number, date: string): Promise<Forecast | null> {
  const point = await json(
    `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
    NWS_HEADERS
  )
  const url = point?.properties?.forecast
  if (typeof url !== 'string') return null
  const forecast = await json(url, NWS_HEADERS)
  const periods = forecast?.properties?.periods
  return Array.isArray(periods) ? dayFromPeriods(periods, date) : null
}

async function fromOpenMeteo(lat: number, lng: number, date: string): Promise<Forecast | null> {
  const data = await json(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,wind_speed_10m_max` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=16`
  )
  const daily = data?.daily
  const i = Array.isArray(daily?.time) ? daily.time.indexOf(date) : -1
  if (i < 0) return null
  return {
    summary: wmoLabel(daily.weathercode?.[i] ?? 0),
    high: Math.round(daily.temperature_2m_max?.[i]),
    low: Math.round(daily.temperature_2m_min?.[i]),
    chanceOfRain: daily.precipitation_probability_max?.[i] ?? 0,
    windMph: Math.round(daily.wind_speed_10m_max?.[i] ?? 0),
    source: 'Open-Meteo',
  }
}

/** The forecast for a place on a date `daysAhead` from today. */
export async function forecastFor(
  lat: number,
  lng: number,
  date: string,
  daysAhead: number
): Promise<Forecast | null> {
  if (daysAhead < 0 || daysAhead > FORECAST_DAYS) return null
  return (
    (daysAhead <= NWS_DAYS ? await fromNWS(lat, lng, date) : null) ??
    (await fromOpenMeteo(lat, lng, date))
  )
}
