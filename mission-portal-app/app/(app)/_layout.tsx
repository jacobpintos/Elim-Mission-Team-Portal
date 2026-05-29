import { Tabs, Redirect } from 'expo-router'
import { Platform } from 'react-native'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { visibleTabs } from '@/lib/roles'
import type { Tab } from '@/lib/roles'

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
}

export default function AppLayout() {
  const { profile, loading } = useAuthStore()
  const { theme, mode } = useThemeStore()

  if (loading) return null
  if (!profile) return <Redirect href="/(auth)/login" />

  const tabs = visibleTabs(profile)
  const isWeb = Platform.OS === 'web'

  const bg = mode === 'dark' ? theme.dark.background : theme.light.background
  const text = mode === 'dark' ? theme.dark.text : theme.light.text
  const border = mode === 'dark' ? theme.dark.border : theme.light.border

  return (
    <Tabs
      screenOptions={{
        tabBarPosition: isWeb ? 'top' : 'bottom',
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: mode === 'dark' ? theme.dark.textMuted : theme.light.textMuted,
        tabBarStyle: {
          backgroundColor: bg,
          borderTopColor: border,
          borderBottomColor: border,
        },
        headerStyle: { backgroundColor: bg },
        headerTintColor: text,
        sceneStyle: { backgroundColor: bg },
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
      {/* Sub-routes that are not top-level tabs */}
      <Tabs.Screen name="events/index" options={{ href: null }} />
      <Tabs.Screen name="events/[id]" options={{ href: null }} />
      <Tabs.Screen name="messages/index" options={{ href: null }} />
      <Tabs.Screen name="messages/[threadId]" options={{ href: null }} />
      <Tabs.Screen name="issues/index" options={{ href: null }} />
      <Tabs.Screen name="issues/[id]" options={{ href: null }} />
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
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  )
}
