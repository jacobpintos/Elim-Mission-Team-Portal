import { Platform } from 'react-native'
import {
  deckFromLyrics,
  deckFromSheet,
  sheetForSlides,
  type LyricDeck,
  type SlidesAsk,
} from '@/lib/lyricSlides'
import { lyricPptx, pptxName, PPTX_MIME } from '@/lib/pptx'
import { saveBytes } from '@/lib/saveBytes'
import { loadAliases } from '@/lib/songAliases'
import { splitSpokenKey } from '@/lib/songRequest'
import type { OnceOpen } from '@/lib/sheetAfterOpen'
import { useChordSheetsStore } from '@/stores/chordSheetsStore'
import { useMiriamStore } from '@/stores/miriamStore'
import { useUIStore } from '@/stores/uiStore'
import type { ChordSheet } from '@/types/chordSheet'
import { chordSheets } from './actions'
import type { PanelState } from './usePanelState'

/**
 * Lyric slides Miriam is asked for (lib/lyricSlides): "make slides for Way
 * Maker", from its chord sheet, or "make slides for this song" with the
 * lyrics pasted under it — shown to look over, with a PowerPoint file
 * (lib/pptx) a tap away, which Google Slides opens too. Made on the device
 * and never uploaded: the file is where they save it (lib/saveBytes).
 *
 * `offerSongs`: the nearest titles offered when the song named isn't plain
 * (./useMiriamMedia), the one picked made into slides. `askBack`: her
 * question back, answered by typing (./useMiriamConversation).
 */
export function useMiriamSlides(
  panel: PanelState,
  {
    offerSongs,
    askBack,
  }: {
    offerSongs: (
      asked: { name: string; key: null; sheets: ChordSheet[] },
      then: OnceOpen[],
      forSlides: boolean
    ) => void
    askBack: (typing: boolean) => void
  }
) {
  const { setStage, setAnswer, setSongGuesses, slides, setSlides, setLyricsWanted, speak } = panel

  /** Said, written out, and left up. */
  const say = (text: string) => {
    setAnswer(text)
    speak(text)
    setStage('answered')
  }

  /** The slides made: shown to look over, with the file a tap away. */
  const show = (deck: LyricDeck, none: string) => {
    useMiriamStore.getState().setAwaiting(false)
    const count = deck.slides.filter((s) => s.kind === 'lyrics').length
    if (count === 0) {
      say(none)
      return
    }
    const titled = deck.slides[0]?.kind === 'title'
    const what = `${count} ${count === 1 ? 'slide' : 'slides'}${titled ? ' and a title slide' : ''}`
    setSlides(deck)
    say(
      `Here are the slides${titled ? ` for ${deck.name}` : ''}: ${what}. ` +
        (Platform.OS === 'web' ? 'Download them' : 'Share them') +
        ' for PowerPoint or Google Slides.'
    )
  }

  /** A chord sheet's lyrics as slides: the chords, "_" and syllable breaks left out. */
  const slidesOfSheet = (sheet: ChordSheet) => {
    setSongGuesses([])
    show(
      deckFromSheet(sheet),
      `“${sheet.title}” has no lyrics on its chord sheet to put on slides.`
    )
  }

  /**
   * Lyric slides asked for: from lyrics given, or from the chord sheet named;
   * asked which song, when neither was. `fromReply`: what was typed after she
   * asked — a name that is no song is false, to be taken as a request instead.
   */
  const makeSlides = async (ask: SlidesAsk, fromReply = false): Promise<boolean> => {
    if (ask.kind === 'which') {
      // The lyrics are pasted, so the reply is typed, however this was asked.
      useMiriamStore.getState().setAwaiting(true)
      setLyricsWanted(true)
      say('Which song? Paste its lyrics here, or tell me its name, and I’ll make the slides.')
      askBack(true)
      return true
    }
    if (ask.kind === 'lyrics') {
      show(
        deckFromLyrics(ask.lyrics, ask.title),
        'I couldn’t find any lyrics in that to put on slides.'
      )
      return true
    }
    // By name: its chord sheet, from the worship team's (only theirs, admins' and guests' to read).
    if (!useChordSheetsStore.getState().chordSheets.length) setStage('thinking')
    const sheets = await chordSheets().catch(() => [] as ChordSheet[])
    const found = sheets.length ? sheetForSlides(sheets, await loadAliases(), ask.name) : null
    if (found?.kind === 'one') {
      slidesOfSheet(found.sheet)
      return true
    }
    if (found?.kind === 'guess') {
      offerSongs({ name: splitSpokenKey(ask.name).name, key: null, sheets: found.sheets }, [], true)
      return true
    }
    if (fromReply) return false
    say(
      sheets.length
        ? `I couldn’t find “${ask.name}” among the chord sheets. Paste its lyrics after “make slides for this song”, and I’ll make them from those.`
        : 'I make slides from the worship team’s chord sheets, and I can’t see them from here. Paste the lyrics after “make slides for this song”, and I’ll make them from those.'
    )
    return true
  }

  /** The slides as a PowerPoint file: downloaded, or the share sheet on a phone. */
  const saveSlides = async () => {
    if (!slides) return
    try {
      await saveBytes(
        pptxName(slides),
        lyricPptx(slides),
        PPTX_MIME,
        'org.openxmlformats.presentationml.presentation'
      )
    } catch {
      useUIStore.getState().toast('The slides couldn’t be saved just now — try again.', 'error')
    }
  }

  return { makeSlides, slidesOfSheet, saveSlides }
}
