/**
 * Reading api.weather.gov's forecast shapes.
 *
 * The NWS forecast is written for people rather than for programs, and it
 * shows: wind arrives as "10 to 15 mph", the day's high and low live in two
 * separate 12-hour periods, and gusts are only in a raw grid feed that states
 * each value as a time range plus an ISO 8601 duration. All of that parsing
 * lives here, apart from the fetching, so it can be tested — vitest runs
 * without a React Native preset, and none of this needs one.
 */

/** A daytime and its following night, reduced to what a card shows. */
export interface NWSDay {
  high: number
  low: number
  precipPct: number
  windMph: number
  shortForecast: string
}

export interface NWSPeriod {
  startTime?: string
  isDaytime?: boolean
  temperature?: number
  probabilityOfPrecipitation?: { value?: number | null }
  windSpeed?: string
  shortForecast?: string
}

/**
 * Pull a number of mph out of the text NWS gives.
 *
 * "10 to 15 mph" takes the upper figure: someone deciding whether to put a
 * marquee up is planning for the stronger end, not the average. A plain
 * "7 mph" is itself. Anything unreadable is nothing rather than a guess.
 */
export function parseWindMph(text: string | undefined): number {
  if (!text) return 0
  const numbers = text.match(/\d+/g)
  if (!numbers || numbers.length === 0) return 0
  return Math.max(...numbers.map((n) => parseInt(n, 10)))
}

/**
 * Hours in an ISO 8601 duration, as the grid feed writes them.
 *
 * Only the forms that feed actually uses: PT6H, P1D, P1DT2H. Minutes and
 * seconds round up to an hour, since a value covering part of an hour still
 * covers that hour.
 */
export function parseIsoDurationHours(duration: string | undefined): number {
  if (!duration) return 0
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(duration)
  if (!match) return 0
  const [, days, hours, minutes, seconds] = match
  const whole = (days ? parseInt(days, 10) * 24 : 0) + (hours ? parseInt(hours, 10) : 0)
  const partial = (minutes ? parseInt(minutes, 10) : 0) + (seconds ? parseInt(seconds, 10) : 0)
  return whole + (partial > 0 ? 1 : 0)
}

export interface GustSpan {
  startMs: number
  endMs: number
  mph: number
}

/** km/h and m/s are the two units the grid feed reports wind in. */
function toMph(value: number, uom: string): number {
  if (uom.includes('km_h')) return value * 0.621371
  if (uom.includes('m_s')) return value * 2.236936
  return value
}

/**
 * Flatten the grid feed's gust series into spans that can be looked up.
 *
 * Each entry covers a stretch of time rather than an instant — "18:00 for the
 * next six hours" — so a gust reading applies to every hour it spans.
 */
export function expandGustSeries(
  values: { validTime?: string; value?: number | null }[] | undefined,
  uom: string
): GustSpan[] {
  const spans: GustSpan[] = []
  for (const entry of values ?? []) {
    if (entry.value === null || entry.value === undefined) continue
    const [start, duration] = (entry.validTime ?? '').split('/')
    const startMs = Date.parse(start)
    if (Number.isNaN(startMs)) continue
    const hours = parseIsoDurationHours(duration)
    if (hours <= 0) continue
    spans.push({
      startMs,
      endMs: startMs + hours * 3600000,
      mph: Math.round(toMph(entry.value, uom)),
    })
  }
  return spans
}

/** The gust covering an instant, or 0 when the feed says nothing about it. */
export function gustAt(spans: GustSpan[], ms: number): number {
  for (const span of spans) {
    if (ms >= span.startMs && ms < span.endMs) return span.mph
  }
  return 0
}

/** The strongest gust anywhere in a day, for the daily summary. */
export function gustPeak(spans: GustSpan[], dayStartMs: number): number {
  const dayEndMs = dayStartMs + 86400000
  let peak = 0
  for (const span of spans) {
    if (span.endMs <= dayStartMs || span.startMs >= dayEndMs) continue
    if (span.mph > peak) peak = span.mph
  }
  return peak
}

/**
 * Reduce the 12-hour periods covering a date to one day's figures.
 *
 * NWS splits a day into a daytime period and a night one, each with a single
 * temperature — the daytime's is the high, the night's the low. The first
 * period of all can be a night ("Tonight") with no daytime before it, and a
 * date at the end of the range can have a daytime with no night yet, so
 * either half may be missing and the other stands in for it.
 */
export function dailyFromPeriods(periods: NWSPeriod[], date: string): NWSDay | null {
  const onDate = periods.filter((p) => (p.startTime ?? '').startsWith(date))
  if (onDate.length === 0) return null

  const day = onDate.find((p) => p.isDaytime)
  const night = onDate.find((p) => !p.isDaytime)

  const dayTemp = day?.temperature
  const nightTemp = night?.temperature
  if (dayTemp === undefined && nightTemp === undefined) return null

  const high = dayTemp ?? nightTemp!
  const low = nightTemp ?? dayTemp!

  const precipPct = Math.max(...onDate.map((p) => p.probabilityOfPrecipitation?.value ?? 0), 0)
  const windMph = Math.max(...onDate.map((p) => parseWindMph(p.windSpeed)), 0)

  return {
    high: Math.round(high),
    low: Math.round(low),
    precipPct,
    windMph,
    shortForecast: day?.shortForecast ?? night?.shortForecast ?? '',
  }
}

/**
 * An emoji for NWS's own words.
 *
 * Open-Meteo gives a WMO code and the app already maps those; NWS gives a
 * phrase like "Chance Showers And Thunderstorms". Ordered so the more severe
 * word wins when a phrase carries several.
 */
export function iconForShortForecast(text: string): { icon: string; label: string } {
  const t = (text ?? '').toLowerCase()
  if (!t) return { icon: '🌤️', label: 'Forecast' }
  if (t.includes('thunder')) return { icon: '⛈️', label: text }
  if (t.includes('snow') || t.includes('flurr') || t.includes('sleet'))
    return { icon: '🌨️', label: text }
  if (t.includes('freezing') || t.includes('ice')) return { icon: '🧊', label: text }
  if (t.includes('rain') || t.includes('shower')) return { icon: '🌧️', label: text }
  if (t.includes('drizzle')) return { icon: '🌦️', label: text }
  if (t.includes('fog') || t.includes('haze') || t.includes('smoke'))
    return { icon: '🌫️', label: text }
  if (t.includes('wind')) return { icon: '💨', label: text }
  if (t.includes('cloud') || t.includes('overcast')) return { icon: '☁️', label: text }
  if (t.includes('partly') || t.includes('mostly sunny')) return { icon: '🌤️', label: text }
  if (t.includes('clear') || t.includes('sunny') || t.includes('fair'))
    return { icon: '☀️', label: text }
  return { icon: '🌤️', label: text }
}
