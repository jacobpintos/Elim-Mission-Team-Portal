import { useState, useEffect } from 'react'
import { Modal, ScrollView, Pressable, View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import {
  fetchHourlyForecast,
  fetchNWSAlerts,
  type HourlyPoint,
  type NWSAlert,
} from '@/lib/weather'
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

  useEffect(() => {
    if (!open || !event._geocodeLat || !event._geocodeLng || !event.date) return
    Promise.all([
      fetchHourlyForecast(event._geocodeLat, event._geocodeLng, event.date),
      fetchNWSAlerts(event._geocodeLat, event._geocodeLng),
    ]).then(([h, a]) => {
      setHourly(h)
      setAlerts(a)
    })
  }, [open, event._geocodeLat, event._geocodeLng, event.date])

  const hasData = hourly.length > 0 || alerts.length > 0

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable>
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: 540,
            }}
          >
            {/* Handle */}
            <XStack justifyContent="center" paddingTop="$3" paddingBottom="$1">
              <YStack width={36} height={4} backgroundColor={colors.border} borderRadius={99} />
            </XStack>

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

            <ScrollView>
              <YStack padding="$4" gap="$4" paddingBottom="$8">
                {/* Alerts */}
                {alerts.length > 0 ? (
                  <YStack gap="$2">
                    {alerts.map((alert) => {
                      const sc = SEVERITY[alert.severity]
                      return (
                        <YStack
                          key={alert.id}
                          backgroundColor={sc.bg}
                          borderRadius="$2"
                          padding="$3"
                          gap="$1"
                        >
                          <XStack alignItems="center" gap="$2">
                            <Text fontSize={16}>{alertIcon(alert.event)}</Text>
                            <Text
                              color={sc.fg}
                              fontWeight="700"
                              fontSize="$3"
                              flex={1}
                              numberOfLines={1}
                            >
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
                          {alert.expires ? (
                            <Text color={sc.fg} fontSize={11} opacity={0.75}>
                              Expires {formatExpires(alert.expires)}
                            </Text>
                          ) : null}
                          {alert.instruction ? (
                            <Text color={sc.fg} fontSize="$2" opacity={0.9} marginTop="$1">
                              {alert.instruction}
                            </Text>
                          ) : null}
                        </YStack>
                      )
                    })}
                  </YStack>
                ) : null}

                {/* Hourly forecast */}
                {hourly.length > 0 ? (
                  <YStack gap="$2">
                    <Text
                      color={colors.textMuted}
                      fontSize={11}
                      fontWeight="700"
                      letterSpacing={0.8}
                    >
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
                        <Text fontSize={20}>{pt.icon}</Text>
                        <Text color={colors.text} fontSize="$4" fontWeight="600" flex={1}>
                          {pt.temp}°
                        </Text>
                        {pt.precipPct > 0 ? (
                          <XStack alignItems="center" gap={4}>
                            <Text fontSize={12}>💧</Text>
                            <Text color={colors.textMuted} fontSize={12}>
                              {pt.precipPct}%
                            </Text>
                          </XStack>
                        ) : null}
                      </XStack>
                    ))}
                  </YStack>
                ) : null}

                {!hasData ? (
                  <Text color={colors.textMuted} fontSize="$3" textAlign="center" paddingVertical="$4">
                    No forecast available for this event date.
                  </Text>
                ) : null}
              </YStack>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
