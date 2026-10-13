import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useRemindersStore, type Reminder } from '@/stores/remindersStore'
import { minutesBeforeSaid as before, reminderWhen, repeatWhen } from '@/lib/reminders'

/** Done ones stay in the list this long, ticked, then drop out of it. */
const KEEP_DONE_MS = 24 * 60 * 60 * 1000

/**
 * Your reminders, at the top of your tasks: set by asking Miriam ("remind me
 * to go to Costco at 5 pm tomorrow"), each ticked off or taken away here.
 */
export function RemindersSection({ uid }: { uid: string }) {
  const colors = useThemeColors()
  const reminders = useRemindersStore((s) => s.reminders)
  const setDone = useRemindersStore((s) => s.setDone)
  const remove = useRemindersStore((s) => s.remove)
  const snooze = useRemindersStore((s) => s.snooze)
  // The time now, moved on each minute, so "in 5 minutes" and "past" stay true.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const store = useRemindersStore.getState()
    store.subscribe(uid)
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => {
      clearInterval(t)
      store.unsubscribe()
    }
  }, [uid])

  // One before every event stays, whatever its next: it is for all of them.
  const shown = reminders.filter((r) => r.everyEvent || !r.done || now - r.remindAt < KEEP_DONE_MS)
  const open = shown.filter((r) => !r.done).length

  return (
    <YStack gap="$2">
      <XStack justifyContent="space-between" alignItems="center" paddingVertical="$1">
        <Text color={colors.primary} fontWeight="700" fontSize="$3">
          Reminders ({open})
        </Text>
      </XStack>
      {shown.length === 0 ? (
        <Text color={colors.textMuted} fontSize="$2">
          Ask Miriam: “Remind me to go to Costco at 5 PM tomorrow.”
        </Text>
      ) : (
        shown.map((r) => (
          <ReminderRow
            key={r.id}
            reminder={r}
            now={now}
            onToggle={() => setDone(r, !r.done).catch(() => {})}
            onRemove={() => remove(r.id).catch(() => {})}
            onSnooze={() => snooze(r, 60).catch(() => {})}
          />
        ))
      )}
    </YStack>
  )
}

function ReminderRow({
  reminder: r,
  now,
  onToggle,
  onRemove,
  onSnooze,
}: {
  reminder: Reminder
  now: number
  onToggle: () => void
  onRemove: () => void
  onSnooze: () => void
}) {
  const colors = useThemeColors()
  const at = new Date(r.remindAt)
  // One before every event with none coming up has no time (0): not past.
  const past = r.remindAt > 0 && r.remindAt <= now
  const clock = `${at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  const each = `${(r.relation || (typeof r.minutesBefore === 'number' ? before(r.minutesBefore) : 'before')).replace(/^./, (c) => c.toUpperCase())} each of your events`
  const when = r.everyEvent
    ? `${each} · ${r.eventTitle && r.remindAt > 0 ? `next: ${r.eventTitle}, ${reminderWhen(at, new Date(now))}` : 'none coming up'}`
    : r.repeat
      ? `${repeatWhen(at, r.repeat).replace(/^./, (c) => c.toUpperCase())} · next ${reminderWhen(at, new Date(now))}`
      : r.eventTitle && typeof r.minutesBefore === 'number'
        ? `${before(r.minutesBefore)} ${r.eventTitle} · ${past ? clock : reminderWhen(at, new Date(now))}`
        : past
          ? clock
          : reminderWhen(at, new Date(now))
  return (
    <XStack
      backgroundColor={colors.surface}
      borderRadius="$3"
      borderWidth={1}
      borderColor={colors.border}
      paddingLeft="$2"
      paddingRight="$1"
      alignItems="center"
      gap="$2"
    >
      {r.everyEvent ? (
        // For every event, so never ticked off: taken away with ✕.
        <View style={styles.hit} accessibilityLabel="Before each of your events">
          <Text fontSize={18}>🔁</Text>
        </View>
      ) : (
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          aria-checked={r.done}
          accessibilityLabel={r.done ? `Not done: ${r.text}` : `Done: ${r.text}`}
          style={styles.hit}
        >
          <XStack
            width={22}
            height={22}
            borderRadius={11}
            borderWidth={2}
            borderColor={r.done ? '#27ae60' : colors.textMuted}
            backgroundColor={r.done ? '#27ae60' : 'transparent'}
            alignItems="center"
            justifyContent="center"
          >
            {r.done ? (
              <Text color="white" fontSize={12} fontWeight="800">
                ✓
              </Text>
            ) : null}
          </XStack>
        </Pressable>
      )}
      <YStack flex={1} paddingVertical="$2" gap="$0.5">
        <Text
          color={r.done ? colors.textMuted : colors.text}
          fontSize="$4"
          fontWeight="600"
          textDecorationLine={r.done && !r.everyEvent ? 'line-through' : 'none'}
        >
          {r.text || 'Event reminder'}
        </Text>
        <Text
          color={past && !r.done ? colors.primary : colors.textMuted}
          fontSize="$2"
          fontWeight={past && !r.done ? '600' : '400'}
        >
          {when}
        </Text>
      </YStack>
      {past && !r.done ? (
        <Pressable
          onPress={onSnooze}
          accessibilityRole="button"
          accessibilityLabel={`Snooze an hour: ${r.text}`}
          style={[styles.snooze, { borderColor: colors.border }]}
        >
          <Text color={colors.text} fontSize="$2" fontWeight="700">
            +1 hr
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Delete the reminder: ${r.text}`}
        style={styles.hit}
      >
        <Text color={colors.textMuted} fontSize="$4">
          ✕
        </Text>
      </Pressable>
    </XStack>
  )
}

const styles = StyleSheet.create({
  hit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  snooze: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
