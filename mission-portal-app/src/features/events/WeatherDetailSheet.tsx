import { useState, useEffect } from 'react'
import { Pressable, ScrollView as RNScrollView } from 'react-native'
import { Sheet, YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import {
  fetchHourlyForecast,
  fetchNWSAlerts,
  alertsForDate,
  type HourlyPoint,
  type NWSAlert,
} from '@/lib/weather'
import { formatWind, isWindNotable } from '@/lib/windFormat'
import type { EventInstance } from '@/types/events'

interface WeatherDetailSheetProps {
  open: boolean
  onClose: () => void
  event: EventInstance
}

const SEVERITY: Record<NWSAlert['severity'], { bg: string; fg: string }> = {
  Extreme: { bg: '#c0392b', fg: 'white' },
  Severe: { bg: '#e74c3c', fg: 'white' },
  Moderate: { bg: '#e67e22', fg: 'white' },
  Minor: { bg: '#2980b9', fg: 'white' },
  Unknown: { bg: '#7f8c8d', fg: 'white' },
}

function alertIcon(event: string): string {
  const e = event.toLowerCase()
  if (e.includes('tornado')) return '🌪️'
  if (e.includes('thunder') || e.includes('storm')) return '⛈️'
  if (e.includes('flood')) return '🌊'
  if (e.includes('snow') || e.includes('blizzard') || e.includes('winter')) return '❄️'
  if (e.includes('ice') || e.includes('frost') || e.includes('freez')) return '🧊'
  if (e.includes('wind')) return '💨'
  if (e.includes('heat') || e.includes('fire')) return '🔥'
  if (e.includes('fog')) return '🌫️'
  return '⚠️'
}

function formatHour(time: string): string {
  const hour = parseInt(time.split(':')[0], 10)
  const ampm = hour < 12 ? 'AM' : 'PM'
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${h12} ${ampm}`
}

/** "Mar 10, 2:00 PM – Mar 12, 6:00 AM", or one end when only one is known. */
function formatWindow(effective: string, expires: string): string {
  const from = formatExpires(effective)
  const to = formatExpires(expires)
  if (from && to) return `${from} – ${to}`
  if (to) return `Until ${to}`
  if (from) return `From ${from}`
  return ''
}

function formatExpires(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return ''
  }
}

export function WeatherDetailSheet({ open, onClose, event }: WeatherDetailSheetProps) {
  const colors = useThemeColors()
  const [hourly, setHourly] = useState<HourlyPoint[]>([])
  const [alerts, setAlerts] = useState<NWSAlert[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !event._geocodeLat || !event._geocodeLng || !event.date) return
    Promise.all([
      fetchHourlyForecast(event._geocodeLat, event._geocodeLng, event.date),
      fetchNWSAlerts(event._geocodeLat, event._geocodeLng),
    ]).then(([h, a]) => {
      setHourly(h)
      // api.weather.gov returns everything active at the location regardless
      // of when the event is, which put today's warning on every event in the
      // area. Only what covers this event's day belongs here.
      setAlerts(alertsForDate(a, event.date))
    })
  }, [open, event._geocodeLat, event._geocodeLng, event.date])

  const hasData = hourly.length > 0 || alerts.length > 0

  // Whichever source actually answered for this event's date, rather than
  // whichever one was expected to.
  const forecastCredit =
    hourly[0]?.source === 'nws' ? 'National Weather Service' : 'Open-Meteo (model data)'

  return (
    // disableDrag + a plain ScrollView, for the reason written up in
    // components/ui/Modal.tsx: Sheet.ScrollView's fallback path (taken because
    // @tamagui/native/setup-gesture-handler is never imported) attaches
    // responder handlers that scrollTo a ref only its gesture-handler path
    // ever assigns. It stays 0, so every downward scroll snapped back to the
    // top — which is what expanding a long alert description here ran into.
    // The ✕ in the header already closes the sheet without the drag gesture.
    <Sheet
      open={open}
      onOpenChange={(v: boolean) => !v && onClose()}
      snapPoints={[70]}
      dismissOnSnapToBottom
      disableDrag
      modal
      zIndex={200000}
    >
      <Sheet.Overlay backgroundColor="rgba(0,0,0,0.45)" />
      <Sheet.Frame backgroundColor={colors.background}>
        <Sheet.Handle />

        {/* Header */}
        <XStack
          paddingHorizontal="$4"
          paddingVertical="$2"
          justifyContent="space-between"
          alignItems="center"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
        >
          <YStack>
            <Text color={colors.text} fontWeight="700" fontSize="$5">
              Weather Forecast
            </Text>
            <Text color={colors.textMuted} fontSize="$2">
              {event.title}
            </Text>
          </YStack>
          <Pressable onPress={onClose}>
            <Text color={colors.textMuted} fontSize="$5" paddingLeft="$3">
              ✕
            </Text>
          </Pressable>
        </XStack>

        <RNScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <YStack padding="$4" gap="$4" paddingBottom="$8">
            {/* Alerts */}
            {alerts.length > 0 ? (
              <YStack gap="$2">
                {alerts.map((alert) => {
                  const sc = SEVERITY[alert.severity]
                  const expanded = expandedId === alert.id
                  const body = alert.description?.trim()
                  return (
                    <Pressable
                      key={alert.id}
                      onPress={() => setExpandedId(expanded ? null : alert.id)}
                      disabled={!body}
                    >
                      <YStack backgroundColor={sc.bg} borderRadius="$2" padding="$3" gap="$1">
                        <XStack alignItems="center" gap="$2">
                          <Text fontSize={16}>{alertIcon(alert.event)}</Text>
                          <Text color={sc.fg} fontWeight="700" fontSize="$3" flex={1}>
                            {alert.event}
                          </Text>
                          <XStack
                            backgroundColor="rgba(0,0,0,0.2)"
                            borderRadius={99}
                            paddingHorizontal={8}
                            paddingVertical={2}
                          >
                            <Text color={sc.fg} fontSize={10} fontWeight="700">
                              {alert.severity.toUpperCase()}
                            </Text>
                          </XStack>
                        </XStack>
                        <Text color={sc.fg} fontSize="$2" opacity={0.95}>
                          {alert.headline}
                        </Text>
                        {/* When it is in force, not just when it was issued —
                          "expires" alone leaves you guessing at the start. */}
                        {formatWindow(alert.effective, alert.expires) ? (
                          <Text color={sc.fg} fontSize={11} opacity={0.75}>
                            In effect {formatWindow(alert.effective, alert.expires)}
                          </Text>
                        ) : null}
                        {alert.instruction ? (
                          <Text color={sc.fg} fontSize="$2" opacity={0.9} marginTop="$1">
                            {alert.instruction}
                          </Text>
                        ) : null}
                        {/* The statement itself. It is long, so it stays folded
                          away until asked for — but it has to be reachable. */}
                        {body ? (
                          expanded ? (
                            <Text color={sc.fg} fontSize="$2" opacity={0.9} marginTop="$2">
                              {body}
                            </Text>
                          ) : (
                            <Text color={sc.fg} fontSize={11} fontWeight="700" marginTop="$1">
                              Tap to read the full statement
                            </Text>
                          )
                        ) : null}
                      </YStack>
                    </Pressable>
                  )
                })}
              </YStack>
            ) : null}

            {/* Hourly forecast */}
            {hourly.length > 0 ? (
              <YStack gap="$2">
                <Text color={colors.textMuted} fontSize={11} fontWeight="700" letterSpacing={0.8}>
                  HOURLY FORECAST
                </Text>
                {hourly.map((pt) => (
                  <XStack
                    key={pt.time}
                    alignItems="center"
                    gap="$3"
                    paddingVertical="$1"
                    borderBottomWidth={1}
                    borderBottomColor={colors.border}
                  >
                    <Text color={colors.textMuted} fontSize="$2" width={52}>
                      {formatHour(pt.time)}
                    </Text>
                    <XStack alignItems="center" gap="$2" flex={1}>
                      <Text fontSize={20}>{pt.icon}</Text>
                      <Text color={colors.text} fontSize="$4" fontWeight="600">
                        {pt.temp}°
                      </Text>
                      {pt.precipPct > 0 ? (
                        <XStack alignItems="center" gap={3}>
                          <Text fontSize={12}>💧</Text>
                          <Text color={colors.textMuted} fontSize={12}>
                            {pt.precipPct}%
                          </Text>
                        </XStack>
                      ) : null}
                      {/* Always shown, unlike rain: an outdoor set-up needs to
                          know the wind is calm as much as that it is not. */}
                      <XStack alignItems="center" gap={3}>
                        <Text fontSize={12}>💨</Text>
                        <Text
                          color={
                            isWindNotable(pt.windMph, pt.gustMph) ? colors.text : colors.textMuted
                          }
                          fontSize={12}
                          fontWeight={isWindNotable(pt.windMph, pt.gustMph) ? '700' : '400'}
                        >
                          {formatWind(pt.windMph, pt.gustMph)}
                        </Text>
                      </XStack>
                    </XStack>
                  </XStack>
                ))}
              </YStack>
            ) : null}

            {/* Both feeds are credited, and named rather than merged: the
                forecast can come from either source depending on how far off
                the event is, and Open-Meteo's licence asks for the credit.
                It also stops a model forecast being read as the official
                one. */}
            {hasData ? (
              <YStack gap={2} paddingTop="$2">
                <Text color={colors.textMuted} fontSize={11}>
                  Forecast: {forecastCredit}
                </Text>
                <Text color={colors.textMuted} fontSize={11}>
                  Alerts: National Weather Service
                </Text>
              </YStack>
            ) : null}

            {!hasData ? (
              <Text color={colors.textMuted} fontSize="$3" textAlign="center" paddingVertical="$4">
                No forecast available for this event date.
              </Text>
            ) : null}
          </YStack>
        </RNScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}
