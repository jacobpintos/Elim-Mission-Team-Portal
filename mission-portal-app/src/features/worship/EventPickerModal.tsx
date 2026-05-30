import { useState, useMemo } from 'react'
import { Modal, View, Pressable, ScrollView, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useEventsStore } from '@/stores/eventsStore'
import { useThemeColors } from '@/theme/useThemeColors'
import type { EventInstance } from '@/types/events'

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

interface EventPickerModalProps {
  visible: boolean
  onClose: () => void
  onSelect: (instance: EventInstance) => void
}

export function EventPickerModal({ visible, onClose, onSelect }: EventPickerModalProps) {
  const colors = useThemeColors()
  const { instances } = useEventsStore()

  const now = new Date()
  const [calY, setCalY] = useState(now.getFullYear())
  const [calM, setCalM] = useState(now.getMonth() + 1)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const from = `${calY}-${String(calM).padStart(2, '0')}-01`
  const lastDay = new Date(calY, calM, 0).getDate()
  const to = `${calY}-${String(calM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const monthEvents = instances(from, to)

  const byDate = useMemo(() => {
    const map: Record<string, EventInstance[]> = {}
    monthEvents.forEach((ev) => {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    })
    return map
  }, [monthEvents])

  const firstDayOfMonth = new Date(calY, calM - 1, 1).getDay()
  const daysInMonth = new Date(calY, calM, 0).getDate()

  const prevMonth = () => {
    if (calM === 1) {
      setCalM(12)
      setCalY((y) => y - 1)
    } else setCalM((m) => m - 1)
    setSelectedDay(null)
  }

  const nextMonth = () => {
    if (calM === 12) {
      setCalM(1)
      setCalY((y) => y + 1)
    } else setCalM((m) => m + 1)
    setSelectedDay(null)
  }

  const dayStr = (d: number) =>
    `${calY}-${String(calM).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const selectedEvents = selectedDay ? (byDate[selectedDay] ?? []) : []

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$4"
          gap="$3"
          width="92%"
          maxWidth={480}
          maxHeight="85%"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={colors.text} fontSize="$5" fontWeight="700">
              Pick Event Instance
            </Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4">
                ✕
              </Text>
            </Pressable>
          </XStack>

          {/* Month nav */}
          <XStack justifyContent="space-between" alignItems="center">
            <Pressable onPress={prevMonth}>
              <Text color={colors.primary} fontSize="$5" paddingHorizontal="$2">
                ‹
              </Text>
            </Pressable>
            <Text color={colors.text} fontWeight="700" fontSize="$4">
              {MONTH_NAMES[calM - 1]} {calY}
            </Text>
            <Pressable onPress={nextMonth}>
              <Text color={colors.primary} fontSize="$5" paddingHorizontal="$2">
                ›
              </Text>
            </Pressable>
          </XStack>

          {/* Day header */}
          <XStack>
            {DAY_NAMES.map((d) => (
              <YStack key={d} flex={1} alignItems="center">
                <Text color={colors.textMuted} fontSize="$1" fontWeight="600">
                  {d}
                </Text>
              </YStack>
            ))}
          </XStack>

          {/* Calendar grid */}
          <YStack gap={2}>
            {Array.from({ length: Math.ceil((firstDayOfMonth + daysInMonth) / 7) }).map(
              (_, row) => (
                <XStack key={row}>
                  {Array.from({ length: 7 }).map((_, col) => {
                    const cellIndex = row * 7 + col
                    const day = cellIndex - firstDayOfMonth + 1
                    if (day < 1 || day > daysInMonth) {
                      return <YStack key={col} flex={1} />
                    }
                    const ds = dayStr(day)
                    const hasEvents = !!byDate[ds]?.length
                    const isSelected = selectedDay === ds
                    return (
                      <Pressable
                        key={col}
                        style={{ flex: 1 }}
                        onPress={() => setSelectedDay(isSelected ? null : ds)}
                      >
                        <YStack alignItems="center" paddingVertical={4}>
                          <YStack
                            width={28}
                            height={28}
                            borderRadius={14}
                            alignItems="center"
                            justifyContent="center"
                            backgroundColor={isSelected ? colors.primary : 'transparent'}
                          >
                            <Text
                              color={isSelected ? 'white' : colors.text}
                              fontSize="$2"
                              fontWeight={hasEvents ? '700' : '400'}
                            >
                              {day}
                            </Text>
                          </YStack>
                          {hasEvents ? (
                            <View
                              style={[
                                styles.dot,
                                { backgroundColor: isSelected ? 'white' : colors.primary },
                              ]}
                            />
                          ) : null}
                        </YStack>
                      </Pressable>
                    )
                  })}
                </XStack>
              )
            )}
          </YStack>

          {/* Event list for selected day */}
          {selectedDay ? (
            <YStack gap="$2">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                EVENTS ON {selectedDay}
              </Text>
              {selectedEvents.length === 0 ? (
                <Text color={colors.textMuted} fontSize="$3">
                  No events on this day
                </Text>
              ) : (
                <ScrollView style={{ maxHeight: 160 }}>
                  <YStack gap="$2">
                    {selectedEvents.map((ev) => (
                      <Pressable
                        key={ev.instanceKey}
                        onPress={() => {
                          onSelect(ev)
                          onClose()
                        }}
                      >
                        <XStack
                          backgroundColor={colors.background}
                          borderRadius="$2"
                          padding="$3"
                          borderWidth={1}
                          borderColor={colors.border}
                          alignItems="center"
                          justifyContent="space-between"
                        >
                          <YStack flex={1}>
                            <Text color={colors.text} fontWeight="700" fontSize="$3">
                              {ev.title}
                            </Text>
                            {ev.startTime ? (
                              <Text color={colors.textMuted} fontSize="$2">
                                {ev.startTime}
                              </Text>
                            ) : null}
                          </YStack>
                          <Text color={colors.primary} fontSize="$3">
                            ›
                          </Text>
                        </XStack>
                      </Pressable>
                    ))}
                  </YStack>
                </ScrollView>
              )}
            </YStack>
          ) : (
            <Text color={colors.textMuted} fontSize="$2" textAlign="center">
              Tap a day with events to select an instance
            </Text>
          )}
        </YStack>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
})
