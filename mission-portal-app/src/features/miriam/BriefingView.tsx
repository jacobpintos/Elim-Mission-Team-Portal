import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { XStack, YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { miriamHref } from '@/lib/miriam'
import type { AttentionItem, Briefing, FoodNudge } from '@/lib/briefing'
import type { Reminder } from '@/stores/remindersStore'

type Colors = ReturnType<typeof useThemeColors>

/**
 * The daily briefing in Miriam's panel (lib/briefing): today's events, your
 * tasks and reminders, what's new, and what needs you — each a tap to where
 * it is, tasks and reminders ticked off here, and those who haven't
 * answered reminded at a tap.
 */
export function BriefingView({
  briefing: b,
  speaking,
  onStop,
  onOpen,
  onTaskDone,
  onReminderDone,
  onRemind,
  onBringFood,
}: {
  briefing: Briefing
  speaking: boolean
  onStop: () => void
  onOpen: (href: string) => void
  onTaskDone: (id: string) => Promise<void>
  onReminderDone: (r: Reminder) => Promise<void>
  onRemind: (item: NonNullable<AttentionItem['remind']>) => Promise<void>
  /** Signed up for the item suggested; false if that couldn't be done. */
  onBringFood: (food: FoodNudge) => Promise<boolean>
}) {
  const colors = useThemeColors()
  // Ticked off, or reminded, here: shown so at once.
  const [done, setDone] = useState<Set<string>>(new Set())
  const mark = (id: string) => setDone((d) => new Set(d).add(id))

  return (
    <YStack gap="$3" paddingBottom="$1">
      <YStack gap="$0.5">
        <Text color={colors.text} fontSize="$6" fontWeight="700">
          {b.greeting}
        </Text>
        <Text color={colors.textMuted} fontSize="$3">
          {b.dateLine}
        </Text>
      </YStack>

      {speaking ? (
        <XStack
          alignItems="center"
          gap="$2"
          paddingLeft="$3"
          paddingRight="$1.5"
          paddingVertical="$1.5"
          borderRadius="$3"
          backgroundColor="rgba(245,108,90,0.12)"
        >
          <Text color={colors.primary} fontSize="$3" fontWeight="700">
            ▍▌▍▌
          </Text>
          <Text flex={1} color={colors.text} fontSize="$3">
            Reading your briefing…
          </Text>
          <Pressable
            onPress={onStop}
            accessibilityRole="button"
            style={[styles.pill, { borderColor: colors.primary }]}
          >
            <Text color={colors.text} fontWeight="700" fontSize="$2">
              Stop
            </Text>
          </Pressable>
        </XStack>
      ) : null}

      {b.today.length || b.next ? (
        <Section title={b.today.length ? 'TODAY' : 'NEXT UP'} colors={colors}>
          {(b.today.length ? b.today : [b.next!]).map((ev) => (
            <Pressable
              key={ev.key}
              onPress={() => onOpen(miriamHref({ kind: 'event', key: ev.key, section: null }))}
              accessibilityRole="link"
              accessibilityLabel={`${ev.title}, ${ev.time} ${ev.meridiem}`}
            >
              <XStack
                style={[
                  styles.card,
                  { borderColor: colors.border, backgroundColor: colors.background },
                ]}
                gap="$3"
              >
                <YStack width={58}>
                  <Text color={colors.text} fontSize="$4" fontWeight="700">
                    {ev.time}
                  </Text>
                  <Text color={colors.textMuted} fontSize="$1">
                    {ev.meridiem}
                  </Text>
                </YStack>
                <YStack flex={1} gap="$1.5">
                  <Text color={colors.text} fontSize="$4" fontWeight="700">
                    {ev.title}
                  </Text>
                  {ev.place ? (
                    <Text color={colors.textMuted} fontSize="$2">
                      {ev.place}
                    </Text>
                  ) : null}
                  {ev.chips.length ? (
                    <XStack flexWrap="wrap" gap="$1.5">
                      {ev.chips.map((c) => (
                        <View key={c} style={[styles.chip, { backgroundColor: colors.border }]}>
                          <Text color={colors.text} fontSize="$1">
                            {c}
                          </Text>
                        </View>
                      ))}
                    </XStack>
                  ) : null}
                </YStack>
                <Text color={colors.textMuted} alignSelf="center">
                  ›
                </Text>
              </XStack>
            </Pressable>
          ))}
        </Section>
      ) : null}

      {b.tasks.length || b.reminders.length ? (
        <Section title="YOUR TASKS" colors={colors}>
          <YStack
            style={[
              styles.list,
              { borderColor: colors.border, backgroundColor: colors.background },
            ]}
          >
            {b.reminders.map((r, i) => (
              <Row
                key={r.id}
                colors={colors}
                dot={colors.primary}
                title={r.text}
                sub={`Reminder · ${new Date(r.remindAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                last={i === b.reminders.length - 1 && b.tasks.length === 0}
                onPress={() => onOpen('/assignments')}
                action={
                  done.has(r.id)
                    ? { label: '✓ Done', disabled: true }
                    : {
                        label: '✓ Done',
                        run: () => onReminderDone(r as Reminder).then(() => mark(r.id)),
                      }
                }
              />
            ))}
            {b.tasks.map((t, i) => (
              <Row
                key={t.id}
                colors={colors}
                dot={
                  t.due === 'overdue' ? '#e74c3c' : t.due === 'today' ? '#f0a070' : colors.textMuted
                }
                title={t.title}
                sub={t.label}
                subColor={t.due === 'overdue' ? '#e74c3c' : undefined}
                last={i === b.tasks.length - 1}
                onPress={() => onOpen(`/assignments?taskId=${encodeURIComponent(t.id)}`)}
                action={
                  done.has(t.id)
                    ? { label: '✓ Done', disabled: true }
                    : { label: '✓ Done', run: () => onTaskDone(t.id).then(() => mark(t.id)) }
                }
              />
            ))}
          </YStack>
        </Section>
      ) : null}

      {b.food.length ? (
        <Section title="BRING FOOD" colors={colors}>
          <YStack
            style={[
              styles.list,
              { borderColor: colors.border, backgroundColor: colors.background },
            ]}
          >
            {b.food.map((f, i) => {
              const id = `food${f.eventKey}`
              return (
                <Row
                  key={id}
                  colors={colors}
                  dot="#f0a070"
                  title={`${f.title} still has open food items`}
                  sub={`How about ${f.suggestion}? · ${f.open.length} open`}
                  last={i === b.food.length - 1}
                  onPress={() =>
                    onOpen(miriamHref({ kind: 'event', key: f.eventKey, section: 'food' }))
                  }
                  action={
                    done.has(id)
                      ? { label: `✓ ${f.suggestion}`, disabled: true }
                      : {
                          label: `Bring ${f.suggestion}`,
                          filled: true,
                          run: () =>
                            onBringFood(f).then((ok) => {
                              if (ok) mark(id)
                            }),
                        }
                  }
                />
              )
            })}
          </YStack>
        </Section>
      ) : null}

      {b.news.length ? (
        <Section title="NEW SINCE YESTERDAY" colors={colors}>
          <YStack
            style={[
              styles.list,
              { borderColor: colors.border, backgroundColor: colors.background },
            ]}
          >
            {b.news.map((n, i) => (
              <Row
                key={`${n.kind}${i}`}
                colors={colors}
                dot={n.kind === 'announcement' ? '#f0a070' : '#5b8def'}
                title={n.title}
                sub={n.sub}
                last={i === b.news.length - 1}
                onPress={() => onOpen(n.href)}
              />
            ))}
          </YStack>
        </Section>
      ) : null}

      {b.attention.length ? (
        <Section title="NEEDS YOUR ATTENTION" colors={colors}>
          <YStack
            style={[
              styles.list,
              { borderColor: colors.border, backgroundColor: colors.background },
            ]}
          >
            {b.attention.map((a, i) => {
              const id = `${a.kind}${i}`
              const remind = a.remind
              return (
                <Row
                  key={id}
                  colors={colors}
                  dot={
                    a.kind === 'issue'
                      ? '#f0a070'
                      : a.kind === 'setlist'
                        ? '#a77bdb'
                        : colors.primary
                  }
                  title={a.title}
                  sub={a.sub}
                  last={i === b.attention.length - 1}
                  onPress={() => onOpen(a.href)}
                  action={
                    remind
                      ? done.has(id)
                        ? { label: 'Reminded', disabled: true }
                        : {
                            label: 'Remind',
                            filled: true,
                            run: () => onRemind(remind).then(() => mark(id)),
                          }
                      : undefined
                  }
                />
              )
            })}
          </YStack>
        </Section>
      ) : null}

      {!b.today.length &&
      !b.next &&
      !b.tasks.length &&
      !b.reminders.length &&
      !b.news.length &&
      !b.food.length &&
      !b.attention.length ? (
        <Text color={colors.textMuted} fontSize="$3">
          Nothing on today, and nothing waiting on you.
        </Text>
      ) : null}
    </YStack>
  )
}

function Section({
  title,
  colors,
  children,
}: {
  title: string
  colors: Colors
  children: React.ReactNode
}) {
  return (
    <YStack gap="$2">
      <Text color={colors.textMuted} fontSize={11} fontWeight="800" letterSpacing={1.2}>
        {title}
      </Text>
      {children}
    </YStack>
  )
}

function Row({
  colors,
  dot,
  title,
  sub,
  subColor,
  last,
  onPress,
  action,
}: {
  colors: Colors
  dot: string
  title: string
  sub: string
  subColor?: string
  last: boolean
  onPress: () => void
  action?: { label: string; run?: () => Promise<void>; disabled?: boolean; filled?: boolean }
}) {
  const [busy, setBusy] = useState(false)
  return (
    <XStack
      alignItems="center"
      gap="$2.5"
      paddingLeft="$3"
      paddingRight="$2"
      minHeight={52}
      borderBottomWidth={last ? 0 : 1}
      borderBottomColor={colors.border}
    >
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Pressable onPress={onPress} accessibilityRole="link" style={{ flex: 1, paddingVertical: 8 }}>
        <Text color={colors.text} fontSize="$4" fontWeight="600" numberOfLines={2}>
          {title}
        </Text>
        <Text
          color={subColor ?? colors.textMuted}
          fontSize="$2"
          fontWeight={subColor ? '600' : '400'}
        >
          {sub}
        </Text>
      </Pressable>
      {action ? (
        <Pressable
          disabled={action.disabled || busy}
          onPress={async () => {
            if (!action.run) return
            setBusy(true)
            await action.run().catch(() => {})
            setBusy(false)
          }}
          accessibilityRole="button"
          accessibilityLabel={`${action.label}: ${title}`}
          style={[
            styles.pill,
            action.filled && !action.disabled
              ? { backgroundColor: '#c04a34', borderColor: '#c04a34' }
              : { borderColor: colors.border, opacity: action.disabled ? 0.6 : 1 },
          ]}
        >
          <Text
            color={action.filled && !action.disabled ? 'white' : colors.text}
            fontWeight="700"
            fontSize="$2"
          >
            {busy ? '…' : action.label}
          </Text>
        </Pressable>
      ) : (
        <Text color={colors.textMuted}>›</Text>
      )}
    </XStack>
  )
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 12, borderWidth: 1 },
  list: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: {
    minHeight: 36,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
