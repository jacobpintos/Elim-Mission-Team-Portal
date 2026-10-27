import { useEffect, useState } from 'react'
import {
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { wakeEngine } from '@/lib/wakeEngine'
import { MAX_PASTE } from '@/lib/miriam'
import { shownAlready } from '@/lib/miriamReplies'
import { songHost } from '@/lib/songHost'
import { FD } from '@/lib/format'
import type { Conversation } from './useMiriamConversation'
import type { Listening } from './useListening'
import type { PanelState } from './usePanelState'
import { useMiriamStore } from '@/stores/miriamStore'

/** Miriam's button, in the header: a green dot while she listens for her name. */
export function MiriamHeaderButton({
  open,
  waiting,
  onPress,
}: {
  open: boolean
  waiting: boolean
  onPress: () => void
}) {
  const colors = useThemeColors()
  return (
    <Pressable
      onPress={onPress}
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
  )
}

/**
 * Her bar, at the top — not a screen: a chord sheet stays in view beneath.
 * What she heard, her answer, and what can be tapped with it: events or songs
 * to choose from, a change to confirm, a link, Undo; or the box to type in.
 */
export function MiriamPanel({
  panel,
  listening: ears,
  conversation,
}: {
  panel: PanelState
  listening: Listening
  conversation: Conversation
}) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const {
    stage,
    heard,
    typed,
    setTyped,
    ranOut,
    answer,
    choices,
    understood,
    pending,
    said,
    confirmByVoice,
    link,
    briefing,
    undo,
    songGuesses,
    videoGuesses,
    slides,
    lyricsWanted,
    stay,
    woken,
  } = panel
  const { available, listening, wakeOn, requestRef, listen, toggleWake } = ears
  const {
    send,
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
  } = conversation
  // Her own last answer, while it can still be said not to be what was meant.
  const correctable = useMiriamStore((s) => !!s.lastOwn)

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
              // A walkthrough runs long: scrolled within the bar rather than cut off —
              // and an answer on faith, left open to be read, given more room.
              <ScrollView style={{ maxHeight: stay ? 420 : 260 }} nestedScrollEnabled>
                <Text color={ink} fontSize="$3" fontWeight="600">
                  {answer}
                </Text>
              </ScrollView>
            ) : null}
            {said && !shownAlready(said, answer) ? (
              // What she said that isn't on screen in so many words — her
              // briefing read out, a briefing button's result — written out.
              <ScrollView style={{ maxHeight: briefing ? 150 : 220 }} nestedScrollEnabled>
                <Text color={ink} fontSize="$3" fontWeight="600" accessibilityLiveRegion="polite">
                  {said}
                </Text>
              </ScrollView>
            ) : null}
            {stage === 'answered' && correctable ? (
              <Pressable
                onPress={notMeant}
                accessibilityRole="button"
                accessibilityLabel="That’s not what I meant — ask again"
                hitSlop={8}
                style={{ alignSelf: 'flex-start', paddingVertical: 2 }}
              >
                <Text color={soft} fontSize="$2" textDecorationLine="underline">
                  Not what I meant
                </Text>
              </Pressable>
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
                    <Text color={colors.primary} fontWeight="700" fontSize="$3" numberOfLines={1}>
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
                onPress={undoLast}
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
                        backgroundColor: pending.prepared.destructive ? '#c0392b' : colors.primary,
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
                      {pending.prepared.cancel ?? 'Cancel'}
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
                    <Text color={colors.primary} fontWeight="700" fontSize="$3" numberOfLines={1}>
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
                    <Text color={colors.primary} fontWeight="700" fontSize="$3" numberOfLines={1}>
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
            {stage === 'answered' && videoGuesses.length ? (
              <YStack gap="$1.5" paddingTop="$1.5">
                {videoGuesses.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => pickVideo(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Play ${item.title}`}
                    style={[styles.choice, { borderColor: colors.primary }]}
                  >
                    <Text color={colors.primary} fontWeight="700" fontSize="$3" numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.preacher || item.host || item.album ? (
                      <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                        {item.preacher || item.host || item.album}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </YStack>
            ) : null}
            {stage === 'answered' && slides ? (
              // Lyric slides made: as they'll show, to look over — then the file.
              <YStack gap="$1.5" paddingTop="$1.5">
                <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
                  <YStack gap="$1.5">
                    {slides.slides.map((slide, i) => (
                      <View
                        key={i}
                        style={styles.slide}
                        accessible
                        accessibilityLabel={`Slide ${i + 1}: ${
                          slide.kind === 'title'
                            ? [slide.title, slide.artist].filter(Boolean).join(', ')
                            : slide.lines.join(' ')
                        }`}
                      >
                        {slide.kind === 'title' ? (
                          <>
                            <Text color="white" fontWeight="800" fontSize="$4" textAlign="center">
                              {slide.title}
                            </Text>
                            {slide.artist ? (
                              <Text color="#BFBFBF" fontSize="$1" textAlign="center">
                                {slide.artist}
                              </Text>
                            ) : null}
                          </>
                        ) : (
                          <Text color="white" fontWeight="800" fontSize="$2" textAlign="center">
                            {slide.lines.join('\n')}
                          </Text>
                        )}
                      </View>
                    ))}
                  </YStack>
                </ScrollView>
                <XStack gap="$2" alignItems="center">
                  <Pressable
                    onPress={saveSlides}
                    accessibilityRole="button"
                    accessibilityHint="A PowerPoint file, which Google Slides opens too"
                    style={[styles.small, { backgroundColor: colors.primary }]}
                  >
                    <Text color="white" fontWeight="700" fontSize="$2">
                      {Platform.OS === 'web' ? '⬇ Download slides' : 'Share slides'}
                    </Text>
                  </Pressable>
                  <Text color={soft} fontSize="$1" flex={1}>
                    A PowerPoint file. For Google Slides, upload it to Drive and open it there.
                  </Text>
                </XStack>
              </YStack>
            ) : null}
          </YStack>
          {stage === 'listening' && heard ? (
            <Pressable
              onPress={() => send(requestRef.current)}
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

        {stage === 'typing' ? (
          <XStack gap="$2" alignItems="flex-end">
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder={
                lyricsWanted ? 'Paste the lyrics, or the song’s name' : 'What should Miriam do?'
              }
              placeholderTextColor={colors.textMuted}
              autoFocus
              multiline
              // Room for a song's lyrics, pasted for slides.
              maxLength={MAX_PASTE}
              accessibilityLabel={
                lyricsWanted ? 'The song’s lyrics, or its name' : 'What should Miriam do?'
              }
              style={[
                styles.field,
                lyricsWanted ? styles.lyricsField : null,
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
  )
}

/** The morning offer of her briefing: small, at the top, gone at a tap. */
export function MorningOffer({ onShow, onDismiss }: { onShow: () => void; onDismiss: () => void }) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  return (
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
          onPress={onShow}
          accessibilityRole="button"
          style={[styles.small, { backgroundColor: colors.primary }]}
        >
          <Text color="white" fontWeight="700" fontSize="$2">
            Show me
          </Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
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
  // Lyrics pasted: more of them in view.
  lyricsField: {
    maxHeight: 220,
  },
  // A slide in small: white capitals on black, as it will show.
  slide: {
    backgroundColor: '#000',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 60,
    alignItems: 'center',
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
