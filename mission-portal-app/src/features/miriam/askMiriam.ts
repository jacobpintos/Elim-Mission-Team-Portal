import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { MiriamResult } from '@/lib/miriam'
import { loadNames, type LearnedName } from '@/lib/miriamMemory'

/** Today on this device's calendar, for "Friday" and "9/25". */
function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Ask Miriam. Rejects with the function's message when it cannot be done. */
export async function askMiriam(text: string): Promise<MiriamResult> {
  const call = httpsCallable<{ text: string; today: string; known: LearnedName[] }, MiriamResult>(
    functions,
    'askMiriam'
  )
  const { data } = await call({ text, today: localToday(), known: await loadNames() })
  return data
}

/** What went wrong, in words to show: the function's own message where it gave one. */
export function miriamError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  const message = (err as { message?: string })?.message ?? ''
  if (code.endsWith('not-found') || code.endsWith('internal') || !message) {
    return 'Miriam couldn’t be reached. Try again.'
  }
  return message
}
