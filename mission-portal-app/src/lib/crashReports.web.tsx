import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react'

/**
 * Crash reports on the web (./crashReports, for the phone). Sentry is about
 * 245 KB sent, and nothing is reported until EXPO_PUBLIC_SENTRY_DSN is set,
 * so it isn't part of the app as it loads: where a DSN is set, it is fetched
 * once the app has started (an import() is a file of its own in the web
 * build), and anything reported before it arrives is sent when it does.
 */

type Sentry = typeof import('@sentry/react-native')

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN

/** Whether crash reports are set up (a DSN is configured). */
export const crashReportsOn = Boolean(dsn)

let sentry: Sentry | null = null
/** Reported before Sentry arrived: a few, sent when it does. */
const waiting: { err: unknown; componentStack?: string }[] = []
const WAITING_AT_MOST = 20

function send(s: Sentry, err: unknown, componentStack?: string) {
  s.captureException(err, componentStack ? { contexts: { react: { componentStack } } } : undefined)
}

/** Starts crash reports, where they are set up; once, as the app starts. */
export function startCrashReports() {
  if (!crashReportsOn) return
  import('@sentry/react-native')
    .then((s) => {
      s.init({ dsn, debug: __DEV__ })
      sentry = s
      for (const { err, componentStack } of waiting.splice(0)) send(s, err, componentStack)
    })
    .catch((err) => console.warn('[crashReports] Sentry could not be loaded', err))
}

function report(err: unknown, componentStack?: string) {
  if (sentry) send(sentry, err, componentStack)
  else if (crashReportsOn && waiting.length < WAITING_AT_MOST) waiting.push({ err, componentStack })
}

/** An error worth knowing about, reported where crash reports are set up. */
export function reportCrash(err: unknown) {
  report(err)
}

/** What it wraps, or `fallback` once something in it has crashed: reported. */
export class CrashBoundary extends Component<
  { fallback: ReactElement; children: ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(err: unknown, info: ErrorInfo) {
    report(err, info.componentStack ?? undefined)
  }

  render() {
    return this.state.crashed ? this.props.fallback : this.props.children
  }
}
