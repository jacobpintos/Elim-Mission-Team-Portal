import { useState, useEffect } from 'react'
import { Pressable } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { FD } from '@/lib/format'
import { openLocationInMaps, eventMapQuery } from '@/lib/location'
import { AvailBadge } from './AvailBadge'
import { fetchWeather, type WeatherData } from '@/lib/weather'
import { useAuthStore } from '@/stores/authStore'
import { sameId } from '@/lib/ids'
import type { EventInstance, AvailResponse } from '@/types/events'
import { openExternalUrl } from '@/lib/externalUrl'

interface EventCardProps {
  event: EventInstance
  myAvail?: AvailResponse | null
  onDetail?: () => void
  onAvail?: () => void
  healthStatus?: 'on-track' | 'behind' | 'no-tasks'
  onShowTasks?: () => void
  onWeatherPress?: () => void
  mini?: boolean
  isPublic?: boolean
}

export function EventCard({
  event,
  myAvail,
  onDetail,
  onAvail,
  healthStatus,
  onShowTasks,
  onWeatherPress,
  mini,
  isPublic,
}: EventCardProps) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = profile?.uid ? String(profile.uid) : null
  const [weather, setWeather] = useState<WeatherData | null>(null)

  const myLodging =
    uid && event.lodging
      ? (event.lodgingEntries ?? []).find((e) => e.assignees.some((a) => sameId(a, uid)))
      : null

  const myFlight =
    uid && event.flights ? (event.flightEntries ?? []).find((e) => sameId(e.uid, uid)) : null

  useEffect(() => {
    if (isPublic || !event._geocodeLat || !event._geocodeLng || !event.date || event.isVirtual)
      return
    fetchWeather(event._geocodeLat, event._geocodeLng, event.date).then(setWeather)
  }, [event._geocodeLat, event._geocodeLng, event.date, event.isVirtual, isPublic])

  const healthBadge =
    healthStatus === 'on-track'
      ? { label: '✓ On Track', bg: '#27ae60', text: 'white' }
      : healthStatus === 'behind'
        ? { label: '⚠ Behind', bg: '#c0392b', text: 'white' }
        : healthStatus === 'no-tasks'
          ? { label: 'No Tasks', bg: colors.border, text: colors.textMuted }
          : null

  return (
    <Pressable onPress={onDetail} disabled={!onDetail}>
      <YStack
        backgroundColor={colors.surface}
        borderRadius="$3"
        padding="$3"
        gap="$2"
        borderWidth={1}
        borderColor={colors.border}
      >
        <XStack justifyContent="space-between" alignItems="flex-start">
          <YStack flex={1} gap="$1">
            <Text color={colors.text} fontWeight="700" fontSize="$4" numberOfLines={1}>
              {event.title}
            </Text>
            <Text color={colors.textMuted} fontSize="$3">
              {FD(event.date, { weekday: true })}
              {event.startTime ? ` · ${event.startTime}` : ''}
            </Text>
            {event.location || event.city ? (
              <Pressable onPress={() => openLocationInMaps(eventMapQuery(event))}>
                <Text
                  color={colors.primary}
                  fontSize="$2"
                  textDecorationLine="underline"
                  numberOfLines={1}
                >
                  {event.location ?? `${event.city}${event.state ? `, ${event.state}` : ''}`}
                </Text>
              </Pressable>
            ) : null}
            {event.isVirtual && event.virtualLink ? (
              <Pressable onPress={() => openExternalUrl(event.virtualLink)}>
                <Text color={colors.primary} fontSize="$2" textDecorationLine="underline">
                  Join Here
                </Text>
              </Pressable>
            ) : null}
            {myLodging ? (
              <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                🏨 {myLodging.name}
                {myLodging.room ? ` · ${myLodging.room}` : ''}
              </Text>
            ) : null}
            {myFlight ? (
              <YStack gap="$0.5">
                {myFlight.outAirline || myFlight.outFlight || myFlight.outDate ? (
                  <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                    ✈{' '}
                    {[myFlight.outDate, myFlight.outAirline, myFlight.outFlight]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
                {myFlight.retAirline || myFlight.retFlight || myFlight.retDate ? (
                  <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                    ↩{' '}
                    {[myFlight.retDate, myFlight.retAirline, myFlight.retFlight]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
              </YStack>
            ) : null}
          </YStack>
          <YStack alignItems="flex-end" gap="$1">
            {myAvail ? <AvailBadge status={myAvail.status} size="sm" /> : null}
            {weather ? (
              <Pressable onPress={onWeatherPress}>
                <XStack
                  alignItems="center"
                  gap="$1"
                  backgroundColor={onWeatherPress ? colors.surface : undefined}
                  borderRadius={99}
                  paddingHorizontal={onWeatherPress ? 6 : 0}
                  paddingVertical={onWeatherPress ? 2 : 0}
                  borderWidth={onWeatherPress ? 1 : 0}
                  borderColor={colors.border}
                >
                  <Text fontSize={13}>{weather.icon}</Text>
                  <Text color={colors.textMuted} fontSize={11}>
                    {weather.high}°/{weather.low}°
                  </Text>
                </XStack>
              </Pressable>
            ) : null}
          </YStack>
        </XStack>

        {/* Health badge */}
        {healthBadge ? (
          <XStack>
            <XStack
              backgroundColor={healthBadge.bg}
              borderRadius={99}
              paddingHorizontal={10}
              paddingVertical={3}
            >
              <Text color={healthBadge.text} fontSize={11} fontWeight="600">
                {healthBadge.label}
              </Text>
            </XStack>
          </XStack>
        ) : null}

        {!mini ? (
          <XStack gap="$2" marginTop="$1" flexWrap="wrap">
            {onAvail ? (
              <Pressable onPress={onAvail}>
                <XStack
                  borderWidth={1}
                  borderColor={colors.primary}
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                  alignItems="center"
                >
                  <Text color={colors.primary} fontSize="$2" fontWeight="600">
                    {myAvail ? '✓ Change Avail' : '✓ Set Avail'}
                  </Text>
                </XStack>
              </Pressable>
            ) : null}
            {onShowTasks ? (
              <Pressable onPress={onShowTasks}>
                <XStack
                  borderWidth={1}
                  borderColor={colors.primary}
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                  alignItems="center"
                >
                  <Text color={colors.primary} fontSize="$2" fontWeight="600">
                    Show Tasks
                  </Text>
                </XStack>
              </Pressable>
            ) : null}
          </XStack>
        ) : null}
      </YStack>
    </Pressable>
  )
}
