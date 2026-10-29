import { useState } from 'react'
import { Pressable } from 'react-native'
import { Input, Text, XStack, YStack } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { tidyTime } from '@/lib/eventSchedule'
import type { EventTeam, ReportTimeEntry } from '@/types/events'
import { REMAINDER } from '../../../functions/src/miriam/data'

/** The event's team names, once each, in their order. */
export const teamNamesOf = (teams: EventTeam[]) => [
  ...new Set(teams.map((t) => t.name.trim()).filter(Boolean)),
]

/**
 * The report times as they are saved: tidied, those left blank dropped, and
 * any for a team the event no longer has.
 */
export function tidyReportTimes(entries: ReportTimeEntry[], teams: EventTeam[]): ReportTimeEntry[] {
  const names = new Set(teamNamesOf(teams))
  return entries
    .filter((e) => e.time.trim() && (e.group === REMAINDER || names.has(e.group)))
    .map((e) => ({ group: e.group, time: tidyTime(e.time) }))
}

/**
 * When those on the event are to be there: one time for everyone, or one for
 * each team and another for everyone else. Seen only by those on the event,
 * and admins (miriam/data reportTimesFor); the start time is for anyone.
 *
 * `earlier`: report times set before there was this field, said, if there
 * are some — whatever is set here replaces them.
 */
export function ReportTimeEditor({
  entries,
  onChange,
  teams,
  earlier,
}: {
  entries: ReportTimeEntry[]
  onChange: (entries: ReportTimeEntry[]) => void
  teams: EventTeam[]
  earlier?: string
}) {
  const colors = useThemeColors()
  const names = teamNamesOf(teams)
  const [byTeam, setByTeam] = useState(() => entries.some((e) => e.group !== REMAINDER))

  const timeOf = (group: string) => entries.find((e) => e.group === group)?.time ?? ''
  // In the order the teams are, everyone else last.
  const order = [...names, REMAINDER]
  const rank = (group: string) => {
    const at = order.indexOf(group)
    return at < 0 ? order.length : at
  }
  const set = (group: string, time: string) =>
    onChange(
      [...entries.filter((e) => e.group !== group), ...(time ? [{ group, time }] : [])].sort(
        (a, b) => rank(a.group) - rank(b.group)
      )
    )

  const choose = (team: boolean) => {
    if (team === byTeam) return
    setByTeam(team)
    // One for everyone: everyone else's time, or else the first team's.
    if (!team) {
      const one = timeOf(REMAINDER) || entries[0]?.time || ''
      onChange(one ? [{ group: REMAINDER, time: one }] : [])
    }
  }

  const timeInput = (group: string, label: string) => (
    <Input
      value={timeOf(group)}
      onChangeText={(v) => set(group, v)}
      onBlur={() => set(group, tidyTime(timeOf(group)))}
      placeholder="e.g. 5:00 PM"
      accessibilityLabel={label}
      backgroundColor={colors.surface}
      color={colors.text}
      borderColor={colors.border}
      {...(byTeam ? { width: 130 } : {})}
    />
  )

  return (
    <YStack gap="$2">
      <YStack gap="$1">
        <Text color={colors.text} fontSize="$3">
          Report Time
        </Text>
        <Text color={colors.textMuted} fontSize="$2">
          Seen only by those on the event, and admins. Everyone else sees the start time.
        </Text>
      </YStack>

      <XStack gap="$2">
        {(
          [
            [false, 'Same for everyone'],
            [true, 'By team'],
          ] as const
        ).map(([team, label]) => {
          const on = byTeam === team
          return (
            <Pressable
              key={label}
              onPress={() => choose(team)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <XStack
                paddingHorizontal="$3"
                paddingVertical="$1.5"
                borderRadius="$2"
                borderWidth={1}
                borderColor={on ? colors.primary : colors.border}
                backgroundColor={on ? colors.primary : 'transparent'}
              >
                <Text color={on ? 'white' : colors.text} fontSize="$2" fontWeight="600">
                  {label}
                </Text>
              </XStack>
            </Pressable>
          )
        })}
      </XStack>

      {!byTeam ? (
        timeInput(REMAINDER, 'Report time')
      ) : (
        <YStack gap="$2">
          {names.length === 0 ? (
            <Text color={colors.textMuted} fontSize="$2">
              Add teams below to give each its own time.
            </Text>
          ) : null}
          {[...names, REMAINDER].map((group) => {
            const label = group === REMAINDER ? 'Everyone else' : group
            return (
              <XStack key={group} gap="$2" alignItems="center">
                <Text color={colors.text} fontSize="$3" flex={1} numberOfLines={1}>
                  {label}
                </Text>
                {timeInput(group, `Report time: ${label}`)}
              </XStack>
            )
          })}
        </YStack>
      )}

      {earlier && !entries.length ? (
        <Text color={colors.textMuted} fontSize="$2">
          Set before: {earlier}. A time set here replaces it.
        </Text>
      ) : null}
    </YStack>
  )
}
