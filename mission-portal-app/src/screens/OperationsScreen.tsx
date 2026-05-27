import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useAuthStore } from '@/stores/authStore'
import { isAdmin } from '@/lib/roles'
import { useThemeColors } from '@/theme/useThemeColors'
import IssuesScreen from '@/screens/IssuesScreen'
import KaizenScreen from '@/screens/KaizenScreen'
import PlanningScreen from '@/screens/PlanningScreen'

type SubTab = 'issues' | 'kaizen' | 'planning'

export default function OperationsScreen() {
  const { profile } = useAuthStore()
  const colors = useThemeColors()
  const [activeTab, setActiveTab] = useState<SubTab>('issues')
  const admin = isAdmin(profile)

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'issues', label: 'Production Issues' },
    { id: 'kaizen', label: 'Kaizen Board' },
    ...(admin ? [{ id: 'planning' as SubTab, label: 'Planning' }] : []),
  ]

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tab,
              activeTab === tab.id && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab.id ? colors.primary : colors.textMuted },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.content}>
        {activeTab === 'issues'   && <IssuesScreen />}
        {activeTab === 'kaizen'   && <KaizenScreen />}
        {activeTab === 'planning' && admin && <PlanningScreen />}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: { fontSize: 13, fontWeight: '600' },
  content: { flex: 1 },
})
