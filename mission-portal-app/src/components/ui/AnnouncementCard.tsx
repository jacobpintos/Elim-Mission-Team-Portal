import { useEffect, useState } from 'react'
import { Pressable, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Text, XStack, YStack } from 'tamagui'
import { Img } from '@/components/ui/Img'
import { Avatar } from '@/components/ui/Avatar'
import { useThemeColors } from '@/theme/useThemeColors'
import { useUsersStore } from '@/stores/usersStore'
import { cardImageHeight } from '@/lib/announcementImage'
import { sameId } from '@/lib/ids'
import { postedWhen } from '@/features/announce/postedWhen'
import type { Announcement } from '@/types/events'

const MEGAPHONE =
  'M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z'
const GLOBE =
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z'
const PEOPLE =
  'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z'
const PENCIL =
  'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'
const TRASH = 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z'
const CLOCK =
  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z'

const DANGER = '#c0392b'

function Glyph({ d, color, size = 16 }: { d: string; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill={color} />
    </Svg>
  )
}

/** Widest a card is drawn: past this the lines are too long to read comfortably. */
export const ANNOUNCEMENT_MAX_WIDTH = 640

interface AnnouncementCardProps {
  announcement: Announcement
  /** Home's: the body cut to a few lines, a smaller title. */
  compact?: boolean
  /** The whole card opens something — Home's goes to Announcements. */
  onPress?: () => void
  /** The photo tapped: opened full screen. */
  onOpenImage?: (url: string) => void
  /** Who it went to, for an admin: "Public", "All members", "5 people". Else "Public" when it is. */
  audience?: string
  /** For an admin: when it is deleted. */
  expiry?: { text: string; past: boolean } | null
  onEdit?: () => void
  onDelete?: () => void
  /** Drawn at this width before it has measured itself: the composer's preview. */
  width?: number
  /** In place of its poster, before it is posted: the composer's preview. */
  author?: { name: string; photo?: string; title?: string }
}

/**
 * An announcement, as a card: its photo across the top — or, with none, a
 * band of the theme's colour — who posted it and when, its title and words.
 * For an admin, below a rule: who it went to, when it goes, and Edit and
 * Delete. One card for Announcements, its composer's preview, and Home.
 *
 * The photo spans the card at the height lib/announcementImage gives it — its
 * own proportions, or the height an admin chose, cropped never stretched — at
 * the width the card has, measured once it is laid out.
 */
export function AnnouncementCard({
  announcement: a,
  compact,
  onPress,
  onOpenImage,
  audience,
  expiry,
  onEdit,
  onDelete,
  width,
  author,
}: AnnouncementCardProps) {
  const colors = useThemeColors()
  const { width: screen } = useWindowDimensions()
  const [measured, setMeasured] = useState<number | null>(null)
  // The photo's width: the card's, inside its border.
  const cardWidth = (measured ?? width ?? Math.min(screen - 24, ANNOUNCEMENT_MAX_WIDTH)) - 2
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width)
    if (w > 0 && w !== measured) setMeasured(w)
  }

  // Who posted it, from the directory every account may read (stores/usersStore):
  // listened to while a card is shown — one listener however many cards.
  const named = !!author
  useEffect(() => {
    if (named) return
    useUsersStore.getState().subscribe()
    return () => useUsersStore.getState().unsubscribe()
  }, [named])
  const poster = useUsersStore((s) => s.users.find((u) => sameId(u.uid, a.by)))
  const by =
    author ??
    (poster?.displayName
      ? {
          name: poster.displayName,
          photo: (poster as { photoURL?: string }).photoURL,
          title: (poster as { title?: string }).title,
        }
      : null)

  const photo = a.attachment?.type === 'image' && a.attachment.url ? a.attachment.url : null
  const photoHeight = photo
    ? Math.min(cardImageHeight(a.attachment, cardWidth), compact ? 260 : Infinity)
    : 0
  const chip = audience ?? (a.isPublic ? 'Public' : null)
  const admin = !!(onEdit || onDelete || expiry)
  const paragraphs = a.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const card = (
    // The shadow on the outside, the clipping inside: a view that clips can't cast one on iOS.
    <View
      onLayout={onLayout}
      style={{
        borderRadius: 20,
        backgroundColor: colors.surface,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
    >
      <YStack
        borderRadius={20}
        overflow="hidden"
        borderWidth={1}
        borderColor={colors.border}
        backgroundColor={colors.surface}
      >
        {photo ? (
          // Tap to see it whole, where it can be zoomed and saved: a card's
          // photo may be cropped to the height an admin chose.
          <Pressable
            disabled={!onOpenImage}
            onPress={() => onOpenImage?.(photo)}
            accessibilityRole={onOpenImage ? 'imagebutton' : 'image'}
            accessibilityLabel={onOpenImage ? 'Open the photo' : a.title}
          >
            <Img
              src={photo}
              alt={a.title}
              style={{
                width: '100%',
                height: photoHeight,
                objectFit: 'cover',
                backgroundColor: colors.border,
                display: 'block',
              }}
            />
          </Pressable>
        ) : (
          <View style={{ height: 5, backgroundColor: colors.primary }} />
        )}

        <YStack padding={compact ? 16 : 20} gap={compact ? 10 : 12}>
          <XStack alignItems="center" gap={12}>
            {by ? (
              <Avatar uri={by.photo} displayName={by.name} size={40} />
            ) : (
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: colors.primary + '22',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Glyph d={MEGAPHONE} color={colors.primary} size={20} />
              </View>
            )}
            <YStack flex={1} gap={1}>
              <Text color={colors.text} fontSize={15} fontWeight="700" numberOfLines={1}>
                {by?.name ?? 'Announcement'}
              </Text>
              <Text color={colors.textMuted} fontSize={13} numberOfLines={1}>
                {[by?.title, postedWhen(a.ts), a.editedTs ? 'Edited' : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </YStack>
          </XStack>

          {/* Who it went to, over its title, as an event's card has "Open to everyone". */}
          <YStack gap={8}>
            {chip ? (
              <XStack
                alignSelf="flex-start"
                alignItems="center"
                gap={5}
                paddingHorizontal={10}
                paddingVertical={4}
                borderRadius={999}
                backgroundColor={colors.primary + '1f'}
              >
                <Glyph d={a.isPublic ? GLOBE : PEOPLE} color={colors.primary} size={12} />
                <Text color={colors.primary} fontSize={11} fontWeight="800" letterSpacing={0.6}>
                  {chip.toUpperCase()}
                </Text>
              </XStack>
            ) : null}
            <Text
              color={colors.text}
              fontSize={compact ? 18 : 21}
              lineHeight={compact ? 24 : 27}
              fontWeight="800"
              letterSpacing={-0.3}
            >
              {a.title}
            </Text>
          </YStack>

          {compact ? (
            <Text
              color={colors.text}
              opacity={0.85}
              fontSize={15}
              lineHeight={22}
              numberOfLines={4}
            >
              {/* Its paragraphs run together: cut short, it ends on "…", not a blank line. */}
              {a.body.replace(/\s*\n+\s*/g, ' ')}
            </Text>
          ) : (
            <YStack gap={10}>
              {paragraphs.map((p, i) => (
                <Text key={i} color={colors.text} opacity={0.88} fontSize={16} lineHeight={24}>
                  {p}
                </Text>
              ))}
            </YStack>
          )}

          {admin ? (
            <XStack
              borderTopWidth={1}
              borderTopColor={colors.border}
              paddingTop={12}
              marginTop={2}
              alignItems="center"
              gap={10}
              flexWrap="wrap"
            >
              <XStack flex={1} minWidth={160} alignItems="center" gap={6}>
                {expiry ? (
                  <>
                    <Glyph d={CLOCK} color={expiry.past ? DANGER : colors.textMuted} size={14} />
                    <Text
                      color={expiry.past ? DANGER : colors.textMuted}
                      fontSize={12}
                      fontWeight={expiry.past ? '700' : '500'}
                    >
                      {expiry.text}
                    </Text>
                  </>
                ) : (
                  <Text color={colors.textMuted} fontSize={12}>
                    Stays until removed
                  </Text>
                )}
              </XStack>
              <XStack gap={8}>
                {onEdit ? (
                  <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Edit">
                    <XStack
                      alignItems="center"
                      gap={6}
                      paddingHorizontal={12}
                      paddingVertical={7}
                      borderRadius={999}
                      borderWidth={1}
                      borderColor={colors.border}
                    >
                      <Glyph d={PENCIL} color={colors.text} size={14} />
                      <Text color={colors.text} fontSize={13} fontWeight="700">
                        Edit
                      </Text>
                    </XStack>
                  </Pressable>
                ) : null}
                {onDelete ? (
                  <Pressable
                    onPress={onDelete}
                    accessibilityRole="button"
                    accessibilityLabel="Delete"
                  >
                    <XStack
                      alignItems="center"
                      gap={6}
                      paddingHorizontal={12}
                      paddingVertical={7}
                      borderRadius={999}
                      backgroundColor={DANGER + '18'}
                    >
                      <Glyph d={TRASH} color={DANGER} size={14} />
                      <Text color={DANGER} fontSize={13} fontWeight="700">
                        Delete
                      </Text>
                    </XStack>
                  </Pressable>
                ) : null}
              </XStack>
            </XStack>
          ) : null}
        </YStack>
      </YStack>
    </View>
  )

  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a.title}>
      {card}
    </Pressable>
  ) : (
    card
  )
}
