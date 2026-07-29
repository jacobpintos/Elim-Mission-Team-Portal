import { useState } from 'react'
import { Pressable, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { confirmAsync } from '@/lib/confirm'
import { REPORT_REASONS, reportMessage, blockUser, type ReportReason } from '@/lib/moderation'
import { MODERATION_SLA_HOURS } from '@/lib/orgInfo'
import type { Message } from '@/types/events'

interface MessageActionsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  message: Message | null
  roomId: string
  viewerUid: string
  authorName?: string
}

/**
 * Report-or-block menu shown on any message the viewer did not write.
 *
 * App Store Review Guideline 1.2 requires both mechanisms to be available to
 * every user of an app with user-generated content — not just to moderators.
 */
export function MessageActionsSheet({
  open,
  onOpenChange,
  message,
  roomId,
  viewerUid,
  authorName,
}: MessageActionsSheetProps) {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const [mode, setMode] = useState<'menu' | 'report'>('menu')
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const close = () => {
    onOpenChange(false)
    setMode('menu')
    setReason(null)
    setDetails('')
  }

  const handleSubmitReport = async () => {
    if (!message || !reason) return
    setSubmitting(true)
    try {
      await reportMessage({
        roomId,
        messageId: `${message.ts}_${message.uid}`,
        messageText: message.text ?? '',
        attachment: message.attachment ?? null,
        messageTs: message.ts,
        authorUid: String(message.uid),
        reason,
        details: details.trim(),
      })
      toast(`Report sent. We review reports within ${MODERATION_SLA_HOURS} hours.`, 'success')
      close()

      // Reporting hides only the message reported, not everything from its
      // author — an easy thing to misread when the reported message was the
      // only one they had sent. Offer the block explicitly rather than leaving
      // someone to assume it happened.
      const alsoBlock = await confirmAsync(
        `Your report has been sent. Do you also want to block ${authorName ?? 'this person'}? That hides all of their messages from you, not just this one.`,
        { title: 'Block them as well?', confirmLabel: 'Block', cancelLabel: 'Not now' }
      )
      if (alsoBlock) {
        try {
          await blockUser(viewerUid, String(message.uid))
          toast(`${authorName ?? 'User'} blocked`, 'success')
        } catch {
          toast('Failed to block user', 'error')
        }
      }
    } catch {
      toast('Failed to send report', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBlock = async () => {
    if (!message) return
    const ok = await confirmAsync(
      `Block ${authorName ?? 'this user'}? You will stop seeing their messages everywhere in the app.`,
      { title: 'Block user', confirmLabel: 'Block', destructive: true }
    )
    if (!ok) return
    setSubmitting(true)
    try {
      await blockUser(viewerUid, String(message.uid))
      toast(`${authorName ?? 'User'} blocked`, 'success')
      close()
    } catch {
      toast('Failed to block user', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      {mode === 'menu' ? (
        <YStack gap="$2" paddingVertical="$2">
          <Text color={colors.textMuted} fontSize="$2" marginBottom="$1">
            {authorName ? `Message from ${authorName}` : 'Message'}
          </Text>

          <Pressable onPress={() => setMode('report')}>
            <XStack paddingVertical="$3" alignItems="center" gap="$3">
              <Text fontSize="$5">🚩</Text>
              <YStack flex={1}>
                <Text color={colors.text} fontWeight="600" fontSize="$4">
                  Report message
                </Text>
                <Text color={colors.textMuted} fontSize="$2">
                  Flag this for review and hide it from your view
                </Text>
              </YStack>
            </XStack>
          </Pressable>

          <Pressable onPress={handleBlock} disabled={submitting}>
            <XStack paddingVertical="$3" alignItems="center" gap="$3">
              <Text fontSize="$5">🚫</Text>
              <YStack flex={1}>
                <Text color="#c0392b" fontWeight="600" fontSize="$4">
                  Block {authorName ?? 'this user'}
                </Text>
                <Text color={colors.textMuted} fontSize="$2">
                  Hide all of their messages from you
                </Text>
              </YStack>
            </XStack>
          </Pressable>

          <Pressable onPress={close}>
            <XStack paddingVertical="$3" justifyContent="center">
              <Text color={colors.textMuted} fontSize="$4">
                Cancel
              </Text>
            </XStack>
          </Pressable>
        </YStack>
      ) : (
        <YStack gap="$3" paddingVertical="$2">
          <Text color={colors.text} fontWeight="700" fontSize="$5">
            Report message
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            Tell us what is wrong with this message. Reports are reviewed within{' '}
            {MODERATION_SLA_HOURS} hours and the message is hidden from you straight away.
          </Text>

          <YStack gap="$1.5">
            {REPORT_REASONS.map((r) => (
              <Pressable key={r} onPress={() => setReason(r)}>
                <XStack
                  alignItems="center"
                  gap="$2.5"
                  paddingVertical="$2"
                  paddingHorizontal="$2"
                  borderRadius="$3"
                  backgroundColor={reason === r ? colors.primary : 'transparent'}
                >
                  <Text color={reason === r ? 'white' : colors.text} fontSize="$3">
                    {reason === r ? '◉' : '○'}
                  </Text>
                  <Text color={reason === r ? 'white' : colors.text} fontSize="$3" flex={1}>
                    {r}
                  </Text>
                </XStack>
              </Pressable>
            ))}
          </YStack>

          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Anything else we should know? (optional)"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
            style={[
              styles.details,
              {
                borderColor: colors.border,
                color: colors.text,
                backgroundColor: colors.background,
              },
            ]}
          />

          <XStack gap="$3">
            <Pressable style={{ flex: 1 }} onPress={() => setMode('menu')} disabled={submitting}>
              <XStack
                height={44}
                borderRadius={10}
                borderWidth={1}
                borderColor={colors.border}
                alignItems="center"
                justifyContent="center"
              >
                <Text color={colors.text} fontWeight="700">
                  Back
                </Text>
              </XStack>
            </Pressable>
            <Pressable
              style={{ flex: 1 }}
              onPress={handleSubmitReport}
              disabled={!reason || submitting}
            >
              <XStack
                height={44}
                borderRadius={10}
                backgroundColor={colors.primary}
                alignItems="center"
                justifyContent="center"
                opacity={!reason || submitting ? 0.5 : 1}
              >
                <Text color="white" fontWeight="700">
                  {submitting ? 'Sending…' : 'Submit report'}
                </Text>
              </XStack>
            </Pressable>
          </XStack>
        </YStack>
      )}
    </Modal>
  )
}

const styles = StyleSheet.create({
  details: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
  },
})
