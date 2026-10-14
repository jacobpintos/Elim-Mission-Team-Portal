import { useEffect, useState } from 'react'
import { Image, Linking, Pressable, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useReimbursementsStore } from '@/stores/reimbursementsStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { formatCents, parseDollars } from '@/lib/money'
import { receiptUrl, isPdf } from '@/lib/receiptUpload'
import { KIND_COLORS, kindOf } from '@/lib/reimbursementTally'
import { displayToIso } from '@/lib/eventDates'
import { FD } from '@/lib/format'
import type { Task } from '@/types/events'
import type { Reimbursement, ReimbursementStatus } from '@/types/reimbursement'
import { Field, maskDate } from './fields'

const STATUS: Record<ReimbursementStatus, { label: string; color: string }> = {
  submitted: { label: 'Waiting for a decision', color: '#7f8c8d' },
  approved: { label: 'Approved', color: '#27ae60' },
  partial: { label: 'Partly approved', color: '#e67e22' },
  denied: { label: 'Denied', color: '#c0392b' },
  paid: { label: 'Paid', color: '#2980b9' },
}

type Form = null | 'approve' | 'partial' | 'deny' | 'move' | 'paid'

/**
 * The reimbursement request behind a task, and every step taken on it.
 *
 * Shown inside the task, like a meeting request, because the task is where
 * both people look: the Accountant answers it here, and the person who asked
 * follows it here and answers a request to move the pay date.
 *
 * Renders nothing when the request cannot be read — an admin looking at
 * someone else's task sees the task without it.
 */
export function ReimbursementPanel({ task }: { task: Task }) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const toast = useUIStore((s) => s.toast)
  const { subscribe, unsubscribe } = useReimbursementsStore()
  const request = useReimbursementsStore((s) => s.byId(task.reimbursementId))

  useEffect(() => {
    subscribe()
    return unsubscribe
  }, [subscribe, unsubscribe])

  if (!request || !profile) return null
  return (
    <Details
      r={request}
      isAccountant={request.accountantUid === profile.uid}
      isSubmitter={request.submitterUid === profile.uid}
      colors={colors}
      toast={toast}
    />
  )
}

function Details({
  r,
  isAccountant,
  isSubmitter,
  colors,
  toast,
}: {
  r: Reimbursement
  isAccountant: boolean
  isSubmitter: boolean
  colors: ReturnType<typeof useThemeColors>
  toast: (msg: string, kind?: 'success' | 'error' | 'info') => void
}) {
  const store = useReimbursementsStore()
  const [form, setForm] = useState<Form>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [urls, setUrls] = useState<string[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // Links are asked for when the panel is shown, not stored: see receiptUpload.
  useEffect(() => {
    let live = true
    Promise.all(r.receipts.map((p) => receiptUrl(p).catch(() => '')))
      .then((u) => live && setUrls(u))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [r.receipts])

  const status = STATUS[r.status]
  // An outside bill: owed to someone with no account, so nobody to ask or tell.
  const external = kindOf(r) === 'external'
  const awaitingPayment = r.status === 'approved' || r.status === 'partial'

  const startForm = (f: Form) => {
    setForm(f)
    setAmount('')
    setReason('')
    setDate('')
  }

  /** Run a step, say how it went, and close the form if it worked. */
  const run = async (step: () => Promise<void>, done: string) => {
    setBusy(true)
    try {
      await step()
      toast(done, 'success')
      setForm(null)
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'That did not go through. Please try again.',
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  const iso = displayToIso(date)

  const submitForm = () => {
    if (form === 'approve') {
      return run(() => store.decide({ id: r.id, decision: 'approve', payBy: iso }), 'Approved')
    }
    if (form === 'partial') {
      return run(
        () =>
          store.decide({
            id: r.id,
            decision: 'partial',
            approvedAmount: parseDollars(amount) ?? 0,
            reason: reason.trim(),
            payBy: iso,
          }),
        'Partly approved'
      )
    }
    if (form === 'deny') {
      return run(
        () => store.decide({ id: r.id, decision: 'deny', reason: reason.trim() }),
        'Denied'
      )
    }
    if (form === 'move') {
      return run(
        () => store.requestPayDateChange(r.id, iso, reason.trim()),
        external ? 'Due date moved' : `Asked ${r.submitterName}`
      )
    }
    if (form === 'paid') {
      return run(() => store.markPaid(r.id, reason.trim()), 'Marked paid')
    }
  }

  /** What the open form still needs, or null when it can be sent. */
  const formMissing = (() => {
    if (form === 'approve') return iso ? null : 'Pay-by date'
    if (form === 'partial') {
      const cents = parseDollars(amount)
      if (cents === null || cents <= 0) return 'Amount approved'
      if (cents >= r.total) return `Less than ${formatCents(r.total)}`
      if (!reason.trim()) return 'Why the rest was not approved'
      return iso ? null : 'Pay-by date'
    }
    if (form === 'deny') return reason.trim() ? null : 'Why it was denied'
    if (form === 'move') {
      if (!iso) return 'New date'
      return external || reason.trim() ? null : 'Why it needs to move'
    }
    return null
  })()

  const row = (label: string, value: string, color?: string) => (
    <YStack gap="$0.5">
      <Text color={colors.textMuted} fontSize="$1" textTransform="uppercase">
        {label}
      </Text>
      <Text color={color ?? colors.text} fontSize="$3">
        {value}
      </Text>
    </YStack>
  )

  const button = (label: string, onPress: () => void, color = colors.primary, outline = false) => (
    <Pressable onPress={onPress} disabled={busy}>
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderRadius="$2"
        backgroundColor={outline ? 'transparent' : color}
        borderWidth={outline ? 1 : 0}
        borderColor={color}
        opacity={busy ? 0.5 : 1}
      >
        <Text color={outline ? color : 'white'} fontSize="$2" fontWeight="700">
          {label}
        </Text>
      </XStack>
    </Pressable>
  )

  return (
    <YStack padding="$3" gap="$2" borderTopWidth={1} borderTopColor={colors.border}>
      <XStack alignItems="center" gap="$2" flexWrap="wrap">
        <XStack
          backgroundColor={status.color}
          borderRadius={99}
          paddingHorizontal="$2"
          paddingVertical={2}
        >
          <Text color="white" fontSize={11} fontWeight="700">
            {status.label}
          </Text>
        </XStack>
        <XStack
          borderRadius={99}
          paddingHorizontal="$2"
          paddingVertical={2}
          borderWidth={1}
          borderColor={KIND_COLORS[kindOf(r)]}
        >
          <Text color={KIND_COLORS[kindOf(r)]} fontSize={11} fontWeight="700">
            {external ? 'External' : 'Internal'}
          </Text>
        </XStack>
        <Text color={colors.textMuted} fontSize="$2">
          {external
            ? `Owed to ${r.payee ?? r.submitterName}`
            : isSubmitter
              ? `Sent to ${r.accountantName}`
              : `From ${r.submitterName}`}
        </Text>
      </XStack>

      {row('Event', `${r.eventTitle}${r.eventDate ? ` · ${FD(r.eventDate)}` : ''}`)}

      <YStack gap="$1">
        <Text color={colors.textMuted} fontSize="$1" textTransform="uppercase">
          Items
        </Text>
        {r.items.map((it, i) => (
          <XStack key={i} justifyContent="space-between" gap="$2">
            <Text color={colors.text} fontSize="$3" flex={1}>
              {it.description}
            </Text>
            <Text color={colors.text} fontSize="$3">
              {formatCents(it.amount)}
            </Text>
          </XStack>
        ))}
        <XStack
          justifyContent="space-between"
          borderTopWidth={1}
          borderTopColor={colors.border}
          paddingTop="$1"
        >
          <Text color={colors.text} fontSize="$3" fontWeight="700">
            {external ? 'Total owed' : 'Total asked'}
          </Text>
          <Text color={colors.text} fontSize="$3" fontWeight="700">
            {formatCents(r.total)}
          </Text>
        </XStack>
      </YStack>

      {r.approvedAmount !== null && r.status !== 'denied' && !external
        ? row('Approved', formatCents(r.approvedAmount), STATUS[r.status].color)
        : null}
      {r.reason
        ? row(
            r.status === 'denied'
              ? 'Why it was denied'
              : r.status === 'partial'
                ? 'Why not the rest'
                : 'Note from the Accountant',
            r.reason
          )
        : null}
      {r.payBy && r.status !== 'paid'
        ? row(external ? 'Due by' : 'To be paid by', FD(r.payBy))
        : null}
      {r.note ? row('Note', r.note) : null}

      {r.receipts.length > 0 ? (
        <YStack gap="$1">
          <Text color={colors.textMuted} fontSize="$1" textTransform="uppercase">
            {external ? 'Invoice' : 'Receipts'}
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            {r.receipts.map((p, i) =>
              urls[i] ? (
                <Pressable
                  key={p}
                  // A PDF opens in the browser or a viewer; a photo in the lightbox.
                  onPress={() => (isPdf(p) ? void Linking.openURL(urls[i]) : setOpen(urls[i]))}
                  accessibilityLabel={`${external ? 'Invoice' : 'Receipt'} ${i + 1}`}
                >
                  {isPdf(p) ? (
                    <YStack
                      style={styles.thumb}
                      backgroundColor={colors.background}
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text color={colors.primary} fontSize="$2" fontWeight="600">
                        PDF
                      </Text>
                    </YStack>
                  ) : (
                    <Image source={{ uri: urls[i] }} style={styles.thumb} resizeMode="cover" />
                  )}
                </Pressable>
              ) : (
                <YStack key={p} style={styles.thumb} backgroundColor={colors.background} />
              )
            )}
          </XStack>
        </YStack>
      ) : null}

      {/* A date change waiting on the person who asked. */}
      {r.dateChange ? (
        <YStack gap="$2" padding="$2" borderRadius="$2" backgroundColor={colors.background}>
          <Text color={colors.text} fontSize="$3">
            {isSubmitter
              ? `${r.accountantName} asked to move the pay-by date from ${FD(r.payBy)} to ${FD(r.dateChange.proposed)}.`
              : `Waiting for ${r.submitterName} to answer moving the pay-by date to ${FD(r.dateChange.proposed)}.`}
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            {r.dateChange.reason}
          </Text>
          {isSubmitter ? (
            <XStack gap="$2">
              {button('Accept new date', () =>
                run(() => store.answerPayDateChange(r.id, true), 'New date accepted')
              )}
              {button(
                'Keep current date',
                () => run(() => store.answerPayDateChange(r.id, false), 'Kept the current date'),
                colors.primary,
                true
              )}
            </XStack>
          ) : null}
        </YStack>
      ) : null}

      {/* The Accountant's steps. */}
      {isAccountant && !form && r.status === 'submitted' ? (
        <XStack gap="$2" flexWrap="wrap">
          {button('Approve', () => startForm('approve'), STATUS.approved.color)}
          {button('Partly approve', () => startForm('partial'), STATUS.partial.color)}
          {button('Deny', () => startForm('deny'), STATUS.denied.color)}
        </XStack>
      ) : null}
      {isAccountant && !form && awaitingPayment ? (
        <XStack gap="$2" flexWrap="wrap">
          {button('Mark paid', () => startForm('paid'), STATUS.paid.color)}
          {!r.dateChange
            ? button(
                external ? 'Change due date' : 'Ask to move pay date',
                () => startForm('move'),
                colors.primary,
                true
              )
            : null}
        </XStack>
      ) : null}

      {form ? (
        <YStack gap="$2" padding="$2" borderRadius="$2" backgroundColor={colors.background}>
          {form === 'partial' ? (
            <Field
              label={`AMOUNT APPROVED (of ${formatCents(r.total)})`}
              value={amount}
              onChangeText={setAmount}
              placeholder="$0.00"
              keyboardType="decimal-pad"
              maxLength={12}
            />
          ) : null}
          {form === 'partial' || form === 'deny' || form === 'move' || form === 'paid' ? (
            <Field
              label={
                form === 'partial'
                  ? 'WHY THE REST WAS NOT APPROVED'
                  : form === 'deny'
                    ? 'WHY IT WAS DENIED'
                    : form === 'move'
                      ? external
                        ? 'WHY (optional)'
                        : 'WHY THE DATE NEEDS TO MOVE'
                      : external
                        ? 'NOTE (optional)'
                        : 'NOTE FOR ' + r.submitterName.toUpperCase() + ' (optional)'
              }
              value={reason}
              onChangeText={setReason}
              placeholder={form === 'paid' ? 'e.g. Sent by check' : ''}
              multiline
              maxLength={1000}
            />
          ) : null}
          {form === 'approve' || form === 'partial' || form === 'move' ? (
            <Field
              label={
                form === 'move'
                  ? external
                    ? 'NEW DUE DATE (MM/DD/YY)'
                    : 'NEW PAY-BY DATE (MM/DD/YY)'
                  : 'PAY BY (MM/DD/YY)'
              }
              value={date}
              onChangeText={(v) => setDate(maskDate(v))}
              placeholder="MM/DD/YY"
              keyboardType="number-pad"
              maxLength={8}
            />
          ) : null}
          {form === 'paid' ? (
            <Text color={colors.textMuted} fontSize="$2">
              {external
                ? `Records ${formatCents(r.approvedAmount ?? r.total)} paid to ${r.payee ?? r.submitterName} and completes the task.`
                : `Completes the task and tells ${r.submitterName} that ${formatCents(r.approvedAmount ?? r.total)} was paid, with a message.`}
            </Text>
          ) : null}
          <XStack gap="$2" alignItems="center">
            {button(
              busy
                ? 'Saving…'
                : form === 'approve'
                  ? `Approve ${formatCents(r.total)}`
                  : form === 'partial'
                    ? 'Partly approve'
                    : form === 'deny'
                      ? 'Deny'
                      : form === 'move'
                        ? external
                          ? 'Move due date'
                          : `Ask ${r.submitterName}`
                        : 'Mark paid',
              () => {
                if (!formMissing) void submitForm()
              },
              formMissing ? colors.textMuted : colors.primary
            )}
            {button('Cancel', () => setForm(null), colors.textMuted, true)}
          </XStack>
          {formMissing ? (
            <Text color={colors.textMuted} fontSize="$2">
              Still needed: {formMissing}
            </Text>
          ) : null}
        </YStack>
      ) : null}

      {r.history && r.history.length > 0 ? (
        <YStack gap="$1">
          <Pressable onPress={() => setShowHistory((s) => !s)}>
            <Text color={colors.primary} fontSize="$2">
              {showHistory ? 'Hide history ▾' : `History (${r.history.length}) ▸`}
            </Text>
          </Pressable>
          {showHistory
            ? r.history.map((h, i) => (
                <Text key={i} color={colors.textMuted} fontSize="$2">
                  {new Date(h.at).toLocaleDateString()} · {h.text}
                </Text>
              ))
            : null}
        </YStack>
      ) : null}

      {open ? (
        <ImageLightbox key={open} uri={open} onClose={() => setOpen(null)} name="receipt" />
      ) : null}
    </YStack>
  )
}

const styles = StyleSheet.create({
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 6,
  },
})
