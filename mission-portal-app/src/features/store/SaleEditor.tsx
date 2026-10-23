import { useState } from 'react'
import { Pressable, ScrollView, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { isoToDisplay } from '@/lib/eventDates'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { readSale, saleEndsLabel, type StoreSale } from './storeSale'
import { endSale, postSale, updateSale } from './storeWrites'

/**
 * Post a sale at the top of the Elim Store tab, correct it, or end it early.
 *
 * A sale is a message and its last day. Everyone sees both, and it comes down
 * on its own once that day is over. Posting a new one tells everyone who asked
 * to hear about sales; correcting the one that is up does not, so fixing a
 * typo never sends a second notification.
 */
export function SaleEditor({ sale, onClose }: { sale: StoreSale | null; onClose: () => void }) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { profile } = useAuthStore()
  const toast = useUIStore((s) => s.toast)
  const [message, setMessage] = useState(sale?.message ?? '')
  const [endDate, setEndDate] = useState(sale ? isoToDisplay(sale.endsOn) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const read = readSale(message, endDate)
  // What people will read, shown as it is typed so a mistyped date is caught here.
  const preview = endDate.trim() && 'endsOn' in read ? saleEndsLabel(read.endsOn) : null

  const field = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 15,
  } as const

  const save = async () => {
    if ('error' in read) {
      setError(read.error)
      return
    }
    setError(null)
    setBusy(true)
    try {
      if (sale) {
        await updateSale(sale.id, { message: message.trim(), ...read })
        toast('Sale updated', 'success')
      } else {
        await postSale({ message: message.trim(), ...read, createdBy: profile?.uid })
        toast('Sale posted', 'success')
      }
      onClose()
    } catch (err) {
      const reason = err instanceof Error ? err.message : ''
      setError(reason ? `Could not save: ${reason}` : 'Could not save. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const end = async () => {
    if (!sale) return
    setBusy(true)
    try {
      await endSale(sale.id)
      toast('Sale ended', 'info')
      onClose()
    } catch (err) {
      const reason = err instanceof Error ? err.message : ''
      setError(reason ? `Could not end the sale: ${reason}` : 'Could not end the sale.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FullScreenOverlay visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <XStack
          paddingHorizontal="$4"
          paddingTop={insets.top + 16}
          paddingBottom="$4"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
          alignItems="center"
          justifyContent="space-between"
        >
          <Text color={colors.text} fontSize="$5" fontWeight="700">
            Elim Store sale
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text color={colors.textMuted} fontSize="$4">
              ✕
            </Text>
          </Pressable>
        </XStack>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 640 }}>
          {sale ? (
            <YStack padding="$3" borderRadius="$2" backgroundColor={colors.primary + '22'} gap="$1">
              <Text color={colors.text} fontWeight="700">
                A sale is up — {saleEndsLabel(sale.endsOn).toLowerCase()}.
              </Text>
              <Text color={colors.textMuted} fontSize="$2">
                Saving changes here corrects it without notifying anyone again.
              </Text>
            </YStack>
          ) : (
            <Text color={colors.textMuted} fontSize="$3">
              The sale shows at the top of the Elim Store tab with its last day, and comes down on
              its own once that day is over. Everyone who asked to hear about sales gets a
              notification when you post it.
            </Text>
          )}

          <YStack gap="$1">
            <Text color={colors.text} fontWeight="600">
              Sale message
            </Text>
            <TextInput
              value={message}
              onChangeText={(v) => {
                setMessage(v)
                setError(null)
              }}
              placeholder="e.g. 20% off every T-shirt this weekend"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[field, { minHeight: 80, textAlignVertical: 'top' }]}
              accessibilityLabel="Sale message"
            />
          </YStack>

          <YStack gap="$1">
            <Text color={colors.text} fontWeight="600">
              Last day of the sale (MM/DD/YY)
            </Text>
            <TextInput
              value={endDate}
              onChangeText={(v) => {
                setEndDate(v)
                setError(null)
              }}
              placeholder="MM/DD/YY"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              style={field}
              accessibilityLabel="Last day of the sale"
            />
            {preview ? (
              <Text color={colors.textMuted} fontSize="$2">
                People will see: “{preview}”
              </Text>
            ) : null}
          </YStack>

          {error ? (
            <Text color="$red10" fontSize="$3">
              {error}
            </Text>
          ) : null}

          <XStack gap="$3" flexWrap="wrap" marginTop="$2">
            <Pressable onPress={save} disabled={busy} accessibilityRole="button">
              <XStack
                paddingHorizontal="$4"
                paddingVertical="$2.5"
                borderRadius="$3"
                backgroundColor={colors.primary}
                opacity={busy ? 0.6 : 1}
              >
                <Text color="white" fontWeight="700">
                  {sale ? 'Save changes' : 'Post sale'}
                </Text>
              </XStack>
            </Pressable>
            {sale ? (
              <Pressable onPress={end} disabled={busy} accessibilityRole="button">
                <XStack
                  paddingHorizontal="$4"
                  paddingVertical="$2.5"
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor={colors.border}
                  opacity={busy ? 0.6 : 1}
                >
                  <Text color={colors.text} fontWeight="600">
                    End sale now
                  </Text>
                </XStack>
              </Pressable>
            ) : null}
          </XStack>
        </ScrollView>
      </View>
    </FullScreenOverlay>
  )
}
