import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { MiriamResult } from '@/lib/miriam'
import { loadNames } from '@/lib/miriamMemory'
import { screensFor } from '@/lib/miriamScreens'
import { useAuthStore } from '@/stores/authStore'
import { appToolsFor, runAppTool } from './appTools'

/** Today on this device's calendar, for "Friday" and "9/25". */
function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Lookups for the app to run, while the request waits (functions: APP_TOOLS). */
interface Run {
  kind: 'run'
  calls: { id: string; name: string; input: Record<string, unknown> }[]
  state: string
}

/** How many times a request may hand lookups to the app before it is given up. */
const MAX_RUNS = 6

/**
 * Ask Miriam. Lookups she asks the app for are run here, as the person signed
 * in, and handed back for her to carry on. Rejects with the function's
 * message when it cannot be done.
 */
export async function askMiriam(text: string): Promise<MiriamResult> {
  const call = httpsCallable<Record<string, unknown>, MiriamResult | Run>(functions, 'askMiriam')
  const profile = useAuthStore.getState().profile
  const today = localToday()
  let { data } = await call({
    text,
    today,
    known: await loadNames(),
    appTools: appToolsFor(profile),
    screens: screensFor(profile).map(({ id, label }) => ({ id, label })),
  })
  for (let runs = 0; data.kind === 'run' && runs < MAX_RUNS; runs++) {
    const { calls, state } = data
    const results = await Promise.all(
      calls.map(async (c) => ({ id: c.id, content: await runAppTool(c.name, c.input ?? {}) }))
    )
    ;({ data } = await call({ today, resume: { state, results } }))
  }
  return data.kind === 'run'
    ? { kind: 'reply', text: 'I couldn’t work that out — try asking another way.' }
    : data
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
