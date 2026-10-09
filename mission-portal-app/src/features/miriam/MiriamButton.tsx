import { useEffect, useRef, useState } from 'react'
import { AppState, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Text, XStack, YStack } from 'tamagui'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { useThemeColors } from '@/theme/useThemeColors'
import {
  claimSpeech,
  claimSpeechInBackground,
  ownsSpeech,
  releaseSpeech,
  speechFree,
  withSpeech,
} from '@/lib/speechOwner'
import { listeningCue } from '@/lib/listeningCue'
import { canRecogniseOnDevice, isOffline } from '@/lib/speechSupport'
import { findWake } from '@/lib/wakeWord'
import { askMiriam, miriamError } from './askMiriam'
import { useMiriamStore } from '@/stores/miriamStore'
import { useUsersStore } from '@/stores/usersStore'
import { useGroupsStore } from '@/stores/groupsStore'

/** This listener's claim on the phone's speech recognition (lib/speechOwner). */
const SPEECH_ID = 'miriam'
/** A pause this long ends the request: long enough to think mid-sentence. */
const PAUSE_MS = 1800
/** After "Hey Miriam" and nothing more: how long to wait for the request. */
const AFTER_WAKE_MS = 6000
/** Not left listening for a request if nothing is said. */
const LISTEN_MS = 30_000
/** How often listening for "Hey Miriam" is started again when it has stopped. */
const WAKE_RETRY_MS = 3000
/** Past this much heard without her name, listening starts over, kept short. */
const WAKE_TEXT_MAX = 300
/** Whether this device listens for "Hey Miriam" (AsyncStorage). */
const WAKE_KEY = 'miriam_wake'

type Stage = 'listening' | 'typing' | 'thinking' | 'answered'
/** What the one listening session is for: waiting for her name, or a request. */
type Mode = 'off' | 'wake' | 'request'

function recognitionAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable()
  } catch {
    return false
  }
}

const joined = (a: string, b: string) => [a, b].filter((s) => s.trim()).join(' ')

/**
 * Miriam's button, in the header, and what opens from it.
 *
 * Tap it, or — where switched on — say "Hey Miriam", and say what to do:
 * "Create an event on 9/25 called Revival in the Heartland, starting at 9 PM
 * in Coralville, Iowa; assign everyone in All except Jacob." What was said
 * goes to Miriam (lib/miriam, ./askMiriam), and what she fills in opens where
 * it belongs, to be checked and saved: nothing is saved without that. It can
 * be typed instead, and is where the browser has no speech recognition.
 *
 * "Hey Miriam" is listened for only while the app is open and on screen, on
 * a device where it has been switched on (off unless it is). It is the same
 * speech recognition as everything else here, waiting in the background: on
 * a phone that can, kept on the phone, so what is said near it is not sent
 * anywhere until her name is heard. It gives the microphone up the moment
 * anything else wants it (lib/speechOwner) and comes back when that is done.
 * "Hey Miriam, create an event…" can be said in one breath: the same
 * listening carries on into the request.
 *
 * On a phone the microphone is set up as for a call — the phone's own
 * processing for a voice close by, which holds up better in a noisy room
 * than the raw microphone the song finder uses to hear music. Over a live
 * band it will still mostly not hear her name; the button is for then.
 *
 * Shown only to people Miriam can do something for (canUseMiriam).
 */
export function MiriamButton() {
  const colors = useThemeColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const offerEventForm = useMiriamStore((s) => s.offerEventForm)
  const users = useUsersStore((s) => s.users)
  const groups = useGroupsStore((s) => s.groups)
  const subGroups = useGroupsStore((s) => s.subscribe)
  const unsubGroups = useGroupsStore((s) => s.unsubscribe)

  const [available] = useState(recognitionAvailable)
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>('listening')
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [typed, setTyped] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  // "Hey Miriam": wanted on this device, and listening for it right now.
  const [wakeOn, setWakeOn] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background')

  const mode = useRef<Mode>('off')
  // Everything the current session has heard: finished phrases, and the one
  // still being made out.
  const settled = useRef('')
  const full = useRef('')
  // Where the request starts in it: after her name, or after what had been
  // heard when the button was tapped.
  const from = useRef<'wake' | { base: string }>({ base: '' })
  const request = useRef('')
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sent = useRef(false)

  useEffect(() => {
    AsyncStorage.getItem(WAKE_KEY)
      .then((v) => setWakeOn(v === '1'))
      .catch(() => {})
  }, [])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s !== 'background'))
    return () => sub.remove()
  }, [])
  // Group names, for the recogniser to expect.
  useEffect(() => {
    if (!open && !wakeOn) return
    subGroups()
    return () => unsubGroups()
  }, [open, wakeOn, subGroups, unsubGroups])

  const setWake = (on: boolean) => {
    setWakeOn(on)
    AsyncStorage.setItem(WAKE_KEY, on ? '1' : '0').catch(() => {})
  }

  const clearPause = () => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current)
    pauseTimer.current = null
  }
  const stopListening = () => {
    clearPause()
    mode.current = 'off'
    if (ownsSpeech(SPEECH_ID)) {
      releaseSpeech(SPEECH_ID)
      ExpoSpeechRecognitionModule.abort()
    }
    setListening(false)
    setWaiting(false)
  }

  /** Start listening — for her name, or for a request. */
  const startSession = (kind: 'wake' | 'request', onDevice: boolean) => {
    settled.current = ''
    full.current = ''
    const start = () => {
      mode.current = kind
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: onDevice,
        // Her name, and the names a request is likeliest to hold.
        contextualStrings: [
          'Hey Miriam',
          ...groups.map((g) => g.name),
          ...users.map((u) => u.displayName).filter(Boolean),
        ].slice(0, 100),
        iosTaskHint: 'dictation',
        iosCategory: {
          category: 'playAndRecord',
          categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'mixWithOthers'],
          mode: 'voiceChat',
        },
        iosVoiceProcessingEnabled: true,
      })
    }
    if (kind === 'wake') {
      claimSpeechInBackground(SPEECH_ID, () => {
        mode.current = 'off'
        ExpoSpeechRecognitionModule.abort()
      })
      start()
    } else {
      withSpeech(SPEECH_ID, start)
    }
  }

  const send = async (text: string) => {
    const said = text.trim()
    if (!said || sent.current) return
    sent.current = true
    stopListening()
    setHeard(said)
    setStage('thinking')
    try {
      const result = await askMiriam(said)
      if (result.kind === 'eventForm') {
        offerEventForm({ draft: result.draft, heard: said, notes: result.notes })
        setOpen(false)
        router.navigate('/events' as never)
        return
      }
      setAnswer(result.text)
    } catch (err) {
      setAnswer(miriamError(err))
    }
    setStage('answered')
  }

  /** Listen for a request: the panel open, waiting for what to do. */
  const beginRequest = () => {
    sent.current = false
    request.current = ''
    setHeard('')
    setAnswer(null)
    setStage('listening')
    setOpen(true)
  }

  /** Tapped: listen for a request — in the listening already going, if there is one. */
  const listen = async () => {
    beginRequest()
    if (!available) {
      setStage('typing')
      return
    }
    if (mode.current === 'wake' && ownsSpeech(SPEECH_ID)) {
      // Already listening for her name: carry on, for the request.
      claimSpeech(SPEECH_ID)
      mode.current = 'request'
      from.current = { base: full.current }
      setWaiting(false)
      setListening(true)
      listeningCue('start')
      return
    }
    let onDevice = false
    if (Platform.OS !== 'web') {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!permission.granted) {
        setAnswer(
          'Mission Portal needs the microphone and speech recognition for Miriam. You can turn them on in Settings, or type instead.'
        )
        setStage('answered')
        return
      }
      onDevice = (await isOffline()) && canRecogniseOnDevice()
    }
    listeningCue('start')
    // A moment for the chime before the microphone takes the sound over; a
    // browser plays it alongside, and must start listening within the tap.
    if (Platform.OS !== 'web') await new Promise((r) => setTimeout(r, 180))
    from.current = { base: '' }
    startSession('request', onDevice)
  }

  const requestIn = (text: string): string => {
    const f = from.current
    if (f === 'wake') return findWake(text)?.after ?? ''
    return text.startsWith(f.base) ? text.slice(f.base.length).trim() : text
  }

  useSpeechRecognitionEvent('start', () => {
    if (!ownsSpeech(SPEECH_ID)) return
    if (mode.current === 'wake') setWaiting(true)
    else setListening(true)
  })
  useSpeechRecognitionEvent('result', (e) => {
    if (!ownsSpeech(SPEECH_ID) || mode.current === 'off') return
    const text = e.results[0]?.transcript ?? ''
    if (e.isFinal) settled.current = joined(settled.current, text)
    full.current = e.isFinal ? settled.current : joined(settled.current, text)

    if (mode.current === 'wake') {
      const woke = findWake(full.current)
      if (!woke) {
        // Kept short: started over once a good deal has gone by without her.
        if (full.current.length > WAKE_TEXT_MAX) ExpoSpeechRecognitionModule.stop()
        return
      }
      // "Hey Miriam": listening on, now for the request.
      claimSpeech(SPEECH_ID)
      mode.current = 'request'
      from.current = 'wake'
      setWaiting(false)
      setListening(true)
      beginRequest()
      listeningCue('start')
    }
    if (sent.current) return
    request.current = requestIn(full.current)
    setHeard(request.current)
    clearPause()
    pauseTimer.current = setTimeout(
      () => send(request.current),
      request.current ? PAUSE_MS : AFTER_WAKE_MS
    )
  })
  useSpeechRecognitionEvent('end', () => {
    if (!ownsSpeech(SPEECH_ID)) return
    const was = mode.current
    mode.current = 'off'
    releaseSpeech(SPEECH_ID)
    setWaiting(false)
    setListening(false)
    if (was !== 'request') return
    listeningCue('stop')
    // Stopped by the recogniser itself: what it has is the request.
    if (!sent.current && request.current.trim()) send(request.current)
  })
  useSpeechRecognitionEvent('error', (e) => {
    if (!ownsSpeech(SPEECH_ID)) return
    const was = mode.current
    mode.current = 'off'
    setWaiting(false)
    setListening(false)
    // Let go on the end that follows, the last thing this listening reports
    // (lib/speechOwner) — or in a moment, should none come.
    setTimeout(() => {
      if (mode.current === 'off' && ownsSpeech(SPEECH_ID)) releaseSpeech(SPEECH_ID)
    }, 1000)
    if (e.error === 'aborted') return
    if (was === 'wake') {
      // Listening for her name is not something to report trouble with,
      // unless it can never work: then it is switched off.
      if (e.error === 'not-allowed') setWake(false)
      return
    }
    if (was !== 'request') return
    listeningCue('stop')
    if (e.error === 'no-speech' || e.error === 'speech-timeout') {
      setAnswer('Didn’t hear anything. Try again, or type it.')
    } else if (e.error === 'not-allowed') {
      setAnswer(
        Platform.OS === 'web'
          ? 'This browser isn’t allowed to use the microphone here. Allow it in the site settings, or type instead.'
          : 'Mission Portal isn’t allowed to use the microphone. You can turn it on in Settings, or type instead.'
      )
    } else if (e.error === 'network') {
      setAnswer('Couldn’t reach speech recognition. Check the connection, or type instead.')
    } else {
      setAnswer('Listening stopped. Try again, or type it.')
    }
    setStage('answered')
  })

  // Listening for "Hey Miriam": while switched on, the app on screen, the
  // panel closed and the microphone free — started again whenever it stops.
  useEffect(() => {
    if (!available || !wakeOn || !appActive || open) return
    const onDevice = Platform.OS !== 'web' && canRecogniseOnDevice()
    const tryWake = () => {
      if (mode.current === 'off' && speechFree()) startSession('wake', onDevice)
    }
    const first = setTimeout(tryWake, 400)
    const every = setInterval(tryWake, WAKE_RETRY_MS)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      if (mode.current === 'wake' && ownsSpeech(SPEECH_ID)) stopListening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, wakeOn, appActive, open])

  // Not left listening for a request if nothing is said; never behind a
  // closed panel.
  useEffect(() => {
    if (!listening) return
    const t = setTimeout(() => {
      if (ownsSpeech(SPEECH_ID)) ExpoSpeechRecognitionModule.stop()
    }, LISTEN_MS)
    return () => clearTimeout(t)
  }, [listening])
  useEffect(
    () => () => {
      if (pauseTimer.current) clearTimeout(pauseTimer.current)
      mode.current = 'off'
      if (ownsSpeech(SPEECH_ID)) {
        releaseSpeech(SPEECH_ID)
        ExpoSpeechRecognitionModule.abort()
      }
    },
    []
  )

  const toggleWake = async () => {
    if (!wakeOn && Platform.OS !== 'web') {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!permission.granted) {
        setAnswer(
          'Mission Portal needs the microphone and speech recognition to listen for “Hey Miriam”. You can turn them on in Settings.'
        )
        setStage('answered')
        return
      }
    }
    setWake(!wakeOn)
  }

  const close = () => {
    sent.current = true
    stopListening()
    setOpen(false)
  }
  const typeInstead = () => {
    stopListening()
    sent.current = false
    setTyped(heard)
    setStage('typing')
  }

  const typing = stage === 'typing'

  return (
    <>
      <Pressable
        onPress={listen}
        accessibilityRole="button"
        accessibilityLabel={waiting ? 'Ask Miriam. Listening for “Hey Miriam”' : 'Ask Miriam'}
        hitSlop={6}
        style={[styles.button, { borderColor: colors.primary }]}
      >
        <XStack alignItems="center" gap="$1.5">
          {waiting ? <View style={[styles.dot, { backgroundColor: '#2ecc71' }]} /> : null}
          <Text fontSize={13} fontWeight="700" color={colors.primary}>
            🎤 Miriam
          </Text>
        </XStack>
      </Pressable>

      <FullScreenOverlay visible={open} animationType="fade" transparent onRequestClose={close}>
        <View style={[styles.backdrop, { paddingTop: insets.top + 12 }]}>
          <YStack
            backgroundColor={colors.surface}
            borderRadius="$4"
            padding="$4"
            gap="$3"
            width="92%"
            maxWidth={520}
          >
            <XStack alignItems="center" justifyContent="space-between">
              <Text color={colors.text} fontSize="$5" fontWeight="700">
                {stage === 'thinking'
                  ? 'Miriam is working on it…'
                  : listening
                    ? 'Miriam is listening…'
                    : 'Miriam'}
              </Text>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.close}
              >
                <Text color={colors.textMuted} fontSize="$4">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            {typing ? (
              <YStack gap="$2">
                <TextInput
                  value={typed}
                  onChangeText={setTyped}
                  placeholder="What should Miriam do?"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  multiline
                  maxLength={600}
                  accessibilityLabel="What should Miriam do?"
                  style={[
                    styles.field,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                />
                <Pressable
                  onPress={() => send(typed)}
                  disabled={!typed.trim()}
                  accessibilityRole="button"
                  style={[
                    styles.primary,
                    { backgroundColor: colors.primary, opacity: typed.trim() ? 1 : 0.5 },
                  ]}
                >
                  <Text color="white" fontWeight="700">
                    Send
                  </Text>
                </Pressable>
              </YStack>
            ) : (
              <>
                {stage === 'listening' && !heard ? (
                  <Text color={colors.textMuted} fontSize="$3">
                    Say what to do — “Create an event on 9/25 called Revival in the Heartland,
                    starting at 9 PM in Coralville, Iowa.” I’ll fill in the form for you to check.
                  </Text>
                ) : null}
                {heard ? (
                  <Text color={colors.text} fontSize="$4" fontStyle="italic">
                    “{heard}”
                  </Text>
                ) : null}
                {answer ? (
                  <Text color={colors.text} fontSize="$4" fontWeight="600">
                    {answer}
                  </Text>
                ) : null}
              </>
            )}

            {stage === 'listening' && heard ? (
              <Pressable
                onPress={() => send(request.current)}
                accessibilityRole="button"
                style={[styles.primary, { backgroundColor: colors.primary }]}
              >
                <Text color="white" fontWeight="700">
                  Done
                </Text>
              </Pressable>
            ) : null}

            {stage === 'answered' ? (
              <Pressable
                onPress={listen}
                accessibilityRole="button"
                style={[styles.primary, { backgroundColor: colors.primary }]}
              >
                <Text color="white" fontWeight="700">
                  {available ? '🎤 Ask again' : 'Ask again'}
                </Text>
              </Pressable>
            ) : null}

            {stage !== 'typing' && stage !== 'thinking' ? (
              <Pressable onPress={typeInstead} accessibilityRole="button" style={styles.link}>
                <Text color={colors.primary} fontSize="$3" fontWeight="600">
                  ⌨︎ Type instead
                </Text>
              </Pressable>
            ) : null}

            {available ? (
              <Pressable
                onPress={toggleWake}
                accessibilityRole="switch"
                aria-checked={wakeOn}
                accessibilityLabel="Listen for “Hey Miriam” on this device"
                style={[styles.wake, { borderTopColor: colors.border }]}
              >
                <XStack alignItems="center" gap="$2">
                  <YStack flex={1} gap="$1">
                    <Text color={colors.text} fontSize="$3" fontWeight="600">
                      Listen for “Hey Miriam”
                    </Text>
                    <Text color={colors.textMuted} fontSize="$2">
                      {Platform.OS === 'web'
                        ? 'While this page is open. The browser sends what it hears to its speech service to listen for her name.'
                        : 'While the app is open, on this phone. Not over a loud band — tap the button then.'}
                    </Text>
                  </YStack>
                  <View
                    style={[
                      styles.track,
                      { backgroundColor: wakeOn ? colors.primary : colors.border },
                    ]}
                  >
                    <View style={[styles.knob, wakeOn ? styles.knobOn : null]} />
                  </View>
                </XStack>
              </Pressable>
            ) : null}
          </YStack>
        </View>
      </FullScreenOverlay>
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  field: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    // 16pt: smaller, and an iPhone zooms the page in on the field.
    fontSize: 16,
    textAlignVertical: 'top',
  },
  primary: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    minHeight: 40,
    justifyContent: 'center',
  },
  wake: {
    borderTopWidth: 1,
    paddingTop: 12,
    minHeight: 44,
  },
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
  },
  knobOn: {
    marginLeft: 18,
  },
})
