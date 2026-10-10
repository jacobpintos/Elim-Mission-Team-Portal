import { useEffect, useId, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import {
  claimSpeech,
  ownsSpeech,
  releaseSpeech,
  speechTakeable,
  withSpeech,
  withSpeechInBackground,
} from '@/lib/speechOwner'
import { listeningCue } from '@/lib/listeningCue'
import { canRecogniseOnDevice, isOffline } from '@/lib/speechSupport'
import { spokenWords } from '@/lib/songRequest'

/** What `handle` returns for "stop listening": voice control turns itself off. */
export const STOP_LISTENING = '\u0000stop'

/** How long a pause ends a phrase, so it can be acted on before the recogniser says so. */
const PAUSE_MS = 700
/** The same, after a word that plainly has more to come: "queue…", "…in". */
const PAUSE_MORE_MS = 1600
const MORE_TO_COME =
  /\b(?:queue|cue|q|few|kill|cute|open|opened|opening|switch to|change to|pull up|bring up|up next|key|key of|in|at|on|to|speed|level|miriam)$/i
/** How long a phrase that did nothing is kept, as the first half of one cut at a pause. */
const CARRY_MS = 3000
/** Only a few words: the start of a command, not a line being sung. */
const CARRY_WORDS = 4
/**
 * A word on its own is a command only after this long without words, or
 * just after another command: straight after words that did nothing it is
 * the end of a line held on a long note — "no turning … back".
 */
const LONE_WORD_QUIET_MS = 1500
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
 *
 * Off, with "Hey Miriam" switched on (`byName`), it listens anyway, for her
 * name alone (`handle` is told so: nothing sung is taken as a command) — in
 * the background, giving way to anyone else who wants the microphone, and
 * taking over from the app's own listening for her name while the sheet is
 * open, so what follows her name is heard here.
 */
export function useSheetVoice(
  open: boolean,
  handle: (phrase: string, alternatives: string[], onlyName: boolean) => string | null,
  hints: string[],
  byName = false
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
  // Listening for her name refused (no microphone, no signal): not tried again on this sheet.
  const [nameRefused, setNameRefused] = useState(false)
  const forName = available && open && byName && !on && !nameRefused
  const forNameRef = useRef(forName)
  const onRef = useRef(on)
  useEffect(() => {
    forNameRef.current = forName
    onRef.current = on
  })
  const [feedback, setFeedback] = useState<string | null>(null)
  // What is being heard right now, before it is acted on: shown, so they
  // can see they were heard.
  const [heard, setHeard] = useState('')
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

  // A short phrase that did nothing, kept a moment: "queue…" [pause]
  // "…10,000 Reasons in D" is one command cut in two.
  const carried = useRef<{ text: string; at: number } | null>(null)
  // When words were last heard, how long it had been quiet before this
  // phrase began, and whether the phrase before it was a command.
  const lastWordsAt = useRef(0)
  const quietBefore = useRef(Infinity)
  const phraseOpen = useRef(false)
  const lastWasCommand = useRef(false)
  const act = (phrase: string, alternatives: string[]) => {
    phraseOpen.current = false
    setHeard('')
    const words = spokenWords(phrase).join(' ')
    if (!words) return
    const last = lastActed.current
    if (last && last.words === words && Date.now() - last.at < REPEAT_MS) return
    const before =
      carried.current && Date.now() - carried.current.at < CARRY_MS ? carried.current.text : null
    carried.current = null
    let done = before
      ? handleRef.current(
          `${before} ${phrase}`,
          alternatives.map((a) => `${before} ${a}`),
          !onRef.current
        )
      : null
    const loneWordInSong =
      words.split(' ').length === 1 &&
      quietBefore.current < LONE_WORD_QUIET_MS &&
      !lastWasCommand.current
    if (!done && !loneWordInSong) done = handleRef.current(phrase, alternatives, !onRef.current)
    lastWasCommand.current = Boolean(done)
    if (!done && words.split(' ').length <= CARRY_WORDS) {
      carried.current = { text: phrase, at: Date.now() }
    }
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

  /** Listening: for commands, or (`background`) for her name alone. */
  const listen = (background = false) => {
    if (ownsSpeech(id)) {
      // Already listening for her name: now for everything, as it is.
      if (!background) claimSpeech(id)
      return
    }
    consumed.current = ''
    const start = () =>
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
    if (background) {
      withSpeechInBackground(id, () => ExpoSpeechRecognitionModule.abort(), start)
    } else {
      withSpeech(id, start)
    }
  }
  /** Listening again, as wanted, once it has stopped. */
  const again = () => {
    if (ownsSpeech(id) || !speechTakeable()) return
    if (wanted) listen()
    else if (forNameRef.current) listen(true)
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
    if (phrase) {
      const now = Date.now()
      if (!phraseOpen.current) {
        phraseOpen.current = true
        quietBefore.current = now - lastWordsAt.current
      }
      lastWordsAt.current = now
      setHeard(phrase.split(/\s+/).slice(-8).join(' '))
    }
    if (e.isFinal) {
      act(phrase, others)
      consumed.current = ''
      return
    }
    pauseTimer.current = setTimeout(
      () => {
        pauseTimer.current = null
        act(phrase, others)
        consumed.current = text
      },
      MORE_TO_COME.test(phrase.trim()) ? PAUSE_MORE_MS : PAUSE_MS
    )
  })

  // Started again whenever it stops, while wanted.
  useSpeechRecognitionEvent('end', () => {
    if (!ownsSpeech(id)) return
    releaseSpeech(id)
    if (open) setTimeout(again, 250)
  })
  useSpeechRecognitionEvent('error', (e) => {
    if (!ownsSpeech(id)) return
    releaseSpeech(id)
    if (e.error === 'aborted') return
    if (!wanted) {
      // Listening for her name: quietly given up if it can't be done.
      if (e.error === 'not-allowed') return setNameRefused(true)
      if (e.error === 'network') {
        if (onDevice.current || !canRecogniseOnDevice()) return setNameRefused(true)
        onDevice.current = true
      }
      if (open) setTimeout(again, 400)
      return
    }
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
    if (open) setTimeout(again, 400)
  })

  // On when wanted: on opening, on moving to another song of the set, and
  // whenever the microphone comes free again (a note dictated meanwhile).
  useEffect(() => {
    if (!on || !open) return
    const tryListen = () => {
      if (wanted && speechTakeable() && !ownsSpeech(id)) listen()
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

  // Listening for her name, while off and "Hey Miriam" is on: on the phone's
  // own recogniser where it has one (nothing sent off, no time limit).
  useEffect(() => {
    if (!forName) return
    onDevice.current = canRecogniseOnDevice()
    const tryListen = () => {
      if (speechTakeable() && !ownsSpeech(id)) listen(true)
    }
    const first = setTimeout(tryListen, 300)
    const every = setInterval(tryListen, 2000)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      // Switched on fully: carries on, as it is (`listen`).
      if (!onRef.current) stopListening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forName])

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
      // At once: listening for her name hands over rather than stopping (above).
      onRef.current = true
      listeningCue('start')
      setOn(true)
      // At once, within the tap: a browser may not start listening later.
      if (speechTakeable()) listen()
    } else {
      wanted = false
      onRef.current = false
      setOn(false)
      stopListening()
      listeningCue('stop')
    }
  }

  useEffect(() => {
    toggleRef.current = toggle
  })

  return { available, on, toggle, feedback, show, heard, forName }
}
