import { useEffect, useState } from 'react'
import { Modal, Pressable, TextInput, View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { YStack, XStack, Text } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useLivestreamStore } from '@/stores/livestreamStore'
import { useUIStore } from '@/stores/uiStore'
import { extractYouTubeId } from '@/stores/musicStore'
import { activeStream, expiryFrom, DEFAULT_STREAM_HOURS, MAX_STREAM_HOURS } from '@/lib/livestream'
import { useThemeColors } from '@/theme/useThemeColors'

function nanoid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** The pair of timestamps a freshly posted card carries. */
function stamps(hours: number): { createdAt: number; expiresAt: number } {
  const now = Date.now()
  return { createdAt: now, expiresAt: expiryFrom(now, hours) }
}

/** How long is left, for the admin to read before deciding to take it down. */
function timeLeft(expiresAt: number, now: number = Date.now()): string {
  const ms = Math.max(0, expiresAt - now)
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} min left`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  return rem === 0 ? `${hours} hr left` : `${hours} hr ${rem} min left`
}

/**
 * Post the stream that is on right now, or take it down early.
 *
 * There is no separate "edit" — posting again replaces whatever is standing,
 * because during a service the only edit anybody wants is a corrected link.
 */
export function StreamCardModal({ onClose }: { onClose: () => void }) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { profile } = useAuthStore()
  const toast = useUIStore((s) => s.toast)
  const { subscribe, unsubscribe, post, takeDown } = useLivestreamStore()
  const streams = useLivestreamStore((s) => s.streams)
  const live = activeStream(streams)

  const [title, setTitle] = useState(live?.title ?? '')
  const [url, setUrl] = useState(live?.youtubeUrl ?? '')
  const [hours, setHours] = useState(String(DEFAULT_STREAM_HOURS))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    subscribe()
    return unsubscribe
  }, [subscribe, unsubscribe])

  const handlePost = async () => {
    if (!title.trim() || !url.trim()) {
      setError('Title and stream link are required.')
      return
    }
    if (!extractYouTubeId(url)) {
      setError('That does not look like a YouTube link. Paste the address of the live stream.')
      return
    }
    const parsedHours = Number(hours)
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      setError(`Hours must be a number between 1 and ${MAX_STREAM_HOURS}.`)
      return
    }
    setError(null)
    setBusy(true)
    try {
      // Replacing whatever is up rather than adding beside it: the id is
      // reused so a correction cannot leave two cards live at once.
      const id = live?.id ?? nanoid()
      await post({
        id,
        title: title.trim(),
        youtubeUrl: url.trim(),
        ...stamps(parsedHours),
        createdBy: profile?.uid,
      })
      toast(live ? 'Stream updated' : 'Stream posted', 'success')
      onClose()
    } catch (err) {
      const reason = err instanceof Error ? err.message : ''
      setError(reason ? `Could not post: ${reason}` : 'Could not post. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleTakeDown = async () => {
    if (!live) return
    setBusy(true)
    try {
      await takeDown(live.id)
      toast('Stream taken down', 'info')
      onClose()
    } catch (err) {
      const reason = err instanceof Error ? err.message : ''
      setError(reason ? `Could not take down: ${reason}` : 'Could not take down.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <XStack
          paddingHorizontal="$4"
          // Same reason as the Photos header: this sheet covers the status
          // bar, so its own padding cannot start at the top of the window.
          paddingTop={insets.top + 16}
          paddingBottom="$4"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
          alignItems="center"
          justifyContent="space-between"
        >
          <Text color={colors.text} fontSize="$5" fontWeight="700">
            Live Stream
          </Text>
          <Pressable onPress={onClose}>
            <Text color={colors.textMuted} fontSize="$4">
              ✕
            </Text>
          </Pressable>
        </XStack>

        <YStack flex={1} padding="$4" gap="$3">
          {live ? (
            <XStack
              padding="$3"
              borderRadius="$2"
              backgroundColor={colors.primary + '22'}
              alignItems="center"
              gap="$2"
            >
              <Text color={colors.text} fontSize="$3" flex={1}>
                “{live.title}” is up now — {timeLeft(live.expiresAt)}.
              </Text>
            </XStack>
          ) : (
            <Text color={colors.textMuted} fontSize="$3">
              Nothing is streaming right now. Posting a card puts it on the front of the app for
              everyone until the window runs out, then it comes down on its own.
            </Text>
          )}

          <Text style={[styles.label, { color: colors.textMuted }]}>Title *</Text>
          <TextInput
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
            value={title}
            onChangeText={(v) => {
              setError(null)
              setTitle(v)
            }}
            placeholder="Sunday Service"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { color: colors.textMuted }]}>Stream link *</Text>
          <TextInput
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
            value={url}
            onChangeText={(v) => {
              setError(null)
              setUrl(v)
            }}
            placeholder="https://www.youtube.com/live/..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />

          <Text style={[styles.label, { color: colors.textMuted }]}>
            Show for (hours, 1–{MAX_STREAM_HOURS})
          </Text>
          <TextInput
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
            value={hours}
            onChangeText={(v) => {
              setError(null)
              setHours(v)
            }}
            placeholder={String(DEFAULT_STREAM_HOURS)}
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
          />
        </YStack>

        <YStack borderTopWidth={1} borderTopColor={colors.border}>
          {error ? (
            <XStack
              margin="$4"
              marginBottom="$0"
              padding="$3"
              borderRadius="$2"
              backgroundColor="#dc2626"
            >
              <Text color="white" fontSize="$3" flex={1}>
                {error}
              </Text>
            </XStack>
          ) : null}
          <XStack padding="$4" gap="$3" justifyContent="flex-end" alignItems="center">
            {live ? (
              <Pressable onPress={handleTakeDown} disabled={busy}>
                <XStack
                  paddingHorizontal="$4"
                  paddingVertical="$2"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="#c0392b"
                  opacity={busy ? 0.6 : 1}
                >
                  <Text color="#c0392b" fontSize="$3" fontWeight="600">
                    Take down
                  </Text>
                </XStack>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose}>
              <XStack
                paddingHorizontal="$4"
                paddingVertical="$2"
                borderRadius="$2"
                borderWidth={1}
                borderColor={colors.border}
              >
                <Text color={colors.text} fontSize="$3">
                  Cancel
                </Text>
              </XStack>
            </Pressable>
            <Pressable onPress={handlePost} disabled={busy}>
              <XStack
                paddingHorizontal="$4"
                paddingVertical="$2"
                borderRadius="$2"
                backgroundColor={colors.primary}
                opacity={busy ? 0.6 : 1}
              >
                <Text color="white" fontSize="$3" fontWeight="600">
                  {busy ? 'Working…' : live ? 'Update' : 'Post stream'}
                </Text>
              </XStack>
            </Pressable>
          </XStack>
        </YStack>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
})
