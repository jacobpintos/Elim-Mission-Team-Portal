import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { confirmAsync } from '@/lib/confirm'
import { newScheduleItem, sortSchedule, tidySchedule, tidyTime } from '@/lib/eventSchedule'
import { useThemeColors } from '@/theme/useThemeColors'
import type { ScheduleItem } from '@/types/events'

interface ScheduleBuilderProps {
  /** What the schedule is for, under the window's title: the event's name. */
  subtitle?: string
  schedule: ScheduleItem[]
  /** What to call each of the event's days: one for an event of one day. */
  days: string[]
  onSave: (schedule: ScheduleItem[]) => void
  onClose: () => void
}

/**
 * Build an event's schedule — what happens when — in a window of its own,
 * opened from the event form.
 *
 * A row is a time, what happens, and, if wanted, when it ends and a note. A
 * multi-day event has a tab for each day. Times are written however is
 * easiest ("7pm") and tidied as they are left ("7:00 PM"), and the rows are
 * put in time order as the window opens and as it is saved.
 *
 * Works on a copy: nothing is kept until Save, which hands the schedule back.
 */
export function ScheduleBuilder({
  subtitle,
  schedule,
  days,
  onSave,
  onClose,
}: ScheduleBuilderProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const dayCount = Math.max(1, days.length)
  const [items, setItems] = useState<ScheduleItem[]>(() => sortSchedule(schedule))
  const [day, setDay] = useState(0)
  // A new row's time takes the cursor as it appears.
  const [focus, setFocus] = useState<string | null>(null)

  const onDay = (it: ScheduleItem) => Math.min(it.day ?? 0, dayCount - 1) === day
  const shown = items.filter(onDay)
  const dirty =
    JSON.stringify(tidySchedule(items, dayCount)) !==
    JSON.stringify(tidySchedule(schedule, dayCount))

  const update = (id: string, change: Partial<ScheduleItem>) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...change } : x)))

  const add = () => {
    const item = newScheduleItem(items, day)
    setItems((xs) => [...xs, item])
    setFocus(item.id)
  }

  const remove = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id))

  const close = async () => {
    if (dirty) {
      const ok = await confirmAsync(
        'Close without saving? The changes to the schedule will be lost.',
        {
          title: 'Unsaved changes',
          confirmLabel: 'Discard',
          destructive: true,
        }
      )
      if (!ok) return
    }
    onClose()
  }

  const input = (extra: object = {}) => [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
    extra,
  ]

  return (
    // Over the form it was opened from, on the web as on the phones.
    <FullScreenOverlay visible animationType="slide" transparent onRequestClose={close} aboveSheets>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.center,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
          ]}
        >
          <YStack
            backgroundColor={colors.surface}
            borderRadius="$4"
            padding="$3"
            gap="$2.5"
            width="96%"
            maxWidth={760}
            flex={1}
          >
            {/* Header */}
            <XStack alignItems="center" gap="$2">
              <YStack flex={1}>
                <Text color={colors.text} fontSize="$6" fontWeight="700">
                  Schedule
                </Text>
                {subtitle ? (
                  <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </YStack>
              <Pressable
                onPress={() => onSave(tidySchedule(items, dayCount))}
                accessibilityRole="button"
                style={[styles.button, { backgroundColor: colors.primary }]}
              >
                <Text color={colors.onPrimary} fontWeight="700" fontSize="$3">
                  Save
                </Text>
              </Pressable>
              <Pressable
                onPress={close}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text color={colors.textMuted} fontSize="$6" paddingHorizontal="$1">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            {/* A tab for each day of a multi-day event */}
            {dayCount > 1 ? (
              <View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tabs}
                  keyboardShouldPersistTaps="handled"
                >
                  {days.map((label, i) => {
                    const on = i === day
                    const count = items.filter(
                      (it) => Math.min(it.day ?? 0, dayCount - 1) === i
                    ).length
                    return (
                      <Pressable
                        key={i}
                        onPress={() => setDay(i)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                        style={[
                          styles.tab,
                          {
                            borderColor: on ? colors.primary : colors.border,
                            backgroundColor: on ? colors.primary : colors.background,
                          },
                        ]}
                      >
                        <Text
                          color={on ? colors.onPrimary : colors.text}
                          fontSize="$3"
                          fontWeight="700"
                        >
                          {label}
                        </Text>
                        {count ? (
                          <Text color={on ? colors.onPrimary : colors.textMuted} fontSize="$2">
                            {count}
                          </Text>
                        ) : null}
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>
            ) : null}

            <Text color={colors.textMuted} fontSize="$2">
              What happens when. Write times however is easiest — “7pm” becomes 7:00 PM — and
              they’re put in order when you save.
            </Text>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: 10, paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              {shown.map((it) => (
                <View
                  key={it.id}
                  style={[
                    styles.row,
                    { borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                >
                  <XStack gap="$2" alignItems="center">
                    <TextInput
                      value={it.time}
                      onChangeText={(time) => update(it.id, { time })}
                      onBlur={() => update(it.id, { time: tidyTime(it.time) })}
                      onFocus={() => setFocus(null)}
                      autoFocus={focus === it.id}
                      placeholder="7:00 PM"
                      placeholderTextColor={colors.textMuted}
                      style={input(styles.time)}
                      accessibilityLabel="Time"
                    />
                    <TextInput
                      value={it.title}
                      onChangeText={(title) => update(it.id, { title })}
                      placeholder="What’s happening"
                      placeholderTextColor={colors.textMuted}
                      style={input(styles.flex)}
                      accessibilityLabel="What’s happening"
                    />
                    <Pressable
                      onPress={() => remove(it.id)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Remove from the schedule"
                    >
                      <Text color="$red10" fontSize="$4">
                        ✕
                      </Text>
                    </Pressable>
                  </XStack>
                  <XStack gap="$2" alignItems="center">
                    <TextInput
                      value={it.endTime ?? ''}
                      onChangeText={(endTime) => update(it.id, { endTime })}
                      onBlur={() => update(it.id, { endTime: tidyTime(it.endTime ?? '') })}
                      placeholder="Ends"
                      placeholderTextColor={colors.textMuted}
                      style={input(styles.time)}
                      accessibilityLabel="When it ends"
                    />
                    <TextInput
                      value={it.notes ?? ''}
                      onChangeText={(notes) => update(it.id, { notes })}
                      placeholder="Notes (optional)"
                      placeholderTextColor={colors.textMuted}
                      style={input(styles.flex)}
                      accessibilityLabel="Notes"
                    />
                    {/* Lines the note up under what's happening. */}
                    <View style={{ width: 16 }} />
                  </XStack>
                </View>
              ))}
              {shown.length === 0 ? (
                <Text color={colors.textMuted} fontSize="$3">
                  {dayCount > 1 ? `Nothing on ${days[day]} yet.` : 'Nothing on the schedule yet.'}
                </Text>
              ) : null}
              <Pressable
                onPress={add}
                accessibilityRole="button"
                style={[styles.add, { borderColor: colors.primary }]}
              >
                <Text color={colors.primary} fontSize="$3" fontWeight="700">
                  + Add to the schedule
                </Text>
              </Pressable>
            </ScrollView>
          </YStack>
        </KeyboardAvoidingView>
      </View>
    </FullScreenOverlay>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    gap: 8,
    paddingVertical: 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  row: {
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  input: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
  },
  time: {
    width: 104,
  },
  // Free to shrink: a text box on the web is otherwise as wide as its default
  // size, which put the end of each row past the window on a phone.
  flex: {
    flex: 1,
    minWidth: 0,
  },
  add: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
})
