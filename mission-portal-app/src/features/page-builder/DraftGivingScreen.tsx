import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageBackground, Pressable, ScrollView, View } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { Arrow, BrandMark, INK, SERIF } from '@/components/ui/Brand'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { doc } from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { db } from '@/lib/firebase'
import { openExternalUrl } from '@/lib/externalUrl'
import { resolveSocialIcon } from '@/lib/socialIcon'
import { parseEmphasis } from '@/lib/textEmphasis'
import { useThemeColors } from '@/theme/useThemeColors'
import { useThemeStore } from '@/stores/themeStore'
import { autoTextColor } from '@/theme/contrast'
import type { PageBlock, PageData } from '@/types/pages'
import { composeGivingDraft, type GiveWay } from './draftGiving'
import { ImageBlock } from './BlockRenderer/ImageBlock'
import { EmbedBlock } from './BlockRenderer/EmbedBlock'
import { GalleryBlock } from './BlockRenderer/GalleryBlock'
import { TwoColBlock } from './BlockRenderer/TwoColBlock'
import { TimelineBlock } from './BlockRenderer/TimelineBlock'
import { MeetingBlock } from './BlockRenderer/MeetingBlock'
import { HeroBlock } from './BlockRenderer/HeroBlock'
import { QuoteBlock } from './BlockRenderer/QuoteBlock'

/**
 * Said when the page carries no verse of its own. 2 Corinthians 9:7, ESV.
 * A quote block on the Giving page replaces it.
 */
const DEFAULT_VERSE = {
  text: 'Each one must give as he has decided in his heart, not reluctantly or under compulsion, for God loves a cheerful giver.',
  attribution: '2 Corinthians 9:7',
}

/** The small, widely spaced label that names a section before its heading does. */
function Overline({ children, color }: { children: string; color: string }) {
  return (
    <Text fontSize={12} fontWeight="800" letterSpacing={3} color={color}>
      {children.toUpperCase()}
    </Text>
  )
}

/** A dark wash over a photograph, heavier toward the words at the bottom. */
function Scrim() {
  return (
    <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Defs>
        <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={INK} stopOpacity={0.35} />
          <Stop offset="0.55" stopColor={INK} stopOpacity={0.7} />
          <Stop offset="1" stopColor={INK} stopOpacity={0.95} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrim)" />
    </Svg>
  )
}

function GiveCard({ way, width }: { way: GiveWay; width: number | '100%' }) {
  const colors = useThemeColors()
  const icon = resolveSocialIcon(way.icon, way.label)

  return (
    <Pressable
      onPress={() => openExternalUrl(way.url)}
      accessibilityRole="link"
      accessibilityLabel={`Give with ${way.label}`}
      style={(state) => {
        // react-native-web adds `hovered`; native has no such state.
        const hovered = (state as { hovered?: boolean }).hovered
        return {
          width,
          opacity: state.pressed ? 0.85 : 1,
          transform: [{ translateY: hovered ? -2 : 0 }],
        }
      }}
    >
      <XStack
        alignItems="center"
        gap={14}
        padding={18}
        borderRadius={18}
        borderWidth={1}
        borderColor={colors.border}
        backgroundColor={colors.surface}
      >
        <YStack
          width={52}
          height={52}
          borderRadius={14}
          alignItems="center"
          justifyContent="center"
          overflow="hidden"
          backgroundColor={icon.kind === 'image' ? colors.border : colors.primary + '1f'}
        >
          {icon.kind === 'image' ? (
            <Image
              source={{ uri: icon.uri }}
              style={{ width: 52, height: 52 }}
              contentFit="cover"
            />
          ) : (
            <Text
              fontSize={icon.kind === 'glyph' ? 24 : 22}
              fontWeight="800"
              color={colors.primary}
            >
              {icon.text}
            </Text>
          )}
        </YStack>
        <YStack flex={1} gap={2}>
          <Text fontSize={17} fontWeight="700" color={colors.text} numberOfLines={1}>
            {way.label}
          </Text>
          {way.handle && way.handle !== way.label.toLowerCase() ? (
            <Text fontSize={14} color={colors.textMuted} numberOfLines={1}>
              {way.handle}
            </Text>
          ) : null}
        </YStack>
        <YStack
          width={36}
          height={36}
          borderRadius={18}
          alignItems="center"
          justifyContent="center"
          backgroundColor={colors.primary + '1f'}
        >
          <Arrow color={colors.primary} />
        </YStack>
      </XStack>
    </Pressable>
  )
}

function renderRest(block: PageBlock) {
  switch (block.type) {
    case 'image':
      return <ImageBlock key={block.id} data={block.data as never} />
    case 'embed':
      return <EmbedBlock key={block.id} data={block.data as never} />
    case 'gallery':
      return <GalleryBlock key={block.id} data={block.data as never} />
    case 'twocol':
      return <TwoColBlock key={block.id} data={block.data as never} />
    case 'timeline':
      return <TimelineBlock key={block.id} data={block.data as never} />
    case 'meeting':
      return <MeetingBlock key={block.id} data={block.data as never} />
    case 'hero':
      return <HeroBlock key={block.id} data={block.data as never} />
    case 'quote':
      return <QuoteBlock key={block.id} data={block.data as never} />
    default:
      return null
  }
}

/**
 * A redesign of the Giving page, drawn from the live page's own content.
 *
 * It only reads: the blocks come from publicPages.giving and are sorted into
 * the draft's sections by composeGivingDraft, so what is shown is always the
 * real Giving page in the new design, and nothing here can change it.
 *
 * Top to bottom: a dark hero carrying the logo's mark, with one button that
 * goes straight to the ways to give; the ways themselves as cards, lifted over
 * the hero's edge so they are in view without scrolling on most phones; the
 * page's verse, set large in a serif; the page's own words on why to give; and
 * a quiet close. The coral throughout is the theme's primary colour, which is
 * the logo's.
 */
export function DraftGivingScreen() {
  const colors = useThemeColors()
  const primary = colors.primary
  const onPrimary = useThemeStore((s) => s.theme.onPrimaryOverride) ?? autoTextColor(primary)

  const [blocks, setBlocks] = useState<PageBlock[] | null>(null)
  const [width, setWidth] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const waysY = useRef(0)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'main'), (snap) => {
      const page = snap.data()?.publicPages?.giving as PageData | undefined
      setBlocks(page?.blocks ?? [])
    })
    return () => unsub()
  }, [])

  const draft = useMemo(() => composeGivingDraft(blocks ?? []), [blocks])

  if (!blocks) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Spinner size="large" />
      </YStack>
    )
  }

  const wide = width >= 720
  const columns = width >= 960 ? 3 : width >= 600 ? 2 : 1
  const gutter = wide ? 40 : 20
  const panelPadding = wide ? 32 : 20
  // The cards' row: the page column, less the panel's padding and its border.
  const row = Math.min(width, 1040) - gutter * 2 - panelPadding * 2 - 2
  const cardWidth = columns === 1 ? '100%' : (row - 16 * (columns - 1)) / columns

  const hero = draft.hero
  const heading = hero?.heading?.trim() || 'Giving'
  const verse = draft.quote?.text
    ? { text: draft.quote.text, attribution: draft.quote.attribution ?? '' }
    : DEFAULT_VERSE

  const heroText = (
    <YStack
      width="100%"
      maxWidth={1040}
      alignSelf="center"
      paddingHorizontal={gutter}
      paddingTop={wide ? 88 : 56}
      paddingBottom={draft.ways.length ? (wide ? 104 : 84) : wide ? 72 : 56}
      gap={18}
    >
      <XStack alignItems="center" gap={12}>
        <BrandMark color={primary} height={18} />
        {/* Named here only when the heading is saying something else. */}
        {heading.toLowerCase() !== 'giving' ? (
          <>
            <View style={{ width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.25)' }} />
            <Overline color={primary}>Giving</Overline>
          </>
        ) : null}
      </XStack>
      <Text
        color="#ffffff"
        fontSize={wide ? 60 : 40}
        lineHeight={wide ? 64 : 44}
        fontWeight="900"
        letterSpacing={wide ? -1.5 : -1}
        maxWidth={760}
      >
        {heading}
      </Text>
      {hero?.subheading ? (
        <Text
          color="rgba(255,255,255,0.74)"
          fontSize={wide ? 19 : 17}
          lineHeight={wide ? 30 : 27}
          maxWidth={600}
        >
          {hero.subheading}
        </Text>
      ) : null}
      {draft.ways.length ? (
        <XStack marginTop={10} gap={18} alignItems="center" flexWrap="wrap">
          <Pressable
            onPress={() => scrollRef.current?.scrollTo({ y: Math.max(0, waysY.current - 16) })}
            accessibilityRole="button"
          >
            <XStack
              backgroundColor={primary}
              borderRadius={999}
              paddingHorizontal={26}
              paddingVertical={15}
              gap={10}
              alignItems="center"
            >
              <Text color={onPrimary} fontSize={16} fontWeight="800" letterSpacing={0.3}>
                Give now
              </Text>
              <Arrow color={onPrimary} />
            </XStack>
          </Pressable>
          <Text color="rgba(255,255,255,0.6)" fontSize={14}>
            {draft.ways.length === 1
              ? `Through ${draft.ways[0].label}`
              : `${draft.ways.length} ways · ${draft.ways.map((w) => w.label).join(', ')}`}
          </Text>
        </XStack>
      ) : null}
    </YStack>
  )

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {/* Draft notice, for the admins who can see this tab. */}
      <XStack
        paddingHorizontal={gutter}
        paddingVertical={10}
        gap={8}
        alignItems="center"
        justifyContent="center"
        backgroundColor={colors.primary + '1a'}
      >
        <Text fontSize={12} fontWeight="800" letterSpacing={1.5} color={colors.primary}>
          DRAFT
        </Text>
        <Text fontSize={12} color={colors.textMuted} flexShrink={1}>
          A new design for Giving, showing the live page’s content. Nothing here changes Giving.
        </Text>
      </XStack>

      {/* Hero */}
      {hero?.bgImage ? (
        <ImageBackground
          source={{ uri: hero.bgImage }}
          resizeMode="cover"
          style={{ width: '100%', backgroundColor: INK }}
        >
          <Scrim />
          {heroText}
        </ImageBackground>
      ) : (
        <View style={{ width: '100%', backgroundColor: INK, overflow: 'hidden' }}>
          {/* The mark again, large and faint, so a hero with no photograph is not a flat slab. */}
          <View
            pointerEvents="none"
            style={{ position: 'absolute', right: wide ? -60 : -150, bottom: -50, opacity: 0.06 }}
          >
            <BrandMark color={primary} height={wide ? 340 : 240} />
          </View>
          {heroText}
        </View>
      )}

      {/* Ways to give, lifted over the hero's lower edge. */}
      {draft.ways.length ? (
        <YStack
          width="100%"
          maxWidth={1040}
          alignSelf="center"
          paddingHorizontal={gutter}
          marginTop={wide ? -64 : -48}
          // Drawn over the hero it overlaps, not under it.
          position="relative"
          zIndex={1}
          onLayout={(e) => (waysY.current = e.nativeEvent.layout.y)}
        >
          <YStack
            backgroundColor={colors.background}
            borderRadius={24}
            padding={panelPadding}
            gap={20}
            borderWidth={1}
            borderColor={colors.border}
            style={{ boxShadow: '0 18px 40px rgba(23,18,15,0.12)' } as never}
          >
            <YStack gap={8}>
              <Overline color={colors.primary}>Ways to give</Overline>
              <Text
                fontSize={wide ? 28 : 24}
                fontWeight="800"
                color={colors.text}
                letterSpacing={-0.4}
              >
                {draft.waysHeading || 'Give online'}
              </Text>
              <Text fontSize={15} color={colors.textMuted}>
                Choose whichever is easiest for you.
              </Text>
            </YStack>
            <XStack flexWrap="wrap" gap={16}>
              {draft.ways.map((way, i) => (
                <GiveCard key={`${way.url}-${i}`} way={way} width={cardWidth} />
              ))}
            </XStack>
          </YStack>
        </YStack>
      ) : null}

      {/* The verse */}
      <YStack
        width="100%"
        maxWidth={820}
        alignSelf="center"
        paddingHorizontal={gutter}
        paddingVertical={wide ? 88 : 64}
        alignItems="center"
        gap={18}
      >
        <Text
          fontFamily={SERIF}
          fontSize={wide ? 96 : 72}
          lineHeight={wide ? 72 : 56}
          height={wide ? 48 : 38}
          color={colors.primary}
        >
          “
        </Text>
        <Text
          fontFamily={SERIF}
          fontStyle="italic"
          fontSize={wide ? 30 : 23}
          lineHeight={wide ? 44 : 34}
          textAlign="center"
          color={colors.text}
        >
          {parseEmphasis(verse.text).map((seg, i) => (
            <Text
              key={i}
              fontFamily={SERIF}
              fontStyle="italic"
              color={seg.accent ? colors.primary : colors.text}
              fontWeight={seg.bold ? '700' : undefined}
            >
              {seg.text}
            </Text>
          ))}
        </Text>
        {verse.attribution ? (
          <XStack alignItems="center" gap={12} marginTop={4}>
            <View style={{ width: 28, height: 2, backgroundColor: colors.primary }} />
            <Text fontSize={12} fontWeight="800" letterSpacing={2.5} color={colors.textMuted}>
              {verse.attribution.toUpperCase()}
            </Text>
            <View style={{ width: 28, height: 2, backgroundColor: colors.primary }} />
          </XStack>
        ) : null}
      </YStack>

      {/* The page's own words */}
      {draft.story.length ? (
        <YStack backgroundColor={colors.surface} borderTopWidth={1} borderColor={colors.border}>
          <YStack
            width="100%"
            maxWidth={720}
            alignSelf="center"
            paddingHorizontal={gutter}
            paddingVertical={wide ? 72 : 52}
            gap={wide ? 44 : 36}
          >
            {draft.story.map((t, i) => (
              <YStack key={i} gap={14}>
                {i === 0 ? <Overline color={colors.primary}>Why we give</Overline> : null}
                {t.heading ? (
                  <Text
                    fontSize={wide ? 30 : 25}
                    fontWeight="800"
                    color={colors.text}
                    letterSpacing={-0.4}
                  >
                    {t.heading}
                  </Text>
                ) : null}
                {(t.content ?? '')
                  .split('\n')
                  .filter((p) => p.trim())
                  .map((p, j) => (
                    <Text key={j} fontSize={17} lineHeight={29} color={colors.textMuted}>
                      {p}
                    </Text>
                  ))}
              </YStack>
            ))}
          </YStack>
        </YStack>
      ) : null}

      {/* Buttons that are not ways to give, and anything else on the page. */}
      {draft.actions.length || draft.rest.length ? (
        <YStack width="100%" maxWidth={820} alignSelf="center" paddingVertical={24} gap={8}>
          {draft.rest.map(renderRest)}
          {draft.actions.map((a, i) => (
            <YStack key={i} paddingHorizontal={gutter} alignItems="center">
              <Pressable
                onPress={() => openExternalUrl(a.url)}
                style={{ width: '100%', maxWidth: 420 }}
              >
                <YStack
                  borderWidth={1.5}
                  borderColor={colors.primary}
                  borderRadius={999}
                  paddingVertical={14}
                  alignItems="center"
                >
                  <Text fontSize={16} fontWeight="800" color={colors.primary}>
                    {a.label ?? 'Learn more'}
                  </Text>
                </YStack>
              </Pressable>
            </YStack>
          ))}
        </YStack>
      ) : null}

      {/* Close */}
      <YStack
        alignItems="center"
        gap={14}
        paddingTop={48}
        paddingBottom={64}
        paddingHorizontal={gutter}
      >
        <YStack
          width={64}
          height={64}
          borderRadius={32}
          borderWidth={1.5}
          borderColor={colors.primary}
          alignItems="center"
          justifyContent="center"
        >
          <BrandMark color={colors.primary} height={16} />
        </YStack>
        <Text fontSize={15} color={colors.textMuted} textAlign="center">
          Thank you for your generosity.
        </Text>
      </YStack>
    </ScrollView>
  )
}
