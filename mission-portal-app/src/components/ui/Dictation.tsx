import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Text } from 'tamagui'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import { useThemeColors } from '@/theme/useThemeColors'
import { useUIStore } from '@/stores/uiStore'
import { joinDictation } from '@/lib/dictation'
import { claimSpeech, ownsSpeech, releaseSpeech } from '@/lib/speechOwner'
import { listeningCue } from '@/lib/listeningCue'
import { canRecogniseOnDevice, isOffline } from '@/lib/speechSupport'

/** Long enough for a full account; past it, the mic is not left on by mistake. */
const MAX_MS = 2 * 60 * 1000

function recognitionAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable()
  } catch {
    return false
  }
}

/**
 * A 🎤 for a text field: tap, speak, and the words are added to what is
 * there, appearing as they are made out. Tap again to stop.
 *
 * For writing that is long, or done with busy hands — a security report, a
 * note on stage, a message — where the phone keyboard's own mic is a step
 * further away, and on a computer, which has none. The phone's speech
 * recognition in the app; the browser's on the web (Chrome, Safari). Not
 * shown where there is none to use.
 *
 * `onDevice`: kept on the phone where it can be — for what should not be
 * sent off to be transcribed, like a security report. Where the phone
 * cannot, or on the web, it is transcribed as the keyboard's mic would be.
 */
export function DictateButton({
  value,
  onChangeText,
  multiline = false,
  onDevice = false,
  style,
}: {
  value: string
  onChangeText: (text: string) => void
  multiline?: boolean
  onDevice?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const id = `dictate-${useId()}`
  const [available] = useState(recognitionAvailable)
  const [listening, setListening] = useState(false)
  // What the field held when listening began, and what has been settled since.
  const base = useRef('')
  const settled = useRef('')
  // Listening on the phone itself: asked for, or for want of a signal.
  const local = useRef(false)
  // Kept current so a result writes onto the field as the parent has it now.
  const write = useRef(onChangeText)
  useEffect(() => {
    write.current = onChangeText
  }, [onChangeText])

  const show = (interim: string) => {
    const spoken = [settled.current, interim].filter(Boolean).join(' ')
    write.current(joinDictation(base.current, spoken, multiline))
  }

  const begin = () => {
    claimSpeech(id)
    setListening(true)
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      requiresOnDeviceRecognition: local.current,
      iosTaskHint: 'dictation',
    })
  }

  useSpeechRecognitionEvent('result', (e) => {
    if (!ownsSpeech(id)) return
    const text = e.results[0]?.transcript ?? ''
    if (e.isFinal) {
      settled.current = [settled.current, text.trim()].filter(Boolean).join(' ')
      show('')
    } else {
      show(text)
    }
  })
  useSpeechRecognitionEvent('end', () => {
    if (!ownsSpeech(id)) return
    releaseSpeech(id)
    setListening(false)
    listeningCue('stop')
  })
  useSpeechRecognitionEvent('error', (e) => {
    if (!ownsSpeech(id)) return
    releaseSpeech(id)
    setListening(false)
    // Lost the signal: carry on, on the phone, keeping what was said so far.
    if (e.error === 'network' && !local.current && canRecogniseOnDevice()) {
      local.current = true
      base.current = joinDictation(base.current, settled.current, multiline)
      settled.current = ''
      begin()
      return
    }
    listeningCue('stop')
    if (e.error === 'not-allowed') {
      toast(
        Platform.OS === 'web'
          ? 'The browser isn’t allowed to use the microphone here.'
          : 'Mission Portal isn’t allowed to use the microphone. You can turn it on in Settings.',
        'error'
      )
    } else if (e.error === 'network') {
      toast('Couldn’t reach speech recognition — check your connection.', 'error')
    }
  })

  // Not left listening: stopped after a while, and when the field goes away.
  useEffect(() => {
    if (!listening) return
    const timer = setTimeout(() => {
      if (ownsSpeech(id)) ExpoSpeechRecognitionModule.stop()
    }, MAX_MS)
    return () => clearTimeout(timer)
  }, [listening, id])
  useEffect(
    () => () => {
      if (ownsSpeech(id)) {
        releaseSpeech(id)
        ExpoSpeechRecognitionModule.abort()
      }
    },
    [id]
  )

  const start = async () => {
    if (Platform.OS !== 'web') {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!permission.granted) {
        toast(
          'Mission Portal needs the microphone and speech recognition to take dictation. You can turn them on in Settings.',
          'error'
        )
        return
      }
    }
    base.current = value
    settled.current = ''
    // On the phone where asked to, or where there is no signal to send to.
    local.current =
      Platform.OS !== 'web' && canRecogniseOnDevice() && (onDevice || (await isOffline()))
    listeningCue('start')
    // A moment for the chime before the microphone takes the sound over; a
    // browser plays it alongside, and must start listening within the tap.
    if (Platform.OS !== 'web') await new Promise((r) => setTimeout(r, 180))
    begin()
  }

  const stop = () => {
    if (ownsSpeech(id)) ExpoSpeechRecognitionModule.stop()
  }

  if (!available) return null

  return (
    <Pressable
      onPress={listening ? stop : start}
      accessibilityRole="button"
      accessibilityLabel={listening ? 'Stop dictating' : 'Dictate'}
      style={[
        styles.button,
        {
          backgroundColor: listening ? colors.primary : colors.surface,
          borderColor: colors.primary,
        },
        style,
      ]}
    >
      <Text fontSize={listening ? 13 : 16} color={listening ? 'white' : colors.text}>
        {listening ? '■' : '🎤'}
      </Text>
    </Pressable>
  )
}

/**
 * A text field with a 🎤 in its corner — bottom right in a field of several
 * lines, middle right in one of one. The field is given room on the right
 * so what is typed never runs under the button.
 *
 * Wraps the field as it is: pass the same value and setter the field uses.
 */
export function WithDictation({
  value,
  onChangeText,
  multiline = false,
  onDevice = false,
  children,
}: {
  value: string
  onChangeText: (text: string) => void
  multiline?: boolean
  onDevice?: boolean
  children: ReactNode
}) {
  const [available] = useState(recognitionAvailable)
  const field = Children.only(children)
  const padded =
    available && isValidElement(field)
      ? cloneElement(field as ReactElement<{ style?: unknown }>, {
          style: [(field as ReactElement<{ style?: unknown }>).props.style, { paddingRight: 46 }],
        })
      : field
  return (
    <View style={styles.wrap}>
      {padded}
      <DictateButton
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        onDevice={onDevice}
        style={multiline ? styles.cornerBottom : styles.cornerMiddle}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerBottom: {
    position: 'absolute',
    right: 5,
    bottom: 5,
  },
  cornerMiddle: {
    position: 'absolute',
    right: 5,
    top: '50%',
    marginTop: -18,
  },
})
