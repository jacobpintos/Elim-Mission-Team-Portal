import { logger } from 'firebase-functions'

/**
 * How hard a notification is allowed to interrupt, on iOS.
 *
 * - `passive` — added to the list silently, no screen, no sound
 * - `active` — the default: screen lights up, sound plays, held by Focus modes
 * - `time-sensitive` — breaks through Focus modes and Do Not Disturb
 * - `critical` — also bypasses the physical mute switch
 *
 * NOTE THE SPELLING. The push service takes `time-sensitive` with a hyphen,
 * while the client-side expo-notifications package spells the same value
 * `timeSensitive` in camel case. The service does not reject an unknown value,
 * it ignores it — so the camel-case spelling here would leave the notification
 * silently held by Focus with nothing in the logs to say why.
 *
 * `critical` additionally requires Apple's critical-alerts entitlement, which
 * is granted case by case on request. Without it the value is ignored.
 */
export type InterruptionLevel = 'passive' | 'active' | 'time-sensitive' | 'critical'

interface ExpoPushMessage {
  to: string
  title: string
  body: string
  data?: object
  sound?: string
  badge?: number
  interruptionLevel?: InterruptionLevel
  priority?: 'default' | 'normal' | 'high'
}

export interface SendPushOptions {
  /** Omit for the ordinary `active` treatment. */
  interruptionLevel?: InterruptionLevel
}

export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data: object = {},
  options: SendPushOptions = {},
): Promise<void> {
  const { interruptionLevel } = options
  // Asking to break through Focus and then letting the delivery be held back
  // for batching would defeat the point, so an elevated notification is also
  // asked for immediately.
  const priority =
    interruptionLevel === 'time-sensitive' || interruptionLevel === 'critical' ? 'high' : undefined

  const messages: ExpoPushMessage[] = tokens
    .filter((t) => t.startsWith('ExponentPushToken'))
    .map((to) => ({
      to,
      title,
      body,
      data,
      sound: 'default',
      badge: 1,
      ...(interruptionLevel ? { interruptionLevel } : {}),
      ...(priority ? { priority } : {}),
    }))

  if (!messages.length) return

  // Send in batches of 100 (Expo recommends ≤ 100 per request)
  const batchSize = 100
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize)
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    })
    const result = (await response.json()) as { errors?: unknown[] }
    if (result.errors?.length) {
      logger.error('Expo push errors', result.errors)
    }
  }
}
