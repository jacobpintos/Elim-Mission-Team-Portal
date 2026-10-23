import { useMemo, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Image } from 'expo-image'
import { Text, XStack, YStack } from 'tamagui'
import { Arrow, BrandHero, BrandMark, INK, Overline, SERIF } from '@/components/ui/Brand'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { openExternalUrl } from '@/lib/externalUrl'
import { parseEmphasis } from '@/lib/textEmphasis'
import { useThemeColors } from '@/theme/useThemeColors'
import { useThemeStore } from '@/stores/themeStore'
import { autoTextColor } from '@/theme/contrast'
import type { ButtonData, PageBlock, QuoteData, TextData } from '@/types/pages'
import { composeStory, paragraphs, type Cover, type StorySection } from './storyLayout'
import { HeroPill, renderRestBlock } from './designedParts'

type Colors = ReturnType<typeof useThemeColors>

/**
 * A photograph at its own proportions, so a portrait of two people is not
 * cropped to a letterbox. Until it has loaded the frame holds `fallback`; past
 * `maxHeight` it is cropped from the top, where the faces are.
 */
function Photo({
  uri,
  width,
  maxHeight,
  label,
  fallback = 4 / 3,
  radius = 20,
  onPress,
}: {
  uri: string
  width: number
  maxHeight?: number
  label: string
  fallback?: number
  radius?: number
  onPress?: () => void
}) {
  const colors = useThemeColors()
  const [ratio, setRatio] = useState(fallback)
  const natural = width / ratio
  const height = maxHeight ? Math.min(natural, maxHeight) : natural
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'imagebutton' : 'image'}
      accessibilityLabel={label}
    >
      <View
        style={{
          width,
          height,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: colors.border,
        }}
      >
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          contentPosition={height < natural ? 'top' : 'center'}
          onLoad={(e) => {
            const { width: w, height: h } = e.source
            if (w > 0 && h > 0) setRatio(w / h)
          }}
        />
      </View>
    </Pressable>
  )
}

/** Paragraphs in the reading column; the story's first passage opens larger. */
function Passage({
  text,
  colors,
  wide,
  lede = false,
  primary,
}: {
  text: TextData
  colors: Colors
  wide: boolean
  lede?: boolean
  primary: string
}) {
  const paras = paragraphs(text.content)
  return (
    <YStack gap={16}>
      {text.heading ? (
        lede ? (
          <Overline color={primary}>{text.heading}</Overline>
        ) : (
          <YStack gap={14}>
            <View style={{ width: 32, height: 3, borderRadius: 2, backgroundColor: primary }} />
            <Text
              fontSize={wide ? 32 : 26}
              lineHeight={wide ? 38 : 32}
              fontWeight="900"
              letterSpacing={-0.6}
              color={colors.text}
            >
              {text.heading}
            </Text>
          </YStack>
        )
      ) : null}
      {paras.map((p, i) =>
        lede && i === 0 ? (
          <Text
            key={i}
            fontFamily={SERIF}
            fontSize={wide ? 25 : 21}
            lineHeight={wide ? 38 : 32}
            color={colors.text}
          >
            {p}
          </Text>
        ) : (
          <Text key={i} fontSize={17} lineHeight={29} color={colors.textMuted}>
            {p}
          </Text>
        )
      )}
    </YStack>
  )
}

/** A line set large in the serif, as Connect sets the church's line about itself. */
function PullQuote({
  quote,
  colors,
  wide,
  primary,
}: {
  quote: QuoteData
  colors: Colors
  wide: boolean
  primary: string
}) {
  return (
    <YStack alignItems="center" gap={20}>
      <Text
        fontFamily={SERIF}
        fontSize={wide ? 36 : 27}
        lineHeight={wide ? 48 : 37}
        textAlign="center"
        color={colors.text}
      >
        {parseEmphasis(quote.text ?? '').map((seg, i) => (
          <Text
            key={i}
            fontFamily={SERIF}
            color={seg.accent ? primary : colors.text}
            fontWeight={seg.bold ? '700' : undefined}
          >
            {seg.text}
          </Text>
        ))}
      </Text>
      <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: primary }} />
      {quote.attribution ? (
        <Text fontSize={14} fontWeight="700" letterSpacing={1} color={colors.textMuted}>
          {quote.attribution}
        </Text>
      ) : null}
    </YStack>
  )
}

/** A cover on the shelf: all the same height, each as wide as its own proportions make it. */
function CoverTile({
  cover,
  height,
  onView,
}: {
  cover: Cover
  height: number
  onView: (uri: string) => void
}) {
  const [ratio, setRatio] = useState(2 / 3)
  return (
    <Pressable
      onPress={() => (cover.url ? openExternalUrl(cover.url) : onView(cover.image))}
      accessibilityRole={cover.url ? 'link' : 'imagebutton'}
      accessibilityLabel={cover.handle ? `Open on ${cover.handle}` : 'View picture'}
      style={(state) => {
        // react-native-web adds `hovered`; native has no such state.
        const hovered = (state as { hovered?: boolean }).hovered
        return {
          opacity: state.pressed ? 0.85 : 1,
          transform: [{ translateY: hovered ? -4 : 0 }],
        }
      }}
    >
      <YStack gap={12} alignItems="center">
        <View
          style={{
            width: height * ratio,
            height,
            borderRadius: 10,
            overflow: 'hidden',
            backgroundColor: 'rgba(255,255,255,0.08)',
            // A cover lifted off the band, as a book stands off a shelf.
            shadowColor: '#000',
            shadowOpacity: 0.45,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
          }}
        >
          <Image
            source={{ uri: cover.image }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            onLoad={(e) => {
              const { width: w, height: h } = e.source
              if (w > 0 && h > 0) setRatio(w / h)
            }}
          />
        </View>
        {cover.handle ? (
          <XStack gap={6} alignItems="center">
            <Text fontSize={13} fontWeight="700" color="rgba(255,255,255,0.7)">
              {cover.handle}
            </Text>
            <Arrow color="rgba(255,255,255,0.7)" size={12} />
          </XStack>
        ) : null}
      </YStack>
    </Pressable>
  )
}

/** A button on the page itself, outlined in the accent colour. */
function OutlinedAction({ action, primary }: { action: ButtonData; primary: string }) {
  return (
    <Pressable
      onPress={() => action.url && openExternalUrl(action.url)}
      accessibilityRole="link"
      style={{ width: '100%', maxWidth: 460 }}
    >
      <YStack
        borderWidth={1.5}
        borderColor={primary}
        borderRadius={999}
        paddingVertical={14}
        paddingHorizontal={22}
        alignItems="center"
      >
        <Text fontSize={16} fontWeight="800" color={primary} textAlign="center">
          {action.label ?? 'Learn more'}
        </Text>
      </YStack>
    </Pressable>
  )
}

/**
 * Our Story, as people see it: its blocks and pictures (publicPages.ourstory),
 * as the page builder holds them, laid out by composeStory. Admins still edit
 * the blocks in the page builder (PageBuilderScreen); this only draws them.
 *
 * Top to bottom, in the page's order: the header in the dark band, with the
 * photograph of Pastor Ajai and Maureena beside it rather than under a wash;
 * the story in a reading column, opening larger; the line pulled out of it,
 * set in the serif; the people, side by side with their photograph, on a band
 * of their own; the books on a dark shelf with the excerpt under them; Sunny
 * beside the album; and the logo's mark to close.
 */
export function StoryDesign({
  blocks,
  top,
}: {
  blocks: PageBlock[]
  /** Above the header: the admins' Edit Page button. */
  top?: ReactNode
}) {
  const colors = useThemeColors()
  const primary = colors.primary
  const onPrimary = useThemeStore((s) => s.theme.onPrimaryOverride) ?? autoTextColor(primary)

  const [width, setWidth] = useState(0)
  const [viewing, setViewing] = useState<string | null>(null)

  const layout = useMemo(() => composeStory(blocks), [blocks])

  const wide = width >= 720
  const gutter = wide ? 40 : 20
  const column = Math.max(0, Math.min(width, 1040) - gutter * 2)
  const reading = Math.min(column, 680)
  const besideGap = 56
  const besideWidth = wide ? Math.round((column - besideGap) * 0.42) : column
  const space = wide ? 80 : 56

  const hero = layout.hero
  const heroPhoto = hero?.bgImage?.trim()

  // A band straight after the header or another band meets it edge to edge,
  // rather than leaving a strip of page between the two.
  const isBand = (s: StorySection | undefined) => s?.kind === 'group' || s?.kind === 'shelf'
  const section = (s: StorySection, i: number) => {
    const bandGap = i === 0 || isBand(layout.sections[i - 1]) ? 0 : space
    switch (s.kind) {
      case 'text':
        return (
          <YStack key={s.key} width={reading} alignSelf="center" paddingTop={s.lede ? space : 48}>
            <Passage text={s.text} colors={colors} wide={wide} lede={s.lede} primary={primary} />
          </YStack>
        )

      case 'quote':
        return (
          <YStack
            key={s.key}
            width="100%"
            maxWidth={820}
            alignSelf="center"
            paddingHorizontal={gutter}
            paddingTop={space}
            paddingBottom={wide ? 16 : 8}
          >
            <PullQuote quote={s.quote} colors={colors} wide={wide} primary={primary} />
          </YStack>
        )

      case 'group':
      case 'feature': {
        // People with their photograph: the photograph first for a group, after
        // the words for one person, so the two bands do not mirror each other.
        const texts = s.kind === 'group' ? s.texts : [s.text]
        const src = s.image?.src
        const photo = src ? (
          <Photo
            uri={src}
            width={besideWidth}
            maxHeight={wide ? 640 : 520}
            label={s.image?.caption || texts.map((t) => t.heading).join(', ')}
            fallback={s.kind === 'group' ? 3 / 4 : 1}
            onPress={() => setViewing(src)}
          />
        ) : null
        const words = (
          <YStack flex={wide ? 1 : undefined} gap={wide ? 48 : 40}>
            {texts.map((t, i) => (
              <Passage key={i} text={t} colors={colors} wide={wide} primary={primary} />
            ))}
          </YStack>
        )
        const banded = s.kind === 'group'
        return (
          <YStack
            key={s.key}
            marginTop={bandGap}
            backgroundColor={banded ? colors.surface : undefined}
            borderTopWidth={banded ? 1 : 0}
            borderBottomWidth={banded ? 1 : 0}
            borderColor={colors.border}
          >
            <XStack
              width="100%"
              maxWidth={1040}
              alignSelf="center"
              paddingHorizontal={gutter}
              paddingVertical={banded ? (wide ? 72 : 48) : 0}
              flexDirection={wide ? 'row' : 'column'}
              alignItems={wide ? 'flex-start' : 'stretch'}
              gap={wide ? besideGap : 32}
            >
              {banded ? photo : words}
              {banded ? words : photo}
            </XStack>
          </YStack>
        )
      }

      case 'image': {
        const src = s.image.src ?? ''
        return (
          <YStack
            key={s.key}
            alignItems="center"
            paddingTop={space}
            paddingHorizontal={gutter}
            gap={12}
          >
            <Photo
              uri={src}
              width={Math.min(column, 820)}
              maxHeight={wide ? 720 : 560}
              label={s.image.caption || 'Photograph'}
              onPress={() => setViewing(src)}
            />
            {s.image.caption ? (
              <Text fontSize={14} color={colors.textMuted} textAlign="center" maxWidth={620}>
                {s.image.caption}
              </Text>
            ) : null}
          </YStack>
        )
      }

      case 'shelf':
        return (
          <YStack key={s.key} marginTop={bandGap} backgroundColor={INK} overflow="hidden">
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: wide ? -70 : -120, top: -40, opacity: 0.05 }}
            >
              <BrandMark color={primary} height={wide ? 300 : 220} />
            </View>
            <YStack
              width="100%"
              maxWidth={1040}
              alignSelf="center"
              paddingHorizontal={gutter}
              paddingVertical={wide ? 76 : 52}
              gap={wide ? 44 : 32}
              alignItems="center"
            >
              {s.heading ? (
                <Text
                  color="#ffffff"
                  fontSize={wide ? 34 : 27}
                  fontWeight="900"
                  letterSpacing={-0.6}
                  textAlign="center"
                >
                  {s.heading}
                </Text>
              ) : null}
              <XStack
                flexWrap="wrap"
                justifyContent="center"
                alignItems="flex-end"
                columnGap={wide ? 32 : 18}
                rowGap={wide ? 36 : 28}
              >
                {s.covers.map((c, i) => (
                  <CoverTile
                    key={`${c.image}-${i}`}
                    cover={c}
                    height={wide ? 280 : 190}
                    onView={setViewing}
                  />
                ))}
              </XStack>
              {s.actions.length ? (
                <YStack gap={12} alignItems="center" width="100%">
                  {s.actions.map((a, i) => (
                    <HeroPill
                      key={i}
                      label={a.label ?? 'Learn more'}
                      onPress={() => a.url && openExternalUrl(a.url)}
                      solid={i === 0}
                      primary={primary}
                      onPrimary={onPrimary}
                    />
                  ))}
                </YStack>
              ) : null}
            </YStack>
          </YStack>
        )

      case 'action':
        return (
          <YStack key={s.key} alignItems="center" paddingTop={40} paddingHorizontal={gutter}>
            <OutlinedAction action={s.action} primary={primary} />
          </YStack>
        )

      case 'block':
        return (
          <YStack key={s.key} width="100%" maxWidth={820} alignSelf="center" paddingTop={32}>
            {renderRestBlock(s.block)}
          </YStack>
        )
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {top}

      {width > 0 ? (
        <>
          <BrandHero
            label="Our Story"
            heading={hero?.heading?.trim() || 'Our Story'}
            subheading={hero?.subheading}
            primary={primary}
            wide={wide}
            gutter={gutter}
            aside={
              heroPhoto ? (
                <Photo
                  uri={heroPhoto}
                  width={wide ? Math.round((column - besideGap) * 0.4) : column}
                  maxHeight={wide ? 560 : 440}
                  label={hero?.heading || 'Our Story'}
                  fallback={4 / 5}
                  onPress={() => setViewing(heroPhoto)}
                />
              ) : undefined
            }
          />

          {layout.sections.map(section)}

          {/* Close */}
          <YStack alignItems="center" paddingTop={space} paddingBottom={64}>
            <YStack
              width={64}
              height={64}
              borderRadius={32}
              borderWidth={1.5}
              borderColor={primary}
              alignItems="center"
              justifyContent="center"
            >
              <BrandMark color={primary} height={16} />
            </YStack>
          </YStack>
        </>
      ) : null}

      <ImageLightbox key={viewing ?? 'none'} uri={viewing} onClose={() => setViewing(null)} />
    </ScrollView>
  )
}
