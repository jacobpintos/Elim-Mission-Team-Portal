import { useState, useEffect } from 'react'
import { TextInput as RNTextInput } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Stack } from 'expo-router'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useConfigStore } from '@/stores/configStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { useUIStore } from '@/stores/uiStore'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

export default function AdminTeams() {
  const { commonTeams, subscribe, unsubscribe } = useConfigStore()
  const { profile } = useAuthStore()
  const { toast } = useUIStore()

  const [teams, setTeams] = useState<string[]>([])
  const [newTeam, setNewTeam] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTeams(commonTeams)
  }, [commonTeams])

  const saveTeams = async (updatedTeams: string[]) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'config', 'main'), {
        COMMON_TEAMS: updatedTeams,
      })
      await audit(
        'teams.updated',
        `Updated common teams: ${updatedTeams.join(', ')}`,
        profile?.displayName ?? ''
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save teams'
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleBlur = (index: number, value: string) => {
    const updated = [...teams]
    if (!value.trim()) {
      updated.splice(index, 1)
    } else {
      updated[index] = value.trim()
    }
    setTeams(updated)
    saveTeams(updated)
  }

  const handleDelete = (index: number) => {
    const updated = teams.filter((_, i) => i !== index)
    setTeams(updated)
    saveTeams(updated)
  }

  const handleAdd = () => {
    if (!newTeam.trim()) return
    const updated = [...teams, newTeam.trim()]
    setTeams(updated)
    setNewTeam('')
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
        Edit team names inline. Changes save automatically on blur.
      </Text>

      <FlashList
        data={teams}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <XStack
            alignItems="center"
            gap="$2"
            paddingVertical="$1"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <RNTextInput
              value={item}
              onChangeText={(v) => {
                const updated = [...teams]
                updated[index] = v
                setTeams(updated)
              }}
              onBlur={() => handleBlur(index, teams[index])}
              style={{
                flex: 1,
                padding: 8,
                fontSize: 15,
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 6,
                backgroundColor: 'white',
              }}
            />
            <Button
              size="$2"
              onPress={() => handleDelete(index)}
              theme="red"
            >
              ×
            </Button>
          </XStack>
        )}
        ListEmptyComponent={
          <Text color="$gray10" paddingVertical="$2">
            No teams yet. Add one below.
          </Text>
        }
      />

      <XStack gap="$2" alignItems="center">
        <RNTextInput
          placeholder="New team name..."
          value={newTeam}
          onChangeText={setNewTeam}
          onSubmitEditing={handleAdd}
          style={{
            flex: 1,
            padding: 10,
            fontSize: 15,
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 6,
            backgroundColor: 'white',
          }}
        />
        <Button size="$3" onPress={handleAdd} theme="active">
          Add
        </Button>
      </XStack>
    </YStack>
  )
}
