import { Tabs, Redirect, usePathname, useRouter } from 'expo-router'
import { ScrollView, View, Pressable, Modal, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useState, useEffect } from 'react'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useUsersStore } from '@/stores/usersStore'
import { visibleTabs } from '@/lib/roles'
import { useThemeColors } from '@/theme/useThemeColors'
import { AppLogo } from '@/components/ui/AppLogo'
import type { Tab } from '@/lib/roles'

const DRAWER_W = 260

const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard',
  home: 'Home',
  events: 'Events',
  assignments: 'Assignments',
  messages: 'Messages',
  issues: 'Operations',
  security: 'Security',
  inventory: 'Inventory',
  announce: 'Announcements',
  worship: 'Worship',
  admin: 'Admin',
  public: 'Public Facing',
  music: 'Content',
  posts: 'Posts',
  giving: 'Giving',
  story: 'Our Story',
  connect: 'Connect',
  rolehub: 'Role-Specific',
  settings: 'Settings',
}

const TAB_ICONS: Record<Tab, string> = {
  dashboard: '📊',
  home: '🏠',
  events: '📅',
  assignments: '✅',
  messages: '💬',
  issues: '⚠',
  security: '🔒',
  inventory: '📦',
  announce: '📢',
  worship: '🎵',
  admin: '⚙',
  public: '🌐',
  music: '🎶',
  posts: '📝',
  giving: '💝',
  story: '📖',
  connect: '🤝',
  rolehub: '🏷',
  settings: '⚙',
}

// Vertical bar + three horizontal bars — clearly a menu icon
function MenuIcon({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 2, height: 20, backgroundColor: color, borderRadius: 1 }} />
      <View style={{ gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 18, height: 2, backgroundColor: color, borderRadius: 1 }} />
        ))}
      </View>
    </View>
  )
}

function ReportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useThemeColors()
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    if (!text.trim()) return
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setText('')
      onClose()
    }, 1500)
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$5"
          gap="$3"
          width="90%"
          maxWidth={480}
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={colors.text} fontSize="$5" fontWeight="700">
              Report a Concern
            </Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4">
                ✕
              </Text>
            </Pressable>
          </XStack>
          <Text color={colors.textMuted} fontSize="$3">
            Describe your concern and someone from the security team will follow up.
          </Text>
          {submitted ? (
            <YStack alignItems="center" padding="$3">
              <Text color={colors.primary} fontSize="$4" fontWeight="700">
                Submitted ✓
              </Text>
            </YStack>
          ) : (
            <>
              <TextInput
                style={[
                  styles.reportInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
                value={text}
                onChangeText={setText}
                placeholder="Describe the concern…"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
              />
              <Pressable onPress={handleSubmit} disabled={!text.trim()}>
                <XStack
                  backgroundColor={colors.primary}
                  borderRadius="$2"
                  paddingHorizontal="$4"
                  paddingVertical="$2"
                  justifyContent="center"
                  opacity={text.trim() ? 1 : 0.5}
                >
                  <Text color="white" fontWeight="700" fontSize="$3">
                    Submit Report
                  </Text>
                </XStack>
              </Pressable>
            </>
          )}
        </YStack>
      </View>
    </Modal>
  )
}

export default function AppLayout() {
  const { profile, loading } = useAuthStore()
  const { theme } = useThemeStore()
  const colors = useThemeColors()
  const pathname = usePathname()
  const router = useRouter()
  const [reportOpen, setReportOpen] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const { subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()

  // Drawer + content animation (must be before early returns)
  const drawerX = useSharedValue(-DRAWER_W)
  const contentX = useSharedValue(0)

  const drawerAnim = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerX.value }],
  }))
  const contentAnim = useAnimatedStyle(() => ({
    transform: [{ translateX: contentX.value }],
    flex: 1,
    zIndex: 1,
  }))

  useEffect(() => {
    subUsers()
    return () => unsubUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return null
  if (!profile) return <Redirect href="/(auth)/login" />

  const tabs = visibleTabs(profile)
  const showReportButton = !tabs.includes('security')

  // Determine current screen title from pathname
  const firstSeg = pathname.split('/').filter(Boolean)[0] as Tab | undefined
  const currentTitle = firstSeg && firstSeg in TAB_LABELS ? TAB_LABELS[firstSeg as Tab] : 'Menu'

  function openDrawer() {
    setIsOpen(true)
    // eslint-disable-next-line react-hooks/immutability
    drawerX.value = withTiming(0, { duration: 260 })
    // eslint-disable-next-line react-hooks/immutability
    contentX.value = withTiming(DRAWER_W, { duration: 260 })
  }

  function closeDrawer() {
    // eslint-disable-next-line react-hooks/immutability
    drawerX.value = withTiming(-DRAWER_W, { duration: 260 })
    // eslint-disable-next-line react-hooks/immutability
    contentX.value = withTiming(0, { duration: 260 }, (done) => {
      'worklet'
      if (done) runOnJS(setIsOpen)(false)
    })
  }

  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: colors.background }}>
      {/* Drawer panel — slides in from left, always rendered */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: DRAWER_W,
            backgroundColor: colors.background,
            borderRightWidth: 1,
            borderRightColor: colors.border,
            zIndex: 20,
          },
          drawerAnim,
        ]}
      >
        <YStack flex={1}>
          {/* Logo header */}
          <YStack
            padding="$4"
            paddingTop="$6"
            borderBottomWidth={1}
            borderBottomColor={colors.border}
            alignItems="center"
          >
            <AppLogo size="sm" showSlogan={false} />
          </YStack>

          {/* Nav items */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <YStack paddingVertical="$2">
              {tabs.map((tab) => {
                const isActive = pathname === `/${tab}` || pathname.startsWith(`/${tab}/`)
                return (
                  <Pressable
                    key={tab}
                    onPress={() => {
                      closeDrawer()
                      router.push(`/${tab}`)
                    }}
                  >
                    <XStack
                      paddingHorizontal="$4"
                      paddingVertical="$3"
                      gap="$3"
                      alignItems="center"
                      backgroundColor={isActive ? colors.primary + '22' : 'transparent'}
                      borderLeftWidth={3}
                      borderLeftColor={isActive ? colors.primary : 'transparent'}
                    >
                      <Text fontSize={16}>{TAB_ICONS[tab]}</Text>
                      <Text
                        color={isActive ? colors.primary : colors.text}
                        fontWeight={isActive ? '700' : '400'}
                        fontSize="$3"
                      >
                        {TAB_LABELS[tab]}
                      </Text>
                    </XStack>
                  </Pressable>
                )
              })}

              {/* Profile */}
              <Pressable
                onPress={() => {
                  closeDrawer()
                  router.push('/profile')
                }}
              >
                <XStack
                  paddingHorizontal="$4"
                  paddingVertical="$3"
                  gap="$3"
                  alignItems="center"
                  backgroundColor={pathname === '/profile' ? colors.primary + '22' : 'transparent'}
                  borderLeftWidth={3}
                  borderLeftColor={pathname === '/profile' ? colors.primary : 'transparent'}
                >
                  <Text fontSize={16}>👤</Text>
                  <Text
                    color={pathname === '/profile' ? colors.primary : colors.text}
                    fontWeight={pathname === '/profile' ? '700' : '400'}
                    fontSize="$3"
                  >
                    Profile
                  </Text>
                </XStack>
              </Pressable>
            </YStack>
          </ScrollView>

          {/* Report a Concern */}
          {showReportButton ? (
            <Pressable
              onPress={() => {
                closeDrawer()
                setReportOpen(true)
              }}
            >
              <XStack
                padding="$4"
                gap="$3"
                alignItems="center"
                borderTopWidth={1}
                borderTopColor={colors.border}
              >
                <Text fontSize={14}>⚑</Text>
                <Text color={colors.textMuted} fontSize="$3">
                  Report a Concern
                </Text>
              </XStack>
            </Pressable>
          ) : null}
        </YStack>
      </Animated.View>

      {/* Content area — shifts right when drawer opens */}
      <Animated.View style={contentAnim}>
        {/* Custom header bar */}
        <View
          style={{
            backgroundColor: colors.background,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <Pressable onPress={openDrawer} style={{ padding: 4 }}>
            <MenuIcon color={colors.text} />
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', flex: 1 }}>
            {currentTitle}
          </Text>
        </View>

        {/* Tabs with hidden bar — handles all routing */}
        <View style={{ flex: 1 }}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none', height: 0 },
              tabBarActiveTintColor: theme.primary,
              sceneStyle: { backgroundColor: colors.background },
            }}
          >
            {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
              <Tabs.Screen
                key={tab}
                name={tab}
                options={{
                  title: TAB_LABELS[tab],
                  href: tabs.includes(tab) ? undefined : null,
                }}
              />
            ))}
            {/* Sub-routes hidden from tab bar */}
            <Tabs.Screen name="events/index" options={{ href: null }} />
            <Tabs.Screen name="events/[id]" options={{ href: null }} />
            <Tabs.Screen name="messages/index" options={{ href: null }} />
            <Tabs.Screen name="messages/[threadId]" options={{ href: null }} />
            <Tabs.Screen name="issues/index" options={{ href: null }} />
            <Tabs.Screen name="issues/[id]" options={{ href: null }} />
            <Tabs.Screen name="issues/kaizen" options={{ href: null }} />
            <Tabs.Screen name="issues/planning" options={{ href: null }} />
            <Tabs.Screen name="pages/[slug]" options={{ href: null }} />
            <Tabs.Screen name="pages/our-story" options={{ href: null }} />
            <Tabs.Screen name="pages/connect" options={{ href: null }} />
            <Tabs.Screen name="pages/giving" options={{ href: null }} />
            <Tabs.Screen name="posts" options={{ href: null }} />
            <Tabs.Screen name="admin/index" options={{ href: null }} />
            <Tabs.Screen name="admin/users" options={{ href: null }} />
            <Tabs.Screen name="admin/groups" options={{ href: null }} />
            <Tabs.Screen name="admin/teams" options={{ href: null }} />
            <Tabs.Screen name="admin/templates" options={{ href: null }} />
            <Tabs.Screen name="admin/theme" options={{ href: null }} />
            <Tabs.Screen name="admin/audit" options={{ href: null }} />
            <Tabs.Screen name="admin/digests" options={{ href: null }} />
            <Tabs.Screen name="admin/leadership" options={{ href: null }} />
            <Tabs.Screen name="public/index" options={{ href: null }} />
            <Tabs.Screen name="public/posts" options={{ href: null }} />
            <Tabs.Screen name="public/connect" options={{ href: null }} />
            <Tabs.Screen name="public/giving" options={{ href: null }} />
            <Tabs.Screen name="public/story" options={{ href: null }} />
            <Tabs.Screen name="public/music" options={{ href: null }} />
            <Tabs.Screen name="rolehub/index" options={{ href: null }} />
            <Tabs.Screen name="rolehub/inventory" options={{ href: null }} />
            <Tabs.Screen name="rolehub/worship" options={{ href: null }} />
            <Tabs.Screen name="rolehub/admin" options={{ href: null }} />
            <Tabs.Screen name="profile" options={{ href: null }} />
          </Tabs>
        </View>
      </Animated.View>

      {/* Backdrop — tap anywhere to close drawer */}
      {isOpen ? (
        <Pressable onPress={closeDrawer} style={[StyleSheet.absoluteFill, { zIndex: 10 }]} />
      ) : null}

      <ReportModal visible={reportOpen} onClose={() => setReportOpen(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
  },
})
