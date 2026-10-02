import { useEffect, useRef, useState } from 'react'
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  useWindowDimensions,
  type GestureResponderEvent,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAutoScroll, type AutoScrollState } from '@/features/worship/useAutoScroll'
import { MAX_LEVEL, MIN_LEVEL } from '@/lib/autoScroll'
import { YStack, XStack, Text } from 'tamagui'
import { printAsync } from 'expo-print'
import { useThemeColors } from '@/theme/useThemeColors'
import { useConfigStore } from '@/stores/configStore'
import { NNS_KEYS, getWordSlots, keyLabel } from '@/lib/nashvilleNumbers'
import type { ChordSheet, ChordSheetSection } from '@/types/chordSheet'
import {
  PROGRESSION_END,
  formatToken,
  stripBoundary,
  splitByProgressionEnd,
  compressGroups,
  buildChordSheetHtml,
  getSectionLabel,
  getSectionShortLabel,
  getPrevMatchingLabel,
  getPrevMatchingSection,
} from './chordSheetFormat'
import { buildChordSheetPdfBlob } from './chordSheetPdf'
import { songProfile, suggestKey, type Chroma } from '@/lib/keyDetect'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { useCoverViewport } from '@/lib/useCoverViewport'
import { resetPageZoom } from '@/lib/resetPageZoom'
import { useAudioPlayersStore } from '@/stores/audioPlayersStore'
import { AudioControls } from '@/components/ui/AudioControls'

interface KeyPrefs {
  key: string
  isMinor: boolean
}

const getKeyPrefs = (): KeyPrefs => {
  try {
    if (typeof window === 'undefined') return { key: '', isMinor: false }
    const raw = window.localStorage?.getItem('chordsheet_key_prefs')
    if (!raw) return { key: '', isMinor: false }
    return JSON.parse(raw) as KeyPrefs
  } catch {
    return { key: '', isMinor: false }
  }
}

const saveKeyPrefs = (prefs: KeyPrefs) => {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem('chordsheet_key_prefs', JSON.stringify(prefs))
    }
  } catch {}
}

// Chord/lyric text is monospaced and hand-aligned by measuring characters, so
// the font size and the per-character width must scale together — changing one
// without the other breaks chord positioning.
const BASE_FONT = 13
const FONT_SCALES = [0.85, 1, 1.15, 1.3, 1.5] as const
const DEFAULT_SCALE_IDX = 1
const FONT_SCALE_KEY = 'chordsheet_font_scale_idx'

// The stored size is read asynchronously, which would make the first sheet
// opened each session flash at the default size before snapping to the saved
// one. Caching it in module scope means that read happens at most once — every
// later sheet opens at the right size immediately.
let cachedScaleIdx: number | null = null

/**
 * Whether the reader has folded the controls away, remembered the same way as
 * the text size. Sideways, the title, the key/size/export row and the section
 * chips took half the card and left a few lines of song — and the controls are
 * set once per song, while the sheet is read for all of it.
 */
const CONTROLS_HIDDEN_KEY = 'chordsheet_controls_hidden'
let cachedControlsHidden: boolean | null = null

function rememberControlsHidden(hidden: boolean) {
  cachedControlsHidden = hidden
  AsyncStorage.setItem(CONTROLS_HIDDEN_KEY, hidden ? '1' : '0').catch(() => {})
}

// Estimate column width in logical px from word length, at the current scale.
/**
 * Courier New sets every character 0.6em wide, so a run of text is its length
 * times that — measured, not guessed: the old allowance of nine points a
 * character at thirteen-point text (0.69em), plus eight points of padding and
 * a 36-point floor for every word, spread a line half as wide again as its
 * text and wrapped most lines of a verse in two on a phone.
 */
/** A swipe to the next song: this far sideways, this quickly. */
const SWIPE_MIN = 70
const SWIPE_MAX_MS = 800

/**
 * Where a finger is. On the web the event is the browser's own, which keeps
 * the position on each touch rather than on the event itself.
 */
function touchPoint(e: GestureResponderEvent): { x: number; y: number } {
  const n = e.nativeEvent
  const t = n.touches?.[0] ?? n.changedTouches?.[0]
  return { x: t?.pageX ?? n.pageX, y: t?.pageY ?? n.pageY }
}

/** Whether the page is pinched in: a sideways drag then moves around it. */
function isZoomedIn(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false
  return (window.visualViewport?.scale ?? 1) > 1.05
}

const CHAR_EM = 0.6

/**
 * The column a word and its chord share, which each is centred in: as wide as
 * the word (with its hyphen) or the chord, whichever is wider.
 */
function columnWidth(text: string, trailing: string, chord: string, charW: number): number {
  return Math.max(text.length + (trailing === '-' ? 1 : 0), chord.length) * charW
}

/**
 * The room one word of a lyric line takes: the word and the space or hyphen
 * after it, or its chord and a space, whichever is wider — never less than
 * its column. A chord longer than its word pushes the rest of the line along,
 * and nothing else does: a syllable's hyphen stays against the next syllable.
 */
function slotWidth(text: string, trailing: string, chord: string, charW: number): number {
  const word = (text.length + (trailing ? 1 : 0)) * charW
  return chord ? Math.max(word, (chord.length + 1) * charW) : word
}

/**
 * A lyric line's words in rows that fit the sheet — broken between words,
 * as the browser would, but here so that each row knows whether it has a
 * chord over it. Left to the browser, the word that wrapped kept an empty
 * chord row above it, a blank line in the middle of the verse. A word wider
 * than the sheet has a row of its own.
 */
export function wrapSlots(widths: number[], max: number): number[][] {
  if (!(max > 0)) return [widths.map((_, i) => i)]
  const rows: number[][] = []
  let row: number[] = []
  let used = 0
  widths.forEach((w, i) => {
    if (row.length > 0 && used + w > max + 0.5) {
      rows.push(row)
      row = []
      used = 0
    }
    row.push(i)
    used += w
  })
  if (row.length > 0) rows.push(row)
  return rows
}

interface SectionGroup {
  section: ChordSheetSection
  count: number
  sig: string
}

interface ChordSheetViewerProps {
  sheet: ChordSheet | null
  onClose: () => void
  initialKey?: string
  /**
   * A section to open at rather than the top — the one a song recognised by
   * listening was being sung from (SongListener).
   */
  startAtSectionId?: string | null
  /** And the line within it to bring into view, counting from 0. */
  startAtLine?: number | null
  /**
   * Once there, start autoscroll — if the song has a speed of its own saved
   * from scrolling it before. For a song found by listening: the band is
   * already playing it.
   */
  autoScrollAtStart?: boolean
  /**
   * The notes the microphone heard while finding this song (SongListener):
   * compared with the sheet's chords to suggest the key it is being played
   * in, if that is clear and not the key already showing.
   */
  heardChroma?: Chroma | null
  /**
   * A key asked for out loud with the song ("Firm Foundation, key of E"):
   * the sheet is shown in it, and it becomes the key the next song opens in,
   * as choosing it here would. A song asked for without a key keeps the last.
   */
  openInKey?: { key: string; minor: boolean } | null
  /**
   * Opened from a set list: the songs either side, reached by swiping the
   * sheet sideways or with ‹ › in the header, and where this one is in the
   * set ("2 / 5"). Left out, the sheet stands alone.
   */
  setNav?: {
    position: string
    onPrev?: () => void
    onNext?: () => void
    /**
     * Arrived at from the song before or after: shown at once rather than
     * faded in, so the set list behind never shows through between songs.
     */
    stepped?: boolean
  }
  /**
   * The reference track of the song this sheet was opened from, if it has one.
   * Its controls sit under the sheet and drive the same player as the song's
   * card on the set list — see TrackBar.
   */
  audio?: { url: string; name?: string } | null
}

export function ChordSheetViewer({
  sheet,
  onClose,
  initialKey,
  audio,
  startAtSectionId,
  startAtLine,
  autoScrollAtStart,
  heardChroma,
  openInKey,
  setNav,
}: ChordSheetViewerProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()

  /**
   * How tall the card may be, in points rather than as a percentage.
   *
   * It was maxHeight="94%", which is 94% of whatever the browser believes the
   * fixed-position overlay to be — and on a phone turned sideways that belief
   * can be wrong or stale. When the cap fails to apply, the card grows to fit
   * the whole sheet, and a card centred in a viewport shorter than itself
   * overflows at BOTH ends: the header and the toolbar end up above the top of
   * the screen, out of reach, while the sheet fills what you can see. Every
   * button in that row stops answering and nothing looks obviously broken.
   *
   * Measuring the window directly cannot go stale — useWindowDimensions
   * re-renders on rotation, which a percentage never did.
   */
  const availableHeight = windowHeight - insets.top - insets.bottom

  /**
   * On a short screen — a phone on its side — the sheet is the whole window.
   *
   * As a card it kept a 640pt width cap, a margin above and below and 16pt of
   * padding, and on an iPhone held sideways that was 94pt of dimmed gutter
   * and the better part of 50pt of height spent on framing around a song
   * that already had too little room. Nothing behind the sheet needs to show
   * while it is open, so there it fills the page edge to edge.
   *
   * Decided by height rather than orientation: an iPad on its side has room
   * to spare, and there the card and its width cap — which keeps lines
   * readable on a wide screen — stay as they were.
   */
  const fullBleed = availableHeight < 500

  /**
   * And on the web, the whole screen — not just the page.
   *
   * A home-screen web app on an iPhone held sideways is drawn inside a box
   * that stops 59pt short of the top and both sides, so "edge to edge" was
   * still a sheet framed by dark bands. While the sheet is open the page asks
   * for the whole screen (useCoverViewport) and the sheet pads itself clear of
   * the notch and the home bar by env(safe-area-inset-*), which the browser
   * keeps current through a rotation. The insets from safe-area-context are
   * left out here: they would count the same notch twice.
   */
  const coverScreen = fullBleed && Platform.OS === 'web'
  // Off with no sheet: the viewer stays mounted between sheets, rendering
  // nothing, and the page must not keep the whole screen while it does.
  useCoverViewport(coverScreen && !!sheet)

  // The phone's own zoom back to 100% when a sheet opens and when it turns:
  // a sheet pinched into on one song, or left zoomed by a rotation, otherwise
  // opens the next one half off the screen. After useCoverViewport, so that
  // takes its copy of the viewport tag before the zoom cap goes in. Again a
  // moment later for a rotation, which the phone is still finishing when
  // the new size is first reported.
  const sheetKey = sheet ? String(sheet.id) : null
  const landscape = windowWidth > windowHeight
  useEffect(() => {
    if (!sheetKey) return
    resetPageZoom()
    const again = setTimeout(resetPageZoom, 400)
    return () => clearTimeout(again)
  }, [sheetKey, landscape])

  const cardMaxHeight = coverScreen
    ? windowHeight
    : fullBleed
      ? availableHeight
      : Math.max(240, Math.round(availableHeight * 0.94))

  // CCLI requires the license number on every sheet we reproduce, so this
  // screen loads it itself. It used to only read the value and rely on some
  // other screen having subscribed, which meant the number was missing until
  // someone happened to open the admin licensing tab — reproducing songs
  // without the credit CCLI licenses us to print.
  const ccliLicense = useConfigStore((s) => s.ccliLicense)
  const subConfig = useConfigStore((s) => s.subscribe)
  const unsubConfig = useConfigStore((s) => s.unsubscribe)
  useEffect(() => {
    subConfig()
    return () => unsubConfig()
  }, [subConfig, unsubConfig])

  // Text size is a per-reader preference (stage lighting, eyesight, phone vs
  // tablet), so it's adjustable and persisted rather than a fixed size.
  // AsyncStorage (not localStorage like the key prefs above) so it works on
  // native too.
  const [scaleIdx, setScaleIdx] = useState(cachedScaleIdx ?? DEFAULT_SCALE_IDX)
  useEffect(() => {
    if (cachedScaleIdx !== null) return // already loaded earlier this session
    let cancelled = false
    AsyncStorage.getItem(FONT_SCALE_KEY)
      .then((raw) => {
        if (raw == null) return
        const idx = Number(raw)
        if (!Number.isInteger(idx) || idx < 0 || idx >= FONT_SCALES.length) return
        cachedScaleIdx = idx
        if (!cancelled) setScaleIdx(idx)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // The sheet's width, for breaking lyric lines into rows (wrapSlots).
  const [sheetWidth, setSheetWidth] = useState(0)
  const [controlsHidden, setControlsHidden] = useState(cachedControlsHidden ?? false)
  useEffect(() => {
    if (cachedControlsHidden !== null) return
    let cancelled = false
    AsyncStorage.getItem(CONTROLS_HIDDEN_KEY)
      .then((raw) => {
        cachedControlsHidden = raw === '1'
        if (!cancelled) setControlsHidden(cachedControlsHidden)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const toggleControls = () => {
    const next = !controlsHidden
    rememberControlsHidden(next)
    setControlsHidden(next)
    // A key list left open would be stranded under a row that is not there.
    if (next) setShowKeyDropdown(false)
  }

  const fontScale = FONT_SCALES[scaleIdx]
  const monoSize = Math.round(BASE_FONT * fontScale)

  const changeScale = (delta: number) => {
    const next = Math.min(FONT_SCALES.length - 1, Math.max(0, scaleIdx + delta))
    if (next === scaleIdx) return
    cachedScaleIdx = next
    setScaleIdx(next)
    AsyncStorage.setItem(FONT_SCALE_KEY, String(next)).catch(() => {})
  }

  /**
   * Jump straight to a section.
   *
   * A sheet with four verses and a bridge is several screens long, and the
   * thing a musician needs mid-rehearsal — "from the bridge" — was a scroll
   * and a hunt. Each section reports where it starts as it lays out, so the
   * bar above only has to scroll there.
   *
   * Offsets are a ref rather than state: they are written during layout, and
   * re-rendering the whole sheet every time one arrives would lay it out
   * again, which writes them again.
   */
  const scrollRef = useRef<ScrollView>(null)
  const sectionOffsets = useRef<Record<string, number>>({})
  // Each lyric line's top within its section, keyed "section:line" — for
  // opening at the line a song found by listening had got to.
  const lineOffsets = useRef<Record<string, number>>({})

  /**
   * Autoscroll — hands-free, at a speed kept per song, paused with a tap on
   * the sheet. The control floats over the sheet's corner (AutoScrollControl)
   * so it is there with the controls folded away too.
   */
  const autoScroll = useAutoScroll(scrollRef, sheet ? String(sheet.id) : null, fontScale)

  /**
   * Where a section starts, asked for now rather than remembered.
   *
   * The remembered answer goes stale on the web and does so invisibly.
   * Tamagui measures layout through observers that only watch elements in
   * view, so a section scrolled off screen never reports its new position —
   * and every reflow moves them: a press of Size, a change of key, Chords
   * Only. Driven in Chromium, tapping Bridge after one press of Size landed
   * on Interlude. In landscape almost every section is off screen, which is
   * why it was worst there.
   *
   * The DOM can simply be asked, so on the web it is — which is what the `id`
   * on each section is for. Native keeps the remembered offsets, where
   * onLayout fires for every pass whether the view is on screen or not.
   *
   * Measured in Chromium at 844×390 over seven ways of reaching the bar: the
   * remembered offsets put the bridge 438 points below the top after three
   * presses of Size, and 156 above it — off screen entirely — after three the
   * other way. All seven land on it now.
   */
  const measuredOffset = (sectionId: string): number | null => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const el = document.getElementById(sectionDomId(sectionId))
      const content = document.getElementById(SHEET_CONTENT_ID)
      if (el && content) {
        return el.getBoundingClientRect().top - content.getBoundingClientRect().top
      }
    }
    return sectionOffsets.current[sectionId] ?? null
  }

  const jumpTo = (sectionId: string, line: number | null = null) => {
    const y = measuredOffset(sectionId)
    if (y == null) return
    // A line: the one before it at the top, so where it comes from is in
    // view too; the first line, the section's heading. Otherwise a few points
    // above the heading, so it does not sit flush against the toolbar and
    // read as cut off.
    const within = line && line > 0 ? lineOffsets.current[`${sectionId}:${line - 1}`] : undefined
    autoScroll.scrollTo(Math.max(0, y + (within ?? 0) - 6))
  }

  // Opened at a section, or a line in one: once the sheet has been laid
  // out, there — and scrolling on from there, if asked and the song has a
  // speed saved. Started first, so the jump is made at once rather than as a
  // glide the first frame would cut short (autoScroll.scrollTo).
  useEffect(() => {
    if (!sheetKey || !startAtSectionId) return
    let cancelled = false
    const timer = setTimeout(async () => {
      if (autoScrollAtStart) await autoScroll.startIfSaved()
      if (!cancelled) jumpTo(startAtSectionId, startAtLine ?? null)
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetKey, startAtSectionId, startAtLine])

  const [selectedKey, setSelectedKey] = useState(() => {
    if (initialKey && (NNS_KEYS as readonly string[]).includes(initialKey)) return initialKey
    return getKeyPrefs().key
  })
  const [isMinor, setIsMinor] = useState(() => {
    if (initialKey && (NNS_KEYS as readonly string[]).includes(initialKey)) return false
    return getKeyPrefs().isMinor
  })
  const [chordsOnly, setChordsOnly] = useState(false)
  const [showKeyDropdown, setShowKeyDropdown] = useState(false)
  // A key asked for: taken up when it arrives. Set while rendering, as React
  // has it for state that follows a prop.
  const [keyAsked, setKeyAsked] = useState<typeof openInKey>(null)
  if (openInKey !== keyAsked) {
    setKeyAsked(openInKey)
    if (openInKey) {
      setSelectedKey(openInKey.key)
      setIsMinor(openInKey.minor)
    }
  }
  useEffect(() => {
    if (keyAsked) saveKeyPrefs({ key: keyAsked.key, isMinor: keyAsked.minor })
  }, [keyAsked])
  // The heard sound whose key suggestion was waved away or taken.
  const [keyHintDoneFor, setKeyHintDoneFor] = useState<Chroma | null>(null)

  /**
   * A sideways swipe across the sheet: the next song in the set, or the one
   * before. Only a clear one — one finger, mostly sideways, far enough and
   * quick enough — so a scroll that drifts, a pinch, or a tap that pauses
   * autoscroll is never taken for one. Not while the page is zoomed in,
   * when a sideways drag is the way around it.
   */
  const swipe = useRef<{ x: number; y: number; t: number; endX: number; endY: number } | null>(null)
  const swipeProps = setNav
    ? {
        onTouchStart: (e: GestureResponderEvent) => {
          const n = e.nativeEvent
          const { x, y } = touchPoint(e)
          swipe.current =
            (n.touches?.length ?? 1) === 1 ? { x, y, t: Date.now(), endX: x, endY: y } : null
        },
        onTouchMove: (e: GestureResponderEvent) => {
          if (!swipe.current) return
          if ((e.nativeEvent.touches?.length ?? 1) > 1) {
            swipe.current = null
            return
          }
          const { x, y } = touchPoint(e)
          swipe.current.endX = x
          swipe.current.endY = y
        },
        onTouchEnd: () => {
          const s = swipe.current
          swipe.current = null
          if (!s || isZoomedIn()) return
          const dx = s.endX - s.x
          const dy = s.endY - s.y
          if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < 2 * Math.abs(dy)) return
          if (Date.now() - s.t > SWIPE_MAX_MS) return
          if (dx < 0) setNav.onNext?.()
          else setNav.onPrev?.()
        },
        onTouchCancel: () => {
          swipe.current = null
        },
      }
    : null

  // And the arrow keys, on a keyboard or a page-turner pedal that sends them.
  // A browser that goes back a page on a sideways swipe (Chrome) is told not
  // to while the swipe means the next song.
  const inSet = Boolean(setNav)
  const navRef = useRef(setNav)
  useEffect(() => {
    navRef.current = setNav
  })
  useEffect(() => {
    if (Platform.OS !== 'web' || !sheetKey || !inSet) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (e.key === 'ArrowRight') navRef.current?.onNext?.()
      else if (e.key === 'ArrowLeft') navRef.current?.onPrev?.()
    }
    window.addEventListener('keydown', onKey)
    const root = document.documentElement.style
    const before = root.overscrollBehaviorX
    root.overscrollBehaviorX = 'none'
    return () => {
      window.removeEventListener('keydown', onKey)
      root.overscrollBehaviorX = before
    }
  }, [sheetKey, inSet])

  if (!sheet) return null

  const heardKey =
    heardChroma && heardChroma !== keyHintDoneFor
      ? suggestKey(
          heardChroma,
          songProfile(
            sheet.sections.flatMap((s) => (s.chordTokens ?? []).flat()),
            isMinor
          )
        )
      : null
  const heardKeyName = heardKey ? NNS_KEYS[heardKey.keyIdx] : null
  const showKeyHint = heardKeyName !== null && heardKeyName !== selectedKey

  const keyOptions: string[] = ['', ...NNS_KEYS]
  const keyIdx =
    selectedKey === '' ? -1 : NNS_KEYS.indexOf(selectedKey as (typeof NNS_KEYS)[number])

  const handleSelectKey = (key: string) => {
    setSelectedKey(key)
    saveKeyPrefs({ key, isMinor })
    setShowKeyDropdown(false)
  }

  const handleToggleMinor = () => {
    const newIsMinor = !isMinor
    setIsMinor(newIsMinor)
    saveKeyPrefs({ key: selectedKey, isMinor: newIsMinor })
  }

  const displayToken = (raw: string) => formatToken(raw, keyIdx, isMinor)

  const handleExportPdf = async () => {
    // expo-print has no way to produce an actual file on web — its web shim just
    // calls window.print() on the current page regardless of the `html` option,
    // which opens the OS print/printer chooser rather than creating a PDF. So on
    // web we build a real PDF client-side and hand it to the user directly: via
    // the share sheet where available (so it can be saved to Files, AirDropped,
    // etc.), or as a plain download otherwise.
    if (Platform.OS === 'web') {
      const blob = buildChordSheetPdfBlob(
        sheet,
        selectedKey,
        isMinor,
        keyIdx,
        colors.primary,
        ccliLicense
      )
      const filename = `${sheet.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'chord-sheet'}.pdf`
      const file = new File([blob], filename, { type: 'application/pdf' })

      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean
        share?: (data: { files: File[]; title?: string }) => Promise<void>
      }
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        try {
          await nav.share({ files: [file], title: sheet.title })
          return
        } catch {
          // user cancelled or share failed — fall through to direct download
        }
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return
    }

    const html = buildChordSheetHtml(
      sheet,
      selectedKey,
      isMinor,
      keyIdx,
      colors.primary,
      ccliLicense
    )
    await printAsync({ html })
  }

  // In Chords Only mode, group consecutive sections with the same type + chord progression.
  // sameAsPrevious sections increment the current group's repeat count.
  const sectionGroups: SectionGroup[] = []
  if (chordsOnly) {
    for (const section of sheet.sections) {
      if (section.sameAsPrevious) {
        if (sectionGroups.length > 0) sectionGroups[sectionGroups.length - 1].count++
        continue
      }
      const sig = (section.chordTokens ?? [])
        .flat()
        .filter((t) => Boolean(t) && t !== PROGRESSION_END)
        .map(stripBoundary)
        .join('\x00')
      const last = sectionGroups[sectionGroups.length - 1]
      if (last && last.section.type === section.type && sig && sig === last.sig) {
        last.count++
      } else {
        sectionGroups.push({ section, count: 1, sig })
      }
    }
  }

  // Whichever set of sections is on screen: Chords Only collapses repeats into
  // one entry, so its bar has to match what is actually there to scroll to.
  const jumpTargets = (chordsOnly ? sectionGroups.map((g) => g.section) : sheet.sections).map(
    (section) => ({ id: section.id, label: getSectionShortLabel(sheet.sections, section.id) })
  )

  /**
   * Jump bar — one tap to a section.
   *
   * Pinned outside the scroll view so it never scrolls away, and one line tall
   * with short labels so it costs almost nothing and never covers the sheet.
   * It scrolls sideways rather than wrapping: a song with eight sections must
   * not take two lines off a phone held sideways. Hidden for a sheet with
   * nothing to jump between.
   *
   * Drawn on its own line, or — with the controls folded away and the phone on
   * its side — on the title's line, which has the width to spare and was
   * otherwise a row of mostly nothing above a row of chips.
   */
  const chipsInHeader = controlsHidden && windowWidth > windowHeight
  const jumpBar =
    jumpTargets.length > 1 ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={chipsInHeader ? styles.jumpInline : styles.jumpRow}
      >
        <XStack gap="$1" paddingVertical={2}>
          {jumpTargets.map(({ id, label }) => (
            <Pressable key={id} onPress={() => jumpTo(id)} style={styles.touchSmall}>
              <XStack
                backgroundColor={colors.primary + '18'}
                borderRadius={99}
                borderWidth={1}
                borderColor={colors.primary}
                paddingHorizontal="$2"
                minWidth={30}
                alignItems="center"
                justifyContent="center"
                flexGrow={1}
              >
                <Text color={colors.primary} fontSize={12} fontWeight="700">
                  {label}
                </Text>
              </XStack>
            </Pressable>
          ))}
        </XStack>
      </ScrollView>
    ) : null

  return (
    <FullScreenOverlay
      visible
      animationType={setNav?.stepped ? 'none' : 'fade'}
      transparent
      onRequestClose={onClose}
    >
      {/* Inset the area the card is centred in, rather than the card itself.
          Centring alone does not clear the status bar here: at 94% of the
          screen height the margin above the card is around twenty-six points
          on a tall phone, less than the inset, so a sheet long enough to
          reach that cap put its title under the clock. A margin on the card
          would not fix it either — card plus margin is then taller than the
          screen, and centring takes most of the margin straight back. Padding
          the overlay shrinks what the percentage is measured against, so the
          card stays centred inside the safe area. */}
      {/* Sized from the measured window rather than left to fill the fixed box
          react-native-web gives the modal. Two reasons. The fixed box is the
          layout viewport, which on a phone is not always what you can see —
          useWindowDimensions reads the visual viewport, which is. And an
          element whose width and height are written out in points has to be
          laid out again every time those numbers change, so a rotation
          rebuilds this overlay's geometry instead of leaving Safari to decide
          whether the old one still holds. */}
      <View
        {...autoScroll.viewerTouchProps}
        style={[
          styles.overlay,
          {
            width: windowWidth,
            height: windowHeight,
            paddingTop: coverScreen ? 0 : insets.top,
            paddingBottom: coverScreen ? 0 : insets.bottom,
          },
        ]}
      >
        <YStack
          backgroundColor={colors.surface}
          borderRadius={fullBleed ? 0 : '$4'}
          paddingHorizontal={coverScreen ? undefined : fullBleed ? '$3' : '$4'}
          paddingVertical={coverScreen ? undefined : fullBleed ? '$2' : '$4'}
          style={coverScreen ? CLEAR_OF_THE_NOTCH : undefined}
          gap="$2"
          width={fullBleed ? '100%' : '96%'}
          maxWidth={fullBleed ? undefined : 640}
          height={fullBleed ? cardMaxHeight : undefined}
          maxHeight={cardMaxHeight}
        >
          {/* Header — one line when the controls are folded away. */}
          <XStack
            justifyContent="space-between"
            alignItems={controlsHidden ? 'center' : 'flex-start'}
          >
            {controlsHidden ? (
              <>
                <Text
                  color={colors.text}
                  fontSize="$5"
                  fontWeight="700"
                  numberOfLines={1}
                  // Beside the chips it gives way to them; alone it has the row.
                  {...(chipsInHeader ? { flexShrink: 1, maxWidth: '40%' } : { flex: 1 })}
                >
                  {sheet.title}
                  {sheet.artist ? (
                    <Text color={colors.textMuted} fontSize="$3" fontWeight="400">
                      {`  ·  ${sheet.artist}`}
                    </Text>
                  ) : null}
                </Text>
                {chipsInHeader ? jumpBar : null}
              </>
            ) : (
              <YStack flex={1} gap="$0.5">
                <Text color={colors.text} fontSize="$5" fontWeight="700" numberOfLines={2}>
                  {sheet.title}
                </Text>
                {sheet.artist ? (
                  <Text color={colors.textMuted} fontSize="$3">
                    {sheet.artist}
                  </Text>
                ) : null}
                {sheet.bpm != null ? (
                  <Text color={colors.textMuted} fontSize="$2">
                    ♩ = {sheet.bpm} BPM
                  </Text>
                ) : null}
              </YStack>
            )}
            {setNav ? (
              <XStack alignItems="center">
                <Pressable
                  onPress={setNav.onPrev}
                  disabled={!setNav.onPrev}
                  style={styles.headerBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Previous song"
                >
                  <Text
                    color={setNav.onPrev ? colors.primary : colors.border}
                    fontSize="$6"
                    fontWeight="700"
                  >
                    ‹
                  </Text>
                </Pressable>
                <Text color={colors.textMuted} fontSize="$2">
                  {setNav.position}
                </Text>
                <Pressable
                  onPress={setNav.onNext}
                  disabled={!setNav.onNext}
                  style={styles.headerBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Next song"
                >
                  <Text
                    color={setNav.onNext ? colors.primary : colors.border}
                    fontSize="$6"
                    fontWeight="700"
                  >
                    ›
                  </Text>
                </Pressable>
              </XStack>
            ) : null}
            <Pressable
              onPress={toggleControls}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel={controlsHidden ? 'Show controls' : 'Hide controls'}
            >
              <Text color={colors.textMuted} fontSize="$3">
                {controlsHidden ? '▼' : '▲'}
              </Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text color={colors.textMuted} fontSize="$4">
                ✕
              </Text>
            </Pressable>
          </XStack>

          {/* Controls */}
          {controlsHidden ? null : (
            <XStack gap="$2" alignItems="flex-start" flexWrap="wrap">
              {/* Key selector */}
              <YStack>
                <Pressable onPress={() => setShowKeyDropdown((v) => !v)} style={styles.touch}>
                  <XStack
                    backgroundColor={colors.primary + '18'}
                    borderRadius={99}
                    borderWidth={1}
                    borderColor={colors.primary}
                    paddingHorizontal="$3"
                    alignItems="center"
                    flexGrow={1}
                    gap="$1"
                  >
                    <Text color={colors.primary} fontSize="$2" fontWeight="600">
                      {selectedKey === '' ? 'Nashville #s' : `Key: ${keyLabel(selectedKey)}`}
                    </Text>
                    <Text color={colors.primary} fontSize="$1">
                      {showKeyDropdown ? '▲' : '▼'}
                    </Text>
                  </XStack>
                </Pressable>
                {showKeyDropdown ? (
                  <YStack
                    backgroundColor={colors.surface}
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor={colors.border}
                    marginTop="$1"
                    overflow="hidden"
                  >
                    {keyOptions.map((k) => (
                      <Pressable key={k === '' ? '__none__' : k} onPress={() => handleSelectKey(k)}>
                        <XStack
                          paddingHorizontal="$3"
                          paddingVertical="$2"
                          backgroundColor={
                            selectedKey === k ? colors.primary + '22' : 'transparent'
                          }
                        >
                          <Text
                            color={selectedKey === k ? colors.primary : colors.text}
                            fontSize="$2"
                            fontWeight={selectedKey === k ? '700' : '400'}
                          >
                            {k === '' ? 'Nashville #s' : keyLabel(k)}
                          </Text>
                        </XStack>
                      </Pressable>
                    ))}
                  </YStack>
                ) : null}
              </YStack>

              {/* Major/Minor toggle — only when a key is selected */}
              {selectedKey !== '' ? (
                <Pressable onPress={handleToggleMinor} style={styles.touch}>
                  <XStack
                    backgroundColor={isMinor ? colors.primary : colors.primary + '18'}
                    borderRadius={99}
                    borderWidth={1}
                    borderColor={colors.primary}
                    paddingHorizontal="$3"
                    alignItems="center"
                    flexGrow={1}
                  >
                    <Text color={isMinor ? 'white' : colors.primary} fontSize="$2" fontWeight="600">
                      {isMinor ? 'Minor' : 'Major'}
                    </Text>
                  </XStack>
                </Pressable>
              ) : null}

              {/* Chords Only toggle */}
              <Pressable onPress={() => setChordsOnly((v) => !v)} style={styles.touch}>
                <XStack
                  backgroundColor={chordsOnly ? colors.primary : colors.primary + '18'}
                  borderRadius={99}
                  borderWidth={1}
                  borderColor={colors.primary}
                  paddingHorizontal="$3"
                  alignItems="center"
                  flexGrow={1}
                >
                  <Text
                    color={chordsOnly ? 'white' : colors.primary}
                    fontSize="$2"
                    fontWeight="600"
                  >
                    Chords Only
                  </Text>
                </XStack>
              </Pressable>

              {/* Text size — persists across sessions so a reader sets it once.
                Labelled "Size" rather than A−/A+ because A–G read as key names
                in a chord sheet. */}
              <XStack
                borderRadius={99}
                borderWidth={1}
                borderColor={colors.primary}
                backgroundColor={colors.primary + '18'}
                alignItems="stretch"
                minHeight={44}
                overflow="hidden"
              >
                <Pressable
                  onPress={() => changeScale(-1)}
                  disabled={scaleIdx === 0}
                  style={[
                    styles.touch,
                    { paddingHorizontal: 12, opacity: scaleIdx === 0 ? 0.4 : 1 },
                  ]}
                >
                  <Text color={colors.primary} fontSize={16} fontWeight="700">
                    −
                  </Text>
                </Pressable>
                <Text
                  color={colors.primary}
                  fontSize="$2"
                  fontWeight="600"
                  paddingHorizontal="$1"
                  alignSelf="center"
                >
                  Size
                </Text>
                <Pressable
                  onPress={() => changeScale(1)}
                  disabled={scaleIdx === FONT_SCALES.length - 1}
                  style={[
                    styles.touch,
                    {
                      paddingHorizontal: 12,
                      opacity: scaleIdx === FONT_SCALES.length - 1 ? 0.4 : 1,
                    },
                  ]}
                >
                  <Text color={colors.primary} fontSize={16} fontWeight="700">
                    +
                  </Text>
                </Pressable>
              </XStack>

              {/* Export PDF — available on all platforms via expo-print */}
              <Pressable onPress={handleExportPdf} style={styles.touch}>
                <XStack
                  backgroundColor={colors.primary + '18'}
                  borderRadius={99}
                  borderWidth={1}
                  borderColor={colors.primary}
                  paddingHorizontal="$3"
                  alignItems="center"
                  flexGrow={1}
                  gap="$1"
                >
                  <Text color={colors.primary} fontSize="$2" fontWeight="600">
                    Export PDF
                  </Text>
                </XStack>
              </Pressable>
            </XStack>
          )}

          {/* The key the song sounds like, from listening — offered, not applied. */}
          {showKeyHint ? (
            <XStack
              alignItems="center"
              gap="$2"
              backgroundColor={colors.primary + '18'}
              borderRadius="$3"
              paddingLeft="$3"
            >
              <Text color={colors.text} fontSize="$3" flex={1}>
                🎤 Sounds like {keyLabel(heardKeyName, isMinor)}
              </Text>
              <Pressable
                onPress={() => {
                  setKeyHintDoneFor(heardChroma ?? null)
                  handleSelectKey(heardKeyName)
                }}
                accessibilityRole="button"
                style={styles.touch}
              >
                <XStack
                  backgroundColor={colors.primary}
                  borderRadius={99}
                  paddingHorizontal="$3"
                  alignItems="center"
                  flexGrow={1}
                >
                  <Text color="white" fontSize="$2" fontWeight="700">
                    Switch to {keyLabel(heardKeyName)}
                  </Text>
                </XStack>
              </Pressable>
              <Pressable
                onPress={() => setKeyHintDoneFor(heardChroma ?? null)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss key suggestion"
                style={[styles.touch, styles.hintClose]}
              >
                <Text color={colors.textMuted} fontSize="$3">
                  ✕
                </Text>
              </Pressable>
            </XStack>
          ) : null}

          {chipsInHeader ? null : jumpBar}

          {/* Content, with the autoscroll control over its corner. */}
          <View style={styles.sheetArea} {...swipeProps}>
            <ScrollView
              ref={scrollRef}
              style={{ flexShrink: 1 }}
              showsVerticalScrollIndicator={false}
              {...autoScroll.scrollProps}
              onLayout={(e) => {
                autoScroll.scrollProps.onLayout(e)
                setSheetWidth(e.nativeEvent.layout.width)
              }}
            >
              <YStack gap="$3" paddingBottom="$4" id={SHEET_CONTENT_ID}>
                {chordsOnly
                  ? sectionGroups.map(({ section, count }) => {
                      const fullLabel = getSectionLabel(sheet.sections, section.id)
                      const rangeMatch = count > 1 ? fullLabel.match(/^(.+?)\s+(\d+)$/) : null
                      const label = rangeMatch
                        ? `${rangeMatch[1]} ${parseInt(rangeMatch[2], 10)}-${parseInt(rangeMatch[2], 10) + count - 1}`
                        : fullLabel
                      const allTokens = (section.chordTokens ?? []).flat()
                      const progGroups = splitByProgressionEnd(allTokens)
                      const compressed = compressGroups(progGroups)
                      return (
                        <YStack
                          key={section.id}
                          id={sectionDomId(section.id)}
                          gap="$0.5"
                          onLayout={(e) => {
                            sectionOffsets.current[section.id] = e.nativeEvent.layout.y
                          }}
                        >
                          <XStack gap="$2" alignItems="center">
                            <Text color={colors.primary} fontWeight="700" fontSize="$3">
                              {label}
                            </Text>
                          </XStack>
                          {compressed.map(({ chords, count: pc }, gi) => (
                            <YStack key={gi}>
                              {gi > 0 && compressed.length > 1 ? (
                                <View
                                  style={{
                                    height: 1,
                                    backgroundColor: colors.border,
                                    marginVertical: 4,
                                  }}
                                />
                              ) : null}
                              <XStack gap="$2" alignItems="center">
                                <Text
                                  style={[styles.mono, { fontSize: monoSize }]}
                                  color={colors.text}
                                >
                                  {chords.map(displayToken).join('  ')}
                                </Text>
                                {pc > 1 ? (
                                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                                    ×{pc}
                                  </Text>
                                ) : null}
                              </XStack>
                            </YStack>
                          ))}
                        </YStack>
                      )
                    })
                  : sheet.sections.map((section) => {
                      const label = getSectionLabel(sheet.sections, section.id)

                      // A "same as previous" section renders the FULL content it
                      // repeats (lyrics + aligned chords), not just a label and a
                      // chord list — a repeated chorus should be singable in place
                      // without scrolling back to find the words. The italic
                      // "(same as X)" note is kept so the relationship stays clear.
                      const repeatSource = section.sameAsPrevious
                        ? getPrevMatchingSection(sheet.sections, section.id)
                        : null
                      const content = repeatSource ?? section
                      const repeatNote = section.sameAsPrevious
                        ? getPrevMatchingLabel(sheet.sections, section.id)
                        : null
                      const hasLyrics = content.lyrics.trim().length > 0

                      // Full mode — instrumental
                      if (!hasLyrics) {
                        const tokens = (content.chordTokens ?? []).flat().filter(Boolean)
                        return (
                          <YStack
                            key={section.id}
                            id={sectionDomId(section.id)}
                            gap="$1"
                            onLayout={(e) => {
                              sectionOffsets.current[section.id] = e.nativeEvent.layout.y
                            }}
                          >
                            <Text color={colors.primary} fontWeight="700" fontSize="$3">
                              {label}
                            </Text>
                            {repeatNote ? (
                              <Text color={colors.textMuted} fontSize="$2" fontStyle="italic">
                                (same as {repeatNote})
                              </Text>
                            ) : null}
                            {tokens.length > 0 ? (
                              <XStack flexWrap="wrap" gap="$2" alignItems="center">
                                {tokens.map((t, i) =>
                                  t === PROGRESSION_END ? (
                                    <Text
                                      key={i}
                                      style={[styles.mono, { fontSize: monoSize }]}
                                      color={colors.border}
                                    >
                                      {'|'}
                                    </Text>
                                  ) : (
                                    <Text
                                      key={i}
                                      style={[
                                        styles.mono,
                                        styles.chordText,
                                        { fontSize: monoSize },
                                      ]}
                                      color={colors.primary}
                                    >
                                      {displayToken(t)}
                                    </Text>
                                  )
                                )}
                              </XStack>
                            ) : null}
                          </YStack>
                        )
                      }

                      // Full mode — lyrics section with per-word chord alignment
                      const lyricsLines = content.lyrics.split('\n')
                      // Filter break rows so lineIdx maps correctly to lyricsLines
                      const lyricChordRows = (content.chordTokens ?? []).filter(
                        (row) => !(row.length === 1 && row[0] === PROGRESSION_END)
                      )
                      return (
                        <YStack
                          key={section.id}
                          id={sectionDomId(section.id)}
                          gap="$1"
                          onLayout={(e) => {
                            sectionOffsets.current[section.id] = e.nativeEvent.layout.y
                          }}
                        >
                          <Text
                            color={colors.primary}
                            fontWeight="700"
                            fontSize="$3"
                            marginBottom={repeatNote ? 0 : '$0.5'}
                          >
                            {label}
                          </Text>
                          {repeatNote ? (
                            <Text
                              color={colors.textMuted}
                              fontSize="$2"
                              fontStyle="italic"
                              marginBottom="$0.5"
                            >
                              (same as {repeatNote})
                            </Text>
                          ) : null}
                          {lyricsLines.map((lyricLine, lineIdx) => {
                            const slots = getWordSlots(lyricLine)
                            if (!slots.length) return <View key={lineIdx} style={{ height: 8 }} />
                            const lineTokens = lyricChordRows[lineIdx] ?? []
                            const chords = slots.map((_, wi) => displayToken(lineTokens[wi] ?? ''))
                            const charW = monoSize * CHAR_EM
                            const widths = slots.map((slot, wi) =>
                              slotWidth(slot.text, slot.trailing, chords[wi], charW)
                            )
                            return (
                              // A plain View: Tamagui's stacks can miss reporting
                              // layout for what is drawn before its layer is on
                              // the page, which is how a sheet opens.
                              <View
                                key={lineIdx}
                                style={{ paddingBottom: 4 }}
                                onLayout={(e) => {
                                  lineOffsets.current[`${section.id}:${lineIdx}`] =
                                    e.nativeEvent.layout.y
                                }}
                              >
                                {wrapSlots(widths, sheetWidth).map((row, ri) => {
                                  // A row with no chords has no chord row to
                                  // keep in step with: just the words.
                                  const hasChords = row.some((wi) => chords[wi])
                                  return (
                                    <XStack key={ri} alignItems="flex-end" flexWrap="wrap">
                                      {row.map((wi) => {
                                        const slot = slots[wi]
                                        const chord = chords[wi]
                                        return (
                                          // minWidth, not width: should the
                                          // font in use run wider than Courier
                                          // New, the word pushes its neighbour
                                          // along rather than running into it.
                                          <YStack
                                            key={wi}
                                            minWidth={widths[wi]}
                                            alignItems="flex-start"
                                          >
                                            {/* The chord centred over its word,
                                                or the word under a wider chord. */}
                                            <YStack
                                              minWidth={columnWidth(
                                                slot.text,
                                                slot.trailing,
                                                chord,
                                                charW
                                              )}
                                              alignItems="center"
                                              gap={0}
                                            >
                                              {hasChords ? (
                                                <Text
                                                  style={[
                                                    styles.mono,
                                                    styles.chordText,
                                                    { fontSize: monoSize },
                                                  ]}
                                                  color={chord ? colors.primary : 'transparent'}
                                                  numberOfLines={1}
                                                >
                                                  {/* A non-breaking space: a plain
                                                    one collapses to nothing on
                                                    the web, and the word drops
                                                    onto the chord row. */}
                                                  {chord || '\u00a0'}
                                                </Text>
                                              ) : null}
                                              <Text
                                                style={[
                                                  styles.mono,
                                                  styles.lyricText,
                                                  { fontSize: monoSize },
                                                ]}
                                                color={colors.text}
                                                numberOfLines={1}
                                              >
                                                {slot.text}
                                                {slot.trailing === '-' ? '-' : ''}
                                              </Text>
                                            </YStack>
                                          </YStack>
                                        )
                                      })}
                                    </XStack>
                                  )
                                })}
                              </View>
                            )
                          })}
                        </YStack>
                      )
                    })}
              </YStack>

              {/* CCLI attribution — required on reproduced worship material. */}
              {ccliLicense ? (
                <Text
                  color={colors.textMuted}
                  fontSize={11}
                  marginTop="$4"
                  paddingTop="$2"
                  borderTopWidth={1}
                  borderTopColor={colors.border}
                >
                  Reproduced under CCLI License No. {ccliLicense}
                </Text>
              ) : null}
              {/* Room for the last lines to scroll up past the autoscroll control. */}
              <View style={styles.underControl} />
            </ScrollView>
            <AutoScrollControl
              state={autoScroll.state}
              level={autoScroll.level}
              onToggle={autoScroll.toggle}
              onStop={autoScroll.stop}
              onSpeed={autoScroll.changeSpeed}
            />
          </View>

          {audio ? <TrackBar url={audio.url} name={audio.name} /> : null}
        </YStack>
      </View>
    </FullScreenOverlay>
  )
}

/**
 * Autoscroll's control, floating over the bottom corner of the sheet.
 *
 * Off, it is one button to start. On, it is the speed with − and + either
 * side, pause/resume, and ✕ to put it away; the sheet itself pauses and
 * resumes with a tap as well, which is the one to reach for mid-song. It
 * floats rather than sitting in the controls so it is there with them folded
 * away — which is how a sheet is read on stage.
 */
function AutoScrollControl({
  state,
  level,
  onToggle,
  onStop,
  onSpeed,
}: {
  state: AutoScrollState
  level: number
  onToggle: () => void
  onStop: () => void
  onSpeed: (delta: number) => void
}) {
  const colors = useThemeColors()
  const running = state === 'running'
  const pill = {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  }

  if (state === 'off') {
    return (
      <View style={styles.autoScrollDock} pointerEvents="box-none">
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel="Start autoscroll"
          style={[styles.autoScrollPill, pill]}
        >
          <Text color={colors.primary} fontSize="$2" fontWeight="700" paddingHorizontal="$3">
            ▶ Autoscroll
          </Text>
        </Pressable>
      </View>
    )
  }

  const segment = (
    label: string,
    text: string,
    onPress: () => void,
    disabled = false,
    wide = false
  ) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.autoScrollSegment,
        wide && styles.autoScrollWide,
        disabled && { opacity: 0.35 },
      ]}
    >
      <Text
        color={running && wide ? 'white' : colors.primary}
        fontSize={wide ? 14 : 18}
        fontWeight="700"
      >
        {text}
      </Text>
    </Pressable>
  )

  return (
    <View style={styles.autoScrollDock} pointerEvents="box-none">
      <View style={[styles.autoScrollPill, pill]}>
        {segment('Scroll slower', '−', () => onSpeed(-1), level <= MIN_LEVEL)}
        <View
          style={[
            styles.autoScrollMiddle,
            { backgroundColor: running ? colors.primary : colors.primary + '18' },
          ]}
        >
          {segment(
            running ? `Pause autoscroll, speed ${level}` : `Resume autoscroll, speed ${level}`,
            `${running ? '❚❚' : '▶'}  ${level}`,
            onToggle,
            false,
            true
          )}
        </View>
        {segment('Scroll faster', '+', () => onSpeed(1), level >= MAX_LEVEL)}
        {segment('Stop autoscroll', '✕', onStop)}
      </View>
    </View>
  )
}

/**
 * The song's reference track, under the sheet.
 *
 * Opening a chord sheet from a set list used to leave the track playing in its
 * card underneath, out of reach: to stop it, go back ten seconds or find the
 * bridge you had to close the sheet. This draws controls for that same player
 * — found by its URL, since the card owns it — so the track carries on exactly
 * where it was and everything done here happens to the one track playing.
 *
 * One row, pinned below the sheet rather than scrolling with it, so it stays
 * in reach wherever you are in the song. Nothing is drawn until the card's
 * player is found, which it always is when the sheet was opened from a card.
 */
function TrackBar({ url, name }: { url: string; name?: string }) {
  const colors = useThemeColors()
  const player = useAudioPlayersStore((s) => s.players[url])
  if (!player) return null
  return (
    <YStack borderTopWidth={1} borderColor={colors.border} paddingTop="$1">
      <AudioControls player={player} url={url} name={name} layout="bar" />
    </YStack>
  )
}

/**
 * The sheet's padding while it covers the whole screen: what it would have had
 * anyway, or the notch and home bar, whichever is more. env() reads 0 until the
 * page is allowed under them, so this is the ordinary padding until then.
 */
const CLEAR_OF_THE_NOTCH = {
  paddingTop: 'max(8px, env(safe-area-inset-top))',
  paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
  paddingLeft: 'max(12px, env(safe-area-inset-left))',
  paddingRight: 'max(12px, env(safe-area-inset-right))',
} as unknown as ViewStyle

/** The scroll view's content wrapper, which section offsets are measured from. */
const SHEET_CONTENT_ID = 'chord-sheet-content'

/** A section's element, so the web can measure it without remembering it. */
function sectionDomId(sectionId: string): string {
  return `chord-sheet-section-${sectionId}`
}

const styles = StyleSheet.create({
  /**
   * A touch target Apple would call one, and one you can see.
   *
   * These controls were 24 to 26 points tall, and the hitSlop meant to pad
   * them is ignored by react-native-web — it exists only on the old Touchable
   * — so on the PWA there was nothing around them at all. This sets the floor
   * at the 44 points Apple asks for; each pill then grows to fill it, so the
   * button you can see and the area that answers a thumb are the same box.
   * They used to be concentric, a 24pt pill inside a 44pt target, which left
   * ten points of live space above and below every button that looked like
   * dead space — and made a misplaced tap impossible to tell apart from a
   * misplaced button.
   */
  touch: {
    minHeight: 44,
    justifyContent: 'center',
  },
  hintClose: {
    minWidth: 44,
    alignItems: 'center',
  },
  /** The chip strip on its own line: only as tall as the chips. */
  jumpRow: {
    flexGrow: 0,
    flexShrink: 0,
  },
  /** The chip strip on the title's line: whatever width the title leaves. */
  jumpInline: {
    flex: 1,
    marginLeft: 12,
  },
  /** The jump chips, which are a row of their own and stay compact. */
  touchSmall: {
    minHeight: 34,
    justifyContent: 'center',
  },
  /** The scroll view and the autoscroll control over its corner. */
  sheetArea: {
    flexShrink: 1,
    minHeight: 0,
    position: 'relative',
  },
  /** Below the sheet's last line, the height of the control and a little more. */
  underControl: {
    height: 64,
  },
  autoScrollDock: {
    position: 'absolute',
    right: 0,
    bottom: 4,
  },
  autoScrollPill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: 99,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  autoScrollSegment: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoScrollWide: {
    minWidth: 64,
    paddingHorizontal: 10,
  },
  autoScrollMiddle: {
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  /** Width and height are supplied per render; flex would override both. */
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * The caret and the close. 44 tall, which also sets the folded header's
   * height, and narrow enough that two of them leave the title its room.
   */
  headerBtn: {
    minWidth: 36,
    minHeight: 44,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mono: {
    fontFamily: 'Courier New',
    fontSize: 13,
  },
  chordText: {
    fontWeight: '700',
    fontSize: 13,
  },
  lyricText: {
    fontSize: 13,
  },
})
