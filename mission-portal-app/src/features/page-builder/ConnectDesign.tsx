import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Image } from 'expo-image'
import { Text, XStack, YStack } from 'tamagui'
import { Arrow, BrandHero, BrandMark, Overline, SERIF } from '@/components/ui/Brand'
import { openExternalUrl } from '@/lib/externalUrl'
import { parseEmphasis } from '@/lib/textEmphasis'
import { useThemeColors } from '@/theme/useThemeColors'
import { useThemeStore } from '@/stores/themeStore'
import { autoTextColor } from '@/theme/contrast'
import type { PageBlock } from '@/types/pages'
import { composeConnect, directionsQuery, directionsUrl } from './connectLayout'
import { HeroPill, LinkCard, renderRestBlock } from './designedParts'
import { MeetingBlock } from './BlockRenderer/MeetingBlock'

const lines = (text: string | undefined) =>
  (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/**
 * The Connect page, as people see it: its blocks (publicPages.connect), as the
 * page builder holds them, sorted into the design's sections by
 * composeConnect. Admins still edit the blocks in the page builder
 * (PageBuilderScreen); this only draws them.
 *
 * Top to bottom: the page's header in the dark band, with a button to the
 * service details and one to the meeting form; the church's line about itself,
 * set large in a serif; when and where to come, as a card with a way to get
 * directions and the venue's photograph; anything else the page says; and the
 * form to ask to meet the leadership last, in a card of its own.
 */
export function ConnectDesign({
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
  const visitY = useRef(0)
  const meetingY = useRef(0)

  const layout = useMemo(() => composeConnect(blocks), [blocks])

  const wide = width >= 720
  const gutter = wide ? 40 : 20
  const column = Math.min(width, 1040) - gutter * 2
  const linkColumns = width >= 960 ? 3 : width >= 600 ? 2 : 1
  const linkWidth = linkColumns === 1 ? '100%' : (column - 16 * (linkColumns - 1)) / linkColumns
  const scrollTo = (y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 16) })

  const visit = layout.visit
  const visitLines = lines(visit?.leftContent)
  const query = directionsQuery(visit?.leftContent)

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {top}

      <BrandHero
        label="Connect"
        heading={layout.hero?.heading?.trim() || 'Connect'}
        subheading={layout.hero?.subheading}
        bgImage={layout.hero?.bgImage}
        primary={primary}
        wide={wide}
        gutter={gutter}
      >
        {visit || layout.meeting ? (
          <XStack marginTop={10} gap={12} alignItems="center" flexWrap="wrap">
            {visit ? (
              <HeroPill
                label="Plan your visit"
                onPress={() => scrollTo(visitY.current)}
                solid
                primary={primary}
                onPrimary={onPrimary}
              />
            ) : null}
            {layout.meeting ? (
              <HeroPill
                label="Request a meeting"
                onPress={() => scrollTo(meetingY.current)}
                solid={!visit}
                primary={primary}
                onPrimary={onPrimary}
              />
            ) : null}
          </XStack>
        ) : null}
      </BrandHero>

      {/* Who the church is, in its own words. */}
      {layout.tagline?.text ? (
        <YStack
          width="100%"
          maxWidth={820}
          alignSelf="center"
          paddingHorizontal={gutter}
          paddingVertical={wide ? 80 : 56}
          alignItems="center"
          gap={20}
        >
          <Text
            fontFamily={SERIF}
            fontSize={wide ? 36 : 27}
            lineHeight={wide ? 48 : 37}
            textAlign="center"
            color={colors.text}
          >
            {parseEmphasis(layout.tagline.text).map((seg, i) => (
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
        </YStack>
      ) : null}

      {/* When and where. */}
      {visit ? (
        <YStack
          backgroundColor={colors.surface}
          borderTopWidth={1}
          borderBottomWidth={1}
          borderColor={colors.border}
          onLayout={(e) => (visitY.current = e.nativeEvent.layout.y)}
        >
          <YStack
            width="100%"
            maxWidth={1040}
            alignSelf="center"
            paddingHorizontal={gutter}
            paddingVertical={wide ? 72 : 48}
          >
            <XStack flexDirection={wide ? 'row' : 'column'} gap={wide ? 48 : 28}>
              <YStack flex={wide ? 1 : undefined} gap={14} justifyContent="center">
                <Overline color={primary}>Join us</Overline>
                {visit.leftHead ? (
                  <Text
                    color={colors.text}
                    fontSize={wide ? 40 : 30}
                    lineHeight={wide ? 46 : 36}
                    fontWeight="900"
                    letterSpacing={-0.8}
                  >
                    {visit.leftHead}
                  </Text>
                ) : null}
                {visitLines.map((line, i) => (
                  <Text
                    key={i}
                    color={i === 0 ? colors.text : colors.textMuted}
                    fontSize={i === 0 ? 20 : 16}
                    lineHeight={i === 0 ? 28 : 24}
                    fontWeight={i === 0 ? '700' : '400'}
                  >
                    {line}
                  </Text>
                ))}
                {query ? (
                  <XStack marginTop={8}>
                    <Pressable
                      onPress={() => openExternalUrl(directionsUrl(query))}
                      accessibilityRole="link"
                      accessibilityLabel={`Directions to ${query}`}
                    >
                      <XStack
                        backgroundColor={primary}
                        borderRadius={999}
                        paddingHorizontal={22}
                        paddingVertical={13}
                        gap={10}
                        alignItems="center"
                      >
                        <Text color={onPrimary} fontSize={15} fontWeight="800">
                          Get directions
                        </Text>
                        <Arrow color={onPrimary} />
                      </XStack>
                    </Pressable>
                  </XStack>
                ) : null}
              </YStack>
              {visit.rightImage ? (
                <View
                  style={{
                    width: wide ? (column - 48) * 0.5 : column,
                    aspectRatio: 4 / 3,
                    borderRadius: 20,
                    overflow: 'hidden',
                    backgroundColor: colors.border,
                  }}
                >
                  <Image
                    source={{ uri: visit.rightImage }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    accessibilityLabel={visit.leftHead ?? 'Where we meet'}
                  />
                </View>
              ) : null}
            </XStack>
            {lines(visit.rightContent).map((line, i) => (
              <Text key={i} color={colors.textMuted} fontSize={16} lineHeight={24} marginTop={16}>
                {line}
              </Text>
            ))}
          </YStack>
        </YStack>
      ) : null}

      {/* The page's own words. */}
      {layout.story.length ? (
        <YStack
          width="100%"
          maxWidth={720}
          alignSelf="center"
          paddingHorizontal={gutter}
          paddingTop={wide ? 72 : 52}
          gap={wide ? 44 : 36}
        >
          {layout.story.map((t, i) => (
            <YStack key={i} gap={14}>
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
              {lines(t.content).map((p, j) => (
                <Text key={j} fontSize={17} lineHeight={29} color={colors.textMuted}>
                  {p}
                </Text>
              ))}
            </YStack>
          ))}
        </YStack>
      ) : null}

      {/* The church elsewhere. */}
      {layout.links.length ? (
        <YStack
          width="100%"
          maxWidth={1040}
          alignSelf="center"
          paddingHorizontal={gutter}
          paddingTop={wide ? 72 : 52}
          gap={18}
        >
          <YStack gap={8}>
            <Overline color={primary}>Follow along</Overline>
            {layout.linksHeading ? (
              <Text
                fontSize={wide ? 28 : 24}
                fontWeight="800"
                color={colors.text}
                letterSpacing={-0.4}
              >
                {layout.linksHeading}
              </Text>
            ) : null}
          </YStack>
          <XStack flexWrap="wrap" gap={16}>
            {layout.links.map((link, i) => (
              <LinkCard key={`${link.url}-${i}`} link={link} width={linkWidth} verb="Open" />
            ))}
          </XStack>
        </YStack>
      ) : null}

      {/* Buttons, and anything else the page holds. */}
      {layout.actions.length || layout.rest.length ? (
        <YStack width="100%" maxWidth={820} alignSelf="center" paddingTop={32} gap={8}>
          {layout.rest.map(renderRestBlock)}
          {layout.actions.map((a, i) => (
            <YStack key={i} paddingHorizontal={gutter} alignItems="center">
              <Pressable
                onPress={() => openExternalUrl(a.url)}
                style={{ width: '100%', maxWidth: 420 }}
              >
                <YStack
                  borderWidth={1.5}
                  borderColor={primary}
                  borderRadius={999}
                  paddingVertical={14}
                  alignItems="center"
                >
                  <Text fontSize={16} fontWeight="800" color={primary}>
                    {a.label ?? 'Learn more'}
                  </Text>
                </YStack>
              </Pressable>
            </YStack>
          ))}
        </YStack>
      ) : null}

      {/* Asking to meet: the closing move. */}
      {layout.meeting ? (
        <YStack
          width="100%"
          maxWidth={820}
          alignSelf="center"
          paddingHorizontal={gutter}
          paddingTop={wide ? 72 : 52}
          gap={14}
          onLayout={(e) => (meetingY.current = e.nativeEvent.layout.y)}
        >
          <Overline color={primary}>Meet with us</Overline>
          {/* The form draws its own card; a second frame round it would be a box in a box. */}
          <MeetingBlock data={layout.meeting} />
        </YStack>
      ) : null}

      {/* Close */}
      <YStack alignItems="center" paddingTop={56} paddingBottom={64}>
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
    </ScrollView>
  )
}
