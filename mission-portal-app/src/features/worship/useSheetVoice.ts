import { useEffect, useId, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import { ownsSpeech, releaseSpeech, speechTakeable, withSpeech } from '@/lib/speechOwner'
import { listeningCue } from '@/lib/listeningCue'
import { canRecogniseOnDevice, isOffline } from '@/lib/speechSupport'
import { spokenWords } from '@/lib/songRequest'

/** What `handle` returns for "stop listening": voice control turns itself off. */
export const STOP_LISTENING = '\u0000stop'

/** How long a pause ends a phrase, so it can be acted on before the recogniser says so. */
const PAUSE_MS = 700
/** The same words heard again this soon are the same phrase, not a second command. */
const REPEAT_MS = 3000
/** How long what was done stays on screen ("Next song"). */
const FEEDBACK_MS = 2500

// Wanted across the sheets of a set: switching songs mounts a new viewer,
// and voice control should carry on into it. Off when the sheet is closed.
let wanted = false

/**
 * Voice control for an open chord sheet: hands-free, through a whole set.
 *
 * Switched on with the 🎤 in the sheet's header, and then listens until
 * switched off or the sheet is closed — starting again by itself whenever
 * the recogniser stops (it does, after a minute or a silence), and whenever
 * the microphone comes free after dictating a note.
 *
 * What is heard is cut into phrases at the pauses, and each phrase is
 * offered to `handle`, which acts on it if it is a command and says what it
 * did ("Next song"), shown for a moment. Each phrase is acted on once: a
 * recogniser's later, final version of words already acted on is passed by.
 */
export function useSheetVoice(
  open: boolean,
  handle: (phrase: string, alternatives: string[]) => string | null,
  hints: string[]
) {
  const id = `sheet-voice-${useId()}`
  const [available] = useState(() => {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable()
    } catch {
      return false
    }
  })
  const [on, setOn] = useState(() => wanted && open)
  const [feedback, setFeedback] = useState<string | null>(null)
  const handleRef = useRef(handle)
  const hintsRef = useRef(hints)
  useEffect(() => {
    handleRef.current = handle
    hintsRef.current = hints
  })

  // What of the recogniser's running text has been dealt with, and the last
  // phrase acted on.
  const consumed = useRef('')
  // toggle, for "stop listening" heard before it is declared below.
  const toggleRef = useRef<(next?: boolean) => void>(() => {})
  const lastActed = useRef<{ words: string; at: number } | null>(null)
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onDevice = useRef(false)

  const show = (text: string) => {
    setFeedback(text)
  }
  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), FEEDBACK_MS)
    return () => clearTimeout(t)
  }, [feedback])

  const act = (phrase: string, alternatives: string[]) => {
    const words = spokenWords(phrase).join(' ')
    if (!words) return
    const last = lastActed.current
    if (last && last.words === words && Date.now() - last.at < REPEAT_MS) return
    const done = handleRef.current(phrase, alternatives)
    if (done === STOP_LISTENING) {
      toggleRef.current(false)
      show('Voice control off')
      return
    }
    if (done) {
      lastActed.current = { words, at: Date.now() }
      show(done)
    }
  }

  const listen = () => {
    consumed.current = ''
    withSpeech(id, () =>
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        addsPunctuation: false,
        maxAlternatives: Platform.OS === 'web' ? 1 : 3,
        requiresOnDeviceRecognition: onDevice.current,
        contextualStrings: hintsRef.current.slice(0, 100),
        iosTaskHint: 'confirmation',
        // Alongside whatever is playing, and the microphone as it is.
        iosCategory: {
          category: 'playAndRecord',
          categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'mixWithOthers'],
          mode: 'measurement',
        },
      })
    )
  }

  const stopListening = () => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current)
    pauseTimer.current = null
    if (ownsSpeech(id)) {
      releaseSpeech(id)
      ExpoSpeechRecognitionModule.abort()
    }
  }

  useSpeechRecognitionEvent('result', (e) => {
    if (!ownsSpeech(id)) return
    const alts = (e.results ?? []).map((r) => r.transcript ?? '')
    const text = alts[0] ?? ''
    // A recogniser that keeps one running transcript: only what is new since
    // the last pause. One that starts afresh each phrase: all of it.
    if (!text.startsWith(consumed.current)) consumed.current = ''
    const from = consumed.current.length
    const phrase = text.slice(from).trim()
    const others = alts.slice(1).map((a) => a.slice(from).trim())
    if (pauseTimer.current) clearTimeout(pauseTimer.current)
    pauseTimer.current = null
    if (e.isFinal) {
      act(phrase, others)
      consumed.current = ''
      return
    }
    pauseTimer.current = setTimeout(() => {
      pauseTimer.current = null
      act(phrase, others)
      consumed.current = text
    }, PAUSE_MS)
  })

  // Started again whenever it stops, while wanted.
  useSpeechRecognitionEvent('end', () => {
    if (!ownsSpeech(id)) return
    releaseSpeech(id)
    if (wanted && open) setTimeout(() => wanted && speechTakeable() && listen(), 250)
  })
  useSpeechRecognitionEvent('error', (e) => {
    if (!ownsSpeech(id)) return
    releaseSpeech(id)
    if (e.error === 'aborted') return
    if (e.error === 'not-allowed') {
      wanted = false
      setOn(false)
      show('Microphone not allowed')
      return
    }
    if (e.error === 'network') {
      if (!onDevice.current && canRecogniseOnDevice()) {
        onDevice.current = true
      } else {
        wanted = false
        setOn(false)
        show('No signal for voice control')
        return
      }
    }
    // Nothing heard for a while, or a hiccup: listen on.
    if (wanted && open) setTimeout(() => wanted && speechTakeable() && listen(), 400)
  })

  // On when wanted: on opening, on moving to another song of the set, and
  // whenever the microphone comes free again (a note dictated meanwhile).
  useEffect(() => {
    if (!on || !open) return
    const tryListen = () => {
      if (wanted && speechTakeable()) listen()
    }
    const first = setTimeout(tryListen, 300)
    const every = setInterval(tryListen, 2000)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      stopListening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, open])

  // Closing the sheet ends it.
  useEffect(() => {
    if (!open) wanted = false
  }, [open])

  const toggle = async (next = !on) => {
    if (next) {
      if (Platform.OS !== 'web') {
        const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
        if (!permission.granted) {
          show('Microphone not allowed')
          return
        }
        onDevice.current = (await isOffline()) && canRecogniseOnDevice()
      }
      wanted = true
      listeningCue('start')
      setOn(true)
      // At once, within the tap: a browser may not start listening later.
      if (speechTakeable()) listen()
    } else {
      wanted = false
      setOn(false)
      stopListening()
      listeningCue('stop')
    }
  }

  useEffect(() => {
    toggleRef.current = toggle
  })

  return { available, on, toggle, feedback, show }
}
