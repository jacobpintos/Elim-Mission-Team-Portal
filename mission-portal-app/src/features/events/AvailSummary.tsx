import { useMemo, useState } from 'react'
import { Pressable } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { useEventsStore, resolveAssignedUids } from '@/stores/eventsStore'
import { useUsersStore } from '@/stores/usersStore'
import { useThemeColors } from '@/theme/useThemeColors'
import {
  AVAIL_BUCKETS,
  AVAIL_COLORS,
  availabilityByAnswer,
  type AvailBucket,
} from '@/lib/availability'
import { isPublicFollower } from '@/lib/roles'
import { BLOCKED_NOTE } from '../../../functions/src/blockedDates'
import { sameId } from '@/lib/ids'
import type { EventInstance } from '@/types/events'

const NONE_COLOR = '#8a8f98'

const LABEL: Record<AvailBucket, string> = {
  yes: 'Available',
  no: 'Not available',
  partial: 'Partial',
  tbd: 'TBD',
  none: 'No response',
}

const color = (b: AvailBucket) => (b === 'none' ? NONE_COLOR : AVAIL_COLORS[b])

/**
 * For an admin, at the foot of an event's page: how many of those on this
 * date said they can come, can't, partly, aren't sure yet, or haven't said —
 * and, tapping one, who, with what they wrote.
 *
 * Those on it are everyone it is assigned to — by name, group and team — who
 * is asked: not a public account, nor one since removed.
 */
export function AvailSummary({ event }: { event: EventInstance }) {
  const colors = useThemeColors()
  const avail = useEventsStore((s) => s.avail)
  const users = useUsersStore((s) => s.users)
  const [open, setOpen] = useState<AvailBucket | null>(null)

  const by = useMemo(() => {
    const asked = [...resolveAssignedUids(event)].filter((uid) => {
      const u = users.find((x) => sameId(x.uid, uid))
      return !!u && !isPublicFollower(u)
    })
    const nameOf = (uid: string) => {
      const u = users.find((x) => sameId(x.uid, uid))
      return u?.displayName || u?.email || 'Someone'
    }
    return availabilityByAnswer(avail, event, asked, nameOf)
  }, [avail, event, users])

  const total = AVAIL_BUCKETS.reduce((n, b) => n + by[b].length, 0)
  if (!total) return null
  const shown = open && by[open].length ? open : null

  return (
    <YStack gap="$2">
      <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
        TEAM AVAILABILITY · {total} {total === 1 ? 'PERSON' : 'PEOPLE'}
      </Text>
      <XStack gap="$1.5">
        {AVAIL_BUCKETS.map((b) => {
          const n = by[b].length
          const on = shown === b
          return (
            <Pressable
              key={b}
              style={{ flex: 1, minWidth: 0 }}
              disabled={!n}
              onPress={() => setOpen(on ? null : b)}
              accessibilityRole="button"
              accessibilityState={{ expanded: on, disabled: !n }}
              accessibilityLabel={`${n} ${LABEL[b]}`}
            >
              <YStack
                alignItems="center"
                paddingVertical="$2"
                paddingHorizontal={2}
                borderRadius="$3"
                borderWidth={on ? 2 : 1}
                borderColor={on ? color(b) : colors.border}
                backgroundColor={n ? color(b) + (on ? '33' : '1a') : 'transparent'}
                opacity={n ? 1 : 0.5}
                gap={2}
              >
                <Text color={n ? color(b) : colors.textMuted} fontSize={22} fontWeight="800">
                  {n}
                </Text>
                <Text
                  color={n ? colors.text : colors.textMuted}
                  fontSize={11}
                  fontWeight="600"
                  textAlign="center"
                  numberOfLines={2}
                >
                  {LABEL[b]}
                </Text>
              </YStack>
            </Pressable>
          )
        })}
      </XStack>
      {shown ? (
        <YStack
          borderWidth={1}
          borderColor={colors.border}
          borderLeftWidth={3}
          borderLeftColor={color(shown)}
          borderRadius="$2"
          backgroundColor={colors.surface}
        >
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            justifyContent="space-between"
            alignItems="center"
            borderBottomWidth={1}
            borderBottomColor={colors.border}
          >
            <Text color={color(shown)} fontSize="$3" fontWeight="700">
              {LABEL[shown]} ({by[shown].length})
            </Text>
            <Pressable onPress={() => setOpen(null)} hitSlop={8} accessibilityLabel="Close list">
              <Text color={colors.textMuted} fontSize="$3">
                ✕
              </Text>
            </Pressable>
          </XStack>
          {by[shown].map((p, i) => (
            <XStack
              key={p.uid}
              paddingHorizontal="$3"
              paddingVertical="$2"
              gap="$3"
              alignItems="center"
              borderTopWidth={i ? 1 : 0}
              borderTopColor={colors.border}
            >
              <Text color={colors.text} fontSize="$3" flexShrink={0}>
                {p.name}
              </Text>
              {p.note || p.blocked ? (
                <Text color={colors.textMuted} fontSize="$2" flex={1} textAlign="right">
                  {p.blocked && p.note !== BLOCKED_NOTE ? `Blocked off — ${p.note}` : p.note}
                </Text>
              ) : null}
            </XStack>
          ))}
        </YStack>
      ) : null}
    </YStack>
  )
}
