import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Dimensions,
  Easing,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  ScrollView,
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
import { namesHer, stopListeningAsked, withoutHerName } from '@/lib/wakeWord'
import { MAX_REQUEST, miriamHref } from '@/lib/miriam'
import { anyOverlayOpen } from '@/lib/overlays'
import { rememberName, rememberWords } from '@/lib/miriamMemory'
import { heardRight, refreshHearing } from '@/lib/miriamHearing'
import { recordAsked } from './recordAsked'
import { meetingAsked } from '@/lib/miriamMeeting'
import { usePostsStore } from '@/stores/postsStore'
import { FD } from '@/lib/format'
import { speak as speakAloud, stopSpeaking, unlockSpeech, whenSpoken } from './speak'
import { askMiriam, miriamError, type Heard } from './askMiriam'
import { eventByKey, prepareAction, type Prepared } from './actions'
import { useMiriamStore, WAKE_KEY } from '@/stores/miriamStore'
import { useUsersStore } from '@/stores/usersStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useChordSheetsStore } from '@/stores/chordSheetsStore'
import { ChordSheetViewer } from '@/features/worship/ChordSheetViewer'
import { useSongQueue } from '@/features/worship/useSongQueue'
import { tourFor, tourNames } from '@/features/tour/flows'
import { tourAsked } from '@/lib/miriamTour'
import {
  listAnswer,
  listAsked,
  playAsked,
  playPick,
  quickAnswer,
  screenAsked,
  tasksAnswer,
  tasksAsked,
  weatherLine,
  type QuickData,
} from '@/lib/miriamQuick'
import { fetchWeather } from '@/lib/weather'
import { announcementsShown } from '@/lib/miriamAppData'
import {
  askAvailability,
  offerDirections,
  remindBeforeEach,
  talkHere,
  type Here,
  type Reply,
  type Talk,
} from './localTalk'
import { directionsUrl, googleDirectionsUrl, placeOf } from '@/lib/directions'
import { openDirections } from '@/lib/location'
import { shownAlready } from '@/lib/miriamReplies'
import {
  allAnnouncements,
  foodSheet,
  latestMessages,
  myRooms,
  nextOpenFood,
  openFood,
} from './localData'
import { useTasksStore } from '@/stores/tasksStore'
import { useRemindersStore } from '@/stores/remindersStore'
import { useDateNotesStore } from '@/stores/dateNotesStore'
import { canKeepDateNotes, isDay, noteAddedSaid, noteText } from '@/lib/dateNotes'
import {
  minutesBeforeSaid,
  reminderAsked,
  reminderWhen,
  repeatWhen,
  type Repeat,
} from '@/lib/reminders'
import { clockOf } from '../../../functions/src/push/reminderTime'
import type { BeforeEach, ReminderExtra } from '@/stores/remindersStore'
import { briefingAsked, type Briefing, type FoodNudge } from '@/lib/briefing'
import { gatherBriefing, remindToAnswer } from './briefingData'
import { BriefingView } from './BriefingView'
import { appToolsFor } from './appTools'
import { useEventsStore } from '@/stores/eventsStore'
import { localToday, todayStr } from '@/lib/events'
import { useTourStore } from '@/features/tour/tourStore'
import { asksAQuestion, songAsked } from '@/lib/miriamSongs'
import { songHost, songQueue } from '@/lib/songHost'
import { parseSheetCommand } from '@/lib/sheetCommands'
import { keyLabel } from '@/lib/nashvilleNumbers'
import { KEY_HINTS } from '@/lib/songRequest'
import { loadAliases, rememberAlias } from '@/lib/songAliases'
import type { ChordSheet } from '@/types/chordSheet'
import { VideoPlayerModal } from '@/components/ui/VideoPlayerModal'
import { extractYouTubeId, useMusicStore, type MusicItem } from '@/stores/musicStore'
import { useMediaPlaybackStore } from '@/stores/mediaPlaybackStore'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { screensFor } from '@/lib/miriamScreens'
import { isAdmin } from '@/lib/roles'
import { doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDoc } from '@/lib/liveFirestore'
import { effectiveAvail } from '@/lib/availability'
import type { CarpoolCarData } from '@/types/events'

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
/** How long a confirmed change is waited on before it is said to be waiting for a signal. */
const SEND_WAIT_MS = 12_000
/** How long an answer to her availability questions is waited on before it is taken as kept for a signal. */
const ANSWER_WAIT_MS = 4000
/** How long an answer stays up once given, unless she is spoken to again. */
const ANSWER_MS = 20_000
/** Said to her, answering a question she asked back: nothing more is wanted. */
const NEVER_MIND =
  /^(?:never\s*mind|cancel|forget\s+(?:it|that)|stop|no(?:\s+thanks?)?|nothing|that'?s\s+all)\b/i
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

/** The day the briefing was last offered on this device, and whether it is offered at all. */
const BRIEFING_DAY_KEY = 'miriam_briefing_day'
const BRIEFING_OFF_KEY = 'miriam_briefing_off'
/** Offered from the morning into early afternoon; later, the day is mostly done. */
const OFFER_FROM_HOUR = 5
const OFFER_UNTIL_HOUR = 14
/** "Stop offering my briefing", "offer my briefing every morning". */
const BRIEFING_OFF =
  /\b(?:stop|don'?t|do\s+not|quit)\s+(?:offering|showing|giving)\s+(?:me\s+)?(?:my|the)\s+(?:morning\s+|daily\s+)?briefing\b|\bturn\s+off\s+(?:my|the)\s+(?:morning\s+|daily\s+)?briefing\b/i
const BRIEFING_ON =
  /\b(?:offer|show|give)\s+(?:me\s+)?(?:my|the)\s+briefing\s+(?:each|every)\s+(?:morning|day)\b|\bturn\s+on\s+(?:my|the)\s+(?:morning\s+|daily\s+)?briefing\b/i

/** The time now: read when something is asked, never while drawing. */
const timeNow = () => Date.now()
/** A change shown to confirm, answered out loud: yes, or no. Anything else leaves it to a tap. */
const SAID_YES =
  /^(?:yes|yeah|yep|yup|yes please|sure|ok(?:ay)?|do it|go ahead|confirm(?:ed)?|please do|that'?s right|correct|sounds good)\b/i
const SAID_NO = /^(?:no|nope|cancel|don'?t|stop|never\s*mind|wait|hold on)\b/i
/** How long she listens for that yes or no before leaving it to a tap. */
const CONFIRM_LISTEN_MS = 8000

/** Sent once a change she was asked for among others is done, for her to go on to the rest. */
const CARRY_ON = 'That’s done. Carry on with the rest of what I asked.'
/** Whether this device listens for "Hey Miriam" (AsyncStorage). */

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
/**
 * A question answered from what the app has loaded — the same events and
 * rules the server would use (lib/miriamQuick) — or null, to ask Claude.
 */
function quickFromApp(said: string) {
  const data = appData()
  return data ? quickAnswer(said, data) : null
}

/** The events, groups and people the app has loaded, as lib/miriamQuick reads them; null before the events are in. */
function appData(): QuickData | null {
  const profile = useAuthStore.getState().profile
  const { templates, overrides } = useEventsStore.getState()
  if (!profile || templates.length === 0) return null
  return {
    templates: templates as never,
    overrides: overrides as never,
    groups: useGroupsStore.getState().groups,
    viewer: { uid: String(profile.uid), roles: profile.roles ?? [] },
    names: new Map(useUsersStore.getState().users.map((u) => [String(u.uid), u.displayName])),
    // Their own day, as the server is told it (./askMiriam: localToday).
    today: localToday(),
  }
}

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
  // Her name said at the start of what was heard (taken off what is shown and sent).
  const saidHerName = useRef(false)
  // How the request was heard: the recogniser's other guesses, and how sure it was.
  const heardAs = useRef<Heard | null>(null)
  // How she read it, when that differs from what was heard: shown under it.
  const [understood, setUnderstood] = useState('')
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
  const [pending, setPending] = useState<{
    name: string
    prepared: Prepared
    /** More was asked after it: once it is done, she carries on. */
    more?: boolean
  } | null>(null)
  // She asked something back, and is waiting to hear the reply: kept up meanwhile.
  const [askingBack, setAskingBack] = useState(false)
  // A question she asked here, not of Claude (./localTalk): its reply comes back to it.
  const askedHere = useRef<Reply | null>(null)
  // What she said, written out as well as said aloud — for a phone on silent,
  // a loud room, or someone who would rather read: shown with her answer when
  // it isn't the same words (her briefing read out, a briefing button's result).
  const [said, setSaid] = useState<string | null>(null)
  // The food her briefing showed open today, and suggested: "I'll bring chips
  // as suggested" is that event; one taken since is "just signed up for".
  const briefedFood = useRef<{ day: string; food: FoodNudge[] } | null>(null)
  // A change shown to confirm, and her listening for a spoken yes or no to it.
  const [confirmByVoice, setConfirmByVoice] = useState(false)
  const confirmingByVoice = useRef(false)
  // The last request was said, not typed: a change it brings is listened for a yes to.
  const saidAloud = useRef(false)
  const pendingRef = useRef<typeof pending>(null)
  // What was shown with the answer, remembered with it: "showing the event rev_2026-10-11".
  const shownNote = useRef('')
  const openRef = useRef(false)
  // A link to buy something, for a tap to open (in a browser).
  // `label`: what its button says, when not "Open the link" (directions: "Open in Google Maps").
  const [link, setLink] = useState<{ url: string; name: string; label?: string } | null>(null)
  // The daily briefing, shown in place of an answer; and whether it is being read out.
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  // The first time the app is opened in a morning: the briefing offered.
  const [offerBriefing, setOfferBriefing] = useState(false)
  const [reading, setReading] = useState(false)
  // Something just done that can be taken back at a tap: a reminder set.
  const [undo, setUndo] = useState<{ label: string; run: () => Promise<string> } | null>(null)
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
  // The first time the app is opened in a morning, the day's briefing offered — once a day.
  useEffect(() => {
    if (!appActive) return
    const hour = new Date().getHours()
    if (hour < OFFER_FROM_HOUR || hour >= OFFER_UNTIL_HOUR) return
    let cancelled = false
    Promise.all([AsyncStorage.getItem(BRIEFING_DAY_KEY), AsyncStorage.getItem(BRIEFING_OFF_KEY)])
      .then(([day, off]) => {
        if (cancelled || off === '1' || day === localToday()) return
        AsyncStorage.setItem(BRIEFING_DAY_KEY, localToday()).catch(() => {})
        setOfferBriefing(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [appActive])
  // Group names, for the recogniser to expect in a request — and, with the
  // events, what a plain question about an event is answered from here.
  useEffect(() => {
    if (!open) return
    subGroups()
    const events = useEventsStore.getState()
    events.subscribe()
    // Their tasks too, for "what's due?", and their reminders.
    const tasks = useTasksStore.getState()
    tasks.subscribe()
    const uid = useAuthStore.getState().profile?.uid
    const reminders = useRemindersStore.getState()
    if (uid) reminders.subscribe(String(uid))
    // Their notes on days of their calendar, for the briefing and "what do I have?".
    const notes = useDateNotesStore.getState()
    const keepsNotes = !!uid && canKeepDateNotes(useAuthStore.getState().profile)
    if (keepsNotes) notes.subscribe(String(uid))
    return () => {
      unsubGroups()
      events.unsubscribe()
      tasks.unsubscribe()
      if (uid) reminders.unsubscribe()
      if (keepsNotes) notes.unsubscribe()
    }
  }, [open, subGroups, unsubGroups])

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

  const send = async (text: string, again = false) => {
    const asHeard = text.trim()
    if (!asHeard || sent.current) return
    // Put right where it was plainly misheard: "an even named" → "an event named".
    const said = heardRight(asHeard).text
    // Sent by a tap (the button, or a choice): lets a browser say the answer.
    unlockSpeech()
    sent.current = true
    // A yes or no to the change she just showed: done, or not, from here.
    const shown = pendingRef.current
    if (confirmingByVoice.current && shown?.prepared.kind === 'ready') {
      endVoiceConfirm()
      stopListening()
      const reply = withoutHerName(said)
      if (SAID_YES.test(reply)) {
        await confirmAction(shown)
        return
      }
      if (SAID_NO.test(reply)) {
        cancelAction()
        setStage('answered')
        return
      }
      // Something else: the card stays, for a tap.
      setHeard(asHeard)
      setStage('answered')
      return
    }
    saidAloud.current = stage !== 'typing'
    // Typed rather than said: a question back is answered by typing too.
    const typing = stage === 'typing'
    if (!again) asked.current = said
    setChoices([])
    setSongGuesses([])
    setPending(null)
    setLink(null)
    setUndo(null)
    setBriefing(null)
    setSaid(null)
    setUnderstood('')
    setAskingBack(false)
    shownNote.current = ''
    stopListening()
    setHeard(asHeard)
    // Taken as something other than heard: shown, as Claude's corrections are.
    if (said !== asHeard) setUnderstood(said)
    // "Hey Miriam, stop listening": her name said, or her woken by it — never
    // the words alone, which are as likely sung or said to someone else.
    if (
      !again &&
      (woken || saidHerName.current || namesHer(said)) &&
      stopListeningAsked(withoutHerName(said))
    ) {
      useMiriamStore.getState().setAwaiting(false)
      setWake(false)
      const text = 'Okay — I’ve stopped listening for “Hey Miriam.” Turn it back on here any time.'
      setAnswer(text)
      speak(text)
      setStage('answered')
      return
    }
    // Answering a question she asked here: carried on here. A reply that is
    // no answer to it is taken as a request of its own, below.
    if (!again && askedHere.current && useMiriamStore.getState().awaiting) {
      const onReply = askedHere.current
      askedHere.current = null
      if (await onReply(withoutHerName(said), talkFor(typing))) return
      useMiriamStore.getState().setAwaiting(false)
    }
    askedHere.current = null
    // Answering what she asked back: hers to work out with what came before,
    // not taken for a song or a screen on its own.
    const replying = !again && useMiriamStore.getState().awaiting
    // A question of its own, not an answer to hers: kept, without who asked,
    // for Admin → Analytics (./recordAsked).
    if (!again && !replying) recordAsked(withoutHerName(said), useAuthStore.getState().profile)
    if (replying && NEVER_MIND.test(withoutHerName(said))) {
      useMiriamStore.getState().setAwaiting(false)
      setAnswer('Okay.')
      speak('Okay.')
      setStage('answered')
      return
    }
    // Worked out here, from what the app has, when it plainly can be.
    const local = !again && !replying
    // "Stop offering my briefing" / "offer my briefing every morning".
    if (local && (BRIEFING_OFF.test(said) || BRIEFING_ON.test(said))) {
      const off = BRIEFING_OFF.test(said)
      AsyncStorage.setItem(BRIEFING_OFF_KEY, off ? '1' : '0').catch(() => {})
      const text = off
        ? 'Okay — I won’t offer your briefing in the mornings. Ask for it any time.'
        : 'Okay — I’ll offer your briefing the first time you open the app each morning.'
      setAnswer(text)
      speak(text)
      setStage('answered')
      return
    }
    // "What do I need to know today?": the daily briefing, put together here.
    if (local && briefingAsked(withoutHerName(said))) {
      await giveBriefing(typing)
      return
    }
    // "Remind me to go to Costco at 5 pm tomorrow": set here, at once.
    const reminder = local ? reminderAsked(withoutHerName(said), new Date()) : null
    if (reminder) {
      await setReminder(reminder.text, reminder.at, reminder.spoken, { repeat: reminder.repeat })
      return
    }
    // A tour asked for: the app's own, started here — nothing to work out.
    const tourAsk = local ? tourAsked(withoutHerName(said)) : null
    if (tourAsk) {
      const profile = useAuthStore.getState().profile
      const tour = tourFor(tourAsk.part, profile)
      if (tour) {
        const text = tourAsk.part ? `Here’s a tour of ${tour.title}.` : 'Here’s a tour of the app.'
        speakAside(text)
        noteDone(text)
        setOpen(false)
        useTourStore.getState().start(tour)
        return
      }
      const text = `I can give you a tour of ${tourNames(profile).join(', ')}.`
      setAnswer(text)
      speak(text)
      setStage('answered')
      return
    }
    // "Play Revive Me", "play the sermon from Sunday": a video from Content,
    // played over the page. "Play" is never a chord sheet ("open" is): one
    // not found here is left to Claude, which looks further.
    const play = local ? playAsked(withoutHerName(said)) : null
    if (play) {
      const music = useMusicStore.getState()
      if (music.items.length === 0) await music.load()
      const item = playPick(play, useMusicStore.getState().items)
      if (item) {
        noteDone(`Playing “${item.title}” from Content.`)
        setVideo(item)
        setOpen(false)
        return
      }
    }
    // "I'd like to meet with Pastor Sam next Tuesday": the Connect page's
    // meeting form, filled in from what was said (lib/miriamMeeting), for them
    // to check and send themselves — nothing is sent for them.
    const meeting = local && !play && !anyOverlayOpen() ? meetingAsked(withoutHerName(said)) : null
    const connect = meeting
      ? screensFor(useAuthStore.getState().profile).find((x) => x.id === 'connect')
      : undefined
    if (meeting && connect) {
      useMiriamStore.getState().offerMeetingForm(meeting)
      const text =
        meeting.names.length || meeting.availability || meeting.message
          ? 'Here’s the meeting form, filled in with what you said — check it, then press Submit Request.'
          : 'Here’s the meeting form — choose who you’d like to meet with, say when you’re free, then press Submit Request.'
      noteDone(text)
      setAnswer(text)
      speak(text)
      setStage('answered')
      router.push(connect.path as never)
      return
    }
    // A screen asked for by name ("open settings"): gone to from here.
    if (local && !play && !anyOverlayOpen()) {
      const screens = screensFor(useAuthStore.getState().profile)
      const screenId = screenAsked(withoutHerName(said), screens)
      const screen = screens.find((x) => x.id === screenId)
      if (screen) {
        const text = `Opening ${screen.label}.`
        setAnswer(text)
        speak(text)
        setStage('answered')
        router.push(screen.path as never)
        return
      }
    }
    // A food sign-up, a task's status, a notification switch, announcements or
    // messages: worked out here, asking back what isn't plain (./localTalk).
    if (local && !play && (await talkHere(withoutHerName(said), hereNow(), talkFor(typing)))) return
    // A song, opened here from the sheets on this device: no need to ask.
    // With a song screen up (a sheet open, or the Chord Sheets page), that is
    // all that is asked of her, and it is never sent off to be worked out.
    const sheets = useChordSheetsStore.getState().chordSheets
    const songMode = !!songHost() && sheets.length > 0
    // A question is answered, even with a song screen up: "What am I wearing
    // today?" is not a song.
    if (local && !play && sheets.length && !asksAQuestion(withoutHerName(said))) {
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
      // A song screen up, and not a question: a song not found, said here.
      if (songMode) {
        const text = 'I couldn’t find that song.'
        setAnswer(text)
        speak(text)
        setStage('answered')
        return
      }
    }
    if (local && !play && (await answeredHere(withoutHerName(said)))) return
    // A plain question about an event — its dress code, time, place, your
    // team, car, room or flight — answered from what the app already has.
    const quick = local && !play ? quickFromApp(withoutHerName(said)) : null
    if (quick?.weather) {
      // Its forecast, fetched as the event's page does.
      setStage('thinking')
      const today = localToday()
      const lines = await Promise.all(
        quick.weather.map(async (ev) => {
          const at =
            typeof ev._geocodeLat === 'number' && typeof ev._geocodeLng === 'number'
              ? await fetchWeather(ev._geocodeLat, ev._geocodeLng, ev.date).catch(() => null)
              : null
          return weatherLine(ev, at, today)
        })
      )
      const text = lines.join(' ')
      setAnswer(text)
      speak(text)
      setStage('answered')
      if (quick.open && !anyOverlayOpen()) {
        router.push(miriamHref({ kind: 'event', ...quick.open }) as never)
      }
      return
    }
    if (quick) {
      if (quick.directions) {
        // Where it is, asked on its day: maps offered — a yes, or the button, opens them.
        const ev = quick.directions
        offerDirections(ev, quick.text, talkFor(typing))
        const place = placeOf(ev)
        setLink({
          url:
            Platform.OS === 'web' ? googleDirectionsUrl(place) : directionsUrl(place, Platform.OS),
          name: ev.title,
          label: Platform.OS === 'web' ? 'Open in Google Maps' : 'Open in Maps',
        })
      } else {
        setAnswer(quick.text)
        speak(quick.text)
        setStage('answered')
      }
      if (quick.open && !anyOverlayOpen()) {
        router.push(miriamHref({ kind: 'event', ...quick.open }) as never)
      }
      return
    }
    await askClaude(said, typing)
  }

  /**
   * Worked out by Claude (functions/src/miriam), with what was said and
   * answered just before: shown, said, and opened. `typing`: a question she
   * asks back is answered by typing, rather than listened for.
   */
  const askClaude = async (said: string, typing: boolean) => {
    setStage('thinking')
    try {
      // How it was heard, when it is what was just said (not typed, nor her carrying on).
      // (What was just said, as heard or as put right: lib/miriamHearing.)
      const justSaid = said === request.current || said === heardRight(request.current ?? '').text
      const heard = !typing && justSaid ? (heardAs.current ?? undefined) : undefined
      const result = await askMiriam(said, heard)
      if (result.kind === 'answer') {
        if (result.misheard?.length) {
          rememberWords(result.misheard)
            .then(refreshHearing)
            .catch(() => {})
        }
        const plain = (t: string) =>
          t
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
        if (result.understood && plain(result.understood) !== plain(said)) {
          setUnderstood(result.understood)
        }
      }
      const followUp = result.kind === 'answer' && !!result.followUp
      useMiriamStore.getState().setAwaiting(followUp)
      if (result.kind === 'eventForm') {
        noteDone(
          `Opened the ${result.editKey ? 'event’s' : 'new event'} form, filled in, to check and save.`
        )
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
        noteDone('Opened the new task form, filled in, to check and save.')
        useMiriamStore.getState().offerTaskForm({ draft: result.draft, notes: result.notes })
        setOpen(false)
        router.navigate('/assignments' as never)
        return
      }
      // A change: worked out into exactly what will be done, and shown to
      // be confirmed — nothing is done until it is.
      // A reminder: theirs alone, set at once, with a tap to take it back.
      if (result.kind === 'confirm' && result.name === 'create_reminder') {
        const text = String(result.input.text ?? '').trim()
        // Before every one of their events, from now on: one reminder, kept on the next.
        if (result.input.every_event === true) {
          const minutes = Math.max(0, Math.round(Number(result.input.minutes_before) || 0)) || 60
          const lead = text ? `to ${text.charAt(0).toLowerCase()}${text.slice(1)}` : ''
          const ask = {
            text,
            spoken: lead,
            before: { minutes },
            relation: minutesBeforeSaid(minutes),
          }
          // Events not loaded here: set all the same, its first worked out by the server.
          if (!(await remindBeforeEach(ask, hereNow(), talkFor(typing)))) {
            await setReminderBeforeEach(text, lead, ask.before, ask.relation, null)
          }
          return
        }
        const repeats = ['daily', 'weekdays', 'weekly', 'monthly']
        const repeat = repeats.includes(String(result.input.repeat))
          ? (String(result.input.repeat) as Repeat)
          : undefined
        // Tied to an event: from its start, here, so it can move with it.
        const ev = result.input.event_key
          ? useEventsStore.getState().getInstanceByKey(String(result.input.event_key))
          : null
        const minutesBefore = Math.max(0, Math.round(Number(result.input.minutes_before) || 0))
        const start = ev ? clockOf(ev.startTime) : null
        const at =
          ev && start
            ? new Date(
                new Date(`${ev.date}T00:00:00`).getTime() +
                  (start.h * 60 + start.min - minutesBefore) * 60_000
              )
            : new Date(String(result.input.when ?? ''))
        const extra: ReminderExtra =
          ev && start
            ? {
                eventKey: ev.instanceKey,
                eventTemplateId: String(ev.templateId),
                eventTitle: ev.title,
                minutesBefore,
              }
            : { repeat }
        if (!text || isNaN(at.getTime()) || at.getTime() <= timeNow()) {
          const no =
            'I couldn’t tell when to remind you — try saying the time, like “at 5 PM tomorrow.”'
          setAnswer(no)
          speak(no)
          setStage('answered')
          return
        }
        await setReminder(text, at, `to ${text.charAt(0).toLowerCase()}${text.slice(1)}`, extra)
        return
      }
      // A note on a day of their calendar: theirs alone, added at once, with a tap to take it back.
      if (result.kind === 'confirm' && result.name === 'add_date_note') {
        const date = String(result.input.date ?? '')
        const text = noteText(String(result.input.text ?? ''))
        if (!isDay(date) || !text) {
          const no =
            'I couldn’t tell which day, or what the note should say — try “add a note to Friday: bring the projector.”'
          setAnswer(no)
          speak(no)
          setStage('answered')
          return
        }
        await addNote(date, text)
        return
      }
      if (result.kind === 'confirm') {
        await offerAction(result.name, result.input, result.more)
        return
      }
      // A video asked for: played over the page, with nothing said over it.
      const wanted = result.kind === 'answer' ? result.open : null
      // A tour asked for: the app's own, to each screen in turn, as their role
      // has it — Miriam steps aside for it.
      if (wanted?.kind === 'tour') {
        const tour = tourFor(wanted.id, useAuthStore.getState().profile)
        if (tour) {
          speakAside(result.text)
          noteDone(result.text)
          setOpen(false)
          useTourStore.getState().start(tour)
          return
        }
      }
      if (wanted?.kind === 'video') {
        const item = useMusicStore.getState().items.find((m) => m.id === wanted.id)
        if (item) {
          noteDone(`Playing “${item.title}” from Content.`)
          setVideo(item)
          setOpen(false)
          return
        }
      }
      const shown = result.kind === 'answer' ? result.open : null
      if (shown?.kind === 'event') shownNote.current = `showing the event ${shown.key}`
      else if (shown?.kind === 'task') shownNote.current = `showing the task ${shown.id}`
      setAnswer(result.text)
      speak(result.text)
      if (result.kind === 'answer') {
        setChoices(result.choices ?? [])
        heardName.current = result.heardName ?? ''
      }
      // Asked something back: the reply listened for once she has asked it.
      if (followUp) {
        setStage('answered')
        askBack(typing)
        return
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
      } else if (open?.kind === 'directions') {
        // The way to an event: opened in maps, after what she said of it.
        const ev = await eventByKey(open.key).catch(() => null)
        if (ev && placeOf(ev)) {
          const place = placeOf(ev)
          const opened = await openDirections(place)
          if (!opened) {
            setLink({
              url:
                Platform.OS === 'web'
                  ? googleDirectionsUrl(place)
                  : directionsUrl(place, Platform.OS),
              name: ev.title,
              label: Platform.OS === 'web' ? 'Open in Google Maps' : 'Open in Maps',
            })
          }
        }
      } else if (open?.kind === 'link') {
        // A page she found the answer on: a button to read it there.
        if (/^https?:\/\//i.test(open.url)) {
          setLink({ url: open.url, name: open.label, label: 'Open the page' })
        }
      } else if (open && open.kind !== 'video' && open.kind !== 'tour' && !anyOverlayOpen()) {
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

  /** The daily briefing (lib/briefing): shown to tap through, and read out. `typing`: asked for by typing, so its questions are answered so too. */
  const giveBriefing = async (typing = false) => {
    setStage('thinking')
    const b = await gatherBriefing().catch(() => null)
    if (!b) {
      const no = 'I couldn’t put your briefing together just now. Try again in a moment.'
      setAnswer(no)
      speak(no)
      setStage('answered')
      return
    }
    setAnswer(null)
    setBriefing(b)
    briefedFood.current = { day: localToday(), food: b.food }
    noteDone(b.spoken)
    speak(b.spoken)
    setReading(true)
    const briefedFor = asked.current
    whenSpoken().then(() => {
      setReading(false)
      // Then their events still without an answer, asked about one at a time
      // — unless they have closed her, asked something else, or have a change
      // up to confirm, meanwhile.
      const profile = useAuthStore.getState().profile
      if (
        b.asks.length &&
        openRef.current &&
        asked.current === briefedFor &&
        !pendingRef.current &&
        appToolsFor(profile).includes('set_availability')
      ) {
        const lead =
          b.asks.length === 1
            ? 'One of your events needs an answer. '
            : `${b.asks.length} of your events need an answer. `
        askAvailability(b.asks, hereNow(), talkFor(typing), lead)
      }
    })
    setStage('answered')
  }

  /** The morning offer taken up: the panel opened on the briefing. */
  const openBriefing = async () => {
    unlockSpeech()
    setOfferBriefing(false)
    stopWake()
    sent.current = true
    asked.current = 'What do I need to know today?'
    setHeard('')
    setAnswer(null)
    setChoices([])
    setSongGuesses([])
    setPending(null)
    setUndo(null)
    setUnderstood('')
    setOpen(true)
    await giveBriefing()
  }

  /** A reminder set for them, said back with when — and a tap to take it back. */
  const setReminder = async (text: string, at: Date, spoken: string, extra: ReminderExtra = {}) => {
    const uid = useAuthStore.getState().profile?.uid
    if (!uid) return
    setStage('thinking')
    try {
      const id = await useRemindersStore.getState().add(String(uid), text, at, extra)
      // A monthly one says when it starts; the others say it in how often.
      const when = extra.repeat
        ? extra.repeat === 'monthly'
          ? `${repeatWhen(at, extra.repeat)}, starting ${reminderWhen(at, new Date())}`
          : repeatWhen(at, extra.repeat)
        : reminderWhen(at, new Date())
      const said = `Okay — I’ll remind you ${when} ${spoken}.`
      setAnswer(said)
      speak(said)
      setUndo({
        label: 'Undo',
        run: async () => {
          await useRemindersStore.getState().remove(id)
          return 'Okay — that reminder is gone.'
        },
      })
    } catch {
      const no = 'That reminder didn’t save. Try again in a moment.'
      setAnswer(no)
      speak(no)
    }
    setStage('answered')
  }

  /**
   * One reminder before every event of theirs, from now on (stores/
   * remindersStore: addBeforeEach): set at once, with a tap to take it back.
   */
  const setReminderBeforeEach = async (
    text: string,
    spoken: string,
    before: BeforeEach,
    relation: string,
    first: { ev: { instanceKey: string; templateId: unknown; title: string }; at: Date } | null
  ) => {
    const uid = useAuthStore.getState().profile?.uid
    if (!uid) return
    setStage('thinking')
    try {
      const id = await useRemindersStore.getState().addBeforeEach(
        String(uid),
        text,
        before,
        relation,
        first
          ? {
              at: first.at,
              eventKey: first.ev.instanceKey,
              eventTemplateId: String(first.ev.templateId),
              eventTitle: first.ev.title,
            }
          : null
      )
      const said = `Okay — I’ll remind you${spoken ? ` ${spoken}` : ''} ${relation} each of your events, from now on${
        first
          ? ` — first ${reminderWhen(first.at, new Date())}, before ${first.ev.title}`
          : ', starting with the next one you’re on'
      }. It’s in your tasks.`
      useMiriamStore.getState().remember(asked.current, said)
      setAnswer(said)
      speak(said)
      setUndo({
        label: 'Undo',
        run: async () => {
          await useRemindersStore.getState().remove(id)
          return 'Okay — that reminder is gone.'
        },
      })
    } catch {
      const no = 'That reminder didn’t save. Try again in a moment.'
      setAnswer(no)
      speak(no)
    }
    setStage('answered')
  }

  /**
   * A note on a day of their calendar (stores/dateNotesStore): theirs alone,
   * added at once, with a tap to take it back.
   */
  const addNote = async (date: string, text: string) => {
    setStage('thinking')
    try {
      const id = await useDateNotesStore.getState().add(date, text)
      const said = noteAddedSaid(date, noteText(text), localToday())
      noteDone(said)
      setAnswer(said)
      speak(said)
      setUndo({
        label: 'Undo',
        run: async () => {
          await useDateNotesStore.getState().remove([id])
          return 'Okay — that note is gone.'
        },
      })
    } catch (err) {
      const no =
        err instanceof Error && err.message === 'full'
          ? 'You have as many notes as can be kept — delete some old ones on the Events calendar first.'
          : 'That note didn’t save. Try again in a moment.'
      setAnswer(no)
      speak(no)
    }
    setStage('answered')
  }

  /** Said aloud, and written out in her bar. */
  const speak = (text: string) => {
    speakAloud(text)
    setSaid(text)
  }
  /** Said as her bar closes (a tour starting): written out as a notice instead, to be read. */
  const speakAside = (text: string) => {
    speakAloud(text)
    useUIStore.getState().toast(`Miriam: ${text}`, 'info')
  }

  /** Done without a word shown (a video played, a form opened): remembered for what comes next. */
  const noteDone = (reply: string) => useMiriamStore.getState().remember(asked.current, reply)

  // --- Worked out here (./localTalk) --------------------------------------

  /** How she speaks and acts in a conversation worked out here. `typing`: a question is answered by typing. */
  const talkFor = (typing: boolean): Talk => ({
    say: (text, sheet) => {
      useMiriamStore.getState().setAwaiting(false)
      useMiriamStore.getState().remember(asked.current, text)
      setAnswer(text)
      speak(text)
      setStage('answered')
      if (sheet && !anyOverlayOpen()) {
        router.push(miriamHref({ kind: 'event', key: sheet.instanceKey, section: 'food' }) as never)
      }
    },
    ask: (text, onReply) => {
      askedHere.current = onReply
      useMiriamStore.getState().setAwaiting(true)
      // Remembered with what was asked, so a reply left to Claude is understood.
      useMiriamStore.getState().remember(asked.current, text)
      setAnswer(text)
      speak(text)
      setStage('answered')
      askBack(typing)
    },
    offer: (name, input) => {
      useMiriamStore.getState().setAwaiting(false)
      return offerAction(name, input)
    },
    // Agreed to in so many words ("Did you mean…? I'll mark it done." — "Yes"):
    // made as a confirmed change is, with Undo.
    doNow: async (name, input) => {
      useMiriamStore.getState().setAwaiting(false)
      setStage('thinking')
      const prepared = await prepareAction(name, input)
      if (prepared.kind === 'ready') {
        await confirmAction({ name, prepared })
      } else if (prepared.kind === 'cannot') {
        setAnswer(prepared.message)
        speak(prepared.message)
        setStage('answered')
      } else {
        await offerAction(name, input)
      }
    },
    thinking: () => setStage('thinking'),
    remind: (text, at, spoken, extra) => {
      useMiriamStore.getState().setAwaiting(false)
      return setReminder(text, at, spoken, extra)
    },
    directions: (ev) => {
      useMiriamStore.getState().setAwaiting(false)
      showDirections(ev).catch(() => {})
    },
    remindBeforeEach: (text, spoken, before, relation, first) => {
      useMiriamStore.getState().setAwaiting(false)
      return setReminderBeforeEach(text, spoken, before, relation, first)
    },
    note: (date, text) => {
      useMiriamStore.getState().setAwaiting(false)
      return addNote(date, text)
    },
  })

  /**
   * The way to an event, opened in maps — the phone's own, or Google Maps in a
   * new tab. A browser opens a tab only straight after a tap or a key: when it
   * won't, the way there is a button to tap instead (as a reorder link is).
   */
  const showDirections = async (ev: {
    title: string
    location?: string
    address?: string
    city?: string
    state?: string
  }) => {
    const place = placeOf(ev)
    const opened = await openDirections(place)
    const text = opened
      ? `Opening directions to ${ev.title}${Platform.OS === 'web' ? ' in Google Maps' : ''}.`
      : `Here’s the way to ${ev.title}, at ${place} — tap to open it.`
    if (!opened) {
      setLink({
        url: Platform.OS === 'web' ? googleDirectionsUrl(place) : directionsUrl(place, Platform.OS),
        name: ev.title,
        label: Platform.OS === 'web' ? 'Open in Google Maps' : 'Open in Maps',
      })
    }
    noteDone(text)
    setAnswer(text)
    speak(text)
    setStage('answered')
  }

  /** What the conversations worked out here can see, as this person. */
  const hereNow = (): Here => {
    const profile = useAuthStore.getState().profile
    const uid = String(profile?.uid ?? '')
    return {
      data: appData(),
      profile,
      tools: appToolsFor(profile),
      tasks: () => {
        const tasks = useTasksStore.getState()
        return { ready: tasks._refCount > 0 && !tasks.loading, mine: uid ? tasks.myTasks(uid) : [] }
      },
      openFood,
      foodSheet,
      nextOpenFood,
      announcements: async () =>
        profile ? announcementsShown(await allAnnouncements(), profile, todayStr()) : [],
      names: () =>
        new Map(useUsersStore.getState().users.map((u) => [String(u.uid), u.displayName])),
      rooms: () => myRooms(uid),
      latest: latestMessages,
      now: () => Date.now(),
      briefedFood: () =>
        briefedFood.current?.day === localToday() ? briefedFood.current.food : [],
      answerOf: (ev) => {
        const r = effectiveAvail(useEventsStore.getState().avail, ev as never, uid)
        return r ? { status: r.status, note: r.note ?? '', ts: r.ts ?? 0 } : null
      },
      // As the event's page saves it. Not waited on past a moment: with no
      // signal it is kept on the phone and sent when there is one.
      answer: async (ev, status, note) => {
        const saving = useEventsStore.getState().setAvail(ev as never, uid, status, note)
        // Failing after the wait is past: nothing more to say about it then.
        saving.catch(() => {})
        try {
          await Promise.race([saving, new Promise((done) => setTimeout(done, ANSWER_WAIT_MS))])
          return true
        } catch {
          return false
        }
      },
      // The church's post pages, read fresh, as the Posts screen reads them.
      posts: async () => {
        try {
          await usePostsStore.getState().refreshConfig()
          return usePostsStore.getState().config.pages
        } catch {
          return null
        }
      },
      // Loaded while her panel is open (above): waited for a moment if not yet.
      notes: async () => {
        const until = Date.now() + 3000
        while (!useDateNotesStore.getState().loaded && Date.now() < until) {
          await new Promise((r) => setTimeout(r, 100))
        }
        const store = useDateNotesStore.getState()
        return { ready: store.loaded, all: store.notes }
      },
      carsFor: async (ev) => {
        if (ev.carpoolCars?.length) return ev.carpoolCars as unknown as CarpoolCarData[]
        if (!ev.carpool) return []
        try {
          const saved = ((await getDoc(doc(db, 'carpool', `${ev.templateId}_${ev.date}`))).data()
            ?.cars ?? []) as Partial<CarpoolCarData>[]
          return saved.map((c, i) => ({
            ...c,
            id: c.id ?? String(i),
            label: c.label ?? '',
            driver: c.driver ?? '',
            riders: c.riders ?? [],
          }))
        } catch {
          return null
        }
      },
    }
  }

  /** Her question back, answered: listened for once she has said it, or typed. */
  const askBack = async (typing: boolean) => {
    setAskingBack(true)
    if (typing) {
      setTyped('')
      setStage('typing')
      return
    }
    await whenSpoken()
    // Closed meanwhile, or something else asked: not listened for.
    if (!openRef.current || !useMiriamStore.getState().awaiting) return
    listen(false, true)
  }

  /**
   * Asked for something the app already has — the next event, what's on,
   * their tasks — or an availability to give: done here,
   * nothing sent off. False when it isn't one of those, or isn't plain, for
   * Claude to work out.
   */
  const answeredHere = async (said: string): Promise<boolean> => {
    const say = (text: string, at: { key: string; section: 'details' } | null = null) => {
      setAnswer(text)
      speak(text)
      setStage('answered')
      if (at && !anyOverlayOpen()) router.push(miriamHref({ kind: 'event', ...at }) as never)
      return true
    }
    const data = appData()
    // "What's my next event?", "what's on this week?"
    const list = data && listAsked(said, data.today)
    if (list) {
      const { text, open } = listAnswer(list, data)
      return say(text, open?.section === 'details' ? { key: open.key, section: 'details' } : null)
    }
    // "What are my reminders?"
    if (/\b(?:my|any|what|which)\s+reminders?\b/i.test(said)) {
      const now = timeNow()
      const upcoming = useRemindersStore
        .getState()
        .reminders.filter((r) => !r.done && r.remindAt > now)
      if (upcoming.length === 0) return say('You have no reminders coming up.')
      const lines = upcoming
        .slice(0, 5)
        .map((r) => `${r.text}, ${reminderWhen(new Date(r.remindAt), new Date(now))}`)
      return say(
        `You have ${upcoming.length} ${upcoming.length === 1 ? 'reminder' : 'reminders'}: ${lines.join('; ')}.`
      )
    }
    // "What's due this week?": once their tasks are in.
    const tasksAsk = tasksAsked(said)
    const tasks = useTasksStore.getState()
    if (tasksAsk && data && tasks._refCount > 0 && !tasks.loading) {
      return say(tasksAnswer(tasksAsk, tasks.tasks, data.viewer.uid, data.today).text)
    }
    return false
  }

  /** A change asked for: shown as exactly what will be done, or why it can't be. */
  const offerAction = async (name: string, input: Record<string, unknown>, more = false) => {
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
      setPending({ name, prepared, more })
      setAnswer(prepared.title)
      speak(prepared.title)
      setStage('answered')
      // Asked out loud: a yes or no listened for once it has been said.
      if (saidAloud.current && available) listenForYes()
      return
    }
    setStage('answered')
  }

  /** The change on screen, answered by voice: listened for once she has asked, a short while. */
  const listenForYes = async () => {
    confirmingByVoice.current = true
    setConfirmByVoice(true)
    await whenSpoken()
    if (!openRef.current || !confirmingByVoice.current) return endVoiceConfirm()
    listen(false, true)
    setTimeout(() => {
      // Nothing said: left to a tap.
      if (!confirmingByVoice.current || request.current.trim()) return
      endVoiceConfirm()
      stopListening()
      setStage('answered')
    }, CONFIRM_LISTEN_MS)
  }
  const endVoiceConfirm = () => {
    confirmingByVoice.current = false
    setConfirmByVoice(false)
  }
  /** Confirmed: done, and said so. */
  const confirmAction = async (shown = pending) => {
    endVoiceConfirm()
    if (shown?.prepared.kind !== 'ready') return
    const { run, undo: takeBack } = shown.prepared
    const more = !!shown.more
    unlockSpeech()
    setPending(null)
    setStage('thinking')
    let said: string
    let done = false
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
      done = true
    } catch {
      said = 'That didn’t go through. Nothing was changed — try it on the screen.'
    }
    setAnswer(said)
    speak(said)
    // Done, and it can be taken back: a tap to, while it is shown.
    if (done && takeBack) setUndo({ label: 'Undo', run: takeBack })
    setStage('answered')
    // One of several things asked: on to the next, with this one remembered as done.
    if (more && done) {
      useMiriamStore.getState().remember(asked.current, said)
      await askClaude(CARRY_ON, false)
    }
  }
  const cancelAction = () => {
    endVoiceConfirm()
    setPending(null)
    useMiriamStore.getState().setAwaiting(false)
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
    noteDone(`Opened the chord sheet “${sheet.title}”.`)
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

  // A question handed over (an open chord sheet heard it): asked here, as if
  // typed — the panel opens with it, and her answer.
  const askHanded = useRef<(text: string) => void>(() => {})
  useEffect(() => {
    askHanded.current = (text) => {
      stopListening()
      setChoices([])
      setSongGuesses([])
      setPending(null)
      setLink(null)
      setRanOut(false)
      sent.current = false
      setAnswer(null)
      setSaid(null)
      setOpen(true)
      send(text)
    }
  })
  useEffect(
    () =>
      useMiriamStore.subscribe((now, before) => {
        if (!now.handed || now.handed === before.handed) return
        const { text } = now.handed
        useMiriamStore.getState().clearHanded()
        askHanded.current(text)
      }),
    []
  )

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
    if (!keepQuestion) setPending(null)
    setLink(null)
    setUnderstood('')
    setBriefing(null)
    setUndo(null)
    setWoken(byName)
    setRanOut(false)
    if (byName) AccessibilityInfo.announceForAccessibility('Miriam: Hineni, I am here')
    sent.current = false
    settled.current = ''
    saidHerName.current = false
    heardAs.current = null
    request.current = ''
    setHeard('')
    if (!keepQuestion) {
      setAnswer(null)
      setSaid(null)
      setAskingBack(false)
      asked.current = ''
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
    if (!ownsSpeech(SPEECH_ID) || !requesting.current || sent.current) return
    const text = e.results[0]?.transcript ?? ''
    const before = settled.current
    if (e.isFinal) settled.current = joined(settled.current, text)
    const all = e.isFinal ? settled.current : joined(settled.current, text)
    if (namesHer(all)) saidHerName.current = true
    if (e.isFinal) {
      const confidence = e.results[0]?.confidence
      heardAs.current = {
        alternatives: e.results
          .slice(1, 3)
          .map((r) => r.transcript?.trim())
          .filter((t): t is string => !!t && t !== text.trim())
          .map((t) => withoutHerName(joined(before, t))),
        confidence: typeof confidence === 'number' && confidence >= 0 ? confidence : null,
      }
    }
    request.current = withoutHerName(all)
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
    else if (confirmingByVoice.current) {
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
    if (confirmingByVoice.current) {
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
    endVoiceConfirm()
    sent.current = true
    stopListening()
    stopSpeaking()
    setAskingBack(false)
    setBriefing(null)
    setSaid(null)
    useMiriamStore.getState().setAwaiting(false)
    setOpen(false)
  }
  // Each answer remembered with what was asked, for what is said next (lib/miriamConversation).
  useEffect(() => {
    openRef.current = open
  }, [open])
  useEffect(() => {
    pendingRef.current = pending
  }, [pending])
  useEffect(() => {
    if (stage !== 'answered' || !answer || !asked.current) return
    const shown = shownNote.current ? ` (${shownNote.current})` : ''
    useMiriamStore.getState().remember(asked.current, answer + shown)
  }, [stage, answer])

  // An answer stays up a while, then goes, so the bar is not left over the page.
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useEffect(() => {
    // Not while there are events or songs to choose from: that waits for a choice.
    if (
      stage !== 'answered' ||
      !open ||
      askingBack ||
      briefing ||
      choices.length ||
      songGuesses.length ||
      pending ||
      link
    )
      return
    const t = setTimeout(() => closeRef.current(), ANSWER_MS)
    return () => clearTimeout(t)
  }, [stage, open, answer, askingBack, briefing, choices.length, songGuesses.length, pending, link])
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
                {briefing && stage === 'answered' ? null : stage === 'typing' ? null : heard ? (
                  <Text color={ink} fontSize="$3" fontStyle="italic" numberOfLines={3}>
                    “{heard}”
                  </Text>
                ) : null}
                {understood && stage === 'answered' && !briefing ? (
                  <Text color={soft} fontSize="$2">
                    I took that as “{understood}”
                  </Text>
                ) : stage === 'listening' && !answer && !heard ? (
                  <Text color={soft} fontSize="$2" numberOfLines={2}>
                    {songHost()
                      ? 'Which song? — “Above All in E”'
                      : 'Ask or say what to do — “What’s the dress code for Revival in the Heartland?”'}
                  </Text>
                ) : null}
                {answer ? (
                  // A walkthrough runs long: scrolled within the bar rather than cut off.
                  <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
                    <Text color={ink} fontSize="$3" fontWeight="600">
                      {answer}
                    </Text>
                  </ScrollView>
                ) : null}
                {said && !shownAlready(said, answer) ? (
                  // What she said that isn't on screen in so many words — her
                  // briefing read out, a briefing button's result — written out.
                  <ScrollView style={{ maxHeight: briefing ? 150 : 220 }} nestedScrollEnabled>
                    <Text
                      color={ink}
                      fontSize="$3"
                      fontWeight="600"
                      accessibilityLiveRegion="polite"
                    >
                      {said}
                    </Text>
                  </ScrollView>
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
                {stage === 'answered' && undo ? (
                  <Pressable
                    onPress={async () => {
                      const { run } = undo
                      setUndo(null)
                      const said = await run().catch(() => 'That couldn’t be undone just now.')
                      setAnswer(said)
                      speak(said)
                    }}
                    accessibilityRole="button"
                    style={[
                      styles.small,
                      {
                        borderWidth: 1,
                        borderColor: colors.primary,
                        alignSelf: 'flex-start',
                        marginTop: 6,
                      },
                    ]}
                  >
                    <Text color={colors.primary} fontWeight="700" fontSize="$2">
                      {undo.label}
                    </Text>
                  </Pressable>
                ) : null}
                {stage === 'answered' && link ? (
                  <Pressable
                    onPress={() => Linking.openURL(link.url).catch(() => {})}
                    accessibilityRole="link"
                    accessibilityLabel={`${link.label ?? 'Open the link'} for ${link.name}`}
                    style={[styles.choice, { borderColor: colors.primary, marginTop: 6 }]}
                  >
                    <Text color={colors.primary} fontWeight="700" fontSize="$3" numberOfLines={1}>
                      {link.label ?? 'Open the link'} — {link.name}
                    </Text>
                  </Pressable>
                ) : null}
                {(stage === 'answered' || confirmByVoice) && pending?.prepared.kind === 'ready' ? (
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
                        onPress={() => confirmAction()}
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

            {briefing && stage === 'answered' ? (
              // Long: scrolled within the panel, most of the screen at most.
              <ScrollView
                style={{ maxHeight: Math.round(Dimensions.get('window').height * 0.62) }}
                nestedScrollEnabled
              >
                <BriefingView
                  briefing={briefing}
                  speaking={reading}
                  onStop={() => {
                    stopSpeaking()
                    setReading(false)
                  }}
                  onOpen={(href) => {
                    close()
                    router.push(href as never)
                  }}
                  onTaskDone={(id) => useTasksStore.getState().setStatus(id, 'done')}
                  onReminderDone={(r) => useRemindersStore.getState().setDone(r, true)}
                  onBringFood={async (food) => {
                    // Signed up as asking for it would: checked, and taken only if still open.
                    const prepared = await prepareAction('sign_up_food', {
                      event_key: food.eventKey,
                      item: food.suggestion,
                      // The briefing showed it open: taken since is "just signed up".
                      shown_open: true,
                    })
                    if (prepared.kind === 'ready') {
                      const done = await prepared
                        .run()
                        .catch(() => 'That didn’t go through. Try it on the event’s page.')
                      speak(done)
                      return { signedUp: done.startsWith('You’re signed up') }
                    }
                    speak(
                      prepared.kind === 'cannot'
                        ? prepared.message
                        : 'Pick one on the event’s page.'
                    )
                    // Taken: the sheet as it is now, offered in the row — and
                    // what "as suggested" means from here on.
                    const open = prepared.kind === 'cannot' ? prepared.open : undefined
                    if (open && briefedFood.current) {
                      briefedFood.current = {
                        ...briefedFood.current,
                        food: briefedFood.current.food.map((n) =>
                          n.eventKey === food.eventKey
                            ? { ...n, open, suggestion: open[0] ?? n.suggestion }
                            : n
                        ),
                      }
                    }
                    return { signedUp: false, open }
                  }}
                  onRemind={async (item) => {
                    await remindToAnswer(item)
                    const said = `Okay — I’ve asked ${item.uids.length === 1 ? 'them' : `all ${item.uids.length}`} to answer for ${item.eventTitle}.`
                    speak(said)
                  }}
                />
              </ScrollView>
            ) : null}

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
            {!heard && !briefing && stage !== 'thinking' ? (
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
      {/* The morning offer: small, at the top, gone at a tap. */}
      <FloatingLayer
        visible={offerBriefing && !open}
        onRequestClose={() => setOfferBriefing(false)}
      >
        <View style={[styles.anchor, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <XStack
            style={styles.bar}
            backgroundColor={colors.surface}
            borderColor={colors.primary}
            borderWidth={1}
            borderRadius="$4"
            paddingHorizontal="$3"
            paddingVertical="$2"
            gap="$2.5"
            alignItems="center"
            width="94%"
            maxWidth={560}
          >
            <MiriamBadge color={colors.primary} letter="white" pulsing={false} />
            <YStack flex={1}>
              <Text color={colors.text} fontWeight="700" fontSize="$4">
                Good morning
              </Text>
              <Text color={colors.textMuted} fontSize="$2">
                Want your briefing for today?
              </Text>
            </YStack>
            <Pressable
              onPress={openBriefing}
              accessibilityRole="button"
              style={[styles.small, { backgroundColor: colors.primary }]}
            >
              <Text color="white" fontWeight="700" fontSize="$2">
                Show me
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setOfferBriefing(false)}
              accessibilityRole="button"
              accessibilityLabel="Not today"
              hitSlop={8}
              style={styles.close}
            >
              <Text color={colors.textMuted} fontSize="$4">
                ✕
              </Text>
            </Pressable>
          </XStack>
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
