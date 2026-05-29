import { Tabs, Redirect } from 'expo-router'
import { Platform, View, Pressable, Modal, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { visibleTabs } from '@/lib/roles'
import { useThemeColors } from '@/theme/useThemeColors'
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
  music: 'Content',
  posts: 'Posts',
  giving: 'Giving',
  story: 'Our Story',
  connect: 'Connect',
  rolehub: 'Role-Specific',
  settings: 'Settings',
}

function ReportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useThemeColors()
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    if (!text.trim()) return
    // TODO: wire to securityStore / Firestore
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
            <Text color={colors.text} fontSize="$5" fontWeight="700">Report a Concern</Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4">✕</Text>
            </Pressable>
          </XStack>
          <Text color={colors.textMuted} fontSize="$3">
            Describe your concern and someone from the security team will follow up.
          </Text>
          {submitted ? (
            <YStack alignItems="center" padding="$3">
              <Text color={colors.primary} fontSize="$4" fontWeight="700">Submitted ✓</Text>
            </YStack>
          ) : (
            <>
              <TextInput
                style={[
                  styles.reportInput,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
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
                  <Text color="white" fontWeight="700" fontSize="$3">Submit Report</Text>
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
  const { theme, mode } = useThemeStore()
  const colors = useThemeColors()
  const [reportOpen, setReportOpen] = useState(false)

  if (loading) return null
  if (!profile) return <Redirect href="/(auth)/login" />

  const tabs = visibleTabs(profile)
  const isWeb = Platform.OS === 'web'
  const showReportButton = !tabs.includes('security')

  const bg = mode === 'dark' ? theme.dark.background : theme.light.background
  const text = mode === 'dark' ? theme.dark.text : theme.light.text
  const border = mode === 'dark' ? theme.dark.border : theme.light.border

  return (
    <View style={{ flex: 1 }}>
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

      {showReportButton ? (
        <Pressable
          onPress={() => setReportOpen(true)}
          style={[styles.reportFab, { backgroundColor: theme.primary }]}
        >
          <Text color="white" fontSize="$2" fontWeight="700">⚑ Report</Text>
        </Pressable>
      ) : null}

      <ReportModal visible={reportOpen} onClose={() => setReportOpen(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  reportFab: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
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
