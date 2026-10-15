import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useSongQueue } from '@/features/worship/useSongQueue'
import type { Briefing } from '@/lib/briefing'
import { useMiriamStore } from '@/stores/miriamStore'
import type { MusicItem } from '@/stores/musicStore'
import { useUIStore } from '@/stores/uiStore'
import type { ChordSheet } from '@/types/chordSheet'
import type { Prepared } from './actions'
import type { Reply } from './localTalk'
import { speak as speakAloud } from './speak'

export type Stage = 'listening' | 'typing' | 'thinking' | 'answered'

/**
 * What Miriam's bar shows, and what she keeps track of while it is up —
 * shared by her listening (./useListening), her briefing (./useBriefing) and
 * what she works out (./useMiriamConversation), and drawn by ./MiriamPanel.
 */
export function usePanelState() {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>('listening')
  const [heard, setHeard] = useState('')
  const [typed, setTyped] = useState('')
  // The minute ran out while still talking: what was heard, to finish or send.
  const [ranOut, setRanOut] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  // Events she offers when she isn't sure which was meant, and what was said
  // for it — learned from the one picked — and the question they answer.
  const [choices, setChoices] = useState<{ key: string; title: string; date: string }[]>([])
  const heardNameRef = useRef('')
  // How she read it, when that differs from what was heard: shown under it.
  const [understood, setUnderstood] = useState('')
  const askedRef = useRef('')
  // A chord sheet asked for: open, in the key asked for.
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
  const pendingRef = useRef<typeof pending>(null)
  // She asked something back, and is waiting to hear the reply: kept up meanwhile.
  const [askingBack, setAskingBack] = useState(false)
  // A question she asked here, not of Claude (./localTalk): its reply comes back to it.
  const askedHereRef = useRef<Reply | null>(null)
  // What she said, written out as well as said aloud — for a phone on silent,
  // a loud room, or someone who would rather read: shown with her answer when
  // it isn't the same words (her briefing read out, a briefing button's result).
  const [said, setSaid] = useState<string | null>(null)
  // A change shown to confirm, and her listening for a spoken yes or no to it.
  const [confirmByVoice, setConfirmByVoice] = useState(false)
  const confirmingByVoiceRef = useRef(false)
  // What was shown with the answer, remembered with it: "showing the event rev_2026-10-11".
  const shownNoteRef = useRef('')
  const openRef = useRef(false)
  // A link to buy something, for a tap to open (in a browser).
  // `label`: what its button says, when not "Open the link" (directions: "Open in Google Maps").
  const [link, setLink] = useState<{ url: string; name: string; label?: string } | null>(null)
  // The daily briefing, shown in place of an answer (./useBriefing).
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  // Something just done that can be taken back at a tap: a reminder set.
  const [undo, setUndo] = useState<{ label: string; run: () => Promise<string> } | null>(null)
  // A video from Content asked for, playing over the page.
  const [video, setVideo] = useState<MusicItem | null>(null)
  const [songGuesses, setSongGuesses] = useState<ChordSheet[]>([])
  const [videoGuesses, setVideoGuesses] = useState<MusicItem[]>([])
  // An answer on faith: left open, to be read, until it is closed.
  const [stay, setStay] = useState(false)
  // Opened by her name rather than a tap: shown unmistakably, as it may be
  // across the room from whoever said it.
  const [woken, setWoken] = useState(false)
  // The request now has been sent: nothing more heard is taken for it.
  const sentRef = useRef(false)
  // The last request was said, not typed: a change it brings is listened for a yes to.
  const saidAloudRef = useRef(false)

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
  const noteDone = (reply: string) => useMiriamStore.getState().remember(askedRef.current, reply)

  const endVoiceConfirm = () => {
    confirmingByVoiceRef.current = false
    setConfirmByVoice(false)
  }

  useEffect(() => {
    openRef.current = open
  }, [open])
  useEffect(() => {
    pendingRef.current = pending
  }, [pending])
  // Each answer remembered with what was asked, for what is said next (lib/miriamConversation).
  useEffect(() => {
    if (stage !== 'answered' || !answer || !askedRef.current) return
    const shown = shownNoteRef.current ? ` (${shownNoteRef.current})` : ''
    useMiriamStore.getState().remember(askedRef.current, answer + shown)
  }, [stage, answer])

  return {
    open,
    setOpen,
    stage,
    setStage,
    heard,
    setHeard,
    typed,
    setTyped,
    ranOut,
    setRanOut,
    answer,
    setAnswer,
    choices,
    setChoices,
    heardNameRef,
    understood,
    setUnderstood,
    askedRef,
    song,
    setSong,
    sheetQueue,
    pending,
    setPending,
    pendingRef,
    askingBack,
    setAskingBack,
    askedHereRef,
    said,
    setSaid,
    confirmByVoice,
    setConfirmByVoice,
    confirmingByVoiceRef,
    shownNoteRef,
    openRef,
    link,
    setLink,
    briefing,
    setBriefing,
    undo,
    setUndo,
    video,
    setVideo,
    songGuesses,
    setSongGuesses,
    videoGuesses,
    setVideoGuesses,
    stay,
    setStay,
    woken,
    setWoken,
    sentRef,
    saidAloudRef,
    speak,
    speakAside,
    noteDone,
    endVoiceConfirm,
  }
}

export type PanelState = ReturnType<typeof usePanelState>

/** Whether the app is on screen (not in the background). */
export function useAppActive() {
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s !== 'background'))
    return () => sub.remove()
  }, [])
  return appActive
}
