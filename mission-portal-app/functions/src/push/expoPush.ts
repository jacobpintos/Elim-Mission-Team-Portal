import { logger } from 'firebase-functions'

interface ExpoPushMessage {
  to: string
  title: string
  body: string
  data?: object
  sound?: string
  badge?: number
}

export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data: object = {},
): Promise<void> {
  const messages: ExpoPushMessage[] = tokens
    .filter((t) => t.startsWith('ExponentPushToken'))
    .map((to) => ({ to, title, body, data, sound: 'default', badge: 1 }))

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
