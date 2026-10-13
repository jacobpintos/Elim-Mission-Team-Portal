import { Text, XStack, YStack } from 'tamagui'
import { dayNames, scheduleByDay, whenShown } from '@/lib/eventSchedule'
import { sameId } from '@/lib/ids'
import { useEventsStore } from '@/stores/eventsStore'
import { useThemeColors } from '@/theme/useThemeColors'
import type { EventInstance } from '@/types/events'

/**
 * An event's schedule, as everyone on it sees it: by day for a multi-day
 * event, with the day being looked at marked. Nothing at all when it has none.
 */
export function ScheduleDisplay({ event }: { event: EventInstance }) {
  const colors = useThemeColors()
  const templates = useEventsStore((s) => s.templates)
  const items = event.schedule ?? []
  if (items.length === 0) return null

  // A day other than its first carries that day's date: the first is the event's own.
  const firstDate =
    event._dayIndex && event._dayIndex > 0
      ? templates.find((t) => sameId(t.id, event.templateId))?.date
      : event.date
  const extra = event.isRec ? [] : (event.extraDays ?? [])
  const names = dayNames([firstDate, ...extra.map((d) => d.date)])
  const multi = names.length > 1
  const today = event._dayIndex ?? 0

  return (
    <YStack gap="$2">
      <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
        SCHEDULE
      </Text>
      {scheduleByDay(items).map(({ day, items: list }) => (
        <YStack key={day} gap="$1.5">
          {multi ? (
            <Text
              color={day === today ? colors.primary : colors.text}
              fontSize="$3"
              fontWeight="700"
            >
              {names[Math.min(day, names.length - 1)]}
              {day === today ? ' · this day' : ''}
            </Text>
          ) : null}
          {list.map((it) => (
            <XStack key={it.id} gap="$3" alignItems="flex-start">
              <Text color={colors.primary} fontSize="$3" fontWeight="600" width={112}>
                {whenShown(it) || '—'}
              </Text>
              <YStack flex={1}>
                <Text color={colors.text} fontSize="$3">
                  {it.title}
                </Text>
                {it.notes ? (
                  <Text color={colors.textMuted} fontSize="$2">
                    {it.notes}
                  </Text>
                ) : null}
              </YStack>
            </XStack>
          ))}
        </YStack>
      ))}
    </YStack>
  )
}
