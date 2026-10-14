import { useEffect, useState } from 'react'
import { Pressable, ScrollView, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text, Spinner } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useConfigStore } from '@/stores/configStore'
import { useReimbursementsStore } from '@/stores/reimbursementsStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { formatCents } from '@/lib/money'
import { FD } from '@/lib/format'
import { displayToIso, isoToDisplay } from '@/lib/eventDates'
import { saveTextFile } from '@/lib/saveTextFile'
import { reimbursementsCsv } from '@/lib/dataExport'
import {
  KIND_COLORS,
  kindOf,
  tally,
  tallyByEvent,
  filterForFinance,
  costDate,
  type Tally,
} from '@/lib/reimbursementTally'
import { maskDate } from '@/features/reimbursements/fields'
import { ReceiptThumbs } from '@/features/reimbursements/ReceiptThumbs'
import type { Reimbursement, ReimbursementStatus } from '@/types/reimbursement'

type Colors = ReturnType<typeof useThemeColors>

const STATUS_LABEL: Record<ReimbursementStatus, string> = {
  submitted: 'To decide',
  approved: 'Approved',
  partial: 'Partly approved',
  denied: 'Denied',
  paid: 'Paid',
}

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Admin → Finance: what every event cost, for the Accountant.
 *
 * Search events by name and choose a date range; the events that match are
 * reported together — what they cost combined, and what is still to decide,
 * owed and paid — and each one opens to its own costs, with the receipts and
 * invoices that came with them.
 *
 * The Accountant's alone. The numbers come from the requests sent to them,
 * which the rules let nobody else read, and anyone else who reaches this
 * screen is told so rather than shown an empty tally that looks like nothing
 * was spent.
 */
export default function AdminFinance() {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''
  const accountant = useConfigStore((s) => s.accountant)
  const configLoading = useConfigStore((s) => s.loading)
  const { subscribe: subConfig, unsubscribe: unsubConfig } = useConfigStore()
  const { subscribe, unsubscribe } = useReimbursementsStore()
  const requests = useReimbursementsStore((s) => s.requests)
  const loading = useReimbursementsStore((s) => s.loading)

  const [query, setQuery] = useState('')
  const [from, setFrom] = useState(() => isoToDisplay(`${new Date().getFullYear()}-01-01`))
  const [to, setTo] = useState('')
  const [openEvent, setOpenEvent] = useState<string | null>(null)

  useEffect(() => {
    subConfig()
    subscribe()
    return () => {
      unsubConfig()
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isAccountant = !!uid && accountant === uid

  if (!isAccountant) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$4" gap="$2">
        <ScreenTitle options={{ title: 'Finance', headerShown: false }} />
        {configLoading ? (
          <Spinner size="large" />
        ) : (
          <>
            <Text color={colors.text} fontSize="$5" fontWeight="700">
              Finance
            </Text>
            <Text color={colors.textMuted} fontSize="$3" textAlign="center" maxWidth={420}>
              Only the Accountant can open Finance. The Accountant is chosen in Admin → Leadership.
            </Text>
          </>
        )}
      </YStack>
    )
  }

  const fromIso = displayToIso(from)
  const toIso = displayToIso(to)
  const mine = requests.filter((r) => r.accountantUid === uid)
  const shown = filterForFinance(mine, { query, from: fromIso, to: toIso })
  const total = tally(shown)
  const events = tallyByEvent(shown)

  const preset = (label: string, f: string, t: string) => {
    const active = fromIso === f && toIso === t
    return (
      <Pressable
        key={label}
        onPress={() => {
          setFrom(f ? isoToDisplay(f) : '')
          setTo(t ? isoToDisplay(t) : '')
        }}
      >
        <XStack
          paddingHorizontal="$3"
          paddingVertical="$1"
          borderRadius={99}
          borderWidth={1}
          borderColor={active ? colors.primary : colors.border}
          backgroundColor={active ? colors.primary : 'transparent'}
        >
          <Text color={active ? 'white' : colors.text} fontSize="$2">
            {label}
          </Text>
        </XStack>
      </Pressable>
    )
  }
  const now = new Date()
  const year = now.getFullYear()
  const yearAgo = new Date(now)
  yearAgo.setFullYear(year - 1)

  const download = async () => {
    try {
      const day = localIso(now)
      await saveTextFile(`finance-${day}.csv`, reimbursementsCsv(shown), 'text/csv')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not build that file.', 'error')
    }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <ScreenTitle options={{ title: 'Finance', headerShown: false }} />
      <YStack padding="$4" gap="$3" maxWidth={820} width="100%">
        <Text color={colors.text} fontSize="$6" fontWeight="700">
          Finance
        </Text>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search events by name"
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        />

        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          <DateBox label="From" value={from} onChange={setFrom} colors={colors} />
          <DateBox label="To" value={to} onChange={setTo} colors={colors} />
        </XStack>
        <XStack gap="$2" flexWrap="wrap">
          {preset('This year', `${year}-01-01`, '')}
          {preset('Last 12 months', localIso(yearAgo), localIso(now))}
          {preset(`${year - 1}`, `${year - 1}-01-01`, `${year - 1}-12-31`)}
          {preset('All time', '', '')}
        </XStack>

        {loading && requests.length === 0 ? (
          <Spinner size="large" />
        ) : (
          <>
            <Summary total={total} events={events.length} colors={colors} />

            <XStack justifyContent="space-between" alignItems="center">
              <Text color={colors.text} fontSize="$4" fontWeight="700">
                Events
              </Text>
              {shown.length > 0 ? (
                <Pressable onPress={download}>
                  <Text color={colors.primary} fontSize="$2" fontWeight="600">
                    Download as CSV
                  </Text>
                </Pressable>
              ) : null}
            </XStack>

            {events.length === 0 ? (
              <Text color={colors.textMuted} fontSize="$3">
                No costs recorded for events matching this search and dates.
              </Text>
            ) : null}

            {events.map((e) => {
              const cost = e.internal + e.external
              const opened = openEvent === e.eventId
              return (
                <YStack
                  key={e.eventId}
                  backgroundColor={colors.surface}
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor={opened ? colors.primary : colors.border}
                  overflow="hidden"
                >
                  <Pressable onPress={() => setOpenEvent(opened ? null : e.eventId)}>
                    <YStack padding="$3" gap="$2">
                      <XStack justifyContent="space-between" alignItems="center" gap="$2">
                        <YStack flex={1}>
                          <Text
                            color={colors.text}
                            fontSize="$4"
                            fontWeight="600"
                            numberOfLines={1}
                          >
                            {e.eventTitle}
                          </Text>
                          <Text color={colors.textMuted} fontSize="$2">
                            {e.eventDate ? `${FD(e.eventDate)} · ` : ''}
                            {e.count} {e.count === 1 ? 'cost' : 'costs'}
                          </Text>
                        </YStack>
                        <Text color={colors.text} fontSize="$5" fontWeight="700">
                          {formatCents(cost)}
                        </Text>
                        <Text color={colors.textMuted}>{opened ? '▾' : '▸'}</Text>
                      </XStack>
                      {cost > 0 ? (
                        <SplitBar internal={e.internal} external={e.external} colors={colors} />
                      ) : null}
                    </YStack>
                  </Pressable>

                  {opened ? (
                    <YStack padding="$3" paddingTop={0} gap="$3">
                      <YStack gap="$1">
                        <Line
                          label="Team members"
                          cents={e.internal}
                          color={KIND_COLORS.internal}
                          colors={colors}
                        />
                        <Line
                          label="Outside bills"
                          cents={e.external}
                          color={KIND_COLORS.external}
                          colors={colors}
                        />
                        <Line label="To decide" cents={e.awaitingDecision} colors={colors} />
                        <Line label="Owed" cents={e.owed} colors={colors} />
                        <Line label="Paid" cents={e.paid} colors={colors} />
                        {e.denied ? <Line label="Denied" cents={e.denied} colors={colors} /> : null}
                      </YStack>
                      {[...e.requests]
                        .sort(
                          (a, b) =>
                            costDate(a).localeCompare(costDate(b)) || a.createdAt - b.createdAt
                        )
                        .map((r) => (
                          <FinanceCard key={r.id} r={r} colors={colors} />
                        ))}
                    </YStack>
                  ) : null}
                </YStack>
              )
            })}
          </>
        )}
      </YStack>
    </ScrollView>
  )
}

function DateBox({
  label,
  value,
  onChange,
  colors,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  colors: Colors
}) {
  return (
    <XStack alignItems="center" gap="$2">
      <Text color={colors.textMuted} fontSize="$2">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(maskDate(v))}
        placeholder="MM/DD/YY"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={8}
        style={[
          styles.input,
          styles.date,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
        ]}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} accessibilityLabel={`Clear ${label}`}>
          <Text color={colors.textMuted}>✕</Text>
        </Pressable>
      ) : null}
    </XStack>
  )
}

/** Everything matching, combined. */
function Summary({ total, events, colors }: { total: Tally; events: number; colors: Colors }) {
  const cost = total.internal + total.external
  const figure = (label: string, cents: number, color?: string) => (
    <YStack flex={1} minWidth={110} gap="$0.5">
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
      <Text color={colors.textMuted} fontSize="$2">
        {events === 1 ? 'Combined · 1 event' : `Combined · ${events} events`}
      </Text>
      <XStack gap="$3" flexWrap="wrap">
        {figure('Total cost', cost)}
        {figure('To decide', total.awaitingDecision)}
        {figure('Owed', total.owed, total.owed ? '#e67e22' : undefined)}
        {figure('Paid', total.paid, total.paid ? '#2980b9' : undefined)}
      </XStack>
      {cost > 0 ? (
        <SplitBar internal={total.internal} external={total.external} colors={colors} />
      ) : null}
      <XStack gap="$3" flexWrap="wrap">
        <Legend
          color={KIND_COLORS.internal}
          label={`Team members ${formatCents(total.internal)}`}
          colors={colors}
        />
        <Legend
          color={KIND_COLORS.external}
          label={`Outside bills ${formatCents(total.external)}`}
          colors={colors}
        />
      </XStack>
    </YStack>
  )
}

/** One request or outside bill, with its receipts or invoice. */
function FinanceCard({ r, colors }: { r: Reimbursement; colors: Colors }) {
  const kind = kindOf(r)
  const external = kind === 'external'
  const amount =
    r.status === 'submitted' || r.status === 'denied' ? r.total : (r.approvedAmount ?? r.total)
  return (
    <YStack
      borderRadius="$2"
      borderWidth={1}
      borderColor={colors.border}
      borderLeftWidth={5}
      borderLeftColor={KIND_COLORS[kind]}
      padding="$3"
      gap="$2"
      backgroundColor={colors.background}
    >
      <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
        <YStack flex={1} gap="$0.5">
          <Text color={colors.text} fontSize="$3" fontWeight="600">
            {external ? `Owed to ${r.payee ?? r.submitterName}` : r.submitterName}
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            {external ? 'Outside bill' : 'Team member'} · {STATUS_LABEL[r.status]}
            {r.status === 'paid' && r.paidAt
              ? ` ${FD(new Date(r.paidAt).toISOString().slice(0, 10))}`
              : r.payBy && r.status !== 'denied'
                ? ` · due ${FD(r.payBy)}`
                : ''}
          </Text>
        </YStack>
        <YStack alignItems="flex-end">
          <Text color={colors.text} fontSize="$4" fontWeight="700">
            {formatCents(amount)}
          </Text>
          {r.status === 'partial' ? (
            <Text color={colors.textMuted} fontSize="$1">
              of {formatCents(r.total)} asked
            </Text>
          ) : null}
        </YStack>
      </XStack>
      {r.items.map((it, i) => (
        <XStack key={i} justifyContent="space-between" gap="$2">
          <Text color={colors.textMuted} fontSize="$2" flex={1}>
            {it.description}
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            {formatCents(it.amount)}
          </Text>
        </XStack>
      ))}
      {r.reason ? (
        <Text color={colors.textMuted} fontSize="$2">
          {r.reason}
        </Text>
      ) : null}
      {r.note ? (
        <Text color={colors.textMuted} fontSize="$2">
          Note: {r.note}
        </Text>
      ) : null}
      <ReceiptThumbs
        paths={r.receipts}
        label={external ? 'Invoice' : 'Receipts'}
        removedAt={r.receiptsRemovedAt}
      />
    </YStack>
  )
}

/** How a cost splits between team members and outside bills. */
function SplitBar({
  internal,
  external,
  colors,
}: {
  internal: number
  external: number
  colors: Colors
}) {
  return (
    <XStack height={6} borderRadius={99} overflow="hidden" backgroundColor={colors.background}>
      <XStack flex={internal} backgroundColor={KIND_COLORS.internal} />
      <XStack flex={external} backgroundColor={KIND_COLORS.external} />
    </XStack>
  )
}

function Legend({ color, label, colors }: { color: string; label: string; colors: Colors }) {
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
  colors: Colors
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

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  date: {
    width: 110,
  },
})
