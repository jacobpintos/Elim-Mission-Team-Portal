import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { MiriamResult } from '@/lib/miriam'
import { loadNames, loadWords } from '@/lib/miriamMemory'
import { recentExchanges } from '@/lib/miriamConversation'
import { useMiriamStore } from '@/stores/miriamStore'
import { screensFor } from '@/lib/miriamScreens'
import { useAuthStore } from '@/stores/authStore'
import { appToolsFor, runAppTool } from './appTools'

/** Today on this device's calendar, for "Friday" and "9/25". */
function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The time on this device's clock, "HH:MM": for "in 20 minutes" and "at 4" (today or tomorrow). */
function localClock(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** What this version of the app can show of an answer, beyond what every version can. */
const CAN = ['link']

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
/** How it was heard, when it was said: the recogniser's other guesses, and how sure it was of the first. */
export interface Heard {
  alternatives: string[]
  /** 0–1, or null when the recogniser doesn't say. */
  confidence: number | null
}

/**
 * `continued`: carrying on with the rest of what was asked, once a change
 * is done — the same request, not counted again (functions/src/miriam/stats).
 */
export async function askMiriam(
  text: string,
  heard?: Heard,
  continued = false
): Promise<MiriamResult> {
  const call = httpsCallable<Record<string, unknown>, MiriamResult | Run>(functions, 'askMiriam')
  const profile = useAuthStore.getState().profile
  const today = localToday()
  let { data } = await call({
    ...(continued ? { continued: true } : {}),
    text,
    today,
    now: localClock(),
    can: CAN,
    known: await loadNames(),
    // Words misheard before, and what was meant.
    words: await loadWords(),
    ...(heard ? { heardAs: heard.alternatives, confidence: heard.confidence } : {}),
    // What was said and answered just before: for "it", "there", or an answer to her question.
    history: recentExchanges(useMiriamStore.getState().conversation, Date.now()),
    appTools: appToolsFor(profile),
    screens: screensFor(profile).map(({ id, label }) => ({ id, label })),
  })
  for (let runs = 0; data.kind === 'run' && runs < MAX_RUNS; runs++) {
    const { calls, state } = data
    const results = await Promise.all(
      calls.map(async (c) => ({ id: c.id, content: await runAppTool(c.name, c.input ?? {}) }))
    )
    ;({ data } = await call({
      ...(continued ? { continued: true } : {}),
      today,
      resume: { state, results },
    }))
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
