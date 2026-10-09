import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Text, XStack, YStack } from 'tamagui'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import { FloatingLayer } from '@/components/ui/FloatingLayer'
import { useThemeColors } from '@/theme/useThemeColors'
import {
  claimSpeechInBackground,
  ownsSpeech,
  releaseSpeech,
  speechFree,
  withSpeech,
} from '@/lib/speechOwner'
import { listeningCue } from '@/lib/listeningCue'
import { canRecogniseOnDevice, isOffline } from '@/lib/speechSupport'
import { wakeEngine } from '@/lib/wakeEngine'
import { withoutHerName } from '@/lib/wakeWord'
import { MAX_REQUEST, miriamHref } from '@/lib/miriam'
import { anyOverlayOpen } from '@/lib/overlays'
import { speak, stopSpeaking } from './speak'
import { askMiriam, miriamError } from './askMiriam'
import { useMiriamStore } from '@/stores/miriamStore'
import { useUsersStore } from '@/stores/usersStore'
import { useGroupsStore } from '@/stores/groupsStore'

/** Claims on the microphone (lib/speechOwner): the request, and the wake word. */
const SPEECH_ID = 'miriam'
const WAKE_ID = 'miriam-wake'
/** A pause this long ends the request: long enough to think mid-sentence. */
const PAUSE_MS = 1800
/** The longest a request is listened to: a minute, room for a long one. */
const LISTEN_MS = 60_000
/** How often listening for "Hey Miriam" is started again when it has stopped. */
const WAKE_RETRY_MS = 3000
/** How long an answer stays up once given, unless she is spoken to again. */
const ANSWER_MS = 20_000
/** Whether this device listens for "Hey Miriam" (AsyncStorage). */
const WAKE_KEY = 'miriam_wake'

type Stage = 'listening' | 'typing' | 'thinking' | 'answered'

function recognitionAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable()
  } catch {
    return false
  }
}

const joined = (a: string, b: string) => [a, b].filter((s) => s.trim()).join(' ')

/** The microphone refused, rather than some passing trouble. */
function refused(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? ''
  const message = (err as { message?: string })?.message ?? ''
  return /NotAllowed|Permission|denied/i.test(`${name} ${message}`)
}

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
 * "Hey Miriam" is listened for by a wake word engine on the device itself
 * (lib/wakeEngine: sherpa-onnx's keyword spotter), which hears that phrase and
 * nothing else — so nothing said near the device is sent anywhere, and it is
 * light enough to leave running. Only while the app is open and on screen,
 * and only on a device where it has been switched on (off unless it is). It
 * gives the microphone up the moment anything else wants it (lib/speechOwner)
 * and comes back when that is done.
 *
 * When it hears her name it stops, there is a chime, and speech recognition
 * takes the request, as when the button is tapped. Said in one breath, the
 * first word or so of the request can fall in the moment between the two:
 * "Hey Miriam" — chime — "create an event…" is surer.
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
  // The minute ran out while still talking: what was heard, to finish or send.
  const [ranOut, setRanOut] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  // "Hey Miriam": wanted on this device, and listening for it right now.
  const [wakeOn, setWakeOn] = useState(false)
  const [waiting, setWaiting] = useState(false)
  // Opened by her name rather than a tap: shown unmistakably, as it may be
  // across the room from whoever said it.
  const [woken, setWoken] = useState(false)
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background')

  // Listening for a request now (speech recognition).
  const requesting = useRef(false)
  // What the request's listening has heard: finished phrases, and the one
  // still being made out.
  const settled = useRef('')
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
  // Group names, for the recogniser to expect in a request.
  useEffect(() => {
    if (!open) return
    subGroups()
    return () => unsubGroups()
  }, [open, subGroups, unsubGroups])

  const setWake = (on: boolean) => {
    setWakeOn(on)
    AsyncStorage.setItem(WAKE_KEY, on ? '1' : '0').catch(() => {})
  }

  /** Stop listening for her name, and let the microphone go. */
  const stopWake = () => {
    wakeEngine?.stop()
    releaseSpeech(WAKE_ID)
    setWaiting(false)
  }

  const clearPause = () => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current)
    pauseTimer.current = null
  }
  const stopListening = () => {
    clearPause()
    requesting.current = false
    if (ownsSpeech(SPEECH_ID)) {
      releaseSpeech(SPEECH_ID)
      ExpoSpeechRecognitionModule.abort()
    }
    setListening(false)
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
      speak(result.text)
      // Taken to where the answer is — unless that would pull them out of
      // something open over the page, a chord sheet being played: then it is
      // said and shown here, and the page is left as it is.
      if (result.kind === 'answer' && result.open && !anyOverlayOpen()) {
        router.push(miriamHref(result.open) as never)
      }
    } catch (err) {
      setAnswer(miriamError(err))
    }
    setStage('answered')
  }

  /** Listen for a request — tapped, or woken by her name. */
  const listen = async (byName = false) => {
    stopWake()
    stopSpeaking()
    setWoken(byName)
    setRanOut(false)
    if (byName) AccessibilityInfo.announceForAccessibility('Miriam: Hineni, I am here')
    sent.current = false
    settled.current = ''
    request.current = ''
    setHeard('')
    setAnswer(null)
    setStage('listening')
    setOpen(true)
    if (!available) {
      setStage('typing')
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
    withSpeech(SPEECH_ID, () => {
      requesting.current = true
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: onDevice,
        // The names a request is likeliest to hold, and the hardest to hear.
        contextualStrings: [
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
    })
  }

  useSpeechRecognitionEvent('start', () => {
    if (ownsSpeech(SPEECH_ID)) setListening(true)
  })
  useSpeechRecognitionEvent('result', (e) => {
    if (!ownsSpeech(SPEECH_ID) || !requesting.current || sent.current) return
    const text = e.results[0]?.transcript ?? ''
    if (e.isFinal) settled.current = joined(settled.current, text)
    request.current = withoutHerName(e.isFinal ? settled.current : joined(settled.current, text))
    setHeard(request.current)
    clearPause()
    pauseTimer.current = setTimeout(() => send(request.current), PAUSE_MS)
  })
  useSpeechRecognitionEvent('end', () => {
    if (!ownsSpeech(SPEECH_ID)) return
    const was = requesting.current
    requesting.current = false
    releaseSpeech(SPEECH_ID)
    setListening(false)
    if (!was) return
    listeningCue('stop')
    // Stopped by the recogniser itself: what it has is the request.
    if (!sent.current && request.current.trim()) send(request.current)
  })
  useSpeechRecognitionEvent('error', (e) => {
    if (!ownsSpeech(SPEECH_ID)) return
    const was = requesting.current
    requesting.current = false
    releaseSpeech(SPEECH_ID)
    setListening(false)
    if (e.error === 'aborted' || !was) return
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
  const listenRef = useRef(listen)
  useEffect(() => {
    listenRef.current = listen
  })
  useEffect(() => {
    if (!wakeEngine || !wakeOn || !appActive || open) return
    const engine = wakeEngine
    let starting = false
    let gaveUp = false
    const tryWake = () => {
      if (starting || gaveUp || ownsSpeech(WAKE_ID) || !speechFree()) return
      starting = true
      claimSpeechInBackground(WAKE_ID, stopWake)
      engine
        .start(() => {
          // Heard her: the engine has stopped; the request is next.
          releaseSpeech(WAKE_ID)
          setWaiting(false)
          listenRef.current(true)
        })
        .then(() => {
          if (ownsSpeech(WAKE_ID)) setWaiting(true)
          else engine.stop()
        })
        .catch((err) => {
          releaseSpeech(WAKE_ID)
          setWaiting(false)
          // Not allowed the microphone: switched off, rather than asked again
          // and again. Anything else is tried again in a moment.
          if (refused(err)) {
            gaveUp = true
            setWake(false)
          }
        })
        .finally(() => {
          starting = false
        })
    }
    tryWake()
    const every = setInterval(tryWake, WAKE_RETRY_MS)
    return () => {
      clearInterval(every)
      if (ownsSpeech(WAKE_ID)) stopWake()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeOn, appActive, open])

  // Not left listening past a minute; never behind a closed panel. Cut off
  // mid-request, it is not sent half-said: what was heard is put in the box,
  // to be finished or sent as it is.
  useEffect(() => {
    if (!listening) return
    const t = setTimeout(() => {
      if (!ownsSpeech(SPEECH_ID) || sent.current) return
      const said = request.current.trim()
      stopListening()
      listeningCue('stop')
      if (said) {
        setTyped(said.slice(0, MAX_REQUEST))
        setRanOut(true)
        setStage('typing')
      } else {
        setAnswer('Didn’t hear anything. Try again, or type it.')
        setStage('answered')
      }
    }, LISTEN_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening])
  useEffect(
    () => () => {
      if (pauseTimer.current) clearTimeout(pauseTimer.current)
      if (ownsSpeech(WAKE_ID)) {
        wakeEngine?.stop()
        releaseSpeech(WAKE_ID)
      }
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
          'Mission Portal needs the microphone to listen for “Hey Miriam”. You can turn it on in Settings.'
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
    stopSpeaking()
    setOpen(false)
  }
  // An answer stays up a while, then goes, so the bar is not left over the page.
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useEffect(() => {
    if (stage !== 'answered' || !open) return
    const t = setTimeout(() => closeRef.current(), ANSWER_MS)
    return () => clearTimeout(t)
  }, [stage, open, answer])
  const typeInstead = () => {
    stopListening()
    sent.current = false
    setTyped(heard)
    setStage('typing')
  }

  // Woken by her name and listening: the bar in her colour, so it is seen.
  const called = woken && listening && stage === 'listening'
  const ink = called ? 'white' : colors.text
  const soft = called ? 'rgba(255,255,255,0.85)' : colors.textMuted
  // What she says. Called by name, she answers as Samuel did: "Here I am."
  const title =
    stage === 'thinking'
      ? 'Working on it…'
      : stage === 'typing'
        ? ranOut
          ? 'That’s a minute — finish it or send it'
          : 'What can I do?'
        : listening
          ? called && !heard
            ? 'Hineni — I am here'
            : 'Listening…'
          : null

  return (
    <>
      <Pressable
        onPress={() => listen()}
        accessibilityRole="button"
        accessibilityLabel={waiting ? 'Ask Miriam. Listening for “Hey Miriam”' : 'Ask Miriam'}
        hitSlop={6}
        style={[
          styles.button,
          { borderColor: colors.primary, backgroundColor: open ? colors.primary : 'transparent' },
        ]}
      >
        <XStack alignItems="center" gap="$1.5">
          {waiting ? <View style={[styles.dot, { backgroundColor: '#2ecc71' }]} /> : null}
          <Text fontSize={13} fontWeight="700" color={open ? 'white' : colors.primary}>
            🎤 Miriam
          </Text>
        </XStack>
      </Pressable>

      {/* A bar at the top, not a screen: a chord sheet stays in view beneath. */}
      <FloatingLayer visible={open} onRequestClose={close}>
        <View style={[styles.anchor, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <YStack
            style={styles.bar}
            backgroundColor={called ? colors.primary : colors.surface}
            borderColor={colors.primary}
            borderWidth={called ? 0 : 1}
            borderRadius="$4"
            paddingHorizontal="$3"
            paddingVertical="$2"
            gap="$2"
            width="94%"
            maxWidth={560}
            accessibilityRole="alert"
          >
            <XStack alignItems="center" gap="$2.5">
              <MiriamBadge
                color={called ? 'white' : colors.primary}
                letter={called ? colors.primary : 'white'}
                pulsing={listening && stage === 'listening'}
              />
              <YStack flex={1} gap="$0.5">
                {/* Whose bar this is: hers, not the app's. */}
                <Text color={soft} fontSize={11} fontWeight="800" letterSpacing={1.5}>
                  MIRIAM
                </Text>
                {title ? (
                  <Text color={ink} fontSize="$4" fontWeight="700" numberOfLines={1}>
                    {title}
                  </Text>
                ) : null}
                {stage === 'typing' ? null : heard ? (
                  <Text color={ink} fontSize="$3" fontStyle="italic" numberOfLines={3}>
                    “{heard}”
                  </Text>
                ) : stage === 'listening' ? (
                  <Text color={soft} fontSize="$2" numberOfLines={2}>
                    Ask or say what to do — “What’s the dress code for Revival in the Heartland?”
                  </Text>
                ) : null}
                {answer ? (
                  <Text color={ink} fontSize="$3" fontWeight="600" numberOfLines={6}>
                    {answer}
                  </Text>
                ) : null}
              </YStack>
              {stage === 'listening' && heard ? (
                <Pressable
                  onPress={() => send(request.current)}
                  accessibilityRole="button"
                  style={[styles.small, { backgroundColor: called ? 'white' : colors.primary }]}
                >
                  <Text color={called ? colors.primary : 'white'} fontWeight="700" fontSize="$2">
                    Done
                  </Text>
                </Pressable>
              ) : null}
              {stage === 'answered' ? (
                <Pressable
                  onPress={() => listen()}
                  accessibilityRole="button"
                  accessibilityLabel="Ask again"
                  style={[styles.small, { backgroundColor: colors.primary }]}
                >
                  <Text color="white" fontWeight="700" fontSize="$2">
                    {available ? '🎤 Again' : 'Again'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                style={styles.close}
              >
                <Text color={soft} fontSize="$4">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            {stage === 'typing' ? (
              <XStack gap="$2" alignItems="flex-end">
                <TextInput
                  value={typed}
                  onChangeText={setTyped}
                  placeholder="What should Miriam do?"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  multiline
                  maxLength={MAX_REQUEST}
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
                    styles.small,
                    { backgroundColor: colors.primary, opacity: typed.trim() ? 1 : 0.5 },
                  ]}
                >
                  <Text color="white" fontWeight="700" fontSize="$2">
                    Send
                  </Text>
                </Pressable>
              </XStack>
            ) : null}

            {/* Typing, and "Hey Miriam" on or off: kept out of the way once she hears something. */}
            {!heard && stage !== 'thinking' ? (
              <XStack alignItems="center" justifyContent="space-between" gap="$3">
                {stage !== 'typing' ? (
                  <Pressable onPress={typeInstead} accessibilityRole="button" style={styles.link}>
                    <Text color={ink} fontSize="$2" fontWeight="600">
                      ⌨︎ Type instead
                    </Text>
                  </Pressable>
                ) : (
                  <View />
                )}
                {wakeEngine ? (
                  <Pressable
                    onPress={toggleWake}
                    accessibilityRole="switch"
                    aria-checked={wakeOn}
                    accessibilityLabel="Listen for “Hey Miriam” on this device"
                    accessibilityHint={
                      Platform.OS === 'web'
                        ? 'While this page is open. Hears her name and nothing else, in the browser. An 18 MB download the first time.'
                        : 'While the app is open. Hears her name and nothing else, on this phone. Not over a loud band.'
                    }
                    style={styles.link}
                  >
                    <XStack alignItems="center" gap="$2">
                      <Text color={ink} fontSize="$2" fontWeight="600">
                        “Hey Miriam”
                      </Text>
                      <View
                        style={[
                          styles.track,
                          {
                            backgroundColor: wakeOn
                              ? called
                                ? 'white'
                                : colors.primary
                              : colors.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.knob,
                            { backgroundColor: called && wakeOn ? colors.primary : 'white' },
                            wakeOn ? styles.knobOn : null,
                          ]}
                        />
                      </View>
                    </XStack>
                  </Pressable>
                ) : null}
              </XStack>
            ) : null}
          </YStack>
        </View>
      </FloatingLayer>
    </>
  )
}

/**
 * Miriam's mark — an M in a circle, so the bar is plainly hers — with rings
 * pulsing out from it while she listens.
 */
function MiriamBadge({
  color,
  letter,
  pulsing,
}: {
  color: string
  letter: string
  pulsing: boolean
}) {
  const [pulse] = useState(() => new Animated.Value(0))
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      })
    )
    if (!pulsing) return
    loop.start()
    return () => loop.stop()
  }, [pulse, pulsing])
  const ring = (delay: number) => {
    const t = pulse.interpolate({
      inputRange: [0, delay, 1],
      outputRange: [0, 0, 1 - delay],
      extrapolate: 'clamp',
    })
    return {
      position: 'absolute' as const,
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: color,
      opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
      transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.25] }) }],
    }
  }
  return (
    <View
      style={styles.orb}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {pulsing ? <Animated.View style={ring(0)} /> : null}
      {pulsing ? <Animated.View style={ring(0.35)} /> : null}
      <View style={[styles.orbDot, { backgroundColor: color }]}>
        <Text color={letter} fontSize={15} fontWeight="800">
          M
        </Text>
      </View>
    </View>
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
  anchor: {
    alignItems: 'center',
  },
  bar: {
    // The layer passes touches through; the bar takes its own.
    pointerEvents: 'auto',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  orb: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    minHeight: 44,
    maxHeight: 96,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    // 16pt: smaller, and an iPhone zooms the page in on the field.
    fontSize: 16,
    textAlignVertical: 'top',
  },
  link: {
    minHeight: 36,
    justifyContent: 'center',
  },
  track: {
    width: 40,
    height: 24,
    borderRadius: 12,
    padding: 3,
  },
  knob: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  knobOn: {
    marginLeft: 16,
  },
})
