import { useState, useEffect } from 'react'
import { TextInput as RNTextInput } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useConfigStore } from '@/stores/configStore'
import { useUsersStore } from '@/stores/usersStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { MemberPicker } from '@/features/admin/MemberPicker'
import type { CommonTeam } from '@/types/events'

export default function AdminTeams() {
  const { commonTeams, subscribe, unsubscribe } = useConfigStore()
  const { subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const { profile } = useAuthStore()
  const { toast } = useUIStore()
  const colors = useThemeColors()

  const [teams, setTeams] = useState<CommonTeam[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  useEffect(() => {
    subscribe()
    subUsers()
    return () => {
      unsubscribe()
      unsubUsers()
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTeams(commonTeams)
  }, [commonTeams])

  const saveTeams = async (updatedTeams: CommonTeam[]) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'config', 'main'), {
        COMMON_TEAMS: updatedTeams,
      })
      await audit(
        'teams.updated',
        `Updated common teams: ${updatedTeams.map((t) => t.name).join(', ')}`,
        profile?.displayName ?? ''
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save teams'
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleNameBlur = (index: number, value: string) => {
    const updated = [...teams]
    if (!value.trim()) {
      updated.splice(index, 1)
      if (expandedIdx === index) setExpandedIdx(null)
    } else {
      updated[index] = { ...updated[index], name: value.trim() }
    }
    setTeams(updated)
    saveTeams(updated)
  }

  const handleMembersChange = (index: number, members: string[]) => {
    const updated = teams.map((t, i) => (i === index ? { ...t, members } : t))
    setTeams(updated)
    saveTeams(updated)
  }

  const handleDelete = (index: number) => {
    const updated = teams.filter((_, i) => i !== index)
    if (expandedIdx === index) setExpandedIdx(null)
    setTeams(updated)
    saveTeams(updated)
  }

  const handleAdd = () => {
    if (!newTeamName.trim()) return
    const updated: CommonTeam[] = [...teams, { name: newTeamName.trim(), members: [] }]
    setTeams(updated)
    setNewTeamName('')
    setExpandedIdx(updated.length - 1)
    saveTeams(updated)
  }

  return (
    <YStack flex={1} padding="$4" gap="$3">
      <ScreenTitle options={{ title: 'Common Teams', headerShown: false }} />

      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$6" fontWeight="700">
          Common Teams
        </Text>
        {saving && <Spinner size="small" />}
      </XStack>

      <Text fontSize="$3" color="$gray10">
        Common teams are preset groups of people used when creating events.
      </Text>

      <FlashList
        data={teams}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => {
          const isExpanded = expandedIdx === index
          return (
            <YStack
              borderWidth={1}
              borderColor="$borderColor"
              borderRadius="$3"
              padding="$3"
              marginBottom="$2"
              gap="$2"
              backgroundColor="$background"
            >
              <XStack alignItems="center" gap="$2">
                <RNTextInput
                  value={item.name}
                  onChangeText={(v) => {
                    const updated = [...teams]
                    updated[index] = { ...updated[index], name: v }
                    setTeams(updated)
                  }}
                  onBlur={() => handleNameBlur(index, teams[index].name)}
                  style={{
                    flex: 1,
                    padding: 8,
                    fontSize: 15,
                    fontWeight: '600',
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 6,
                    backgroundColor: colors.surface,
                    color: colors.text,
                  }}
                />
                <Button
                  size="$2"
                  onPress={() => setExpandedIdx(isExpanded ? null : index)}
                >
                  {isExpanded ? 'Done' : `Members (${item.members.length})`}
                </Button>
                <Button size="$2" theme="red" onPress={() => handleDelete(index)}>
                  ×
                </Button>
              </XStack>

              {isExpanded && (
                <MemberPicker
                  selected={item.members}
                  onChange={(members) => handleMembersChange(index, members)}
                  label="Members"
                />
              )}
            </YStack>
          )
        }}
        ListEmptyComponent={
          <Text color="$gray10" paddingVertical="$2">
            No teams yet. Add one below.
          </Text>
        }
      />

      <XStack gap="$2" alignItems="center">
        <RNTextInput
          placeholder="New team name..."
          placeholderTextColor={colors.textMuted}
          value={newTeamName}
          onChangeText={setNewTeamName}
          onSubmitEditing={handleAdd}
          style={{
            flex: 1,
            padding: 10,
            fontSize: 15,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 6,
            backgroundColor: colors.surface,
            color: colors.text,
          }}
        />
        <Button size="$3" onPress={handleAdd} theme="active">
          Add
        </Button>
      </XStack>
    </YStack>
  )
}
