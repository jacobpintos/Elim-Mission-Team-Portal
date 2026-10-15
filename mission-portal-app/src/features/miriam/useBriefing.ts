import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AttentionItem, Briefing, FoodNudge } from '@/lib/briefing'
import { localToday } from '@/lib/events'
import { useAuthStore } from '@/stores/authStore'
import { prepareAction } from './actions'
import { appToolsFor } from './appTools'
import { gatherBriefing, remindToAnswer } from './briefingData'
import { hereNow } from './hereNow'
import { askAvailability, type Talk } from './localTalk'
import { stopSpeaking, unlockSpeech, whenSpoken } from './speak'
import type { PanelState } from './usePanelState'

/** The day the briefing was last offered on this device, and whether it is offered at all. */
const BRIEFING_DAY_KEY = 'miriam_briefing_day'
export const BRIEFING_OFF_KEY = 'miriam_briefing_off'
/** Offered from the morning into early afternoon; later, the day is mostly done. */
const OFFER_FROM_HOUR = 5
const OFFER_UNTIL_HOUR = 14
/** "Stop offering my briefing", "offer my briefing every morning". */
export const BRIEFING_OFF =
  /\b(?:stop|don'?t|do\s+not|quit)\s+(?:offering|showing|giving)\s+(?:me\s+)?(?:my|the)\s+(?:morning\s+|daily\s+)?briefing\b|\bturn\s+off\s+(?:my|the)\s+(?:morning\s+|daily\s+)?briefing\b/i
export const BRIEFING_ON =
  /\b(?:offer|show|give)\s+(?:me\s+)?(?:my|the)\s+briefing\s+(?:each|every)\s+(?:morning|day)\b|\bturn\s+on\s+(?:my|the)\s+(?:morning\s+|daily\s+)?briefing\b/i

/**
 * Miriam's daily briefing (lib/briefing): offered the first time the app is
 * opened in a morning, shown on a screen of its own (./BriefingScreen), and
 * read out a part at a time.
 */
export function useBriefing(
  panel: PanelState,
  {
    appActive,
    stopWake,
    talkFor,
  }: {
    appActive: boolean
    /** Stop listening for her name (./useListening). */
    stopWake: () => void
    /** How she talks in a conversation worked out here (./useMiriamConversation). */
    talkFor: (typing: boolean) => Talk
  }
) {
  const {
    setOpen,
    setStage,
    setHeard,
    setAnswer,
    setChoices,
    setUnderstood,
    askedRef,
    setPending,
    pendingRef,
    openRef,
    briefing,
    setBriefing,
    setUndo,
    setSongGuesses,
    setVideoGuesses,
    setStay,
    sentRef,
    speak,
    noteDone,
  } = panel

  // The food her briefing showed open today, and suggested: "I'll bring chips
  // as suggested" is that event; one taken since is "just signed up for".
  const briefedFoodRef = useRef<{ day: string; food: FoodNudge[] } | null>(null)
  // The first time the app is opened in a morning: the briefing offered.
  const [offerBriefing, setOfferBriefing] = useState(false)
  // Whether it is being read out.
  const [reading, setReading] = useState(false)
  // The briefing on its own screen, the part of it being said, and which
  // reading of it this is (a newer one, or Stop, ends the one before).
  const [briefScreen, setBriefScreen] = useState(false)
  const [saying, setSaying] = useState(-1)
  const briefRun = useRef(0)
  // The briefing put away — a new question, Miriam closed, a row tapped to go
  // to it: her reading of it ends, and so does its screen.
  // (The screen goes with it: it is only shown while there is a briefing.)
  useEffect(() => {
    if (!briefing) briefRun.current++
  }, [briefing])

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

  /**
   * The briefing read aloud a part at a time (lib/briefing: segments), each
   * part's rows lit up on the briefing screen as she comes to it. Resolves
   * true when she read to the end, false when stopped or replaced.
   */
  const readBriefing = async (b: Briefing): Promise<boolean> => {
    const run = ++briefRun.current
    setReading(true)
    for (let i = 0; i < b.segments.length; i++) {
      if (run !== briefRun.current) return false
      setSaying(i)
      speak(b.segments[i].text)
      await whenSpoken()
    }
    if (run !== briefRun.current) return false
    setReading(false)
    return true
  }

  /** Stops her reading the briefing, where she is. */
  const stopBriefing = () => {
    briefRun.current++
    stopSpeaking()
    setReading(false)
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
    setSaying(-1)
    setBriefing(b)
    setBriefScreen(true)
    briefedFoodRef.current = { day: localToday(), food: b.food }
    noteDone(b.spoken)
    const briefedFor = askedRef.current
    readBriefing(b).then((finished) => {
      // Then their events still without an answer, asked about one at a time
      // — unless they have closed her, asked something else, stopped her
      // reading, or have a change up to confirm, meanwhile. Asked in her bar:
      // the briefing screen steps aside for it.
      const profile = useAuthStore.getState().profile
      if (
        finished &&
        b.asks.length &&
        openRef.current &&
        askedRef.current === briefedFor &&
        !pendingRef.current &&
        appToolsFor(profile).includes('set_availability')
      ) {
        const lead =
          b.asks.length === 1
            ? 'One of your events needs an answer. '
            : `${b.asks.length} of your events need an answer. `
        setBriefScreen(false)
        setBriefing(null)
        askAvailability(b.asks, hereNow(briefedFoodRef), talkFor(typing), lead)
      }
    })
    setStage('answered')
  }

  /** The morning offer taken up: the panel opened on the briefing. */
  const openBriefing = async () => {
    unlockSpeech()
    setOfferBriefing(false)
    stopWake()
    sentRef.current = true
    askedRef.current = 'What do I need to know today?'
    setHeard('')
    setAnswer(null)
    setChoices([])
    setSongGuesses([])
    setVideoGuesses([])
    setStay(false)
    setPending(null)
    setUndo(null)
    setUnderstood('')
    setOpen(true)
    await giveBriefing()
  }

  /** The morning offer turned down: gone until tomorrow. */
  const dismissOffer = () => setOfferBriefing(false)

  /** Food the briefing suggested, signed up for at a tap. */
  const bringFood = async (food: FoodNudge): Promise<{ signedUp: boolean; open?: string[] }> => {
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
    speak(prepared.kind === 'cannot' ? prepared.message : 'Pick one on the event’s page.')
    // Taken: the sheet as it is now, offered in the row — and
    // what "as suggested" means from here on.
    const open = prepared.kind === 'cannot' ? prepared.open : undefined
    if (open && briefedFoodRef.current) {
      briefedFoodRef.current = {
        ...briefedFoodRef.current,
        food: briefedFoodRef.current.food.map((n) =>
          n.eventKey === food.eventKey ? { ...n, open, suggestion: open[0] ?? n.suggestion } : n
        ),
      }
    }
    return { signedUp: false, open }
  }

  /** The people yet to answer for an event, asked to (a leader's briefing). */
  const remind = async (item: NonNullable<AttentionItem['remind']>) => {
    await remindToAnswer(item)
    const said = `Okay — I’ve asked ${item.uids.length === 1 ? 'them' : `all ${item.uids.length}`} to answer for ${item.eventTitle}.`
    speak(said)
  }

  return {
    briefedFoodRef,
    offerBriefing,
    dismissOffer,
    reading,
    briefScreen,
    setBriefScreen,
    saying,
    readBriefing,
    stopBriefing,
    giveBriefing,
    openBriefing,
    bringFood,
    remind,
  }
}

export type BriefingControls = ReturnType<typeof useBriefing>
