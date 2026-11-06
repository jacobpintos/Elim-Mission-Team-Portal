import { useCallback, useState } from 'react'
import { Platform, Pressable, ScrollView, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Text, XStack, YStack } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { confirmAsync } from '@/lib/confirm'
import { ATEM, type AtemInput } from '@/lib/switcher/atem'
import { inputName, liveSaid } from '@/lib/switcher/plan'
import { loadMultiviewFeed, type MultiviewFeed } from '@/lib/switcher/switcherAddress'
import { Multiview } from './Multiview'
import { useSwitcher, type SwitcherStatus } from './useSwitcher'

/** The colours of the ATEM's own buttons and multiview borders. */
const LIVE = '#e5322d'
const PREVIEW = '#2bb24c'

const STATUS: Record<Exclude<SwitcherStatus, 'connected'>, string> = {
  connecting: 'Connecting to the video switcher…',
  unreachable: 'I can’t reach the video switcher. Is this phone on its network?',
  'not operator': 'Only Video Operators can switch cameras.',
  'no app': 'Cameras can be switched only from the phone app, on the switcher’s network.',
  'no address': 'Set the switcher’s address in Settings → Video switcher first.',
}

/**
 * Video (for Video Operators, in the phone app): the ATEM's multiview, when
 * an encoder serves it on the network, and a tile for each camera, red when
 * live and green on preview. Tap a camera to put it on preview; Cut or Auto
 * takes it live. Connected to the switcher while this is open
 * (./useSwitcher), so it follows the panel too.
 */
export function VideoScreen() {
  const colors = useThemeColors()
  const router = useRouter()
  const { toast } = useUIStore()
  const uid = String(useAuthStore((s) => s.profile?.uid) ?? '')
  const { status, state, command, retry } = useSwitcher(uid)
  const [feed, setFeed] = useState<MultiviewFeed | null>(null)
  const [busy, setBusy] = useState(false)

  useFocusEffect(
    useCallback(() => {
      loadMultiviewFeed().then(setFeed)
    }, [])
  )

  const send = async (commands: Uint8Array[]) => {
    setBusy(true)
    const ok = await command(commands)
    setBusy(false)
    if (!ok) toast('The switcher didn’t take that. Try again, or use the panel.', 'error')
  }

  const fade = async () => {
    if (!state) return
    if (!state.black) {
      const sure = await confirmAsync('Everyone watching will see the program fade to black.', {
        title: 'Fade to black?',
        confirmLabel: 'Fade to black',
        destructive: true,
      })
      if (!sure) return
    }
    await send([ATEM.fadeToBlack()])
  }

  const connected = status === 'connected' && !!state
  const inputs: AtemInput[] = state ? [...state.inputs.values()].filter((i) => i.external) : []

  const button = (label: string, onPress: () => void, color = colors.primary) => (
    <Pressable onPress={onPress} disabled={!connected || busy} style={{ flex: 1 }}>
      <View
        style={{
          height: 48,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color,
          opacity: !connected || busy ? 0.5 : 1,
        }}
      >
        <Text color="white" fontWeight="700" fontSize="$4">
          {label}
        </Text>
      </View>
    </Pressable>
  )

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenTitle options={{ title: 'Video', headerShown: false }} />
      <YStack padding="$4" gap="$4">
        <Text fontSize="$6" fontWeight="700" color={colors.text}>
          Video
        </Text>

        {Platform.OS === 'web' ? (
          <Text color={colors.textMuted}>{STATUS['no app']}</Text>
        ) : status === 'connected' && state ? (
          <Text color={colors.textMuted} fontSize="$2">
            {state.product ? `${state.product}. ` : ''}
            {liveSaid(state)}
          </Text>
        ) : (
          <YStack gap="$2">
            <Text color={colors.textMuted}>
              {STATUS[status === 'connected' ? 'connecting' : status]}
            </Text>
            {status === 'unreachable' ? (
              <Pressable onPress={() => void retry()}>
                <Text color={colors.primary} fontWeight="700">
                  Try again
                </Text>
              </Pressable>
            ) : status === 'no address' ? (
              <Pressable onPress={() => router.push('/settings' as never)}>
                <Text color={colors.primary} fontWeight="700">
                  Open Settings
                </Text>
              </Pressable>
            ) : null}
          </YStack>
        )}

        {feed ? (
          <Multiview feed={feed} />
        ) : (
          <YStack
            padding="$3"
            borderRadius="$3"
            borderWidth={1}
            borderColor={colors.border}
            backgroundColor={colors.surface}
            gap="$1"
          >
            <Text fontWeight="700" color={colors.text}>
              The cameras’ pictures
            </Text>
            <Text color={colors.textMuted} fontSize="$2">
              To see the ATEM’s multiview here, plug its multiview output into a video encoder on
              this network, then add the encoder’s preview address in Settings → Video switcher.
            </Text>
          </YStack>
        )}

        {connected && state ? (
          <>
            <XStack flexWrap="wrap" gap="$2">
              {inputs.map((input) => {
                const live = state.program === input.id
                const preview = state.preview === input.id
                return (
                  <Pressable
                    key={input.id}
                    onPress={() => void send([ATEM.preview(input.id)])}
                    disabled={busy || preview}
                    accessibilityLabel={`${inputName(input, input.id)}${live ? ', live' : preview ? ', on preview' : ''}`}
                    style={{ width: '31%', minWidth: 96, flexGrow: 1 }}
                  >
                    <View
                      style={{
                        minHeight: 72,
                        padding: 10,
                        borderRadius: 10,
                        borderWidth: 3,
                        borderColor: live ? LIVE : preview ? PREVIEW : colors.border,
                        backgroundColor: live
                          ? `${LIVE}22`
                          : preview
                            ? `${PREVIEW}22`
                            : colors.surface,
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text fontWeight="700" color={colors.text} numberOfLines={2}>
                        {inputName(input, input.id)}
                      </Text>
                      <Text
                        fontSize="$1"
                        fontWeight="700"
                        color={live ? LIVE : preview ? PREVIEW : colors.textMuted}
                      >
                        {live ? 'LIVE' : preview ? 'PREVIEW' : `Input ${input.id}`}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </XStack>

            <XStack gap="$2">
              {button('Cut', () => void send([ATEM.cut()]), LIVE)}
              {button('Auto', () => void send([ATEM.auto()]))}
            </XStack>
            <XStack gap="$2">
              {button(
                state.black ? 'Fade up from black' : 'Fade to black',
                () => void fade(),
                '#333'
              )}
            </XStack>

            <Text color={colors.textMuted} fontSize="$2">
              Tap a camera to put it on preview, then Cut or Auto to take it live. You can also ask
              Miriam: “camera 2”, “preview the wide shot”, “take it”.
            </Text>
          </>
        ) : null}
      </YStack>
    </ScrollView>
  )
}
