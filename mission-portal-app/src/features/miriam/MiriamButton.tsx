import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Linking,
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
import { CUE_MS, listeningCue, prepareCues } from '@/lib/listeningCue'
import { canRecogniseOnDevice, isOffline } from '@/lib/speechSupport'
import { wakeEngine } from '@/lib/wakeEngine'
import { withoutHerName } from '@/lib/wakeWord'
import { MAX_REQUEST, miriamHref } from '@/lib/miriam'
import { anyOverlayOpen } from '@/lib/overlays'
import { rememberName } from '@/lib/miriamMemory'
import { FD } from '@/lib/format'
import { speak, stopSpeaking, unlockSpeech } from './speak'
import { askMiriam, miriamError } from './askMiriam'
import { prepareAction, type Prepared } from './actions'
import { useMiriamStore } from '@/stores/miriamStore'
import { useUsersStore } from '@/stores/usersStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useChordSheetsStore } from '@/stores/chordSheetsStore'
import { ChordSheetViewer } from '@/features/worship/ChordSheetViewer'
import { useSongQueue } from '@/features/worship/useSongQueue'
import { songAsked } from '@/lib/miriamSongs'
import { songHost, songQueue } from '@/lib/songHost'
import { parseSheetCommand } from '@/lib/sheetCommands'
import { keyLabel } from '@/lib/nashvilleNumbers'
import { KEY_HINTS } from '@/lib/songRequest'
import { loadAliases, rememberAlias } from '@/lib/songAliases'
import type { ChordSheet } from '@/types/chordSheet'
import { VideoPlayerModal } from '@/components/ui/VideoPlayerModal'
import { useMusicStore, type MusicItem } from '@/stores/musicStore'
import { useAuthStore } from '@/stores/authStore'
import { screensFor } from '@/lib/miriamScreens'
import { isAdmin } from '@/lib/roles'
import { doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDoc } from '@/lib/liveFirestore'

/** Claims on the microphone (lib/speechOwner): the request, and the wake word. */
const SPEECH_ID = 'miriam'
const WAKE_ID = 'miriam-wake'
/** A pause this long ends the request: long enough to think mid-sentence. */
const PAUSE_MS = 1800
/** The longest a request is listened to: a minute, room for a long one. */
const LISTEN_MS = 60_000
/** How often listening for "Hey Miriam" is started again when it has stopped. */
const WAKE_RETRY_MS = 3000
/**
 * A song named in full, with a song screen up: no need to wait out a pause
 * for the rest — a beat for a key to follow, none once one has.
 */
const SONG_PAUSE_MS = 700
const SONG_WITH_KEY_PAUSE_MS = 300
/** The end of a key that can't run on: "E flat", "F sharp minor", "G major". */
const KEY_DONE = /(?:flat|sharp|minor|major|[♭♯#])$/i
/** How long a confirmed change is waited on before it is said to be waiting for a signal. */
const SEND_WAIT_MS = 12_000
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
  // Events she offers when she isn't sure which was meant, and what was said
  // for it — learned from the one picked — and the question they answer.
  const [choices, setChoices] = useState<{ key: string; title: string; date: string }[]>([])
  const heardName = useRef('')
  const asked = useRef('')
  // A chord sheet asked for: open, in the key asked for. Or, when none was
  // plain, the nearest titles offered — and the words and key it was asked
  // with, the words learned from the one picked (lib/songAliases).
  const [song, setSong] = useState<{
    sheet: ChordSheet
    key: { key: string; minor: boolean } | null
  } | null>(null)
  const sheetQueue = useSongQueue()
  // A change worked out and waiting to be confirmed — or a choice of which.
  const [pending, setPending] = useState<{ name: string; prepared: Prepared } | null>(null)
  // A link to buy something, for a tap to open (in a browser).
  const [link, setLink] = useState<{ url: string; name: string } | null>(null)
  // A video from Content asked for, playing over the page.
  const [video, setVideo] = useState<MusicItem | null>(null)
  const [songGuesses, setSongGuesses] = useState<ChordSheet[]>([])
  const songAsk = useRef<{ name: string; key: { key: string; minor: boolean } | null }>({
    name: '',
    key: null,
  })
  // "Hey Miriam": wanted on this device, and listening for it right now.
  const wakeOn = useMiriamStore((s) => s.wakeOn)
  const setWakeOn = useMiriamStore((s) => s.setWakeOn)
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
    prepareCues()
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

  const send = async (text: string, again = false) => {
    const said = text.trim()
    if (!said || sent.current) return
    // Sent by a tap (the button, or a choice): lets a browser say the answer.
    unlockSpeech()
    sent.current = true
    if (!again) asked.current = said
    setChoices([])
    setSongGuesses([])
    setPending(null)
    setLink(null)
    stopListening()
    setHeard(said)
    // A song, opened here from the sheets on this device: no need to ask.
    // With a song screen up (a sheet open, or the Chord Sheets page), that is
    // all that is asked of her, and it is never sent off to be worked out.
    const sheets = useChordSheetsStore.getState().chordSheets
    const songMode = !!songHost() && sheets.length > 0
    if (!again && sheets.length) {
      const aliases = await loadAliases()
      // "Queue Above All", "Above All next": to come after the open song, not now.
      const cmd = songMode ? parseSheetCommand(withoutHerName(said), sheets, aliases) : null
      if (cmd?.type === 'queue') {
        const { sheet, key, minor } = cmd.request
        const queue = songQueue()
        if (!queue) {
          // Nothing open to come after: it is the song now.
          openSong(sheet, key ? { key, minor } : null)
          return
        }
        queue(sheet, key ? { key, minor } : null)
        const text = `Up next: ${sheet.title}${key ? ` in ${keyLabel(key, minor)}` : ''}`
        setAnswer(text)
        speak(text)
        setStage('answered')
        return
      }
      const asking = songAsked(sheets, aliases, withoutHerName(said), songMode)
      if (asking?.kind === 'open') {
        openSong(asking.sheet, asking.key)
        return
      }
      if (asking?.kind === 'guess') {
        songAsk.current = { name: asking.name, key: asking.key }
        setSongGuesses(asking.sheets)
        const text = 'I couldn’t find that song. Did you mean one of these?'
        setAnswer(text)
        speak(text)
        setStage('answered')
        return
      }
      if (songMode) {
        const text = 'I couldn’t find that song.'
        setAnswer(text)
        speak(text)
        setStage('answered')
        return
      }
    }
    setStage('thinking')
    try {
      const result = await askMiriam(said)
      if (result.kind === 'eventForm') {
        offerEventForm({
          draft: result.draft,
          heard: said,
          notes: result.notes,
          editKey: result.editKey,
        })
        setOpen(false)
        router.navigate('/events' as never)
        return
      }
      if (result.kind === 'taskForm') {
        useMiriamStore.getState().offerTaskForm({ draft: result.draft, notes: result.notes })
        setOpen(false)
        router.navigate('/assignments' as never)
        return
      }
      // A change: worked out into exactly what will be done, and shown to
      // be confirmed — nothing is done until it is.
      if (result.kind === 'confirm') {
        await offerAction(result.name, result.input)
        return
      }
      // A video asked for: played over the page, with nothing said over it.
      const wanted = result.kind === 'answer' ? result.open : null
      if (wanted?.kind === 'video') {
        const item = useMusicStore.getState().items.find((m) => m.id === wanted.id)
        if (item) {
          setVideo(item)
          setOpen(false)
          return
        }
      }
      setAnswer(result.text)
      speak(result.text)
      if (result.kind === 'answer') {
        setChoices(result.choices ?? [])
        heardName.current = result.heardName ?? ''
      }
      // Taken to where the answer is — unless that would pull them out of
      // something open over the page, a chord sheet being played: then it is
      // said and shown here, and the page is left as it is.
      const open = result.kind === 'answer' ? result.open : null
      // Something to buy: its link opened. In a browser, a page may only
      // open a link from a tap, and this answer came after one — so there it
      // is a button to tap.
      if (open?.kind === 'reorder') {
        const found = await reorderLink(open.id)
        if (found && Platform.OS === 'web') setLink(found)
        else if (found) Linking.openURL(found.url).catch(() => setLink(found))
      } else if (open && open.kind !== 'video' && !anyOverlayOpen()) {
        if (open.kind === 'screen') {
          // Only a screen this person has: checked again here.
          const screen = screensFor(useAuthStore.getState().profile).find((x) => x.id === open.id)
          if (screen) router.push(screen.path as never)
        } else {
          router.push(miriamHref(open) as never)
        }
      }
    } catch (err) {
      setAnswer(miriamError(err))
    }
    setStage('answered')
  }

  /** A change asked for: shown as exactly what will be done, or why it can't be. */
  const offerAction = async (name: string, input: Record<string, unknown>) => {
    setStage('thinking')
    const prepared = await prepareAction(name, input)
    if (prepared.kind === 'cannot') {
      setPending(null)
      setAnswer(prepared.message)
      speak(prepared.message)
    } else if (prepared.kind === 'open') {
      // A form to finish: nothing is changed until it is saved there.
      setPending(null)
      const said = await prepared.run()
      setAnswer(said)
      speak(said)
      if (name === 'create_user' && !anyOverlayOpen()) router.push('/admin/users' as never)
    } else {
      setPending({ name, prepared })
      setAnswer(prepared.title)
      speak(prepared.title)
    }
    setStage('answered')
  }
  /** Confirmed: done, and said so. */
  const confirmAction = async () => {
    if (pending?.prepared.kind !== 'ready') return
    const { run } = pending.prepared
    unlockSpeech()
    setPending(null)
    setStage('thinking')
    let said: string
    try {
      // Without a signal the change waits on the phone to be sent: said so,
      // rather than left on "Working on it…".
      said = await Promise.race([
        run(),
        new Promise<string>((done) =>
          setTimeout(
            () => done('No signal yet — it will go through as soon as you’re connected.'),
            SEND_WAIT_MS
          )
        ),
      ])
    } catch {
      said = 'That didn’t go through. Nothing was changed — try it on the screen.'
    }
    setAnswer(said)
    speak(said)
    setStage('answered')
  }
  const cancelAction = () => {
    setPending(null)
    setAnswer('Okay — nothing was changed.')
    speak('Okay.')
  }

  /** A reorder list item's link, if it has one: admins' list (Operations — Inventory). */
  const reorderLink = async (id: string) => {
    if (!isAdmin(useAuthStore.getState().profile)) return null
    try {
      const item = (await getDoc(doc(db, 'reorderItems', id))).data() as
        | { name?: string; link?: string }
        | undefined
      const url = item?.link?.trim() ?? ''
      return /^https?:\/\//i.test(url) ? { url, name: item?.name ?? 'it' } : null
    } catch {
      return null
    }
  }

  /** A chord sheet, opened over the page; the bar goes, to leave it in view. */
  const openSong = (sheet: ChordSheet, key: { key: string; minor: boolean } | null) => {
    setSongGuesses([])
    setOpen(false)
    // Where a song screen is up, there — an open sheet's own place — rather
    // than another sheet on top of it.
    const host = songHost()
    if (host && !song) {
      host(sheet, key)
      return
    }
    sheetQueue.reset()
    setSong({ sheet, key })
  }
  /** One of the songs she offered: opened, and learned as what was meant. */
  const pickSong = (sheet: ChordSheet) => {
    if (songAsk.current.name) rememberAlias(songAsk.current.name, String(sheet.id))
    openSong(sheet, songAsk.current.key)
  }

  // Words this device has learned for songs, ready for matching as they are heard.
  const songAliases = useRef<ReadonlyMap<string, string>>(new Map())
  /** How long to wait after the last words before acting on them. */
  const pauseFor = (text: string) => {
    if (!songHost()) return PAUSE_MS
    const sheets = useChordSheetsStore.getState().chordSheets
    const cmd = parseSheetCommand(text, sheets, songAliases.current)
    const asked =
      cmd?.type === 'queue'
        ? { key: cmd.request.key }
        : songAsked(sheets, songAliases.current, text, true)
    if (!asked || ('kind' in asked && asked.kind !== 'open')) return PAUSE_MS
    // "in E" may yet become "in E flat" or "in E minor": only a key that can
    // say no more is acted on at once.
    return asked.key && KEY_DONE.test(text.trim()) ? SONG_WITH_KEY_PAUSE_MS : SONG_PAUSE_MS
  }

  /** Listen for a request — tapped, or woken by her name. */
  const listen = async (byName = false) => {
    // Tapped, this lets a browser say the answer; called by name, the tap
    // that turned listening on did.
    unlockSpeech()
    stopWake()
    stopSpeaking()
    loadAliases().then((m) => (songAliases.current = m))
    setChoices([])
    setSongGuesses([])
    setPending(null)
    setLink(null)
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
          : [...groups.map((g) => g.name), ...users.map((u) => u.displayName).filter(Boolean)]
        ).slice(0, 100),
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
    pauseTimer.current = setTimeout(() => send(request.current), pauseFor(request.current))
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
    // Not while there are events or songs to choose from: that waits for a choice.
    if (stage !== 'answered' || !open || choices.length || songGuesses.length || pending || link)
      return
    const t = setTimeout(() => closeRef.current(), ANSWER_MS)
    return () => clearTimeout(t)
  }, [stage, open, answer, choices.length, songGuesses.length, pending, link])
  /** One of the events she offered: learned as what was meant, and asked about. */
  const pick = async (choice: { key: string; title: string; date: string }) => {
    unlockSpeech()
    // Saved first, so the question asked again already carries it.
    if (heardName.current) await rememberName(heardName.current, choice.title)
    sent.current = false
    stopSpeaking()
    send(`${asked.current} — I mean “${choice.title}” on ${choice.date}`, true)
  }

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
                    {songHost()
                      ? 'Which song? — “Above All in E”'
                      : 'Ask or say what to do — “What’s the dress code for Revival in the Heartland?”'}
                  </Text>
                ) : null}
                {answer ? (
                  <Text color={ink} fontSize="$3" fontWeight="600" numberOfLines={6}>
                    {answer}
                  </Text>
                ) : null}
                {stage === 'answered' && choices.length ? (
                  <YStack gap="$1.5" paddingTop="$1.5">
                    {choices.map((c) => (
                      <Pressable
                        key={c.key}
                        onPress={() => pick(c)}
                        accessibilityRole="button"
                        accessibilityLabel={`${c.title}, ${FD(c.date, { weekday: true })}`}
                        style={[styles.choice, { borderColor: colors.primary }]}
                      >
                        <Text
                          color={colors.primary}
                          fontWeight="700"
                          fontSize="$3"
                          numberOfLines={1}
                        >
                          {c.title}
                        </Text>
                        <Text color={colors.textMuted} fontSize="$2">
                          {FD(c.date, { weekday: true })}
                        </Text>
                      </Pressable>
                    ))}
                  </YStack>
                ) : null}
                {stage === 'answered' && link ? (
                  <Pressable
                    onPress={() => Linking.openURL(link.url).catch(() => {})}
                    accessibilityRole="link"
                    accessibilityLabel={`Open the link for ${link.name}`}
                    style={[styles.choice, { borderColor: colors.primary, marginTop: 6 }]}
                  >
                    <Text color={colors.primary} fontWeight="700" fontSize="$3" numberOfLines={1}>
                      Open the link — {link.name}
                    </Text>
                  </Pressable>
                ) : null}
                {stage === 'answered' && pending?.prepared.kind === 'ready' ? (
                  <YStack gap="$1.5" paddingTop="$1.5">
                    {pending.prepared.details.length ? (
                      <YStack style={[styles.choice, { borderColor: colors.border }]} gap="$1">
                        {pending.prepared.details.map((line, i) => (
                          <Text key={i} color={ink} fontSize="$3" numberOfLines={8}>
                            {line}
                          </Text>
                        ))}
                      </YStack>
                    ) : null}
                    <XStack gap="$2">
                      <Pressable
                        onPress={confirmAction}
                        accessibilityRole="button"
                        style={[
                          styles.small,
                          {
                            backgroundColor: pending.prepared.destructive
                              ? '#c0392b'
                              : colors.primary,
                          },
                        ]}
                      >
                        <Text color="white" fontWeight="700" fontSize="$3">
                          {pending.prepared.confirm}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={cancelAction}
                        accessibilityRole="button"
                        style={[styles.small, { borderWidth: 1, borderColor: colors.border }]}
                      >
                        <Text color={ink} fontWeight="700" fontSize="$3">
                          Cancel
                        </Text>
                      </Pressable>
                    </XStack>
                  </YStack>
                ) : null}
                {stage === 'answered' && pending?.prepared.kind === 'choose' ? (
                  <YStack gap="$1.5" paddingTop="$1.5">
                    {pending.prepared.options.map((o) => (
                      <Pressable
                        key={o.label}
                        onPress={() => offerAction(pending.name, o.input)}
                        accessibilityRole="button"
                        style={[styles.choice, { borderColor: colors.primary }]}
                      >
                        <Text
                          color={colors.primary}
                          fontWeight="700"
                          fontSize="$3"
                          numberOfLines={1}
                        >
                          {o.label}
                        </Text>
                      </Pressable>
                    ))}
                  </YStack>
                ) : null}
                {stage === 'answered' && songGuesses.length ? (
                  <YStack gap="$1.5" paddingTop="$1.5">
                    {songGuesses.map((sheet) => (
                      <Pressable
                        key={String(sheet.id)}
                        onPress={() => pickSong(sheet)}
                        accessibilityRole="button"
                        accessibilityLabel={sheet.title}
                        style={[styles.choice, { borderColor: colors.primary }]}
                      >
                        <Text
                          color={colors.primary}
                          fontWeight="700"
                          fontSize="$3"
                          numberOfLines={1}
                        >
                          {sheet.title}
                        </Text>
                        {sheet.artist ? (
                          <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                            {sheet.artist}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </YStack>
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
      <VideoPlayerModal
        url={video?.youtubeUrl ?? null}
        title={video?.title}
        subtitle={video?.album ?? video?.preacher ?? video?.host}
        onClose={() => setVideo(null)}
      />
      {song ? (
        <ChordSheetViewer
          sheet={song.sheet}
          openInKey={song.key}
          queue={sheetQueue}
          onOpenSheet={(sheet, key) => setSong({ sheet, key })}
          onClose={() => {
            setSong(null)
            sheetQueue.reset()
          }}
        />
      ) : null}
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
  choice: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
