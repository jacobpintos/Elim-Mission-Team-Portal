import { useState } from 'react'
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  Platform,
  KeyboardAvoidingView,
} from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { useThemeColors } from '@/theme/useThemeColors'
import { useAuthStore } from '@/stores/authStore'
import { useConfigStore } from '@/stores/configStore'
import { useUsersStore } from '@/stores/usersStore'
import { useReimbursementsStore } from '@/stores/reimbursementsStore'
import { useUIStore } from '@/stores/uiStore'
import { EventPickerModal } from '@/features/worship/EventPickerModal'
import { parseDollars, formatCents } from '@/lib/money'
import { pickReceipts, uploadReceipt, type PickedReceipt } from '@/lib/receiptUpload'
import { FD } from '@/lib/format'
import { Field, Label } from './fields'

/** Matches MAX_RECEIPTS in functions/src/reimbursements/logic.ts. */
const MAX_RECEIPTS = 10

export interface ReimbursementEvent {
  /** The event document's id — a recurring event's template, not one date of it. */
  id: string
  title: string
  date: string | null
}

interface Row {
  key: string
  description: string
  amount: string
}

const blankRow = (): Row => ({
  key: Math.random().toString(36).slice(2),
  description: '',
  amount: '',
})

interface Props {
  visible: boolean
  onClose: () => void
  /** The event to start with, when the form is opened from one. */
  event?: ReimbursementEvent | null
  /** Told the task that tracks the new request, to show it. */
  onSubmitted?: (taskId: number) => void
}

/**
 * Ask to be paid back for things bought for an event.
 *
 * Each item is typed with what it cost, the event is chosen from the
 * calendar, and at least one photo of a receipt goes with it. The request goes
 * to the Accountant as a task; the person who asked follows it from their own
 * task list.
 */
export function ReimbursementFormModal({ visible, onClose, event, onSubmitted }: Props) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const accountant = useConfigStore((s) => s.accountant)
  const { users } = useUsersStore()
  const submit = useReimbursementsStore((s) => s.submit)
  const toast = useUIStore((s) => s.toast)

  const [chosen, setChosen] = useState<ReimbursementEvent | null>(event ?? null)
  const [picking, setPicking] = useState(false)
  const [rows, setRows] = useState<Row[]>([blankRow()])
  const [receipts, setReceipts] = useState<PickedReceipt[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const accountantName = users.find((u) => u.uid === accountant)?.displayName

  const parsed = rows.map((r) => ({
    description: r.description.trim(),
    amount: parseDollars(r.amount),
  }))
  const filled = parsed.filter((r) => r.description || r.amount !== null)
  const total = filled.reduce((sum, r) => sum + (r.amount ?? 0), 0)

  /** What still stands between the form and sending it, or null. */
  const missing = (() => {
    if (!chosen) return 'Choose the event this was for.'
    if (filled.length === 0) return 'Add what you bought and what it cost.'
    for (const r of filled) {
      if (!r.description) return 'Every item needs a description.'
      if (r.amount === null || r.amount <= 0) return `Enter a cost for “${r.description}”.`
    }
    if (receipts.length === 0) return 'Add a photo of the receipt.'
    return null
  })()

  const reset = () => {
    setChosen(event ?? null)
    setRows([blankRow()])
    setReceipts([])
    setNote('')
    setError(null)
  }

  const close = () => {
    if (sending) return
    reset()
    onClose()
  }

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const addReceipts = async () => {
    try {
      const picked = await pickReceipts(MAX_RECEIPTS - receipts.length)
      setReceipts((rs) => [...rs, ...picked].slice(0, MAX_RECEIPTS))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add those photos.')
    }
  }

  const send = async () => {
    if (missing || !chosen || !profile) return
    setSending(true)
    setError(null)
    try {
      // One at a time: a phone on a weak connection sending ten photos at once
      // fails all of them rather than most.
      const paths: string[] = []
      for (const r of receipts) paths.push(await uploadReceipt(profile.uid, r))
      const res = await submit({
        eventId: chosen.id,
        eventDate: chosen.date,
        items: filled.map((r) => ({ description: r.description, amount: r.amount ?? 0 })),
        receipts: paths,
        note: note.trim(),
      })
      toast(`Sent to ${accountantName ?? 'the Accountant'}`, 'success')
      reset()
      onClose()
      onSubmitted?.(res.taskId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <FullScreenOverlay visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.overlay}>
          <YStack
            backgroundColor={colors.surface}
            borderRadius="$4"
            padding="$4"
            gap="$3"
            width="92%"
            maxWidth={560}
            maxHeight="92%"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={colors.text} fontSize="$5" fontWeight="700">
                Request reimbursement
              </Text>
              <Pressable onPress={close} accessibilityLabel="Close">
                <Text color={colors.textMuted} fontSize="$4">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <YStack gap="$3">
                <YStack gap="$1">
                  <Label>EVENT *</Label>
                  <Pressable onPress={() => setPicking(true)}>
                    <XStack
                      borderWidth={1}
                      borderColor={colors.border}
                      borderRadius="$2"
                      padding="$3"
                      backgroundColor={colors.background}
                    >
                      <Text color={chosen ? colors.text : colors.textMuted} fontSize="$3">
                        {chosen
                          ? `${chosen.title}${chosen.date ? ` · ${FD(chosen.date)}` : ''}`
                          : 'Choose from the calendar'}
                      </Text>
                    </XStack>
                  </Pressable>
                </YStack>

                <YStack gap="$2">
                  <Label>WHAT YOU BOUGHT *</Label>
                  {rows.map((r) => (
                    <XStack key={r.key} gap="$2" alignItems="center">
                      <YStack flex={3}>
                        <Field
                          value={r.description}
                          onChangeText={(v) => updateRow(r.key, { description: v })}
                          placeholder="Item"
                          maxLength={200}
                        />
                      </YStack>
                      <YStack flex={2}>
                        <Field
                          value={r.amount}
                          onChangeText={(v) => updateRow(r.key, { amount: v })}
                          placeholder="$0.00"
                          keyboardType="decimal-pad"
                          maxLength={12}
                        />
                      </YStack>
                      {rows.length > 1 ? (
                        <Pressable
                          onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                          accessibilityLabel="Remove item"
                        >
                          <Text color={colors.textMuted} fontSize="$4">
                            ✕
                          </Text>
                        </Pressable>
                      ) : null}
                    </XStack>
                  ))}
                  <XStack justifyContent="space-between" alignItems="center">
                    <Pressable onPress={() => setRows((rs) => [...rs, blankRow()])}>
                      <Text color={colors.primary} fontSize="$3">
                        + Add item
                      </Text>
                    </Pressable>
                    <Text color={colors.text} fontSize="$4" fontWeight="700">
                      Total {formatCents(total)}
                    </Text>
                  </XStack>
                </YStack>

                <YStack gap="$2">
                  <Label>{`RECEIPTS * (${receipts.length}/${MAX_RECEIPTS})`}</Label>
                  <XStack gap="$2" flexWrap="wrap">
                    {receipts.map((r, i) => (
                      <YStack key={`${r.uri}_${i}`} gap="$1" alignItems="center">
                        <Image source={{ uri: r.uri }} style={styles.thumb} resizeMode="cover" />
                        <Pressable
                          onPress={() => setReceipts((rs) => rs.filter((_, j) => j !== i))}
                        >
                          <Text color="#c0392b" fontSize="$1">
                            Remove
                          </Text>
                        </Pressable>
                      </YStack>
                    ))}
                    {receipts.length < MAX_RECEIPTS ? (
                      <Pressable onPress={addReceipts}>
                        <YStack
                          style={styles.thumb}
                          borderWidth={1}
                          borderStyle="dashed"
                          borderColor={colors.border}
                          alignItems="center"
                          justifyContent="center"
                        >
                          <Text color={colors.textMuted} fontSize="$2" textAlign="center">
                            📷{'\n'}Add photo
                          </Text>
                        </YStack>
                      </Pressable>
                    ) : null}
                  </XStack>
                </YStack>

                <Field
                  label="NOTE (optional)"
                  value={note}
                  onChangeText={setNote}
                  placeholder="Anything the Accountant should know"
                  multiline
                  maxLength={1000}
                />

                <Text color={colors.textMuted} fontSize="$2">
                  {accountantName
                    ? `This goes to ${accountantName}, the Accountant. You can follow it on your Assignments.`
                    : 'This goes to the Accountant. You can follow it on your Assignments.'}
                </Text>

                {error ? (
                  <Text color="#c0392b" fontSize="$2">
                    {error}
                  </Text>
                ) : null}

                <Pressable onPress={send} disabled={!!missing || sending}>
                  <XStack
                    backgroundColor={colors.primary}
                    borderRadius="$2"
                    paddingVertical="$3"
                    justifyContent="center"
                    opacity={missing || sending ? 0.5 : 1}
                  >
                    <Text color="white" fontWeight="700" fontSize="$3">
                      {sending ? 'Sending…' : `Send request for ${formatCents(total)}`}
                    </Text>
                  </XStack>
                </Pressable>
                {missing && !sending ? (
                  <Text color={colors.textMuted} fontSize="$2" textAlign="center">
                    {missing}
                  </Text>
                ) : null}
              </YStack>
            </ScrollView>
          </YStack>
        </View>
      </KeyboardAvoidingView>

      <EventPickerModal
        visible={picking}
        onClose={() => setPicking(false)}
        onSelect={(ev) => {
          setChosen({ id: String(ev.templateId ?? ev.id), title: ev.title, date: ev.date })
          setPicking(false)
        }}
      />
    </FullScreenOverlay>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
})
