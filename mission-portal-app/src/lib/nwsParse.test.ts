import { describe, it, expect } from 'vitest'
import {
  parseWindMph,
  parseIsoDurationHours,
  expandGustSeries,
  gustAt,
  gustPeak,
  dailyFromPeriods,
  iconForShortForecast,
} from './nwsParse'

describe('parseWindMph', () => {
  it('takes the upper figure of a range', () => {
    // Someone deciding whether to put a tent up plans for the stronger end.
    expect(parseWindMph('10 to 15 mph')).toBe(15)
    expect(parseWindMph('5 to 10 mph')).toBe(10)
  })

  it('reads a single speed', () => {
    expect(parseWindMph('7 mph')).toBe(7)
  })

  it('gives nothing rather than a guess', () => {
    expect(parseWindMph(undefined)).toBe(0)
    expect(parseWindMph('')).toBe(0)
    expect(parseWindMph('light and variable')).toBe(0)
  })
})

describe('parseIsoDurationHours', () => {
  it('reads the forms the grid feed uses', () => {
    expect(parseIsoDurationHours('PT6H')).toBe(6)
    expect(parseIsoDurationHours('PT1H')).toBe(1)
    expect(parseIsoDurationHours('P1D')).toBe(24)
    expect(parseIsoDurationHours('P1DT2H')).toBe(26)
  })

  it('counts part of an hour as an hour, since it still covers it', () => {
    expect(parseIsoDurationHours('PT30M')).toBe(1)
    expect(parseIsoDurationHours('PT2H30M')).toBe(3)
  })

  it('refuses what it cannot read', () => {
    expect(parseIsoDurationHours('')).toBe(0)
    expect(parseIsoDurationHours('6 hours')).toBe(0)
    expect(parseIsoDurationHours(undefined)).toBe(0)
  })
})

describe('expandGustSeries', () => {
  const uom = 'wmoUnit:km_h-1'

  it('turns a value and a duration into a span, converting to mph', () => {
    const spans = expandGustSeries(
      [{ validTime: '2026-08-31T18:00:00+00:00/PT6H', value: 40 }],
      uom
    )
    expect(spans).toHaveLength(1)
    expect(spans[0].mph).toBe(25) // 40 km/h
    expect(spans[0].endMs - spans[0].startMs).toBe(6 * 3600000)
  })

  it('converts metres per second too', () => {
    const spans = expandGustSeries(
      [{ validTime: '2026-08-31T18:00:00+00:00/PT1H', value: 10 }],
      'wmoUnit:m_s-1'
    )
    expect(spans[0].mph).toBe(22)
  })

  it('skips entries with nothing in them', () => {
    expect(
      expandGustSeries(
        [
          { validTime: '2026-08-31T18:00:00+00:00/PT1H', value: null },
          { validTime: 'nonsense', value: 20 },
          { validTime: '2026-08-31T18:00:00+00:00/bad', value: 20 },
        ],
        uom
      )
    ).toEqual([])
    expect(expandGustSeries(undefined, uom)).toEqual([])
  })
})

describe('gustAt', () => {
  const spans = [
    { startMs: 1000, endMs: 2000, mph: 20 },
    { startMs: 2000, endMs: 3000, mph: 30 },
  ]

  it('finds the span covering an instant', () => {
    expect(gustAt(spans, 1500)).toBe(20)
    expect(gustAt(spans, 2000)).toBe(30)
  })

  it('says nothing outside the series, rather than the nearest value', () => {
    expect(gustAt(spans, 500)).toBe(0)
    expect(gustAt(spans, 3000)).toBe(0)
  })
})

describe('gustPeak', () => {
  it('takes the strongest gust touching the day', () => {
    const dayStart = Date.parse('2026-08-31T00:00:00Z')
    const spans = [
      { startMs: dayStart + 3600000, endMs: dayStart + 7200000, mph: 18 },
      { startMs: dayStart + 7200000, endMs: dayStart + 10800000, mph: 33 },
      // The next day, and not this day's problem.
      { startMs: dayStart + 90000000, endMs: dayStart + 93600000, mph: 55 },
    ]
    expect(gustPeak(spans, dayStart)).toBe(33)
  })

  it('is zero when the day has no readings', () => {
    expect(gustPeak([], Date.parse('2026-08-31T00:00:00Z'))).toBe(0)
  })
})

describe('dailyFromPeriods', () => {
  const periods = [
    {
      startTime: '2026-08-31T06:00:00-05:00',
      isDaytime: true,
      temperature: 84,
      probabilityOfPrecipitation: { value: 30 },
      windSpeed: '10 to 15 mph',
      shortForecast: 'Partly Sunny',
    },
    {
      startTime: '2026-08-31T18:00:00-05:00',
      isDaytime: false,
      temperature: 61,
      probabilityOfPrecipitation: { value: 60 },
      windSpeed: '5 mph',
      shortForecast: 'Chance Showers',
    },
    {
      startTime: '2026-09-01T06:00:00-05:00',
      isDaytime: true,
      temperature: 79,
      probabilityOfPrecipitation: { value: 10 },
      windSpeed: '5 to 10 mph',
      shortForecast: 'Sunny',
    },
  ]

  it('pairs the day and its night into a high and a low', () => {
    expect(dailyFromPeriods(periods, '2026-08-31')).toEqual({
      high: 84,
      low: 61,
      precipPct: 60,
      windMph: 15,
      shortForecast: 'Partly Sunny',
    })
  })

  it('copes with a date that has only a daytime period left', () => {
    // The end of the range, where the night has not been issued yet.
    const day = dailyFromPeriods(periods, '2026-09-01')
    expect(day).toEqual({
      high: 79,
      low: 79,
      precipPct: 10,
      windMph: 10,
      shortForecast: 'Sunny',
    })
  })

  it('copes with a night on its own, which is how the feed starts', () => {
    const tonight = [
      {
        startTime: '2026-08-31T20:00:00-05:00',
        isDaytime: false,
        temperature: 58,
        probabilityOfPrecipitation: { value: 20 },
        windSpeed: '5 mph',
        shortForecast: 'Mostly Clear',
      },
    ]
    expect(dailyFromPeriods(tonight, '2026-08-31')).toEqual({
      high: 58,
      low: 58,
      precipPct: 20,
      windMph: 5,
      shortForecast: 'Mostly Clear',
    })
  })

  it('returns nothing for a date the forecast does not reach', () => {
    expect(dailyFromPeriods(periods, '2026-12-25')).toBeNull()
    expect(dailyFromPeriods([], '2026-08-31')).toBeNull()
  })

  it('treats a missing precipitation chance as none, not as unknown', () => {
    const noPrecip = [
      {
        startTime: '2026-08-31T06:00:00-05:00',
        isDaytime: true,
        temperature: 70,
        probabilityOfPrecipitation: { value: null },
        windSpeed: '5 mph',
        shortForecast: 'Sunny',
      },
    ]
    expect(dailyFromPeriods(noPrecip, '2026-08-31')?.precipPct).toBe(0)
  })
})

describe('iconForShortForecast', () => {
  it('lets the more severe word in a phrase win', () => {
    expect(iconForShortForecast('Chance Showers And Thunderstorms').icon).toBe('⛈️')
    expect(iconForShortForecast('Mostly Cloudy then Chance Rain').icon).toBe('🌧️')
  })

  it('reads the ordinary phrases', () => {
    expect(iconForShortForecast('Sunny').icon).toBe('☀️')
    expect(iconForShortForecast('Partly Sunny').icon).toBe('🌤️')
    expect(iconForShortForecast('Mostly Cloudy').icon).toBe('☁️')
    expect(iconForShortForecast('Patchy Fog').icon).toBe('🌫️')
  })

  it('keeps the NWS wording as the label', () => {
    expect(iconForShortForecast('Slight Chance Rain Showers').label).toBe(
      'Slight Chance Rain Showers'
    )
  })

  it('has something for an empty forecast', () => {
    expect(iconForShortForecast('').icon).toBe('🌤️')
  })
})
