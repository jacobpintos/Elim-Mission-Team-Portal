import { useRef } from 'react'
import { useRouter } from 'expo-router'
import { rememberPlay } from '@/lib/miriamMemory'
import { playCandidates, playKey, type PlayAsk } from '@/lib/miriamQuick'
import { screensFor } from '@/lib/miriamScreens'
import { anyOverlayOpen } from '@/lib/overlays'
import { onceOpen, type OnceOpen } from '@/lib/sheetAfterOpen'
import { rememberAlias } from '@/lib/songAliases'
import { chordSheetsPage, songHost, songHostSoon } from '@/lib/songHost'
import { useAuthStore } from '@/stores/authStore'
import type { MusicItem } from '@/stores/musicStore'
import type { ChordSheet } from '@/types/chordSheet'
import type { PanelState } from './usePanelState'

/**
 * Songs and videos Miriam is asked for: a chord sheet opened, a video from
 * Content played over the page, or — when none is plainly the one — the
 * likely ones offered, and the one picked learned as what was meant.
 */
export function useMiriamMedia(panel: PanelState) {
  const router = useRouter()
  const {
    setOpen,
    setStage,
    setAnswer,
    song,
    setSong,
    sheetQueue,
    setVideo,
    setSongGuesses,
    setVideoGuesses,
    setStay,
    speak,
    noteDone,
  } = panel

  // How the videos on offer were asked for: the one picked is remembered as meant by it.
  const guessedFor = useRef('')
  // A chord sheet asked for, when none was plain: the nearest titles are
  // offered — and the words and key it was asked with, the words learned
  // from the one picked (lib/songAliases).
  const songAsk = useRef<{
    name: string
    key: { key: string; minor: boolean } | null
    /** What to do once it is open: "…start autoscroll 5". */
    then: OnceOpen[]
  }>({
    name: '',
    key: null,
    then: [],
  })

  /**
   * A chord sheet, opened; the bar goes, to leave it in view — and what was
   * asked to be done with it ("…start autoscroll 5") done once it is open.
   */
  const openSong = async (
    sheet: ChordSheet,
    key: { key: string; minor: boolean } | null,
    then: readonly OnceOpen[] = []
  ) => {
    noteDone(`Opened the chord sheet “${sheet.title}”.`)
    setSongGuesses([])
    setVideoGuesses([])
    setStay(false)
    setOpen(false)
    onceOpen(sheet.id, then)
    // Where a song screen is up, there — an open sheet's own place — rather
    // than another sheet on top of it.
    const host = songHost()
    if (host && !song) {
      host(sheet, key)
      return
    }
    // Else on the Chord Sheets page, so closing it leaves them at the list to
    // find another — when they have it, and nothing is open over the page.
    const chords = screensFor(useAuthStore.getState().profile).some((x) => x.id === 'worship')
    if (chords && !song && !anyOverlayOpen()) {
      router.push(chordSheetsPage() as never)
      const there = await songHostSoon()
      if (there) {
        there(sheet, key)
        return
      }
    }
    sheetQueue.reset()
    setSong({ sheet, key })
  }
  /** A video from Content, played over the page; the bar goes, to leave it in view. */
  const playVideo = (item: MusicItem) => {
    noteDone(`Playing “${item.title}” from Content.`)
    setVideoGuesses([])
    setStay(false)
    setVideo(item)
    setOpen(false)
  }
  /** A video asked for that isn't plainly one: the likely ones to choose from, or Content to look through. */
  const offerVideos = (ask: PlayAsk, items: MusicItem[], fitting?: string) => {
    const likely = playCandidates(ask, items)
    if (likely.length) {
      guessedFor.current = playKey(ask)
      setVideoGuesses(likely)
      const text =
        fitting ??
        (likely.length === 1
          ? 'I couldn’t find that exactly. Did you mean this one?'
          : 'I couldn’t find that exactly. Did you mean one of these?')
      setAnswer(text)
      speak(text)
      setStage('answered')
      return
    }
    const content = screensFor(useAuthStore.getState().profile).find((x) => x.id === 'music')
    const text = content
      ? 'I couldn’t find that in Content — here’s everything to look through.'
      : 'I couldn’t find that video.'
    setAnswer(text)
    speak(text)
    setStage('answered')
    if (content && !anyOverlayOpen()) router.push(content.path as never)
  }
  /** One of the songs she offered: opened, and learned as what was meant. */
  const pickSong = (sheet: ChordSheet) => {
    if (songAsk.current.name) rememberAlias(songAsk.current.name, String(sheet.id))
    openSong(sheet, songAsk.current.key, songAsk.current.then)
  }
  /** One of the videos she offered: played, and played straight away when asked this way again. */
  const pickVideo = (item: MusicItem) => {
    if (guessedFor.current) {
      void rememberPlay(guessedFor.current, String(item.id))
    }
    playVideo(item)
  }
  /** A song asked for that isn't plainly one: the nearest titles, to choose from. */
  const offerSongs = (
    asked: { name: string; key: { key: string; minor: boolean } | null; sheets: ChordSheet[] },
    then: OnceOpen[]
  ) => {
    songAsk.current = { name: asked.name, key: asked.key, then }
    setSongGuesses(asked.sheets)
    const text = 'I couldn’t find that song. Did you mean one of these?'
    setAnswer(text)
    speak(text)
    setStage('answered')
  }

  return { openSong, playVideo, offerVideos, offerSongs, pickSong, pickVideo }
}
