import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { useThemeColors } from '@/theme/useThemeColors'
import {
  buildLyricIndex,
  confidentMatch,
  hintPhrases,
  rankSongs,
  type LyricMatch,
} from '@/lib/lyricMatch'
import type { Chroma } from '@/lib/keyDetect'
import {
  KEY_HINTS,
  closestTitles,
  parseSongRequest,
  requestFromAliases,
  trailingKey,
  type SongRequest,
} from '@/lib/songRequest'
import { readHeardAudio } from './heardAudio'
import { claimSpeech, ownsSpeech, releaseSpeech } from '@/lib/speechOwner'
import { orderForHints, upcomingSheetIds } from '@/lib/hintOrder'
import { loadAliases, rememberAlias } from '@/lib/songAliases'
import { listeningCue } from '@/lib/listeningCue'
import { canRecogniseOnDevice, isOffline } from '@/lib/speechSupport'
import { keyLabel } from '@/lib/nashvilleNumbers'
import { useWorshipStore } from '@/stores/worshipStore'
import type { ChordSheet } from '@/types/chordSheet'

/** This listener's claim on the phone's speech recognition (lib/speechOwner). */
const SPEECH_ID = 'song-listener'

/**
 * A song offered to pick by hand: by its lyrics, or — `byTitle` — because
 * what was said is close to its name.
 */
type Guess = LyricMatch & { byTitle?: boolean }

/** Today as YYYY-MM-DD, on this phone's calendar. */
function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * How long a song found without being picked waits before it opens —
 * "Opening Breathe in D…" — for a mishearing to be caught and cancelled.
 */
const CONFIRM_MS = 1500
/** Said while a song is about to open: don't. */
const CANCEL_WORDS = /\b(cancel|no|nope|wait|stop|wrong)\b/i
/**
 * How many of the recogniser's guesses at what was said to try. The phone
 * gives them cleanly; a browser runs them together while words are still
 * coming, so there it is the best guess alone.
 */
const ALTERNATIVES = Platform.OS === 'web' ? 1 : 5

/** How long to listen before giving up. */
const LISTEN_MS = 45_000
/** Only the most recent words are matched: the song being sung now. */
const RECENT_WORDS = 40
/** How long a song asked for by name waits for the rest of what is said. */
const REQUEST_PAUSE_MS = 1200

/** A key asked for with a song's name. */
export interface AskedKey {
  key: string
  minor: boolean
}

/**
 * Find a song by listening to it — or by asking for it.
 *
 * Said rather than played — "Firm Foundation, key of E", or just a title —
 * the song opens straight away, in the key asked for, or else the key the
 * last song was in (lib/songRequest). That needs nothing from the music, so
 * it works wherever speech recognition does: the phone app, and the web app
 * in Chrome and Safari. The rest below is for a song playing.
 *
 * The microphone button beside the chord sheet search. The phone's (or the
 * browser's) own speech recognition listens to whatever is being sung or played — the
 * band, a recording, someone humming the words — and the words it makes out
 * are matched against every chord sheet's lyrics (lib/lyricMatch: split
 * syllables and "_" placeholders ignored, misheard words forgiven, phrases
 * every song has counted for little). Once one song is clearly it, the
 * listening stops and its sheet opens at the line that was being sung.
 *
 * Until then, the songs it might be are shown to be picked by hand. It stops
 * on its own after 45 seconds.
 *
 * The sound itself is kept in a file while listening, only so that once the
 * song is known, the notes heard can be compared with its chords to suggest
 * the key it is being played in (lib/keyDetect, via `onHeard`). The file is
 * deleted as soon as it has been read, song found or not.
 */
export function SongListener({
  sheets,
  onFound,
  onHeard,
}: {
  sheets: ChordSheet[]
  onFound: (
    sheet: ChordSheet,
    sectionId: string | null,
    line: number | null,
    key?: AskedKey | null
  ) => void
  /** The notes heard while finding `sheetId`, once the recording is read. */
  onHeard?: (sheetId: string, heard: Chroma) => void
}) {
  const colors = useThemeColors()
  const [open, setOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [guesses, setGuesses] = useState<Guess[]>([])
  // What has been heard and settled, and what is still being made out.
  const settled = useRef('')
  const done = useRef(false)
  // The song found, whose key the recording is then read for.
  const found = useRef<string | null>(null)
  // A song asked for by name, opened once nothing more is said.
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearRequest = () => {
    if (requestTimer.current) clearTimeout(requestTimer.current)
    requestTimer.current = null
  }
  // A song about to open, and what will open it: shown for a moment to be
  // cancelled ("Opening Breathe in D…").
  const [pending, setPending] = useState<string | null>(null)
  const pendingAct = useRef<(() => void) | null>(null)
  const pendingId = useRef<string | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Songs cancelled this time: not offered again on the same lyrics.
  const declined = useRef(new Set<string>())
  // What this device has learned to hear as which song (lib/songAliases).
  const aliases = useRef<ReadonlyMap<string, string>>(new Map())
  useEffect(() => {
    loadAliases().then((m) => (aliases.current = m))
  }, [])
  // No signal: listening on the phone itself, where it can.
  const onDevice = useRef(false)
  const [offline, setOffline] = useState(false)

  // Not every browser has speech recognition (Firefox has none).
  const [available] = useState(() => {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable()
    } catch {
      return false
    }
  })

  // In the order the recogniser should be told to expect their titles, as
  // it takes only so many (lib/hintOrder): not English first, then songs
  // in the next two weeks' set lists.
  const setLists = useWorshipStore((s) => s.setLists)
  const index = useMemo(
    () =>
      buildLyricIndex(
        orderForHints(sheets, upcomingSheetIds(setLists, localToday())).map((s) => ({
          id: String(s.id),
          title: s.title,
          sections: s.sections.map((sec) => ({ id: sec.id, lyrics: sec.lyrics })),
        }))
      ),
    [sheets, setLists]
  )

  const listenForWords = () => {
    claimSpeech(SPEECH_ID)
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      maxAlternatives: ALTERNATIVES,
      requiresOnDeviceRecognition: onDevice.current,
      continuous: true,
      addsPunctuation: false,
      // Steer the recogniser towards this library's words: a sung "wretch"
      // is otherwise as likely heard as "rich".
      // And towards a key said with a title: "key of D", not "KFD".
      contextualStrings: [...KEY_HINTS, ...hintPhrases(index, 100 - KEY_HINTS.length)],
      iosTaskHint: 'dictation',
      // The sound, for the key once the song is found; 16 kHz is plenty for
      // notes up to the top of a voice.
      recordingOptions: {
        persist: true,
        outputSampleRate: 16000,
        outputEncoding: 'pcmFormatInt16',
      },
      // Keep whatever else is playing — a reference track in the app, or a
      // song in another — playing, so it can be heard. Measurement mode: the
      // microphone as it is, without the processing iOS does for a voice
      // call, which treats a band as noise to be taken out.
      iosCategory: {
        category: 'playAndRecord',
        categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'mixWithOthers'],
        mode: 'measurement',
      },
    })
  }

  const clearPending = () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current)
    pendingTimer.current = null
    pendingAct.current = null
    pendingId.current = null
    setPending(null)
  }
  /** Open a song found on its own — after a moment to say it is the wrong one. */
  const confirmThen = (sheetId: string, label: string, act: () => void) => {
    if (done.current || pendingAct.current) return
    pendingAct.current = act
    pendingId.current = sheetId
    setPending(label)
    pendingTimer.current = setTimeout(openNow, CONFIRM_MS)
  }
  const openNow = () => {
    const act = pendingAct.current
    clearPending()
    act?.()
  }
  const cancelPending = () => {
    if (pendingId.current) declined.current.add(pendingId.current)
    clearPending()
    clearRequest()
    // Listening carries on; should it have stopped meanwhile, it starts again.
    if (!done.current && !ownsSpeech(SPEECH_ID)) listenForWords()
  }

  const finish = (match: LyricMatch) => {
    if (done.current) return
    done.current = true
    found.current = match.id
    // Stopped, not aborted, so the recording is finished and handed over.
    ExpoSpeechRecognitionModule.stop()
    setListening(false)
    setOpen(false)
    const sheet = sheets.find((s) => String(s.id) === match.id)
    if (sheet) onFound(sheet, match.sectionId, match.line)
  }

  const openAsked = (request: SongRequest<ChordSheet>) => {
    if (done.current) return
    done.current = true
    clearRequest()
    ExpoSpeechRecognitionModule.abort()
    setListening(false)
    setOpen(false)
    onFound(
      request.sheet,
      null,
      null,
      request.key ? { key: request.key, minor: request.minor } : null
    )
  }

  /**
   * `text` is the best guess at everything said so far; `candidates`, the
   * same with each of the recogniser's other guesses for the latest words,
   * best first — the right one is often second ("Oh Hill King Jesus" first,
   * "All Hail King Jesus" after it).
   */
  const hear = (text: string, candidates: string[] = [text]) => {
    // A song about to open: only listening for "cancel".
    if (pendingAct.current) {
      const last = text.trim().split(/\s+/).slice(-3).join(' ')
      if (CANCEL_WORDS.test(last)) cancelPending()
      return
    }
    const recent = text.trim().split(/\s+/).slice(-RECENT_WORDS).join(' ')
    setHeard(recent)
    const ranked = rankSongs(index, recent)
    // Titles close to what was said first — a name half heard is the
    // likelier meaning — then songs whose lyrics share two word pairs or
    // more with it. One pair ("king Jesus") is in half the library.
    const nearTitles = candidates
      .flatMap((c) => closestTitles(sheets, c.trim().split(/\s+/).slice(-RECENT_WORDS).join(' ')))
      .filter((sheet, i, all) => all.findIndex((x) => x.id === sheet.id) === i)
      .slice(0, 3)
    const titled: Guess[] = nearTitles.map((sheet) => ({
      id: String(sheet.id),
      title: sheet.title,
      score: 0,
      pairs: 0,
      sectionId: null,
      line: null,
      byTitle: true,
    }))
    const sung = ranked.filter((r) => r.pairs >= 2 && !titled.some((t) => t.id === r.id))
    setGuesses([...titled, ...sung].slice(0, 3))
    // A song asked for by name, once the asking stops: "Holy" is not yet
    // "Holy Forever", nor "Firm Foundation" yet "Firm Foundation in E".
    clearRequest()
    // Words this device has learned first — a correction is the surest sign
    // of what is meant — then a title, trying each of the recogniser's guesses.
    let request: SongRequest<ChordSheet> | null = null
    for (const c of candidates) {
      request = requestFromAliases(aliases.current, sheets, c)
      if (request) break
    }
    if (!request) {
      for (const c of candidates) {
        request = parseSongRequest(sheets, c)
        if (request) break
      }
    }
    if (request) {
      const asked = request
      requestTimer.current = setTimeout(() => {
        requestTimer.current = null
        const key = asked.key ? ` in ${keyLabel(asked.key, asked.minor)}` : ''
        confirmThen(String(asked.sheet.id), `${asked.sheet.title}${key}`, () => openAsked(asked))
      }, REQUEST_PAUSE_MS)
      return
    }
    const match = confidentMatch(ranked)
    if (match && !declined.current.has(match.id)) {
      confirmThen(match.id, match.title, () => finish(match))
    }
  }

  /** A guess picked by hand: opened at once, and learned from. */
  const pick = (g: Guess) => {
    clearPending()
    if (heard) {
      rememberAlias(heard, g.id)
      loadAliases().then((m) => (aliases.current = m))
    }
    if (!g.byTitle) return finish(g)
    // Picked by name: in whatever key was said with it.
    const sheet = sheets.find((s) => String(s.id) === g.id)
    const key = trailingKey(heard)
    if (sheet) openAsked({ sheet, key: key?.key ?? null, minor: key?.minor ?? false })
  }

  // Only while listening for a song: the recogniser's events also carry
  // dictation into text fields (components/ui/Dictation), which is not a
  // song to find.
  useSpeechRecognitionEvent('start', () => {
    if (ownsSpeech(SPEECH_ID)) setListening(true)
  })
  useSpeechRecognitionEvent('end', () => {
    if (!ownsSpeech(SPEECH_ID)) return
    releaseSpeech(SPEECH_ID)
    setListening(false)
    listeningCue('stop')
  })
  useSpeechRecognitionEvent('result', (e) => {
    if (done.current || !ownsSpeech(SPEECH_ID)) return
    const alts = (e.results ?? []).map((r) => r.transcript ?? '').filter(Boolean)
    const before = settled.current
    const best = alts[0] ?? ''
    if (e.isFinal) settled.current = `${before} ${best}`
    hear(
      `${before} ${best}`,
      (alts.length ? alts : ['']).map((a) => `${before} ${a}`)
    )
  })
  useSpeechRecognitionEvent('audioend', (e) => {
    if (!e.uri) return
    const sheetId = found.current
    found.current = null
    readHeardAudio(e.uri, Boolean(sheetId && onHeard)).then((chroma) => {
      if (chroma && sheetId) onHeard?.(sheetId, chroma)
    })
  })
  useSpeechRecognitionEvent('error', (e) => {
    if (!ownsSpeech(SPEECH_ID)) return
    releaseSpeech(SPEECH_ID)
    setListening(false)
    if (e.error === 'aborted') return
    // Lost the signal mid-listen: carry on, on the phone.
    if (e.error === 'network' && !onDevice.current && canRecogniseOnDevice() && !done.current) {
      onDevice.current = true
      setOffline(true)
      listenForWords()
      return
    }
    listeningCue('stop')
    setProblem(
      e.error === 'not-allowed'
        ? Platform.OS === 'web'
          ? 'This browser isn’t allowed to use the microphone here. Allow it in the site settings (the icon by the address), then try again.'
          : 'Mission Portal isn’t allowed to use the microphone or speech recognition. You can turn them on in Settings.'
        : e.error === 'no-speech' || e.error === 'speech-timeout'
          ? 'Didn’t hear any words. Try again closer to the music, during a verse or chorus.'
          : e.error === 'network'
            ? 'Couldn’t reach speech recognition — check your connection and try again.'
            : 'Listening stopped. Try again.'
    )
  })

  const start = async () => {
    setProblem(null)
    setHeard('')
    setGuesses([])
    settled.current = ''
    done.current = false
    found.current = null
    declined.current.clear()
    clearPending()
    clearRequest()
    onDevice.current = false
    setOffline(false)
    // The browser asks for the microphone itself, when listening starts.
    if (Platform.OS !== 'web') {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!permission.granted) {
        setProblem(
          'Mission Portal needs the microphone and speech recognition to listen. You can turn them on in Settings.'
        )
        return
      }
      // No signal: on the phone, where it can.
      if ((await isOffline()) && canRecogniseOnDevice()) {
        onDevice.current = true
        setOffline(true)
      }
    }
    listeningCue('start')
    // On the phone, a moment for the chime before the microphone takes over
    // the sound. A browser plays it alongside, and must start listening
    // within the tap.
    if (Platform.OS !== 'web') await new Promise((r) => setTimeout(r, 180))
    if (done.current) return
    listenForWords()
  }

  const close = () => {
    done.current = true
    clearPending()
    clearRequest()
    ExpoSpeechRecognitionModule.abort()
    setListening(false)
    setOpen(false)
  }

  const openAndListen = () => {
    setOpen(true)
    start()
  }

  // Given up after a while.
  useEffect(() => {
    if (!listening) return
    const timer = setTimeout(() => {
      ExpoSpeechRecognitionModule.stop()
      setProblem(
        (p) => p ?? 'Couldn’t place the song. Try again during a chorus, or pick one below.'
      )
    }, LISTEN_MS)
    return () => clearTimeout(timer)
  }, [listening])
  // Never left listening behind a closed screen.
  useEffect(
    () => () => {
      clearRequest()
      if (pendingTimer.current) clearTimeout(pendingTimer.current)
      if (ownsSpeech(SPEECH_ID)) {
        releaseSpeech(SPEECH_ID)
        ExpoSpeechRecognitionModule.abort()
      }
    },
    []
  )

  if (!available) return null

  return (
    <>
      <Pressable
        onPress={openAndListen}
        accessibilityRole="button"
        accessibilityLabel="Find a song by name or by listening"
        style={[styles.micBtn, { borderColor: colors.primary }]}
      >
        <Text fontSize={18}>🎤</Text>
      </Pressable>

      <FullScreenOverlay visible={open} animationType="fade" transparent onRequestClose={close}>
        <View style={styles.backdrop}>
          <YStack
            backgroundColor={colors.surface}
            borderRadius="$4"
            padding="$4"
            gap="$3"
            width="92%"
            maxWidth={480}
          >
            <XStack alignItems="center" justifyContent="space-between">
              <Text color={colors.text} fontSize="$5" fontWeight="700">
                {listening ? 'Listening…' : 'Find a song'}
              </Text>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.closeBtn}
              >
                <Text color={colors.textMuted} fontSize="$4">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            <Text color={colors.textMuted} fontSize="$3">
              {problem ??
                (listening
                  ? 'Say a song’s name — “Firm Foundation in E” — or hold the phone near the music. The chord sheet opens as soon as the song is clear.'
                  : 'Starting…')}
            </Text>

            {offline ? (
              <Text color={colors.textMuted} fontSize="$2">
                No signal — listening on this phone instead.
              </Text>
            ) : null}

            {pending ? (
              <YStack gap="$2">
                <Text color={colors.text} fontSize="$4" fontWeight="700">
                  Opening {pending}…
                </Text>
                <XStack gap="$2">
                  <Pressable
                    onPress={cancelPending}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel, that's the wrong song"
                    style={[styles.choice, { borderColor: colors.border }]}
                  >
                    <Text color={colors.text} fontWeight="700">
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={openNow}
                    accessibilityRole="button"
                    style={[
                      styles.choice,
                      { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text color="white" fontWeight="700">
                      Open now
                    </Text>
                  </Pressable>
                </XStack>
              </YStack>
            ) : null}

            {heard ? (
              <Text color={colors.text} fontSize="$3" fontStyle="italic" numberOfLines={3}>
                “…{heard}”
              </Text>
            ) : null}

            {guesses.length > 0 ? (
              <YStack gap="$2">
                <Text color={colors.textMuted} fontSize="$2">
                  Sounds like:
                </Text>
                {guesses.map((g) => (
                  <Pressable
                    key={g.id}
                    onPress={() => pick(g)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${g.title}`}
                    style={[styles.guess, { borderColor: colors.border }]}
                  >
                    <Text color={colors.primary} fontWeight="700">
                      {g.title}
                    </Text>
                  </Pressable>
                ))}
              </YStack>
            ) : null}

            {!listening && !pending ? (
              <Pressable
                onPress={start}
                accessibilityRole="button"
                style={[styles.again, { backgroundColor: colors.primary }]}
              >
                <Text color="white" fontWeight="700">
                  🎤 Listen again
                </Text>
              </Pressable>
            ) : null}
          </YStack>
        </View>
      </FullScreenOverlay>
    </>
  )
}

const styles = StyleSheet.create({
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guess: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  choice: {
    flex: 1,
    minHeight: 44,
    borderRadius: 99,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  again: {
    borderRadius: 99,
    paddingVertical: 12,
    alignItems: 'center',
  },
})
