import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { useThemeColors } from '@/theme/useThemeColors'
import {
  KEY_HINTS,
  closestTitles,
  parseSongRequest,
  requestFromAliases,
  searchSongs,
  trailingKey,
  type SongRequest,
} from '@/lib/songRequest'
import { ownsSpeech, releaseSpeech, withSpeech } from '@/lib/speechOwner'
import { orderForHints, upcomingSheetIds } from '@/lib/hintOrder'
import { loadAliases, rememberAlias } from '@/lib/songAliases'
import { withoutHerName } from '@/lib/wakeWord'
import { listeningCue } from '@/lib/listeningCue'
import { canRecogniseOnDevice, isOffline } from '@/lib/speechSupport'
import { keyLabel } from '@/lib/nashvilleNumbers'
import { useWorshipStore } from '@/stores/worshipStore'
import type { ChordSheet } from '@/types/chordSheet'

/** This listener's claim on the phone's speech recognition (lib/speechOwner). */
const SPEECH_ID = 'song-listener'

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
/** Only the most recent words are matched: the name being said now. */
const RECENT_WORDS = 12
/** How long a song asked for by name waits for the rest of what is said. */
const REQUEST_PAUSE_MS = 1200

/** A key asked for with a song's name. */
export interface AskedKey {
  key: string
  minor: boolean
}

/**
 * Find a song by saying its name.
 *
 * "Firm Foundation, key of E", or just a title: the song opens, in the key
 * asked for, or else the key the last song was in (lib/songRequest). Titles
 * only — never lyrics, so a song is not opened for a line that happens to
 * be in it. It works wherever speech recognition does: the phone app, and
 * the web app in Chrome and Safari.
 *
 * The microphone button beside the chord sheet search. Until a name is
 * clear, the titles closest to what was said are shown to be picked by
 * hand, or the song can be searched for; either way, what was heard is
 * learned as that song. It stops on its own after 45 seconds.
 */
export function SongListener({
  sheets,
  onFound,
}: {
  sheets: ChordSheet[]
  onFound: (sheet: ChordSheet, key: AskedKey | null) => void
}) {
  const colors = useThemeColors()
  const [open, setOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [guesses, setGuesses] = useState<ChordSheet[]>([])
  // What has been heard and settled, and what is still being made out.
  const settled = useRef('')
  const done = useRef(false)
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
  // What this device has learned to hear as which song (lib/songAliases).
  const aliases = useRef<ReadonlyMap<string, string>>(new Map())
  // The songs those phrases were corrected to: told to the recogniser
  // early on, as titles proven hard to hear (lib/hintOrder).
  const [taught, setTaught] = useState<Set<string>>(new Set())
  const learned = (m: ReadonlyMap<string, string>) => {
    aliases.current = m
    setTaught(new Set(m.values()))
  }
  useEffect(() => {
    loadAliases().then(learned)
  }, [])
  // Searching by hand, for when the guesses are wrong or missing.
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const insets = useSafeAreaInsets()
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

  // The titles the recogniser is told to expect, in order, as it takes only
  // so many (lib/hintOrder): not English first, then songs corrected on
  // this device, then songs in the next two weeks' set lists.
  const setLists = useWorshipStore((s) => s.setLists)
  const hintTitles = useMemo(
    () => [
      ...new Set(
        orderForHints(sheets, upcomingSheetIds(setLists, localToday()), taught).map((s) => s.title)
      ),
    ],
    [sheets, setLists, taught]
  )

  const listenForWords = () => {
    withSpeech(SPEECH_ID, () =>
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: ALTERNATIVES,
        requiresOnDeviceRecognition: onDevice.current,
        continuous: true,
        addsPunctuation: false,
        // Steer the recogniser towards this library's titles — "Agnus Dei",
        // not "Agnes Day" — and a key said with one: "key of D", not "KFD".
        contextualStrings: [...KEY_HINTS, ...hintTitles].slice(0, 100),
        iosTaskHint: 'search',
        // Whatever else is playing — a reference track in the app, or a song
        // in another — carries on.
        iosCategory: {
          category: 'playAndRecord',
          categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'mixWithOthers'],
        },
      })
    )
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
    clearPending()
    clearRequest()
    // Listening carries on; should it have stopped meanwhile, it starts again.
    if (!done.current && !ownsSpeech(SPEECH_ID)) listenForWords()
  }

  const openAsked = (request: SongRequest<ChordSheet>) => {
    if (done.current) return
    done.current = true
    clearRequest()
    ExpoSpeechRecognitionModule.abort()
    setListening(false)
    setOpen(false)
    onFound(request.sheet, request.key ? { key: request.key, minor: request.minor } : null)
  }

  /**
   * `text` is the best guess at everything said so far; `candidates`, the
   * same with each of the recogniser's other guesses for the latest words,
   * best first — the right one is often second ("Oh Hill King Jesus" first,
   * "All Hail King Jesus" after it).
   */
  const hear = (said: string, heardAs: string[] = [said]) => {
    // "Hey Miriam, Above All in E": her name is not part of the song.
    const text = withoutHerName(said)
    const candidates = heardAs.map(withoutHerName)
    // A song about to open: only listening for "cancel".
    if (pendingAct.current) {
      const last = text.trim().split(/\s+/).slice(-3).join(' ')
      if (CANCEL_WORDS.test(last)) cancelPending()
      return
    }
    const recent = text.trim().split(/\s+/).slice(-RECENT_WORDS).join(' ')
    setHeard(recent)
    // The titles closest to what was said, trying each of the recogniser's
    // guesses at it.
    setGuesses(
      candidates
        .flatMap((c) => closestTitles(sheets, c.trim().split(/\s+/).slice(-RECENT_WORDS).join(' ')))
        .filter((sheet, i, all) => all.findIndex((x) => x.id === sheet.id) === i)
        .slice(0, 3)
    )
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
    }
  }

  /** Teach this device that what was heard means this song (lib/songAliases). */
  const learnFrom = (sheetId: string) => {
    if (!heard) return
    rememberAlias(heard, sheetId)
    loadAliases().then(learned)
  }

  /** A guess picked by hand: opened at once, in whatever key was said, and learned from. */
  const pick = (sheet: ChordSheet) => {
    clearPending()
    learnFrom(String(sheet.id))
    const key = trailingKey(heard)
    openAsked({ sheet, key: key?.key ?? null, minor: key?.minor ?? false })
  }

  /**
   * Search instead: for when the guesses are wrong, or there are none.
   * Listening stops — nothing should open while a name is being typed —
   * and what was heard is kept, to be learned as the song picked.
   */
  const openSearch = () => {
    clearPending()
    clearRequest()
    if (ownsSpeech(SPEECH_ID)) ExpoSpeechRecognitionModule.abort()
    setQuery('')
    setSearching(true)
  }
  const pickSearched = (sheet: ChordSheet) => {
    learnFrom(String(sheet.id))
    setSearching(false)
    // In whatever key was said with it.
    const key = trailingKey(heard)
    openAsked({ sheet, key: key?.key ?? null, minor: key?.minor ?? false })
  }
  const results = searching ? searchSongs(sheets, query, 6) : []

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
          ? 'Didn’t hear any words. Try again, saying the song’s name.'
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
    setSearching(false)
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
    setSearching(false)
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
      setProblem((p) => p ?? 'Couldn’t make out a song name. Try again, or search for it below.')
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
        accessibilityLabel="Find a song by saying its name"
        style={[styles.micBtn, { borderColor: colors.primary }]}
      >
        <Text fontSize={18}>🎤</Text>
      </Pressable>

      <FullScreenOverlay visible={open} animationType="fade" transparent onRequestClose={close}>
        <View
          style={[
            styles.backdrop,
            // Typing: at the top of the screen, where the keyboard never
            // reaches and the page has no reason to shift (see SheetNotes).
            searching ? { justifyContent: 'flex-start', paddingTop: insets.top + 12 } : null,
          ]}
        >
          {searching ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$4"
              padding="$3"
              gap="$2"
              width="92%"
              maxWidth={480}
            >
              <XStack alignItems="center" gap="$2">
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Song title or artist…"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  autoCorrect={false}
                  accessibilityLabel="Search for the song"
                  style={[
                    styles.search,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                />
                <Pressable
                  onPress={() => setSearching(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Back to listening"
                  style={styles.closeBtn}
                >
                  <Text color={colors.textMuted} fontSize="$3">
                    Back
                  </Text>
                </Pressable>
              </XStack>
              {heard ? (
                <Text color={colors.textMuted} fontSize="$2">
                  Heard “…{heard}”. The song you pick is remembered for those words.
                </Text>
              ) : null}
              {results.map((sheet) => (
                <Pressable
                  key={String(sheet.id)}
                  onPress={() => pickSearched(sheet)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${sheet.title}`}
                  style={[styles.guess, { borderColor: colors.border }]}
                >
                  <Text color={colors.primary} fontWeight="700">
                    {sheet.title}
                  </Text>
                  {sheet.artist ? (
                    <Text color={colors.textMuted} fontSize="$2">
                      {sheet.artist}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
              {query.trim() && results.length === 0 ? (
                <Text color={colors.textMuted} fontSize="$3">
                  No song by that name.
                </Text>
              ) : null}
            </YStack>
          ) : (
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
                    ? 'Say a song’s name — “Firm Foundation in E”. The chord sheet opens as soon as the name is clear.'
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
                      key={String(g.id)}
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

              {!pending ? (
                <Pressable
                  onPress={openSearch}
                  accessibilityRole="button"
                  style={styles.searchLink}
                >
                  <Text color={colors.primary} fontSize="$3" fontWeight="600">
                    🔍 {guesses.length ? 'Not right? Search for the song' : 'Search for the song'}
                  </Text>
                </Pressable>
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
          )}
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
  search: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    // 16pt: smaller, and an iPhone zooms the page in on the field.
    fontSize: 16,
  },
  searchLink: {
    minHeight: 44,
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
