import { useEffect, useState } from 'react'
import { Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useConfigStore } from '@/stores/configStore'
import { useReimbursementsStore } from '@/stores/reimbursementsStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { TaskCard } from '@/components/ui/TaskCard'
import { formatCents } from '@/lib/money'
import { FD } from '@/lib/format'
import { KIND_COLORS, tally, tallyByEvent, type Tally } from '@/lib/reimbursementTally'
import type { Task } from '@/types/events'
import { ReimbursementFormModal } from './ReimbursementFormModal'

/**
 * Reimbursements, in a section of Assignments of their own.
 *
 * Everyone sees the requests they asked for here. The Accountant also sees
 * what they owe and have paid, tallied by event, with team members' requests
 * and outside bills in their own colours, and logs outside bills from here.
 *
 * The tally is built only from requests sent to the signed-in person as
 * Accountant, which nobody else can read — so it is theirs alone.
 */
export function ReimbursementsSection({
  tasks,
  onSubmitted,
}: {
  /** The reimbursement tasks on this person's list. */
  tasks: Task[]
  onSubmitted?: (taskId: number) => void
}) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''
  const accountant = useConfigStore((s) => s.accountant)
  const { subscribe: subConfig, unsubscribe: unsubConfig } = useConfigStore()
  const { subscribe, unsubscribe } = useReimbursementsStore()
  const requests = useReimbursementsStore((s) => s.requests)

  const [collapsed, setCollapsed] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [openEvent, setOpenEvent] = useState<string | null>(null)
  const [logging, setLogging] = useState(false)

  useEffect(() => {
    subscribe()
    subConfig()
    return () => {
      unsubscribe()
      unsubConfig()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isAccountant = !!uid && accountant === uid
  const mine = requests.filter((r) => r.accountantUid === uid)
  const showTally = isAccountant || mine.length > 0

  if (!showTally && tasks.length === 0) return null

  const open = tasks
    .filter((t) => t.status !== 'done')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  const closed = tasks.filter((t) => t.status === 'done')

  return (
    <YStack gap="$2">
      <Pressable onPress={() => setCollapsed((c) => !c)}>
        <XStack justifyContent="space-between" alignItems="center" paddingVertical="$1">
          <Text color={colors.text} fontWeight="700" fontSize="$3">
            Reimbursements
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            {open.length} open {collapsed ? '▸' : '▾'}
          </Text>
        </XStack>
      </Pressable>

      {collapsed ? null : (
        <>
          {showTally ? (
            <TallyCard
              total={tally(mine)}
              events={tallyByEvent(mine)}
              openEvent={openEvent}
              onToggleEvent={(id) => setOpenEvent((cur) => (cur === id ? null : id))}
              colors={colors}
            />
          ) : null}

          {isAccountant ? (
            <Pressable onPress={() => setLogging(true)}>
              <XStack
                borderWidth={1}
                borderColor={KIND_COLORS.external}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$2"
                alignSelf="flex-start"
                gap="$2"
                alignItems="center"
              >
                <XStack
                  width={8}
                  height={8}
                  borderRadius={99}
                  backgroundColor={KIND_COLORS.external}
                />
                <Text color={KIND_COLORS.external} fontSize="$3" fontWeight="600">
                  + Log an outside bill
                </Text>
              </XStack>
            </Pressable>
          ) : null}

          {open.map((t) => (
            <TaskCard key={String(t.id)} task={t} />
          ))}
          {open.length === 0 ? (
            <Text color={colors.textMuted} fontSize="$2">
              Nothing open.
            </Text>
          ) : null}

          {closed.length > 0 ? (
            <Pressable onPress={() => setShowClosed((s) => !s)}>
              <Text color={colors.primary} fontSize="$2">
                {showClosed ? 'Hide paid and closed ▾' : `Paid and closed (${closed.length}) ▸`}
              </Text>
            </Pressable>
          ) : null}
          {showClosed ? closed.map((t) => <TaskCard key={String(t.id)} task={t} />) : null}
        </>
      )}

      {isAccountant ? (
        <ReimbursementFormModal
          mode="external"
          visible={logging}
          onClose={() => setLogging(false)}
          onSubmitted={onSubmitted}
        />
      ) : null}
    </YStack>
  )
}

function TallyCard({
  total,
  events,
  openEvent,
  onToggleEvent,
  colors,
}: {
  total: Tally
  events: ReturnType<typeof tallyByEvent>
  openEvent: string | null
  onToggleEvent: (id: string) => void
  colors: ReturnType<typeof useThemeColors>
}) {
  const figure = (label: string, cents: number, color?: string) => (
    <YStack flex={1} minWidth={90} gap="$0.5">
      <Text color={colors.textMuted} fontSize="$1" textTransform="uppercase">
        {label}
      </Text>
      <Text color={color ?? colors.text} fontSize="$5" fontWeight="700">
        {formatCents(cents)}
      </Text>
    </YStack>
  )

  return (
    <YStack
      backgroundColor={colors.surface}
      borderRadius="$3"
      borderWidth={1}
      borderColor={colors.border}
      padding="$3"
      gap="$3"
    >
      <XStack gap="$3" flexWrap="wrap">
        {figure('To decide', total.awaitingDecision)}
        {figure('Owed', total.owed, total.owed ? '#e67e22' : undefined)}
        {figure('Paid', total.paid, total.paid ? '#2980b9' : undefined)}
      </XStack>
      <XStack gap="$3" flexWrap="wrap">
        <Legend
          color={KIND_COLORS.internal}
          label={`Team ${formatCents(total.internal)}`}
          colors={colors}
        />
        <Legend
          color={KIND_COLORS.external}
          label={`Outside ${formatCents(total.external)}`}
          colors={colors}
        />
      </XStack>

      {events.length > 0 ? (
        <YStack gap="$1">
          <Text color={colors.textMuted} fontSize="$1" textTransform="uppercase">
            By event
          </Text>
          {events.map((e) => {
            const cost = e.internal + e.external
            const opened = openEvent === e.eventId
            return (
              <Pressable key={e.eventId} onPress={() => onToggleEvent(e.eventId)}>
                <YStack
                  paddingVertical="$2"
                  borderTopWidth={1}
                  borderTopColor={colors.border}
                  gap="$1"
                >
                  <XStack justifyContent="space-between" alignItems="center" gap="$2">
                    <Text
                      color={colors.text}
                      fontSize="$3"
                      fontWeight="600"
                      flex={1}
                      numberOfLines={1}
                    >
                      {e.eventTitle}
                      {e.eventDate ? (
                        <Text color={colors.textMuted} fontSize="$2" fontWeight="400">
                          {` · ${FD(e.eventDate)}`}
                        </Text>
                      ) : null}
                    </Text>
                    <Text color={colors.text} fontSize="$3" fontWeight="700">
                      {formatCents(cost)}
                    </Text>
                  </XStack>
                  {/* How the event's costs split between the team and outside. */}
                  {cost > 0 ? (
                    <XStack
                      height={6}
                      borderRadius={99}
                      overflow="hidden"
                      backgroundColor={colors.background}
                    >
                      <XStack flex={e.internal} backgroundColor={KIND_COLORS.internal} />
                      <XStack flex={e.external} backgroundColor={KIND_COLORS.external} />
                    </XStack>
                  ) : null}
                  {opened ? (
                    <YStack gap="$1" paddingTop="$1">
                      <Line
                        label="Team members"
                        cents={e.internal}
                        colors={colors}
                        color={KIND_COLORS.internal}
                      />
                      <Line
                        label="Outside bills"
                        cents={e.external}
                        colors={colors}
                        color={KIND_COLORS.external}
                      />
                      <Line label="To decide" cents={e.awaitingDecision} colors={colors} />
                      <Line label="Owed" cents={e.owed} colors={colors} />
                      <Line label="Paid" cents={e.paid} colors={colors} />
                      {e.denied ? <Line label="Denied" cents={e.denied} colors={colors} /> : null}
                      <Text color={colors.textMuted} fontSize="$1">
                        {e.count} {e.count === 1 ? 'request' : 'requests'}
                      </Text>
                    </YStack>
                  ) : null}
                </YStack>
              </Pressable>
            )
          })}
        </YStack>
      ) : (
        <Text color={colors.textMuted} fontSize="$2">
          No costs yet. Requests and outside bills are tallied here by event.
        </Text>
      )}
    </YStack>
  )
}

function Legend({
  color,
  label,
  colors,
}: {
  color: string
  label: string
  colors: ReturnType<typeof useThemeColors>
}) {
  return (
    <XStack alignItems="center" gap="$1">
      <XStack width={10} height={10} borderRadius={99} backgroundColor={color} />
      <Text color={colors.text} fontSize="$2">
        {label}
      </Text>
    </XStack>
  )
}

function Line({
  label,
  cents,
  colors,
  color,
}: {
  label: string
  cents: number
  colors: ReturnType<typeof useThemeColors>
  color?: string
}) {
  return (
    <XStack justifyContent="space-between">
      <XStack alignItems="center" gap="$1">
        {color ? <XStack width={8} height={8} borderRadius={99} backgroundColor={color} /> : null}
        <Text color={colors.textMuted} fontSize="$2">
          {label}
        </Text>
      </XStack>
      <Text color={colors.text} fontSize="$2">
        {formatCents(cents)}
      </Text>
    </XStack>
  )
}
