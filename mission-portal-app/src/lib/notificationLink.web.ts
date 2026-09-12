/**
 * The web half of takePendingNotificationLink.
 *
 * There are no notifications to have tapped, and asking expo-notifications for
 * the last response on web throws: its emitter is a stub carrying addListener
 * and nothing else, and getLastNotificationResponse raises UnavailabilityError.
 */
export function takePendingNotificationLink(): string | null {
  return null
}
