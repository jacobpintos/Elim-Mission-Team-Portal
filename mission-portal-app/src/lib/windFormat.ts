/**
 * Put a wind reading into words worth reading.
 *
 * A bare "9 mph" tells someone planning an outdoor event very little; what
 * they need to know is whether the tent, the sound stand and the paper
 * programmes are going to survive the afternoon. Gusts are the number that
 * decides that, and they run far above the sustained wind — so a gust
 * meaningfully stronger than the steady wind is always named.
 */

/** Below this, wind is not a factor in anything anyone is planning. */
export const CALM_UNDER_MPH = 5

/** A gust only earns its own mention when it is this much above the steady wind. */
const GUST_GAP_MPH = 7

export function formatWind(windMph: number, gustMph: number): string {
  const wind = Math.max(0, Math.round(windMph || 0))
  const gust = Math.max(0, Math.round(gustMph || 0))

  if (wind < CALM_UNDER_MPH && gust < CALM_UNDER_MPH + GUST_GAP_MPH) return 'Calm'
  if (gust >= wind + GUST_GAP_MPH) return `${wind} mph, gusts ${gust}`
  return `${wind} mph`
}

/**
 * Is the wind worth flagging rather than merely reporting?
 *
 * 25 mph gusts are where light outdoor structures start needing weight on
 * them; the National Weather Service issues its own wind advisories around
 * 45, so this sits well below anything that would already have an alert.
 */
export const NOTABLE_GUST_MPH = 25

export function isWindNotable(windMph: number, gustMph: number): boolean {
  return Math.round(gustMph || 0) >= NOTABLE_GUST_MPH || Math.round(windMph || 0) >= 20
}
