import { ScrollView, Pressable } from 'react-native'
import { useRouter, usePathname } from 'expo-router'
import { XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useAuthStore } from '@/stores/authStore'
import { canUseMessages, isAdmin } from '@/lib/roles'
import type { UserProfile } from '@/types/user'

/**
 * The bar across the top of the Inbox.
 *
 * Announcements and messages were separate tabs, which meant two places to
 * look for "has anyone said anything to me". They are one tab now, split by
 * these. Someone without messages — an intern, a public follower — has nothing
 * to switch between, so the bar does not render at all and the tab stays the
 * plain Announcements screen it was.
 *
 * Moderation sits here for admins rather than in the admin area, because what
 * it moderates is the conversations one tab over.
 */
export type InboxSection = 'announce' | 'messages' | 'moderation'

/**
 * What the combined tab is called.
 *
 * Someone with only announcements sees the tab they always saw. Once messages
 * join it, neither half's name describes the whole, so it takes a name that
 * covers both. Single definition so the drawer, the header and the tab bar
 * cannot drift.
 */
export const INBOX_LABEL = 'Inbox'
export const ANNOUNCE_ONLY_LABEL = 'Announcements'

export function INBOX_TITLE(profile: UserProfile | null): string {
  return canUseMessages(profile) ? INBOX_LABEL : ANNOUNCE_ONLY_LABEL
}

interface InboxTab {
  key: InboxSection
  label: string
  path: string
}

export function InboxTabs({ active }: { active: InboxSection }) {
  const colors = useThemeColors()
  const router = useRouter()
  const pathname = usePathname()
  const { profile } = useAuthStore()

  if (!canUseMessages(profile)) return null

  const tabs: InboxTab[] = [
    { key: 'announce', label: 'Announcements', path: '/(app)/announce' },
    { key: 'messages', label: 'Messages', path: '/(app)/messages' },
    ...(isAdmin(profile)
      ? [{ key: 'moderation' as const, label: 'Moderation', path: '/(app)/messages/moderation' }]
      : []),
  ]

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border }}
      contentContainerStyle={{ paddingHorizontal: 8 }}
    >
      <XStack>
        {tabs.map((tab) => {
          const isActive = tab.key === active
          return (
            <Pressable
              key={tab.key}
              onPress={() => {
                // Already here — a second tap should do nothing rather than
                // push a duplicate route onto the stack.
                if (isActive || pathname === tab.path) return
                router.push(tab.path as never)
              }}
            >
              <XStack
                paddingHorizontal={14}
                paddingVertical={12}
                borderBottomWidth={isActive ? 2 : 0}
                borderBottomColor={isActive ? colors.primary : 'transparent'}
              >
                <Text
                  fontSize="$3"
                  fontWeight={isActive ? '700' : '400'}
                  color={isActive ? colors.text : colors.textMuted}
                >
                  {tab.label}
                </Text>
              </XStack>
            </Pressable>
          )
        })}
      </XStack>
    </ScrollView>
  )
}
