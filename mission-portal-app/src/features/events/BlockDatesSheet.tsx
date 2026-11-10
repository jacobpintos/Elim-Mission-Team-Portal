import { useEffect, useMemo, useState } from 'react'
import { Pressable } from 'react-native'
import { Input, Text, XStack, YStack } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { useThemeColors } from '@/theme/useThemeColors'
import { confirmAsync } from '@/lib/confirm'
import { localToday } from '@/lib/events'
import { FD } from '@/lib/format'
import { useBlockedDatesStore } from '@/stores/blockedDatesStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useUIStore } from '@/stores/uiStore'
import {
  blockCovers,
  blockProblem,
  blockSpan,
  daysIn,
  MAX_BLOCK_DAYS,
} from '../../../functions/src/blockedDates'
import { shiftDate } from '../../../functions/src/miriam/data'

const MONTHS = [
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
const pad = (n: number) => String(n).padStart(2, '0')

/** Days blocked off, on the calendar: grey — away, not an event. */
export const BLOCKED_COLOR = '#8a8f98'

/** Its first day picked, then its last: or one day, picked once. */
type Range = { from: string; to: string | null }

/**
 * Block off days you can't make — a vacation, work, family, anything — from
 * the Events screen: picked on a calendar, with a reason if you like. You
 * show as Not Available for everything you're on in those days, and anything
 * put there later (functions/src/blockedDatesSync). Your blocks are listed
 * below, to remove.
 */
export function BlockDatesSheet({
  open,
  onClose,
  uid,
  startOn,
}: {
  open: boolean
  onClose: () => void
  uid: string
  /** A day picked on the Events calendar: where this starts. */
  startOn?: string | null
}) {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const blocks = useBlockedDatesStore((s) => s.blocks)
  const add = useBlockedDatesStore((s) => s.add)
  const remove = useBlockedDatesStore((s) => s.remove)
  const today = localToday()

  const [range, setRange] = useState<Range | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [month, setMonth] = useState(() => (startOn ?? today).slice(0, 7))

  // Each time it opens: fresh, at the day picked on the calendar, if one was.
  useEffect(() => {
    if (!open) return
    const start = startOn && startOn >= today ? startOn : null
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRange(start ? { from: start, to: null } : null)
    setReason('')
    setMonth((start ?? today).slice(0, 7))
  }, [open, startOn, today])

  const from = range?.from ?? null
  const to = range ? (range.to ?? range.from) : null

  /** Your events in the days picked, and what you'd said for each. */
  const myInstances = useEventsStore((s) => s.myInstances)
  const affected = useMemo(
    () => (from && to ? myInstances(uid, from, to).filter((ev) => ev.unpublished !== true) : []),
    [from, to, uid, myInstances]
  )

  const pick = (day: string) => {
    if (day < today) return
    setRange((r) => {
      if (!r || r.to) return { from: day, to: null }
      if (day < r.from) return { from: day, to: null }
      if (daysIn(r.from, day) > MAX_BLOCK_DAYS) return r
      return { from: r.from, to: day }
    })
  }

  const save = async () => {
    if (!from || !to) return
    const problem = blockProblem(from, to, today)
    if (problem) return toast(problem, 'error')
    setSaving(true)
    try {
      // Admins on those events hear of it, as they would of an answer given
      // by hand: from the server, as it answers for them (functions:
      // push/recordNotifications onAvailWritten).
      await add(uid, from, to, reason)
      toast(
        `Blocked off ${blockSpan({ from, to })} — you’ll show as Not Available then.`,
        'success'
      )
      setRange(null)
      setReason('')
      onClose()
    } catch {
      toast('Couldn’t block those days off — try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const lift = async (id: string, span: string) => {
    const ok = await confirmAsync(
      `Remove ${span}? Your answers for those days go back to what they were.`,
      { confirmLabel: 'Remove' }
    )
    if (!ok) return
    try {
      await remove(id)
      toast(`${span} is open again.`, 'success')
    } catch {
      toast('Couldn’t remove it — try again.', 'error')
    }
  }

  const upcoming = blocks.filter((b) => b.to >= today)

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title="Block off dates"
      scrollable
    >
      <YStack gap="$3">
        <Text color={colors.textMuted} fontSize="$2">
          Days you can’t make, for any reason. You’ll show as Not Available for everything you’re on
          in them — and anything added later.
        </Text>

        <RangeCalendar
          month={month}
          onMonth={setMonth}
          today={today}
          from={from}
          to={to}
          blocked={(day) => upcoming.some((b) => blockCovers(b, day))}
          anyBlocked={upcoming.length > 0}
          onPick={pick}
        />

        <Text color={from ? colors.text : colors.textMuted} fontSize="$3" fontWeight="600">
          {!from || !to
            ? 'Tap the first day, then the last.'
            : from === to
              ? `${FD(from, { weekday: true })} — tap another day to make it a stretch`
              : `${FD(from, { weekday: true })} – ${FD(to, { weekday: true })} · ${daysIn(from, to)} days`}
        </Text>

        <Input
          value={reason}
          onChangeText={setReason}
          maxLength={120}
          placeholder="Reason (optional) — vacation, work, family…"
          backgroundColor={colors.surface}
          color={colors.text}
          borderColor={colors.border}
          placeholderTextColor={colors.textMuted as never}
        />

        {from && to ? (
          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2">
              {affected.length
                ? `You’re on ${affected.length === 1 ? 'this event' : `these ${affected.length} events`} then:`
                : 'You’re not on anything then yet — anything you’re put on later will show you as Not Available.'}
            </Text>
            {affected.slice(0, 8).map((ev) => (
              <Text key={ev.instanceKey} color={colors.text} fontSize="$2">
                • {ev.title} — {FD(ev.date, { weekday: true })}
              </Text>
            ))}
            {affected.length > 8 ? (
              <Text color={colors.textMuted} fontSize="$2">
                and {affected.length - 8} more
              </Text>
            ) : null}
          </YStack>
        ) : null}

        <Pressable onPress={save} disabled={!from || saving} accessibilityRole="button">
          <XStack
            backgroundColor={colors.primary}
            opacity={!from || saving ? 0.5 : 1}
            borderRadius="$2"
            paddingVertical="$2.5"
            justifyContent="center"
          >
            <Text color="white" fontWeight="700" fontSize="$3">
              {saving ? 'Blocking off…' : 'Block off these days'}
            </Text>
          </XStack>
        </Pressable>

        <YStack gap="$2" marginTop="$2">
          <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
            YOUR BLOCKED-OFF DATES
          </Text>
          {upcoming.length === 0 ? (
            <Text color={colors.textMuted} fontSize="$3">
              None.
            </Text>
          ) : (
            <YStack borderWidth={1} borderColor={colors.border} borderRadius="$3">
              {upcoming.map((b, i) => (
                <XStack
                  key={b.id}
                  padding="$3"
                  gap="$2"
                  alignItems="center"
                  borderTopWidth={i ? 1 : 0}
                  borderTopColor={colors.border}
                >
                  <YStack flex={1}>
                    <Text color={colors.text} fontWeight="600" fontSize="$3">
                      {blockSpan(b)}
                    </Text>
                    {b.reason ? (
                      <Text color={colors.textMuted} fontSize="$2">
                        {b.reason}
                      </Text>
                    ) : null}
                  </YStack>
                  <Pressable
                    onPress={() => lift(b.id, blockSpan(b))}
                    hitSlop={6}
                    accessibilityLabel={`Remove ${blockSpan(b)}`}
                  >
                    <Text color={colors.primary} fontWeight="600" fontSize="$2">
                      Remove
                    </Text>
                  </Pressable>
                </XStack>
              ))}
            </YStack>
          )}
        </YStack>
      </YStack>
    </Modal>
  )
}

/** A month to pick a stretch of days on: past days can't be, days already blocked are marked. */
function RangeCalendar({
  month,
  onMonth,
  today,
  from,
  to,
  blocked,
  anyBlocked,
  onPick,
}: {
  /** YYYY-MM */
  month: string
  onMonth: (m: string) => void
  today: string
  from: string | null
  to: string | null
  blocked: (day: string) => boolean
  anyBlocked: boolean
  onPick: (day: string) => void
}) {
  const colors = useThemeColors()
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const first = new Date(y, m - 1, 1).getDay()
  const days = new Date(y, m, 0).getDate()
  const step = (n: number) => {
    const d = new Date(y, m - 1 + n, 1)
    onMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }
  const canGoBack = month > today.slice(0, 7)
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => {
    const d = i - first + 1
    return d >= 1 && d <= days ? `${month}-${pad(d)}` : null
  })

  return (
    <YStack borderWidth={1} borderColor={colors.border} borderRadius="$3" padding="$2" gap="$1">
      <XStack alignItems="center" justifyContent="space-between" paddingBottom="$1">
        <Pressable
          onPress={() => step(-1)}
          disabled={!canGoBack}
          hitSlop={8}
          accessibilityLabel="Previous month"
        >
          <Text
            color={canGoBack ? colors.primary : colors.border}
            fontSize="$5"
            paddingHorizontal="$2"
          >
            ‹
          </Text>
        </Pressable>
        <Text color={colors.text} fontWeight="700" fontSize="$3">
          {MONTHS[m - 1]} {y}
        </Text>
        <Pressable onPress={() => step(1)} hitSlop={8} accessibilityLabel="Next month">
          <Text color={colors.primary} fontSize="$5" paddingHorizontal="$2">
            ›
          </Text>
        </Pressable>
      </XStack>
      <XStack>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} flex={1} textAlign="center" color={colors.textMuted} fontSize={11}>
            {d}
          </Text>
        ))}
      </XStack>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <XStack key={w}>
          {cells.slice(w * 7, w * 7 + 7).map((day, i) => {
            if (!day) return <YStack key={i} flex={1} height={38} />
            const past = day < today
            const ends = day === from || day === to
            const inside = !!from && !!to && day > from && day < to
            const taken = blocked(day)
            const shiftedIn = !!from && !!to && from !== to
            return (
              <Pressable
                key={i}
                style={{ flex: 1 }}
                disabled={past}
                onPress={() => onPick(day)}
                accessibilityLabel={`${FD(day, { weekday: true })}${taken ? ', blocked off' : ''}`}
                accessibilityState={{ selected: ends || inside, disabled: past }}
              >
                <YStack
                  height={38}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={
                    inside || (shiftedIn && ends) ? colors.primary + '2e' : 'transparent'
                  }
                  borderTopLeftRadius={day === from ? 19 : 0}
                  borderBottomLeftRadius={day === from ? 19 : 0}
                  borderTopRightRadius={day === to ? 19 : 0}
                  borderBottomRightRadius={day === to ? 19 : 0}
                >
                  <YStack
                    width={32}
                    height={32}
                    borderRadius={16}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={ends ? colors.primary : 'transparent'}
                    borderWidth={day === today && !ends ? 1 : 0}
                    borderColor={colors.primary}
                  >
                    <Text
                      color={ends ? 'white' : past ? colors.border : colors.text}
                      fontSize={13}
                      fontWeight={ends ? '700' : '400'}
                      textDecorationLine={taken && !ends ? 'line-through' : 'none'}
                    >
                      {Number(day.slice(8))}
                    </Text>
                  </YStack>
                </YStack>
              </Pressable>
            )
          })}
        </XStack>
      ))}
      {anyBlocked ? (
        <Text color={colors.textMuted} fontSize={11} paddingTop="$1">
          Struck through: already blocked off.
        </Text>
      ) : null}
    </YStack>
  )
}

/** Days still to come of a stretch, for the calendar: each day from its first to its last. */
export function blockedDaysBetween(
  blocks: { from: string; to: string }[],
  from: string,
  to: string
): Set<string> {
  const out = new Set<string>()
  for (const b of blocks) {
    let d = b.from > from ? b.from : from
    const last = b.to < to ? b.to : to
    for (let n = 0; d <= last && n < 400; n++, d = shiftDate(d, 1)) out.add(d)
  }
  return out
}
