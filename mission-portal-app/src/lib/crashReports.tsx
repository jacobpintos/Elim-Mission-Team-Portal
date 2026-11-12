import type { ReactElement, ReactNode } from 'react'
import * as Sentry from '@sentry/react-native'

/**
 * Crash reports (Sentry), on the phone: as they always were, Sentry itself.
 * On the web (./crashReports.web) Sentry is fetched only where it is used,
 * not sent with the app to everyone who opens it.
 *
 * Nothing is reported until EXPO_PUBLIC_SENTRY_DSN is set. Unset, Sentry is
 * never started: initializing it with no DSN still sets up its native side,
 * which isn't something to have running unconfigured.
 */

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN

/** Whether crash reports are set up (a DSN is configured). */
export const crashReportsOn = Boolean(dsn)

/** Starts crash reports, where they are set up; once, as the app starts. */
export function startCrashReports() {
  if (crashReportsOn) Sentry.init({ dsn, debug: __DEV__ })
}

/** An error worth knowing about, reported where crash reports are set up. */
export function reportCrash(err: unknown) {
  Sentry.captureException(err)
}

/** What it wraps, or `fallback` once something in it has crashed: reported. */
export function CrashBoundary({
  fallback,
  children,
}: {
  fallback: ReactElement
  children: ReactNode
}) {
  return <Sentry.ErrorBoundary fallback={fallback}>{children}</Sentry.ErrorBoundary>
}
