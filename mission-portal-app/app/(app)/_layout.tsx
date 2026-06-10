import { Tabs, Redirect, usePathname, useRouter } from 'expo-router'
import { ScrollView, View, Pressable, StyleSheet, Animated, Platform } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useState, useEffect, useMemo } from 'react'
import { getDocs, collection } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { allInstances, todayStr } from '@/lib/events'
import type { EventTemplate } from '@/types/events'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useUsersStore } from '@/stores/usersStore'
import { useSecurityStore } from '@/stores/securityStore'
import { useUIStore } from '@/stores/uiStore'
import { visibleTabs, isSecurity, isPublic, hasRole } from '@/lib/roles'
import { useThemeColors } from '@/theme/useThemeColors'
import { AppLogo } from '@/components/ui/AppLogo'
import { ReportFormModal } from '@/features/security/ReportFormModal'
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

export default function AppLayout() {
  const { profile, loading, signOutNow } = useAuthStore()
  const { theme } = useThemeStore()
  const colors = useThemeColors()
  const pathname = usePathname()
  const router = useRouter()
  const [reportOpen, setReportOpen] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [hasPublicEventToday, setHasPublicEventToday] = useState(false)
  const { subscribe: subUsers, unsubscribe: unsubUsers, users } = useUsersStore()
  const { createReport } = useSecurityStore()
  const toast = useUIStore((s) => s.toast)
  const viewAsPublic = useUIStore((s) => s.viewAsPublic)
  const setViewAsPublic = useUIStore((s) => s.setViewAsPublic)

  // Drawer + content animation (must be before early returns)
  const drawerX = useMemo(() => new Animated.Value(-DRAWER_W), [])
  const contentX = useMemo(() => new Animated.Value(0), [])

  // Stable reference required: Tabs processes screenOptions in useLayoutEffect.
  // A new inline object every render fires that effect → setState → re-render → loop.
  const tabScreenOptions = useMemo(() => ({
    headerShown: false,
    tabBarStyle: { display: 'none' as const, height: 0 },
    tabBarActiveTintColor: theme.primary,
    sceneStyle: { backgroundColor: colors.background },
  }), [theme.primary, colors.background])

  const drawerAnim = { transform: [{ translateX: drawerX }] }
  const contentAnim = { transform: [{ translateX: contentX }], flex: 1 as const, zIndex: 1 as const }

  useEffect(() => {
    if (isPublic(profile)) return
    subUsers()
    return () => unsubUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!profile || !isPublic(profile)) return
    const today = todayStr()
    getDocs(collection(db, 'events'))
      .then((snap) => {
        const templates = snap.docs.map((d) => ({ ...(d.data() as EventTemplate), id: d.id }))
        const todayEvents = allInstances(templates, {}, today, today)
        setHasPublicEventToday(todayEvents.some((ev) => ev.isPublic))
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return null
  if (!profile) return <Redirect href="/(auth)/login" />

  // Non-public members can preview public view; always resets to false on login (store starts false)
  const isMemberUser = !isPublic(profile) || profile.roles.length > 1
  const effectiveProfile =
    viewAsPublic && isMemberUser
      ? { ...profile, roles: ['public' as const] }
      : profile

  const tabs = visibleTabs(effectiveProfile)

  // Unverified users who completed onboarding are awaiting role assignment — show holding screen
  if (tabs.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 20,
            fontWeight: '700',
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          Account Pending
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 14,
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: 32,
          }}
        >
          Your account is awaiting role assignment by an admin.{'\n'}You&apos;ll be notified once
          access is granted.
        </Text>
        <Pressable
          onPress={() => signOutNow()}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 24,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Sign out</Text>
        </Pressable>
      </View>
    )
  }

  // Block direct URL access to unauthorized routes (href:null only hides the tab, doesn't block navigation)
  // 'admin/*' screens are owned by the 'rolehub' tab — allow them when rolehub is accessible
  // 'posts/*' screens are owned by the 'public' tab for members; non-members have 'posts' directly
  const SUB_ROUTE_OWNERS: Partial<Record<string, Tab>> = { admin: 'rolehub', posts: 'public' }
  const pathSeg = pathname.split('/').filter(Boolean)[0] ?? ''
  const owner = SUB_ROUTE_OWNERS[pathSeg]
  const allowed = tabs.includes(pathSeg as Tab) || (!!owner && tabs.includes(owner))
  if (pathSeg && pathSeg !== 'profile' && !allowed) {
    return <Redirect href={`/${tabs[0]}`} />
  }

  const showReportButton = !isPublic(effectiveProfile) || hasPublicEventToday

  const securityUsers = users.filter((u) => isSecurity(u))

  const handleReportSubmit = async (data: {
    description: string
    location: string
    witnesses: string
    photoFile: File | null
  }) => {
    try {
      await createReport(
        {
          description: data.description,
          location: data.location,
          witnesses: data.witnesses,
          reportedBy: String(profile?.uid ?? ''),
          reporterName: profile?.displayName ?? 'Unknown',
        },
        data.photoFile
      )
      const sendNotif = httpsCallable(functions, 'sendNotification')
      securityUsers.forEach((u) => {
        sendNotif({
          uid: String(u.uid),
          type: 'announcement',
          data: {
            title: '🚨 Security Report',
            body: `New incident at ${data.location}: ${data.description.slice(0, 80)}${data.description.length > 80 ? '…' : ''}`,
          },
        }).catch(() => {})
      })
      toast('Report submitted', 'success')
      setReportOpen(false)
    } catch {
      toast('Failed to submit report', 'error')
    }
  }

  // Determine current screen title from pathname
  const firstSeg = pathname.split('/').filter(Boolean)[0] as Tab | undefined
  const currentTitle = firstSeg && firstSeg in TAB_LABELS ? TAB_LABELS[firstSeg as Tab] : 'Menu'

  function openDrawer() {
    setIsOpen(true)
    Animated.parallel([
      Animated.timing(drawerX, { toValue: 0, duration: 260, useNativeDriver: false }),
      Animated.timing(contentX, { toValue: DRAWER_W, duration: 260, useNativeDriver: false }),
    ]).start()
  }

  function closeDrawer() {
    Animated.parallel([
      Animated.timing(drawerX, { toValue: -DRAWER_W, duration: 260, useNativeDriver: false }),
      Animated.timing(contentX, { toValue: 0, duration: 260, useNativeDriver: false }),
    ]).start(({ finished }) => {
      if (finished) setIsOpen(false)
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

          {/* Public view toggle for non-public members */}
          {isMemberUser && (
            <Pressable
              onPress={() => {
                closeDrawer()
                setViewAsPublic(!viewAsPublic)
                router.push('/home')
              }}
            >
              <XStack
                padding="$4"
                gap="$3"
                alignItems="center"
                borderTopWidth={1}
                borderTopColor={colors.border}
                backgroundColor={viewAsPublic ? colors.primary + '22' : 'transparent'}
              >
                <Text fontSize={14}>{viewAsPublic ? '↩' : '🌐'}</Text>
                <Text color={viewAsPublic ? colors.primary : colors.textMuted} fontSize="$3">
                  {viewAsPublic ? 'Back to Member View' : 'Preview Public View'}
                </Text>
              </XStack>
            </Pressable>
          )}

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
          <Tabs screenOptions={tabScreenOptions}>
            {/* On web, Tabs.Screen children call navigation.setOptions() in useLayoutEffect.
                Every back-navigation changes the Tabs navigation state, re-firing all those
                effects with freshly created options objects → infinite update loop (error #185).
                Routes work via file-system routing on web, so these registrations are unnecessary. */}
            {Platform.OS !== 'web' && (Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
              <Tabs.Screen
                key={tab}
                name={tab}
                options={{
                  title: TAB_LABELS[tab],
                  href: tabs.includes(tab) ? undefined : null,
                }}
              />
            ))}
            {Platform.OS !== 'web' && (
              <>
                {/* Sub-routes hidden from tab bar */}
                <Tabs.Screen name="events/[id]" options={{ href: null }} />
                <Tabs.Screen name="messages/[threadId]" options={{ href: null }} />
                <Tabs.Screen name="issues/[id]" options={{ href: null }} />
                <Tabs.Screen name="issues/kaizen" options={{ href: null }} />
                <Tabs.Screen name="issues/planning" options={{ href: null }} />
                <Tabs.Screen name="pages/[slug]" options={{ href: null }} />
                <Tabs.Screen name="pages/our-story" options={{ href: null }} />
                <Tabs.Screen name="pages/connect" options={{ href: null }} />
                <Tabs.Screen name="pages/giving" options={{ href: null }} />
                <Tabs.Screen name="admin/users" options={{ href: null }} />
                <Tabs.Screen name="admin/avail" options={{ href: null }} />
                <Tabs.Screen name="admin/groups" options={{ href: null }} />
                <Tabs.Screen name="admin/teams" options={{ href: null }} />
                <Tabs.Screen name="admin/templates" options={{ href: null }} />
                <Tabs.Screen name="admin/theme" options={{ href: null }} />
                <Tabs.Screen name="admin/analytics" options={{ href: null }} />
                <Tabs.Screen name="admin/audit" options={{ href: null }} />
                <Tabs.Screen name="admin/digests" options={{ href: null }} />
                <Tabs.Screen name="admin/leadership" options={{ href: null }} />
                <Tabs.Screen name="public/posts" options={{ href: null }} />
                <Tabs.Screen name="posts/[pageId]" options={{ href: null }} />
                <Tabs.Screen name="public/connect" options={{ href: null }} />
                <Tabs.Screen name="public/giving" options={{ href: null }} />
                <Tabs.Screen name="public/story" options={{ href: null }} />
                <Tabs.Screen name="public/music" options={{ href: null }} />
                <Tabs.Screen name="public/photos" options={{ href: null }} />
                <Tabs.Screen name="rolehub/inventory" options={{ href: null }} />
                <Tabs.Screen name="rolehub/worship" options={{ href: null }} />
                <Tabs.Screen name="rolehub/admin" options={{ href: null }} />
                <Tabs.Screen name="profile" options={{ href: null }} />
              </>
            )}
          </Tabs>
        </View>
      </Animated.View>

      {/* Backdrop — tap anywhere to close drawer */}
      {isOpen ? (
        <Pressable onPress={closeDrawer} style={[StyleSheet.absoluteFill, { zIndex: 10 }]} />
      ) : null}

      <ReportFormModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmit={handleReportSubmit}
      />
    </View>
  )
}
