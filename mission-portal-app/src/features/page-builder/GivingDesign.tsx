import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Arrow, BrandHero, BrandMark, Overline, SERIF } from '@/components/ui/Brand'
import { Text, XStack, YStack } from 'tamagui'
import { openExternalUrl } from '@/lib/externalUrl'
import { parseEmphasis } from '@/lib/textEmphasis'
import { useThemeColors } from '@/theme/useThemeColors'
import { useThemeStore } from '@/stores/themeStore'
import { autoTextColor } from '@/theme/contrast'
import type { PageBlock } from '@/types/pages'
import { composeGiving } from './givingLayout'
import { LinkCard, renderRestBlock } from './designedParts'

/**
 * Said when the page carries no verse of its own. 2 Corinthians 9:7, ESV.
 * A quote block on the Giving page replaces it.
 */
const DEFAULT_VERSE = {
  text: 'Each one must give as he has decided in his heart, not reluctantly or under compulsion, for God loves a cheerful giver.',
  attribution: '2 Corinthians 9:7',
}

/**
 * The Giving page, as people see it: its blocks (publicPages.giving), as the
 * page builder holds them, sorted into the design's sections by
 * composeGiving. Admins still edit the blocks in the page builder
 * (PageBuilderScreen); this only draws them.
 *
 * Top to bottom: a dark hero carrying the logo's mark, with one button that
 * goes straight to the ways to give; the ways themselves as cards, lifted over
 * the hero's edge so they are in view without scrolling on most phones; the
 * page's verse, set large in a serif; the page's own words on why to give; and
 * a quiet close. The coral throughout is the theme's primary colour, which is
 * the logo's.
 */
export function GivingDesign({
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
  const scrollRef = useRef<ScrollView>(null)
  const waysY = useRef(0)

  const layout = useMemo(() => composeGiving(blocks), [blocks])

  const wide = width >= 720
  const columns = width >= 960 ? 3 : width >= 600 ? 2 : 1
  const gutter = wide ? 40 : 20
  const panelPadding = wide ? 32 : 20
  // The cards' row: the page column, less the panel's padding and its border.
  const row = Math.min(width, 1040) - gutter * 2 - panelPadding * 2 - 2
  const cardWidth = columns === 1 ? '100%' : (row - 16 * (columns - 1)) / columns

  const hero = layout.hero
  const heading = hero?.heading?.trim() || 'Giving'
  const verse = layout.quote?.text
    ? { text: layout.quote.text, attribution: layout.quote.attribution ?? '' }
    : DEFAULT_VERSE

  const giveNow = layout.ways.length ? (
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
      <Text color="rgba(255,255,255,0.7)" fontSize={14}>
        {layout.ways.length === 1
          ? `Through ${layout.ways[0].label}`
          : `${layout.ways.length} ways · ${layout.ways.map((w) => w.label).join(', ')}`}
      </Text>
    </XStack>
  ) : null

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {top}

      <BrandHero
        label="Giving"
        heading={heading}
        subheading={hero?.subheading}
        bgImage={hero?.bgImage}
        primary={primary}
        wide={wide}
        gutter={gutter}
        // Room for the ways-to-give panel lifted over the band's lower edge.
        extraBottom={layout.ways.length ? (wide ? 32 : 28) : 0}
      >
        {giveNow}
      </BrandHero>

      {/* Ways to give, lifted over the hero's lower edge. */}
      {layout.ways.length ? (
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
                {layout.waysHeading || 'Give online'}
              </Text>
              <Text fontSize={15} color={colors.textMuted}>
                Choose whichever is easiest for you.
              </Text>
            </YStack>
            <XStack flexWrap="wrap" gap={16}>
              {layout.ways.map((way, i) => (
                <LinkCard key={`${way.url}-${i}`} link={way} width={cardWidth} verb="Give with" />
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
      {layout.story.length ? (
        <YStack backgroundColor={colors.surface} borderTopWidth={1} borderColor={colors.border}>
          <YStack
            width="100%"
            maxWidth={720}
            alignSelf="center"
            paddingHorizontal={gutter}
            paddingVertical={wide ? 72 : 52}
            gap={wide ? 44 : 36}
          >
            {layout.story.map((t, i) => (
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
      {layout.actions.length || layout.rest.length ? (
        <YStack width="100%" maxWidth={820} alignSelf="center" paddingVertical={24} gap={8}>
          {layout.rest.map(renderRestBlock)}
          {layout.actions.map((a, i) => (
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
