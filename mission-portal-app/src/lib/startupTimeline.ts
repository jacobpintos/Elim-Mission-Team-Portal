import AsyncStorage from '@react-native-async-storage/async-storage'
import { parseRuns, type StartupRun, type StartupStep } from './startupSteps'

/**
 * How long opening the app took on this device, step by step (startupSteps),
 * kept for the last few openings so it can be read in Profile & Settings.
 *
 * Opening takes several things in turn — the phone loading the app's code,
 * Firebase checking the saved sign-in with Google, the profile, the first
 * tab, the database's first answer — and from outside a slow start looks the
 * same whichever of them is slow. These say which.
 *
 * Times count from the app's launch: on the web, from when the page was
 * asked for (tapping the home-screen icon), which is where the browser's own
 * clock starts; on a phone, from the launch React Native records natively,
 * where it has it; otherwise from when this module first runs.
 */

const KEY = 'startup_runs'
const KEEP = 5
/** Later than this, a step is not part of opening (signing in later, say). */
const OPENING_MS = 5 * 60_000

type RNPerformance = {
  now(): number
  rnStartupTiming?: { startTime?: number; executeJavaScriptBundleEntryPointStart?: number }
  getEntriesByType?: (type: string) => { responseEnd?: number }[]
}

const perf = (globalThis as { performance?: RNPerformance }).performance
const now = () => perf?.now() ?? 0
const onWeb = typeof document !== 'undefined'

const launch = (() => {
  // The page's clock began when it was asked for, so its zero is the launch,
  // and this module runs with the app's code.
  if (onWeb && perf) return { origin: 0, fromLaunch: true, code: now() }
  try {
    const timing = perf?.rnStartupTiming
    const start = timing?.startTime
    // On the same clock as now(), and before it — but not long before: a
    // start from some other clock would count every step as minutes late.
    if (typeof start === 'number' && start > 0 && start <= now() && now() - start < OPENING_MS) {
      const code = timing?.executeJavaScriptBundleEntryPointStart
      return { origin: start, fromLaunch: true, code: typeof code === 'number' ? code : undefined }
    }
  } catch {
    // No launch time to count from.
  }
  return { origin: now(), fromLaunch: false, code: undefined }
})()

const run: StartupRun = {
  startedAt: Date.now() - Math.round(now() - launch.origin),
  fromLaunch: launch.fromLaunch,
  steps: {},
}
if (launch.code !== undefined && launch.code >= launch.origin) {
  run.steps.code = Math.round(launch.code - launch.origin)
}
if (onWeb) {
  try {
    const page = perf?.getEntriesByType?.('navigation')[0]?.responseEnd
    if (typeof page === 'number' && page > 0) run.steps.page = Math.round(page)
  } catch {
    // Not given; the rest still count.
  }
}

let saving: ReturnType<typeof setTimeout> | null = null

async function save() {
  saving = null
  try {
    const others = parseRuns(await AsyncStorage.getItem(KEY)).filter(
      (r) => r.startedAt !== run.startedAt
    )
    await AsyncStorage.setItem(KEY, JSON.stringify([run, ...others].slice(0, KEEP)))
  } catch {
    // Not kept this time; nothing depends on it.
  }
}

/** The first time this opening reaches `step`. */
export function markStartup(step: StartupStep, profileFrom?: 'phone' | 'server'): void {
  if (run.steps[step] !== undefined) return
  const at = Math.round(now() - launch.origin)
  if (at > OPENING_MS) return
  run.steps[step] = at
  if (step === 'profile' && profileFrom) run.profileFrom = profileFrom
  saving ??= setTimeout(save, 500)
}

/** The last few openings, newest first. */
export async function recentStartups(): Promise<StartupRun[]> {
  try {
    return parseRuns(await AsyncStorage.getItem(KEY))
  } catch {
    return []
  }
}
