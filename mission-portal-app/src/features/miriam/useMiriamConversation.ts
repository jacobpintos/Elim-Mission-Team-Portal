import { useEffect, useRef } from 'react'
import { Linking, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { namesHer, stopListeningAsked, withoutHerName } from '@/lib/wakeWord'
import { MAX_REQUEST, miriamHref } from '@/lib/miriam'
import { anyOverlayOpen } from '@/lib/overlays'
import { loadPlays, rememberName, rememberPlay, rememberWords } from '@/lib/miriamMemory'
import { heardRight, refreshHearing } from '@/lib/miriamHearing'
import { meetingAsked } from '@/lib/miriamMeeting'
import { storeAsked, storeReply } from '@/lib/miriamStore'
import {
  accountAsked,
  locationAsked,
  nameChangeAsked,
  placeIn,
  themeAsked,
} from '@/lib/miriamSettings'
import { comingAsked, comingSaid, eventsThere, upcomingSeen } from '@/lib/miriamComing'
import { geocodeCity } from '@/lib/geocode'
import { useThemeStore } from '@/stores/themeStore'
import { readElimStore } from '@/features/store/readElimStore'
import { tourFor, tourNames } from '@/features/tour/flows'
import { tourAsked } from '@/lib/miriamTour'
import {
  listAnswer,
  listAsked,
  playAsked,
  playFits,
  playKey,
  playPick,
  screenAsked,
  tasksAnswer,
  tasksAsked,
  weatherLine,
} from '@/lib/miriamQuick'
import { fetchWeather } from '@/lib/weather'
import { directionsUrl, googleDirectionsUrl, placeOf } from '@/lib/directions'
import { openDirections } from '@/lib/location'
import { canKeepDateNotes, isDay, noteText } from '@/lib/dateNotes'
import { minutesBeforeSaid, reminderAsked, reminderWhen, type Repeat } from '@/lib/reminders'
import { briefingAsked } from '@/lib/briefing'
import { localToday } from '@/lib/events'
import { asksAQuestion, songAsked, songThen } from '@/lib/miriamSongs'
import { looksLikeLyrics, slidesAsked, slidesAsking, type SlidesAsk } from '@/lib/lyricSlides'
import { songHost, songQueue } from '@/lib/songHost'
import { parseSheetCommand } from '@/lib/sheetCommands'
import { keyLabel } from '@/lib/nashvilleNumbers'
import { loadAliases } from '@/lib/songAliases'
import { screensFor } from '@/lib/miriamScreens'
import { canUseMessages, isAdmin, isPublicFollower, visibleTabs } from '@/lib/roles'
import { selfAsked, selfIntro } from '../../../functions/src/miriam/own/self'
import { clockOf } from '../../../functions/src/push/reminderTime'
import { useAuthStore } from '@/stores/authStore'
import { useChordSheetsStore } from '@/stores/chordSheetsStore'
import { useDateNotesStore } from '@/stores/dateNotesStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useMiriamStore } from '@/stores/miriamStore'
import { useMusicStore } from '@/stores/musicStore'
import { useRemindersStore, type ReminderExtra } from '@/stores/remindersStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useTourStore } from '@/features/tour/tourStore'
import { recordAsked } from './recordAsked'
import { recordTurn } from './recordTurn'
import { stopSpeaking, unlockSpeech, whenSpoken } from './speak'
import type { LastOwn } from '@/stores/miriamStore'
import { FORGET_MS } from '@/lib/miriamConversation'
import { NOT_MEANT_TAP, notMeantSaid } from '@/lib/miriamNotMeant'
import { askMiriam, miriamError } from './askMiriam'
import { eventByKey, prepareAction } from './actions'
import { appData, eventsLoaded, hereNow, quickFromApp } from './hereNow'
import { offerDirections, remindBeforeEach, talkHere, type Talk } from './localTalk'
import { BRIEFING_OFF, BRIEFING_OFF_KEY, BRIEFING_ON, type BriefingControls } from './useBriefing'
import type { Listening } from './useListening'
import { useMiriamActions } from './useMiriamActions'
import { useMiriamMedia } from './useMiriamMedia'
import { useMiriamSlides } from './useMiriamSlides'
import type { PanelState } from './usePanelState'

/** How long an answer stays up once given, unless she is spoken to again. */
const ANSWER_MS = 20_000
/** Said to her, answering a question she asked back: nothing more is wanted. */
const NEVER_MIND =
  /^(?:never\s*mind|cancel|forget\s+(?:it|that)|stop|no(?:\s+thanks?)?|nothing|that'?s\s+all)\b/i
/** The whole reply only "never mind": a song's name may start with "No" ("No Longer Slaves"). */
const ONLY_NEVER_MIND =
  /^(?:never\s*mind|cancel|forget\s+(?:it|that)|stop|no(?:\s+thanks?)?|nothing|that'?s\s+all)[\s.!]*$/i
/** The time now: read when something is asked, never while drawing. */
const timeNow = () => Date.now()
/** A change shown to confirm, answered out loud: yes, or no. Anything else leaves it to a tap. */
const SAID_YES =
  /^(?:yes|yeah|yep|yup|yes please|sure|ok(?:ay)?|do it|go ahead|confirm(?:ed)?|please do|that'?s right|correct|sounds good)\b/i
const SAID_NO = /^(?:no|nope|cancel|don'?t|stop|never\s*mind|wait|hold on)\b/i
/** Sent once a change she was asked for among others is done, for her to go on to the rest. */
const CARRY_ON = 'That’s done. Carry on with the rest of what I asked.'

/**
 * What Miriam does with a request: worked out here from what the app has
 * when it plainly can be (./localTalk, lib/miriamQuick), or else by Claude
 * (./askMiriam) — then said, shown, opened, or offered to confirm.
 */
/** How far around a city named counts as coming there, in miles. */
const CITY_MILES = 25

export function useMiriamConversation(
  panel: PanelState,
  listening: Listening,
  briefing: BriefingControls
) {
  const router = useRouter()
  const offerEventForm = useMiriamStore((s) => s.offerEventForm)
  const subGroups = useGroupsStore((s) => s.subscribe)
  const unsubGroups = useGroupsStore((s) => s.unsubscribe)
  const {
    open,
    setOpen,
    stage,
    setStage,
    heard,
    setHeard,
    setTyped,
    setRanOut,
    answer,
    setAnswer,
    choices,
    setChoices,
    heardNameRef,
    setUnderstood,
    askedRef,
    pending,
    setPending,
    pendingRef,
    askingBack,
    setAskingBack,
    askedHereRef,
    setSaid,
    confirmingByVoiceRef,
    shownNoteRef,
    openRef,
    link,
    setLink,
    briefing: briefingShown,
    setBriefing,
    setUndo,
    setVideo,
    songGuesses,
    setSongGuesses,
    videoGuesses,
    setVideoGuesses,
    slides,
    setSlides,
    lyricsWanted,
    setLyricsWanted,
    stay,
    setStay,
    woken,
    sentRef,
    saidAloudRef,
    speak,
    speakAside,
    noteDone,
    endVoiceConfirm,
  } = panel
  const { requestRef, heardAsRef, saidHerNameRef, setWake, stopListening, listen } = listening
  const { giveBriefing, briefedFoodRef } = briefing

  // Songs and videos (./useMiriamMedia), lyric slides (./useMiriamSlides), and
  // changes made for them (./useMiriamActions). Each reaches the others through
  // these, called only once everything is in place.
  const { openSong, playVideo, offerVideos, offerSongs, pickSong, pickVideo } = useMiriamMedia(
    panel,
    { slidesOf: (sheet) => slideMaker.slidesOfSheet(sheet) }
  )
  const slideMaker = useMiriamSlides(panel, {
    offerSongs,
    askBack: (typing) => void askBack(typing),
  })
  const { makeSlides, saveSlides } = slideMaker
  const {
    setReminder,
    setReminderBeforeEach,
    addNote,
    showDirections,
    offerAction,
    confirmAction,
    cancelAction,
    undoLast,
    reorderLink,
  } = useMiriamActions(panel, listening, {
    // One of several things asked, done: on to the rest.
    carryOn: () => askClaude(CARRY_ON, false, true),
  })

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

  // Requests sent to the server: one that sends none was the phone's alone (./recordTurn).
  const toServer = useRef(0)
  /** A request, or a reply, said or typed: worked out — and counted when the phone did it all. */
  const send = async (text: string, again = false) => {
    if (!text.trim() || sentRef.current) return
    const sent = toServer.current
    await sendNow(text, again)
    if (toServer.current === sent) recordTurn()
  }

  const sendNow = async (text: string, again = false) => {
    const asHeard = text.trim()
    if (!asHeard || sentRef.current) return
    // Put right where it was plainly misheard: "an even named" → "an event named".
    const said = heardRight(asHeard).text
    // Sent by a tap (the button, or a choice): lets a browser say the answer.
    unlockSpeech()
    sentRef.current = true
    // "That's not what I meant", after an answer of her own: asked again, of
    // Claude — before a yes or no to her card, as "no, that's not what I
    // meant" isn't a no to it. Anything else said lets her answer go.
    const lastOwn = useMiriamStore.getState().lastOwn
    useMiriamStore.getState().setLastOwn(null)
    const notMeant = !again && lastOwn ? notMeantSaid(withoutHerName(said)) : null
    if (lastOwn && notMeant && timeNow() - lastOwn.at < FORGET_MS) {
      // Said or typed, not tapped: how a question back is answered.
      if (stage !== 'answered') saidAloudRef.current = stage !== 'typing'
      await correct(
        lastOwn,
        notMeant === 'restated' ? said : NOT_MEANT_TAP,
        stage === 'typing' || (stage === 'answered' && !saidAloudRef.current)
      )
      return
    }
    // A yes or no to the change she just showed: done, or not, from here.
    const shown = pendingRef.current
    if (confirmingByVoiceRef.current && shown?.prepared.kind === 'ready') {
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
    saidAloudRef.current = stage !== 'typing'
    // Typed rather than said: a question back is answered by typing too.
    const typing = stage === 'typing'
    if (!again) askedRef.current = said
    setChoices([])
    setSongGuesses([])
    setVideoGuesses([])
    setSlides(null)
    setStay(false)
    setPending(null)
    setLink(null)
    setUndo(null)
    setBriefing(null)
    setSaid(null)
    setUnderstood('')
    setAskingBack(false)
    shownNoteRef.current = ''
    stopListening()
    setHeard(asHeard)
    // Taken as something other than heard: shown, as Claude's corrections are.
    if (said !== asHeard) setUnderstood(said)
    // "Hey Miriam, stop listening": her name said, or her woken by it — never
    // the words alone, which are as likely sung or said to someone else.
    if (
      !again &&
      (woken || saidHerNameRef.current || namesHer(said)) &&
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
    // Answering her "which song?" for slides: the lyrics as typed — their
    // lines kept, and never "put right" as something misheard — or its name.
    // Lyrics are pasted, a line to a line: one line, or anything said, is a
    // name. Anything else is taken as a request of its own, below.
    if (!again && lyricsWanted && useMiriamStore.getState().awaiting) {
      setLyricsWanted(false)
      const reply = withoutHerName(asHeard)
      if (!ONLY_NEVER_MIND.test(reply)) {
        const pasted = typing && /\n|\s\/\s/.test(reply) && looksLikeLyrics(reply)
        const ask: SlidesAsk =
          slidesAsked(reply) ??
          (pasted ? { kind: 'lyrics', lyrics: reply, title: '' } : { kind: 'song', name: reply })
        // Remembered without the lyrics: they stay on the device.
        if (ask.kind === 'lyrics') askedRef.current = slidesAsking(ask)
        if (await makeSlides(ask, true)) return
        useMiriamStore.getState().setAwaiting(false)
      }
    }
    setLyricsWanted(false)
    // Answering a question she asked here: carried on here. A reply that is
    // no answer to it is taken as a request of its own, below.
    if (!again && askedHereRef.current && useMiriamStore.getState().awaiting) {
      const onReply = askedHereRef.current
      askedHereRef.current = null
      if (await onReply(withoutHerName(said), talkFor(typing))) return
      useMiriamStore.getState().setAwaiting(false)
    }
    askedHereRef.current = null
    // Answering what she asked back: hers to work out with what came before,
    // not taken for a song or a screen on its own.
    const replying = !again && useMiriamStore.getState().awaiting
    // Lyric slides asked for (lib/lyricSlides): read from what was typed as
    // it was typed, as pasted lyrics keep their lines. Made here even in the
    // middle of a conversation with Claude, who can't make them.
    const slidesAsk = !again ? slidesAsked(withoutHerName(asHeard)) : null
    // Lyrics pasted, too long to send her, and not asked as slides: how to
    // ask for them, here — the lyrics never sent, nor kept.
    if (
      !again &&
      typing &&
      !slidesAsk &&
      asHeard.length > MAX_REQUEST &&
      looksLikeLyrics(asHeard)
    ) {
      askedRef.current = ''
      useMiriamStore.getState().setAwaiting(false)
      const text =
        'To make slides of a song, type “make slides for this song” with its lyrics pasted underneath.'
      setAnswer(text)
      speak(text)
      setStage('answered')
      return
    }
    // A question of its own, not an answer to hers: kept, without who asked,
    // for Admin → Analytics (./recordAsked). Not a song's lyrics.
    if (!again && !replying && !slidesAsk) {
      recordAsked(withoutHerName(said), useAuthStore.getState().profile)
    }
    if (replying && NEVER_MIND.test(withoutHerName(said))) {
      useMiriamStore.getState().setAwaiting(false)
      setAnswer('Okay.')
      speak('Okay.')
      setStage('answered')
      return
    }
    // "Make slides for Way Maker", or for this song with its lyrics pasted: made here.
    if (slidesAsk) {
      useMiriamStore.getState().setAwaiting(false)
      // Remembered without the lyrics: they stay on the device.
      if (slidesAsk.kind === 'lyrics') askedRef.current = slidesAsking(slidesAsk)
      if (await makeSlides(slidesAsk)) return
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
      const items = useMusicStore.getState().items
      // Asked this way before, and it turned out to mean one: that one.
      const key = playKey(play)
      const learned = (await loadPlays()).find((p) => p.key === key)
      const item =
        (learned && items.find((m) => String(m.id) === learned.id)) || playPick(play, items)
      if (item) {
        playVideo(item)
        return
      }
      // Described, and it fits a few — "the Flip The Narrative podcast": those
      // offered to pick from, here, rather than sent on for Claude to guess.
      const fits = playFits(play, items)
      if (fits.length >= 2 && fits.length <= 4) {
        offerVideos(play, items, 'A few fit that — which one?')
        return
      }
      // A public follower's isn't sent on to be looked for further: the
      // likely ones offered, or Content to look through.
      if (isPublicFollower(useAuthStore.getState().profile)) {
        offerVideos(play, items)
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
    // "Who are you?", "what can you do?": who she is — an AI, not a person —
    // and what she can do for them, said here (functions/src/miriam/own/self),
    // as the server says it.
    if (local && !play && selfAsked(withoutHerName(said))) {
      const profile = useAuthStore.getState().profile
      const text = selfIntro({
        isPublic: isPublicFollower(profile),
        messages: canUseMessages(profile),
        worship: visibleTabs(profile).includes('worship'),
        admin: isAdmin(profile),
      })
      noteDone(text)
      setAnswer(text)
      speak(text)
      setStage('answered')
      return
    }
    // "Is anything on sale at the Elim Store?", "what's for sale there?", "what
    // is it?": answered from the store and its sale as they stand
    // (lib/miriamStore), not guessed at or looked for on the web — with the
    // store opened, where there is something there to see.
    const storeAsk = local && !play && !anyOverlayOpen() ? storeAsked(withoutHerName(said)) : null
    const storeScreen = storeAsk
      ? screensFor(useAuthStore.getState().profile).find((x) => x.id === 'store')
      : undefined
    if (storeAsk && storeScreen) {
      setStage('thinking')
      const read = await readElimStore().catch(() => null)
      if (read) {
        const reply = storeReply(storeAsk, read.store, read.sale)
        noteDone(reply.text)
        setAnswer(reply.text)
        speak(reply.text)
        setStage('answered')
        if (reply.open) router.push(storeScreen.path as never)
        return
      }
    }
    // Their own settings, for anyone — a public follower too, whose requests
    // never go to Claude (lib/miriamSettings): light or dark, at once, as
    // Settings' switch does it; their name or location, shown to confirm; and
    // what needs Settings itself — a password, a photo picked — opened there.
    if (local && !play && !anyOverlayOpen()) {
      const asked = withoutHerName(said)
      const mode = themeAsked(asked)
      if (mode) {
        const theme = useThemeStore.getState()
        const text =
          theme.mode === mode ? `It’s already in ${mode} mode.` : `Switched to ${mode} mode.`
        if (theme.mode !== mode) theme.chooseMode(mode)
        noteDone(text)
        setAnswer(text)
        speak(text)
        setStage('answered')
        return
      }
      const name = nameChangeAsked(asked)
      const where = name ? null : locationAsked(asked)
      if (name || where) {
        useMiriamStore.getState().setAwaiting(false)
        await offerAction(
          name ? 'change_my_name' : 'set_my_location',
          name ? { name } : { ...where }
        )
        return
      }
      const account = accountAsked(asked)
      const settings = account
        ? screensFor(useAuthStore.getState().profile).find((x) => x.id === 'settings')
        : undefined
      if (account && settings) {
        const text = {
          email:
            'Your email is changed in Profile & Settings, with your password to confirm it — here it is.',
          password: 'Your password is changed in Profile & Settings — here it is.',
          photo: 'Your photo is changed in Profile & Settings — tap your picture there.',
        }[account]
        noteDone(text)
        setAnswer(text)
        speak(text)
        setStage('answered')
        router.push(settings.path as never)
        return
      }
    }
    // "When is Elim coming to my area?", "…to Des Moines?" — for someone
    // following the church: the public events within the distance they set,
    // or in and around the city named, by date (lib/miriamComing). None:
    // nothing upcoming there at the moment, and the form to ask the
    // leadership team to bring Elim there, filled in with where.
    const coming =
      local && !play && !anyOverlayOpen() && isPublicFollower(useAuthStore.getState().profile)
        ? comingAsked(withoutHerName(said))
        : null
    if (coming) {
      const profile = useAuthStore.getState().profile
      const loc = profile?.locationPref
      const answer = (text: string) => {
        noteDone(text)
        setAnswer(text)
        speak(text)
        setStage('answered')
      }
      if (coming.near && (!loc?.lat || !loc?.lng)) {
        answer(
          'I don’t know where you are yet. Tell me your city — “set my location to North Liberty, Iowa” — or ask “when is Elim coming to Des Moines?”'
        )
        return
      }
      setStage('thinking')
      const data = await eventsLoaded()
      const events = data ? upcomingSeen(data) : []
      const city = coming.near ? null : placeIn(coming.place)
      const spot = coming.near
        ? { lat: loc!.lat!, lng: loc!.lng!, miles: loc!.radius || 50 }
        : city
          ? await geocodeCity(city.city, city.state)
              .then((c) => (c ? { ...c, miles: CITY_MILES } : null))
              .catch(() => null)
          : null
      const found = eventsThere(events, spot, city ?? undefined)
      const named = coming.near ? (loc?.city ?? '') : (city?.city ?? coming.place)
      answer(comingSaid(found, coming.near ? 'near you' : `in ${named}`))
      const connect = screensFor(profile).find((x) => x.id === 'connect')
      if (!found.length && connect) {
        useMiriamStore.getState().offerMeetingForm({
          names: [],
          availability: '',
          message: named ? `Could Elim come to ${named}?` : 'Could Elim come to my area?',
        })
        router.push(connect.path as never)
      }
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
    // "Open Revive Me", for a public follower — who has no chord sheets for
    // "open" to mean: a video from Content, by its whole title.
    const opened =
      local && !play && isPublicFollower(useAuthStore.getState().profile)
        ? playAsked(withoutHerName(said), { openAny: true })
        : null
    if (opened) {
      const music = useMusicStore.getState()
      if (music.items.length === 0) await music.load()
      const item = playPick(opened, useMusicStore.getState().items, { exact: true })
      if (item) {
        playVideo(item)
        return
      }
    }
    // A food sign-up, a task's status, a notification switch, announcements or
    // messages: worked out here, asking back what isn't plain (./localTalk).
    if (
      local &&
      !play &&
      (await talkHere(withoutHerName(said), hereNow(briefedFoodRef), talkFor(typing)))
    )
      return
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
      // "Open revive me in C. Start autoscroll 5.": the song, and what to do once it is open.
      const both = songThen(withoutHerName(said), sheets, aliases)
      const asking = songAsked(sheets, aliases, both?.song ?? withoutHerName(said), songMode)
      if (asking?.kind === 'open') {
        openSong(asking.sheet, asking.key, both?.then)
        return
      }
      if (asking?.kind === 'guess') {
        offerSongs(asking, both?.then ?? [])
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
   * One of her own answers wasn't what they meant: what she showed put away
   * (a card not counted as cancelled — the correction is counted; a reminder
   * she just set taken back), and the request asked again of Claude, with
   * what she said (functions/src/miriam/askMiriam: correct). What they had
   * asked stays what Claude's answer is remembered against.
   */
  const correct = async (last: LastOwn, saidNow: string, typing: boolean) => {
    endVoiceConfirm()
    stopListening()
    stopSpeaking()
    setPending(null)
    // A reminder she set for it — kept with her answer, as listening again
    // takes away its Undo. Never a change they confirmed: that was theirs.
    if (last.undo) {
      setUndo(null)
      await last.undo().catch(() => {})
    }
    useMiriamStore.getState().setAwaiting(false)
    setAskingBack(false)
    setAnswer('')
    setChoices([])
    setSongGuesses([])
    setVideoGuesses([])
    setSlides(null)
    setLink(null)
    setStay(false)
    setBriefing(null)
    setUnderstood('')
    setSaid(null)
    shownNoteRef.current = ''
    setHeard(saidNow)
    await askClaude(saidNow, typing, false, last.check)
  }

  /** "Not what I meant", tapped under one of her own answers — while it can still be. */
  const notMeant = () => {
    const last = useMiriamStore.getState().lastOwn
    if (!last || timeNow() - last.at >= FORGET_MS) {
      useMiriamStore.getState().setLastOwn(null)
      return
    }
    unlockSpeech()
    sentRef.current = false
    stopSpeaking()
    void send(NOT_MEANT_TAP)
  }

  /**
   * Worked out by Claude (functions/src/miriam), with what was said and
   * answered just before: shown, said, and opened. `typing`: a question she
   * asks back is answered by typing, rather than listened for. `check`: one
   * of her own answers, said not to be what they meant.
   */
  const askClaude = async (said: string, typing: boolean, continued = false, check?: string) => {
    toServer.current++
    setStage('thinking')
    useMiriamStore.getState().setLastOwn(null)
    try {
      // How it was heard, when it is what was just said (not typed, nor her carrying on).
      // (What was just said, as heard or as put right: lib/miriamHearing.)
      const justSaid =
        said === requestRef.current || said === heardRight(requestRef.current ?? '').text
      const heard = !typing && justSaid ? (heardAsRef.current ?? undefined) : undefined
      const result = await askMiriam(said, heard, continued, check)
      // Her own answer: kept a little while, for "that's not what I meant" — and let go after.
      const ownCheck =
        (result.kind === 'answer' || result.kind === 'confirm') && result.check
          ? result.check
          : null
      if (ownCheck) {
        useMiriamStore.getState().setLastOwn({ check: ownCheck, at: timeNow() })
        setTimeout(() => {
          if (useMiriamStore.getState().lastOwn?.check === ownCheck) {
            useMiriamStore.getState().setLastOwn(null)
          }
        }, FORGET_MS)
      }
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
      setStay(result.kind === 'answer' && !!result.stay)
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
          if (!(await remindBeforeEach(ask, hereNow(briefedFoodRef), talkFor(typing)))) {
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
        const takeBack = await setReminder(
          text,
          at,
          `to ${text.charAt(0).toLowerCase()}${text.slice(1)}`,
          extra
        )
        // Her own: taken back if they say it wasn't what they meant.
        const last = useMiriamStore.getState().lastOwn
        if (ownCheck && takeBack && last?.check === ownCheck) {
          useMiriamStore.getState().setLastOwn({ ...last, undo: takeBack })
        }
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
      // Claude worked out it was the briefing she was asked for, in words she
      // didn't place herself ("gibe me my daily breifing"): the briefing,
      // as she gives it, rather than Claude's account of their day.
      if (result.kind === 'answer' && result.understood && briefingAsked(result.understood)) {
        await giveBriefing(typing)
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
        // Content's list is only loaded once Content has been opened, so asked
        // from anywhere else it was empty: the video was "not found", and she
        // said she was opening it while nothing opened. Loaded here first, as
        // her own "play" does above.
        const music = useMusicStore.getState()
        if (music.items.length === 0) await music.load()
        const item = useMusicStore.getState().items.find((m) => String(m.id) === String(wanted.id))
        if (item) {
          // Asked for in a way she couldn't place, and Claude found which:
          // remembered, so asked the same way again she plays it herself.
          const asked = playAsked(withoutHerName(said))
          if (asked) void rememberPlay(playKey(asked), String(item.id))
          noteDone(`Playing “${item.title}” from Content.`)
          setVideo(item)
          setOpen(false)
          return
        }
        // Still not there — taken out of Content since, say. Not "opening it
        // now" with nothing opening.
        const text = 'I found it, but couldn’t open it here. It may have been taken out of Content.'
        setAnswer(text)
        speak(text)
        setStage('answered')
        return
      }
      const shown = result.kind === 'answer' ? result.open : null
      if (shown?.kind === 'event') shownNoteRef.current = `showing the event ${shown.key}`
      else if (shown?.kind === 'task') shownNoteRef.current = `showing the task ${shown.id}`
      setAnswer(result.text)
      speak(result.text)
      if (result.kind === 'answer') {
        setChoices(result.choices ?? [])
        heardNameRef.current = result.heardName ?? ''
      }
      // Asked something back: the reply listened for once she has asked it.
      if (followUp) {
        // Remembered here, not left to the panel's "answered" (usePanelState):
        // typed, askBack goes straight on to the box for the reply, the panel
        // is never seen answered, and her question was never kept — so "yes"
        // went to Claude with nothing before it to be a yes to.
        const shown = shownNoteRef.current ? ` (${shownNoteRef.current})` : ''
        noteDone(result.text + shown)
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
          // Connect's meeting form, brought into view once the page is there.
          if (screen && open.section === 'meeting') useMiriamStore.getState().showMeetingForm()
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

  // --- Worked out here (./localTalk) --------------------------------------

  /** How she speaks and acts in a conversation worked out here. `typing`: a question is answered by typing. */
  const talkFor = (typing: boolean): Talk => ({
    say: (text, sheet) => {
      useMiriamStore.getState().setAwaiting(false)
      useMiriamStore.getState().remember(askedRef.current, text)
      setAnswer(text)
      speak(text)
      setStage('answered')
      if (sheet && !anyOverlayOpen()) {
        router.push(miriamHref({ kind: 'event', key: sheet.instanceKey, section: 'food' }) as never)
      }
    },
    ask: (text, onReply) => {
      askedHereRef.current = onReply
      useMiriamStore.getState().setAwaiting(true)
      // Remembered with what was asked, so a reply left to Claude is understood.
      useMiriamStore.getState().remember(askedRef.current, text)
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
        // Agreed to in words, with no card shown: not a card's answer (./recordTurn).
        await confirmAction({ name, prepared }, false)
      } else if (prepared.kind === 'cannot') {
        setAnswer(prepared.message)
        speak(prepared.message)
        setStage('answered')
      } else {
        await offerAction(name, input)
      }
    },
    thinking: () => setStage('thinking'),
    remind: async (text, at, spoken, extra) => {
      useMiriamStore.getState().setAwaiting(false)
      await setReminder(text, at, spoken, extra)
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

  /** Her question back, answered: listened for once she has said it, or typed. */
  const askBack = async (typing: boolean) => {
    setAskingBack(true)
    if (typing) {
      // A new request to send: what was sent before is done with.
      sentRef.current = false
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
    // Only where their Tasks tab is: a public follower alone has none to be told of.
    const tasksTab = visibleTabs(useAuthStore.getState().profile).includes('assignments')
    if (tasksAsk && data && tasksTab && tasks._refCount > 0 && !tasks.loading) {
      return say(tasksAnswer(tasksAsk, tasks.tasks, data.viewer.uid, data.today).text)
    }
    return false
  }

  // A question handed over (an open chord sheet heard it): asked here, as if
  // typed — the panel opens with it, and her answer.
  const askHanded = useRef<(text: string) => void>(() => {})
  useEffect(() => {
    askHanded.current = (text) => {
      stopListening()
      setChoices([])
      setSongGuesses([])
      setVideoGuesses([])
      setSlides(null)
      setStay(false)
      setPending(null)
      setLink(null)
      setRanOut(false)
      sentRef.current = false
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

  const close = () => {
    endVoiceConfirm()
    sentRef.current = true
    stopListening()
    stopSpeaking()
    setAskingBack(false)
    setBriefing(null)
    setSaid(null)
    setLyricsWanted(false)
    useMiriamStore.getState().setAwaiting(false)
    setOpen(false)
  }

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
      briefingShown ||
      choices.length ||
      songGuesses.length ||
      videoGuesses.length ||
      slides ||
      stay ||
      pending ||
      link
    )
      return
    const t = setTimeout(() => closeRef.current(), ANSWER_MS)
    return () => clearTimeout(t)
  }, [
    stage,
    open,
    answer,
    askingBack,
    briefingShown,
    choices.length,
    songGuesses.length,
    videoGuesses.length,
    slides,
    stay,
    pending,
    link,
  ])

  /** One of the events she offered: learned as what was meant, and asked about. */
  const pick = async (choice: { key: string; title: string; date: string }) => {
    unlockSpeech()
    // Saved first, so the question asked again already carries it.
    if (heardNameRef.current) await rememberName(heardNameRef.current, choice.title)
    sentRef.current = false
    stopSpeaking()
    send(`${askedRef.current} — I mean “${choice.title}” on ${choice.date}`, true)
  }

  const typeInstead = () => {
    stopListening()
    sentRef.current = false
    setTyped(heard)
    setStage('typing')
  }

  return {
    send,
    talkFor,
    offerAction,
    confirmAction,
    cancelAction,
    undoLast,
    pickSong,
    pickVideo,
    saveSlides,
    pick,
    notMeant,
    typeInstead,
    close,
  }
}

export type Conversation = ReturnType<typeof useMiriamConversation>
