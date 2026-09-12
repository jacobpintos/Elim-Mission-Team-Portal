import * as Notifications from 'expo-notifications'

/**
 * The link from a notification tap that has not been acted on yet, if there is
 * one, taken so it is not acted on twice.
 *
 * Read synchronously, which is the whole point of it. A tap on a notification
 * while the app is closed is what launches the app, and by the time a hook has
 * mounted and set state the sign-in redirect has already sent the person to
 * their first tab. Asking here, at the moment that redirect is decided, is what
 * lets them arrive at the thing they tapped instead of arriving at home and
 * being moved a frame later.
 *
 * There is a `.web.ts` beside this returning null. The web build of
 * expo-notifications has no getLastNotificationResponse — its emitter is a stub
 * — and calling it throws.
 */
export function takePendingNotificationLink(): string | null {
  try {
    const response = Notifications.getLastNotificationResponse()
    if (!response) return null
    // A tap, not a dismissal or a button on the notification itself.
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null

    const link = (response.notification.request.content.data as { link?: string } | undefined)?.link
    if (!link) return null

    // Taken, not just read: clearing it stops the live listener acting on the
    // same tap a moment later and sending somebody to the same screen twice.
    Notifications.clearLastNotificationResponse()
    return link
  } catch {
    // Nothing here is worth failing sign-in over. Losing the link costs a tap;
    // throwing costs the launch.
    return null
  }
}
