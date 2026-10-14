import { useEffect, useState } from 'react'
import { Pressable } from 'react-native'
import { router } from 'expo-router'
import { YStack, XStack, Text } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useConfigStore } from '@/stores/configStore'
import { useReimbursementsStore } from '@/stores/reimbursementsStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { TaskCard } from '@/components/ui/TaskCard'
import { formatCents } from '@/lib/money'
import { KIND_COLORS, tally } from '@/lib/reimbursementTally'
import type { Task } from '@/types/events'
import { ReimbursementFormModal } from './ReimbursementFormModal'

/**
 * Reimbursements, in a section of Assignments of their own.
 *
 * Everyone sees the requests they asked for here. The Accountant also logs
 * outside bills from here, and has a way into Finance (Admin → Finance), where
 * every cost is tallied by event.
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
  // What the Accountant still has to pay, for the line linking to Finance.
  const owed = tally(requests.filter((r) => r.accountantUid === uid)).owed

  if (!isAccountant && tasks.length === 0) return null

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
          {isAccountant ? (
            <Pressable onPress={() => router.push('/(app)/admin/finance' as never)}>
              <XStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                borderWidth={1}
                borderColor={colors.border}
                padding="$3"
                justifyContent="space-between"
                alignItems="center"
              >
                <YStack flex={1} gap="$0.5">
                  <Text color={colors.text} fontSize="$3" fontWeight="600">
                    Finance
                  </Text>
                  <Text color={colors.textMuted} fontSize="$2">
                    {`Owed ${formatCents(owed)} · costs by event, receipts and invoices`}
                  </Text>
                </YStack>
                <Text color={colors.primary} fontSize="$4">
                  ›
                </Text>
              </XStack>
            </Pressable>
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
