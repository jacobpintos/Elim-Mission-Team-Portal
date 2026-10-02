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
import { parseSongRequest, type SongRequest } from '@/lib/songRequest'
import { readHeardAudio } from './heardAudio'
import { shazam, type ShazamHit } from '@/lib/shazam'
import { findByTitle } from '@/lib/titleMatch'
import type { ChordSheet } from '@/types/chordSheet'

/** How long to listen before giving up. */
const LISTEN_MS = 45_000
/** Only the most recent words are matched: the song being sung now. */
const RECENT_WORDS = 40
/**
 * How long the words get first — enough to say a song's name — before
 * Shazam is given its turn at naming a recording, and how long it gets.
 */
const WORDS_FIRST_MS = 6000
const SHAZAM_SECONDS = 12
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
 * The microphone button beside the chord sheet search. On an iPhone, Shazam
 * gets the first few seconds: a recording — a reference track, a song on
 * someone's phone — it names at once, and the sheet with that title opens.
 * Speech recognition is made for talking, and hears little or nothing of a
 * record's vocals over its band; Shazam is made for exactly that. It knows
 * only released recordings, though, not a band playing the song live, so
 * after that, or straight away where there is no Shazam, the phone's
 * own speech recognition listens to whatever is being sung or played — the
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
  const [guesses, setGuesses] = useState<LyricMatch[]>([])
  // Shazam at work, before the words are listened for.
  const [identifying, setIdentifying] = useState(false)
  // A recording Shazam named that has no sheet under that title.
  const [notInLibrary, setNotInLibrary] = useState<ShazamHit | null>(null)
  // What has been heard and settled, and what is still being made out.
  const settled = useRef('')
  const done = useRef(false)
  // The song found, whose key the recording is then read for.
  const found = useRef<string | null>(null)
  // When Shazam is to have its turn, and whether it has had it.
  const shazamTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearShazamTurn = () => {
    if (shazamTimer.current) clearTimeout(shazamTimer.current)
    shazamTimer.current = null
  }
  // A song asked for by name, opened once nothing more is said.
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearRequest = () => {
    if (requestTimer.current) clearTimeout(requestTimer.current)
    requestTimer.current = null
  }
  // Not every browser has speech recognition (Firefox has none).
  const [available] = useState(() => {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable()
    } catch {
      return false
    }
  })

  const index = useMemo(
    () =>
      buildLyricIndex(
        sheets.map((s) => ({
          id: String(s.id),
          title: s.title,
          sections: s.sections.map((sec) => ({ id: sec.id, lyrics: sec.lyrics })),
        }))
      ),
    [sheets]
  )

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

  const hear = (text: string) => {
    const recent = text.trim().split(/\s+/).slice(-RECENT_WORDS).join(' ')
    setHeard(recent)
    const ranked = rankSongs(index, recent)
    setGuesses(ranked.slice(0, 3))
    // A song asked for by name, once the asking stops: "Holy" is not yet
    // "Holy Forever", nor "Firm Foundation" yet "Firm Foundation in E".
    clearRequest()
    const request = parseSongRequest(sheets, text)
    if (request) {
      requestTimer.current = setTimeout(() => openAsked(request), REQUEST_PAUSE_MS)
      return
    }
    const match = confidentMatch(ranked)
    if (match) finish(match)
  }

  useSpeechRecognitionEvent('start', () => setListening(true))
  useSpeechRecognitionEvent('end', () => setListening(false))
  useSpeechRecognitionEvent('result', (e) => {
    if (done.current) return
    const text = e.results[0]?.transcript ?? ''
    if (e.isFinal) {
      settled.current = `${settled.current} ${text}`
      hear(settled.current)
    } else {
      hear(`${settled.current} ${text}`)
    }
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
    setListening(false)
    if (e.error === 'aborted') return
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
    setNotInLibrary(null)
    settled.current = ''
    done.current = false
    found.current = null
    clearRequest()
    clearShazamTurn()
    // The browser asks for the microphone itself, when listening starts.
    if (Platform.OS !== 'web') {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!permission.granted) {
        setProblem(
          'Mission Portal needs the microphone and speech recognition to listen. You can turn them on in Settings.'
        )
        return
      }
    }
    listenForWords()
    if (shazam) shazamTimer.current = setTimeout(shazamTurn, WORDS_FIRST_MS)
  }

  /**
   * Shazam's turn, once the words have had theirs: the words stop — the two
   * do not share the microphone — while it tries to name a recording, and
   * go on if it cannot. Skipped while a song asked for by name is waiting.
   */
  const shazamTurn = async () => {
    shazamTimer.current = null
    if (!shazam || done.current || requestTimer.current) return
    ExpoSpeechRecognitionModule.abort()
    setIdentifying(true)
    let hit: ShazamHit | null = null
    try {
      hit = await shazam.match(SHAZAM_SECONDS)
    } catch {
      // Unreachable, or not set up for this app: the words will have to do.
    }
    setIdentifying(false)
    if (done.current) return
    if (hit?.title) {
      const sheet = findByTitle(sheets, hit.title)
      if (sheet) {
        done.current = true
        setOpen(false)
        onFound(sheet, null, null)
        return
      }
      // Perhaps under another title: the words may still find it.
      setNotInLibrary(hit)
    }
    listenForWords()
  }

  const listenForWords = () => {
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      addsPunctuation: false,
      // Steer the recogniser towards this library's words: a sung "wretch"
      // is otherwise as likely heard as "rich".
      contextualStrings: hintPhrases(index),
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

  const close = () => {
    done.current = true
    clearRequest()
    clearShazamTurn()
    shazam?.cancel()
    setIdentifying(false)
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
      shazam?.cancel()
      clearRequest()
      clearShazamTurn()
      ExpoSpeechRecognitionModule.abort()
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
                {listening || identifying ? 'Listening…' : 'Find a song'}
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
                (identifying
                  ? 'Checking whether it’s a recording Shazam knows…'
                  : listening
                    ? 'Say a song’s name — “Firm Foundation in E” — or hold the phone near the music. The chord sheet opens as soon as the song is clear.'
                    : 'Starting…')}
            </Text>

            {notInLibrary ? (
              <Text color={colors.text} fontSize="$3">
                Shazam heard “{notInLibrary.title}”
                {notInLibrary.artist ? ` by ${notInLibrary.artist}` : ''}, but there’s no chord
                sheet with that title. Listening for the words in case it’s under another name…
              </Text>
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
                    onPress={() => finish(g)}
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

            {!listening && !identifying ? (
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
  again: {
    borderRadius: 99,
    paddingVertical: 12,
    alignItems: 'center',
  },
})
