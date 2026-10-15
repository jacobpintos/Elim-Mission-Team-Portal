import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import {
  claimSpeechInBackground,
  ownsSpeech,
  releaseSpeech,
  speechFree,
  withSpeech,
} from '@/lib/speechOwner'
import { CUE_MS, listeningCue, prepareCues } from '@/lib/listeningCue'
import { canRecogniseOnDevice, isOffline } from '@/lib/speechSupport'
import { wakeEngine } from '@/lib/wakeEngine'
import { namesHer, withoutHerName } from '@/lib/wakeWord'
import { MAX_REQUEST } from '@/lib/miriam'
import { heardRight } from '@/lib/miriamHearing'
import { tourAsked } from '@/lib/miriamTour'
import { songAsked } from '@/lib/miriamSongs'
import { songHost } from '@/lib/songHost'
import { parseSheetCommand } from '@/lib/sheetCommands'
import { KEY_HINTS } from '@/lib/songRequest'
import { loadAliases } from '@/lib/songAliases'
import { useChordSheetsStore } from '@/stores/chordSheetsStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useMediaPlaybackStore } from '@/stores/mediaPlaybackStore'
import { useMiriamStore, WAKE_KEY } from '@/stores/miriamStore'
import { extractYouTubeId } from '@/stores/musicStore'
import { useUsersStore } from '@/stores/usersStore'
import type { Heard } from './askMiriam'
import { stopSpeaking, unlockSpeech } from './speak'
import type { PanelState } from './usePanelState'

/** Claims on the microphone (lib/speechOwner): the request, and the wake word. */
const SPEECH_ID = 'miriam'
const WAKE_ID = 'miriam-wake'
/** A pause this long ends the request: long enough to think mid-sentence. */
const PAUSE_MS = 1800
/** The longest a request is listened to: a minute, room for a long one. */
const LISTEN_MS = 60_000
/** How often listening for "Hey Miriam" is started again when it has stopped. */
const WAKE_RETRY_MS = 3000
/** What is playing (stores/mediaPlaybackStore) is a video: a YouTube player is up. */
const isVideo = (url: string | null) => !!url && !!extractYouTubeId(url)
/**
 * A song named in full, with a song screen up: no need to wait out a pause
 * for the rest — a beat for a key to follow, none once one has.
 */
const SONG_PAUSE_MS = 700
const SONG_WITH_KEY_PAUSE_MS = 300
/** A tour asked for, of a part named ("a tour of worship"). */
const TOUR_PAUSE_MS = 1000
/** The end of a key that can't run on: "E flat", "F sharp minor", "G major". */
const KEY_DONE = /(?:flat|sharp|minor|major|[♭♯#])$/i
/** Words a request is likely to hold, given to the recogniser to expect. */
const APP_WORDS = [
  'Miriam',
  'event',
  'task',
  'set list',
  'reminder',
  'availability',
  'carpool',
  'dress code',
  'announcement',
  'kaizen',
  'queue',
]

/** The names of events from a week ago to two months on, for the recogniser to expect. */
function eventTitles(): string[] {
  const now = Date.now()
  const from = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10)
  const to = new Date(now + 60 * 86_400_000).toISOString().slice(0, 10)
  const titles = useEventsStore
    .getState()
    .templates.filter((t) => t.isRec || ((t.date ?? '') >= from && (t.date ?? '') <= to))
    .map((t) => t.title)
    .filter(Boolean)
  return [...new Set(titles)].slice(0, 30)
}

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
 * Miriam's ears: a request heard by speech recognition, tapped for or woken
 * by her name, and "Hey Miriam" listened for in between (lib/wakeEngine).
 *
 * A request is heard until a pause ends it (`send` is handed what was heard),
 * or a minute runs out — then what was heard is put in the box to finish.
 */
export function useListening(
  panel: PanelState,
  {
    appActive,
    send,
  }: {
    appActive: boolean
    /** A request heard in full: worked out (./useMiriamConversation). */
    send: (text: string) => void
  }
) {
  const {
    open,
    setOpen,
    setStage,
    setHeard,
    setTyped,
    setRanOut,
    setAnswer,
    setChoices,
    setUnderstood,
    askedRef,
    setPending,
    setAskingBack,
    setSaid,
    confirmingByVoiceRef,
    setLink,
    setBriefing,
    setUndo,
    video,
    setSongGuesses,
    setVideoGuesses,
    setStay,
    setWoken,
    sentRef,
    endVoiceConfirm,
  } = panel
  const users = useUsersStore((s) => s.users)
  const groups = useGroupsStore((s) => s.groups)

  const [available] = useState(recognitionAvailable)
  const [listening, setListening] = useState(false)
  // Her name said at the start of what was heard (taken off what is shown and sent).
  const saidHerNameRef = useRef(false)
  // How the request was heard: the recogniser's other guesses, and how sure it was.
  const heardAsRef = useRef<Heard | null>(null)
  // "Hey Miriam": wanted on this device, and listening for it right now.
  const wakeOn = useMiriamStore((s) => s.wakeOn)
  const setWakeOn = useMiriamStore((s) => s.setWakeOn)
  const [waiting, setWaiting] = useState(false)

  // Listening for a request now (speech recognition).
  const requesting = useRef(false)
  // What the request's listening has heard: finished phrases, and the one
  // still being made out.
  const settled = useRef('')
  const requestRef = useRef('')
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    prepareCues()
    AsyncStorage.getItem(WAKE_KEY)
      .then((v) => setWakeOn(v === '1'))
      .catch(() => {})
  }, [])

  const setWake = (on: boolean) => useMiriamStore.getState().saveWakeOn(on)

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

  // Words this device has learned for songs, ready for matching as they are heard.
  const songAliases = useRef<ReadonlyMap<string, string>>(new Map())
  /** How long to wait after the last words before acting on them. */
  const pauseFor = (text: string) => {
    // A tour of a part named in full: nothing more to wait for.
    if (tourAsked(text)?.part) return TOUR_PAUSE_MS
    if (!songHost()) return PAUSE_MS
    const sheets = useChordSheetsStore.getState().chordSheets
    const meant = heardRight(text).text
    const cmd = parseSheetCommand(meant, sheets, songAliases.current)
    const asked =
      cmd?.type === 'queue'
        ? { key: cmd.request.key }
        : songAsked(sheets, songAliases.current, meant, true)
    if (!asked || ('kind' in asked && asked.kind !== 'open')) return PAUSE_MS
    // "in E" may yet become "in E flat" or "in E minor": only a key that can
    // say no more is acted on at once.
    return asked.key && KEY_DONE.test(text.trim()) ? SONG_WITH_KEY_PAUSE_MS : SONG_PAUSE_MS
  }

  /** Listen for a request — tapped, or woken by her name. */
  /** `keepQuestion`: listening for the reply to what she asked back, which stays shown. */
  const listen = async (byName = false, keepQuestion = false) => {
    // Tapped, this lets a browser say the answer; called by name, the tap
    // that turned listening on did.
    unlockSpeech()
    stopWake()
    stopSpeaking()
    loadAliases().then((m) => (songAliases.current = m))
    setChoices([])
    setSongGuesses([])
    setVideoGuesses([])
    setStay(false)
    if (!keepQuestion) setPending(null)
    setLink(null)
    setUnderstood('')
    setBriefing(null)
    setUndo(null)
    setWoken(byName)
    setRanOut(false)
    if (byName) AccessibilityInfo.announceForAccessibility('Miriam: Hineni, I am here')
    sentRef.current = false
    settled.current = ''
    saidHerNameRef.current = false
    heardAsRef.current = null
    requestRef.current = ''
    setHeard('')
    if (!keepQuestion) {
      setAnswer(null)
      setSaid(null)
      setAskingBack(false)
      askedRef.current = ''
    }
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
      // For a song, the phone's own recogniser where it has one: words come
      // back sooner than from the network, and the titles are given as hints.
      onDevice = songHost() ? canRecogniseOnDevice() : (await isOffline()) && canRecogniseOnDevice()
    }
    // The chime, heard — the ringer off or not — and played out before the
    // microphone takes the sound over; a browser plays it alongside, and
    // must start listening within the tap.
    listeningCue('start')
    if (Platform.OS !== 'web') await new Promise((r) => setTimeout(r, CUE_MS + 30))
    withSpeech(SPEECH_ID, () => {
      requesting.current = true
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: onDevice,
        // The names a request is likeliest to hold, and the hardest to hear:
        // with a song screen up, the songs'.
        contextualStrings: (songHost()
          ? [
              'queue',
              'up next',
              ...useChordSheetsStore.getState().chordSheets.map((c) => c.title),
              ...KEY_HINTS,
            ]
          : [
              ...APP_WORDS,
              ...eventTitles(),
              ...groups.map((g) => g.name),
              ...users.map((u) => u.displayName).filter(Boolean),
            ]
        ).slice(0, 100),
        // The recogniser's next guesses too, for Claude to weigh against what makes sense.
        maxAlternatives: 3,
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
    if (!ownsSpeech(SPEECH_ID) || !requesting.current || sentRef.current) return
    const text = e.results[0]?.transcript ?? ''
    const before = settled.current
    if (e.isFinal) settled.current = joined(settled.current, text)
    const all = e.isFinal ? settled.current : joined(settled.current, text)
    if (namesHer(all)) saidHerNameRef.current = true
    if (e.isFinal) {
      const confidence = e.results[0]?.confidence
      heardAsRef.current = {
        alternatives: e.results
          .slice(1, 3)
          .map((r) => r.transcript?.trim())
          .filter((t): t is string => !!t && t !== text.trim())
          .map((t) => withoutHerName(joined(before, t))),
        confidence: typeof confidence === 'number' && confidence >= 0 ? confidence : null,
      }
    }
    requestRef.current = withoutHerName(all)
    setHeard(requestRef.current)
    clearPause()
    pauseTimer.current = setTimeout(() => send(requestRef.current), pauseFor(requestRef.current))
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
    if (!sentRef.current && requestRef.current.trim()) send(requestRef.current)
    else if (confirmingByVoiceRef.current) {
      // Nothing heard for the change on screen: left to a tap.
      endVoiceConfirm()
      setStage('answered')
    }
  })
  useSpeechRecognitionEvent('error', (e) => {
    if (!ownsSpeech(SPEECH_ID)) return
    const was = requesting.current
    requesting.current = false
    releaseSpeech(SPEECH_ID)
    setListening(false)
    if (e.error === 'aborted' || !was) return
    listeningCue('stop')
    if (confirmingByVoiceRef.current) {
      // Nothing heard for the change on screen: left to a tap, as it was.
      endVoiceConfirm()
      setStage('answered')
      return
    }
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
  // Never while a video is up: the microphone opening under a YouTube player
  // (as it did the moment "play" closed the panel) can switch the audio
  // device beneath it — a Bluetooth headset to its call mode — and the
  // player stops with "Audio renderer error".
  const listenRef = useRef(listen)
  useEffect(() => {
    listenRef.current = listen
  })
  const videoUp = useMediaPlaybackStore((s) => isVideo(s.activeUrl)) || !!video
  useEffect(() => {
    if (!wakeEngine || !wakeOn || !appActive || open || videoUp) return
    const engine = wakeEngine
    let starting = false
    let gaveUp = false
    const tryWake = () => {
      if (starting || gaveUp || ownsSpeech(WAKE_ID) || !speechFree()) return
      // Opened since this started: the player's own effect claims it first.
      if (isVideo(useMediaPlaybackStore.getState().activeUrl)) return
      starting = true
      claimSpeechInBackground(WAKE_ID, stopWake)
      engine
        .start(
          () => {
            // Heard her: the engine has stopped; the request is next.
            releaseSpeech(WAKE_ID)
            setWaiting(false)
            listenRef.current(true)
          },
          () => {
            // Stopped by itself (headphones in, a call): started again in a moment.
            releaseSpeech(WAKE_ID)
            setWaiting(false)
          }
        )
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
  }, [wakeOn, appActive, open, videoUp])

  // Not left listening past a minute; never behind a closed panel. Cut off
  // mid-request, it is not sent half-said: what was heard is put in the box,
  // to be finished or sent as it is.
  useEffect(() => {
    if (!listening) return
    const t = setTimeout(() => {
      if (!ownsSpeech(SPEECH_ID) || sentRef.current) return
      const said = requestRef.current.trim()
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
    unlockSpeech()
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

  return {
    available,
    listening,
    waiting,
    wakeOn,
    requestRef,
    heardAsRef,
    saidHerNameRef,
    setWake,
    stopWake,
    stopListening,
    listen,
    toggleWake,
  }
}

export type Listening = ReturnType<typeof useListening>
