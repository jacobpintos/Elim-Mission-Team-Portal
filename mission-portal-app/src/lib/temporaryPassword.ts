import * as Clipboard from 'expo-clipboard'
import { confirmAsync } from '@/lib/confirm'

/**
 * A temporary password the server just made for someone (functions/src/
 * temporaryPassword), shown to the admin who asked: once, since it is kept
 * nowhere — to copy, and pass on to them.
 *
 * Whether it was copied.
 */
export async function showTemporaryPassword(name: string, password: string): Promise<boolean> {
  const copy = await confirmAsync(
    `${name}’s temporary password:\n\n${password}\n\nGive it to them now: it isn’t shown again. They should change it once they’re signed in.`,
    { title: 'Temporary password', confirmLabel: 'Copy', cancelLabel: 'Done' }
  )
  if (!copy) return false
  await Clipboard.setStringAsync(password).catch(() => {})
  return true
}
