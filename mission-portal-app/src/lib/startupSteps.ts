/**
 * The steps of opening the app, as timed on the device (lib/startupTimeline),
 * and how one opening reads in Profile & Settings.
 *
 * Pure, so it can be tested without a device.
 */

/**
 * - code: the app's own code starts running (the phone has loaded it).
 * - signedIn / signedOut: Firebase has said who is signed in — on a phone,
 *   after checking the saved sign-in with Google's servers.
 * - profile: their profile is in hand, so the app can pick their first tab.
 * - firstScreen: their first tab is on screen.
 * - server: the first answer from the database's servers, for anything.
 */
export type StartupStep = 'code' | 'signedIn' | 'signedOut' | 'profile' | 'firstScreen' | 'server'

export interface StartupRun {
  /** When the app was opened, by the clock. */
  startedAt: number
  /** Times count from the app's launch; false, from when its code began. */
  fromLaunch: boolean
  /** Milliseconds from that start to each step. */
  steps: Partial<Record<StartupStep, number>>
  /** Where the profile came from: the copy kept on the phone, or the server. */
  profileFrom?: 'phone' | 'server'
}

const LABELS: Record<StartupStep, string> = {
  code: 'code',
  signedIn: 'signed in',
  signedOut: 'sign-in screen',
  profile: 'profile',
  firstScreen: 'first screen',
  server: 'server',
}

export function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`
}

/** "code 0.6s · signed in 1.2s · profile 1.3s (phone) · …", in the order they came. */
export function describeRun(run: StartupRun): string {
  return (Object.entries(run.steps) as [StartupStep, number][])
    .filter(([step, ms]) => step in LABELS && typeof ms === 'number')
    .sort((a, b) => a[1] - b[1])
    .map(([step, ms]) => {
      const from = step === 'profile' && run.profileFrom ? ` (${run.profileFrom})` : ''
      return `${LABELS[step]} ${seconds(ms)}${from}`
    })
    .join(' · ')
}

/** A kept list of runs, or nothing for anything that isn't one. */
export function parseRuns(raw: string | null): StartupRun[] {
  try {
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list)
      ? list.filter(
          (r): r is StartupRun =>
            !!r &&
            typeof r.startedAt === 'number' &&
            typeof r.steps === 'object' &&
            r.steps !== null
        )
      : []
  } catch {
    return []
  }
}
