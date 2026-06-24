import { useEffect, useState } from 'react'
import { ScrollView, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { YStack, XStack, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useWorshipStore } from '@/stores/worshipStore'
import { useChordSheetsStore } from '@/stores/chordSheetsStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useUsersStore } from '@/stores/usersStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isWorship } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import { SetListFormModal } from '@/features/worship/SetListFormModal'
import { SetListDetailModal } from '@/features/worship/SetListDetailModal'
import { ChordSheetsTab } from '@/features/worship/ChordSheetsTab'
import { InputListTab } from '@/features/worship/InputListTab'
import type { SetList } from '@/types/worship'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

export default function WorshipScreen() {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''

  const { setLists, loading, subscribe, unsubscribe, createSetList, deleteSetList } =
    useWorshipStore()
  const { subscribe: subChords, unsubscribe: unsubChords } = useChordSheetsStore()
  const { templates, subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()
  const { users, subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const tasksStore = useTasksStore()
  const toast = useUIStore((s) => s.toast)

  const [activeTab, setActiveTab] = useState<'setlists' | 'chords' | 'inputs'>('setlists')
  const [showForm, setShowForm] = useState(false)
  const [detailSetList, setDetailSetList] = useState<SetList | null>(null)

  // Wait for Firebase Auth to confirm the user's identity before subscribing.
  // Starting Firestore listeners before auth is ready can cause silent
  // permission-denied failures that leave stores in an empty state.
  useEffect(() => {
    if (!uid) return
    subscribe()
    subChords()
    subEvents()
    subUsers()
    tasksStore.subscribe()
    return () => {
      unsubscribe()
      unsubChords()
      unsubEvents()
      unsubUsers()
      tasksStore.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  const worshipUsers = users.filter((u) => isWorship(u) && !u.roles?.includes('admin'))

  const handleSave = async (data: Omit<SetList, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const setListId = await createSetList(data)

      // Notify all worship users
      const sendNotif = httpsCallable(functions, 'sendNotification')
      worshipUsers.forEach((u) => {
        sendNotif({
          uid: String(u.uid),
          type: 'announcement',
          data: { title: 'New Set List', body: data.title },
        }).catch(() => {})
      })

      // Create acknowledge tasks for worship users assigned to the linked event
      if (data.eventTemplateId) {
        const evTemplate = templates.find((t) => sameId(t.id, data.eventTemplateId!))
        const evUsers = evTemplate?.users ?? []
        const assignedWorshipUsers = evUsers.length
          ? worshipUsers.filter((wu) => evUsers.some((eu) => sameId(eu, wu.uid)))
          : []

        for (const wu of assignedWorshipUsers) {
          await tasksStore.createTask({
            title: `Acknowledge set list: ${data.title}`,
            assignees: [String(wu.uid)],
            lead: String(wu.uid),
            by: String(uid),
            status: 'pending',
            evTemplateId: data.eventTemplateId,
            evDate: data.eventDate ?? null,
            taskType: 'worship_setlist_ack',
            setListId,
            dueDate: data.eventDate ?? null,
          })
        }
      }

      toast('Set list saved!', 'success')
      setShowForm(false)
    } catch {
      toast('Failed to save set list', 'error')
    }
  }

  const handleDelete = async (sl: SetList) => {
    try {
      await deleteSetList(sl.id)
      toast('Deleted', 'success')
    } catch {
      toast('Failed to delete', 'error')
    }
  }

  const sorted = [...setLists].sort((a, b) => {
    const aDate = a.eventDate ?? ''
    const bDate = b.eventDate ?? ''
    if (!aDate && !bDate) return 0
    if (!aDate) return 1
    if (!bDate) return -1
    return aDate < bDate ? 1 : aDate > bDate ? -1 : 0
  })

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Worship' }} />

      {/* Tab switcher */}
      <XStack
        paddingHorizontal="$3"
        paddingTop="$3"
        paddingBottom="$2"
        gap="$2"
      >
        <Pressable onPress={() => setActiveTab('setlists')}>
          <XStack
            backgroundColor={activeTab === 'setlists' ? colors.primary : colors.surface}
            borderRadius={99}
            borderWidth={1}
            borderColor={activeTab === 'setlists' ? colors.primary : colors.border}
            paddingHorizontal="$3"
            paddingVertical="$1"
          >
            <Text
              color={activeTab === 'setlists' ? 'white' : colors.textMuted}
              fontWeight={activeTab === 'setlists' ? '700' : '400'}
              fontSize="$3"
            >
              Set Lists
            </Text>
          </XStack>
        </Pressable>
        <Pressable onPress={() => setActiveTab('chords')}>
          <XStack
            backgroundColor={activeTab === 'chords' ? colors.primary : colors.surface}
            borderRadius={99}
            borderWidth={1}
            borderColor={activeTab === 'chords' ? colors.primary : colors.border}
            paddingHorizontal="$3"
            paddingVertical="$1"
          >
            <Text
              color={activeTab === 'chords' ? 'white' : colors.textMuted}
              fontWeight={activeTab === 'chords' ? '700' : '400'}
              fontSize="$3"
            >
              Chord Sheets
            </Text>
          </XStack>
        </Pressable>
        <Pressable onPress={() => setActiveTab('inputs')}>
          <XStack
            backgroundColor={activeTab === 'inputs' ? colors.primary : colors.surface}
            borderRadius={99}
            borderWidth={1}
            borderColor={activeTab === 'inputs' ? colors.primary : colors.border}
            paddingHorizontal="$3"
            paddingVertical="$1"
          >
            <Text
              color={activeTab === 'inputs' ? 'white' : colors.textMuted}
              fontWeight={activeTab === 'inputs' ? '700' : '400'}
              fontSize="$3"
            >
              Input List
            </Text>
          </XStack>
        </Pressable>
      </XStack>

      {activeTab === 'setlists' ? (
        <>
          {loading ? (
            <YStack flex={1} alignItems="center" justifyContent="center">
              <Text color={colors.textMuted}>Loading…</Text>
            </YStack>
          ) : sorted.length === 0 ? (
            <YStack flex={1} alignItems="center" justifyContent="center" padding="$4" gap="$4">
              <Text color={colors.textMuted} textAlign="center">
                No set lists yet.
              </Text>
              <Pressable
                onPress={() => setShowForm(true)}
                style={[styles.fab, { backgroundColor: colors.primary, position: 'relative', bottom: 0, right: 0 }]}
              >
                <Text color="white" fontWeight="700" fontSize="$3">⊕ New Set List</Text>
              </Pressable>
            </YStack>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
              <YStack padding="$3" gap="$3">
                {sorted.map((sl) => {
                  const evTemplate = sl.eventTemplateId
                    ? templates.find((t) => sameId(t.id, sl.eventTemplateId!))
                    : null
                  return (
                    <Pressable key={String(sl.id)} onPress={() => setDetailSetList(sl)}>
                      <YStack
                        backgroundColor={colors.surface}
                        borderRadius="$3"
                        padding="$3"
                        gap="$2"
                        borderWidth={1}
                        borderColor={colors.border}
                      >
                        <XStack justifyContent="space-between" alignItems="flex-start">
                          <YStack flex={1} gap="$1">
                            <Text color={colors.text} fontWeight="700" fontSize="$4">
                              {sl.title}
                            </Text>
                            {evTemplate ? (
                              <Text color={colors.primary} fontSize="$2">
                                📅 {evTemplate.title}
                                {sl.eventDate ? ` · ${sl.eventDate}` : ''}
                              </Text>
                            ) : sl.eventDate ? (
                              <Text color={colors.textMuted} fontSize="$2">
                                📅 {sl.eventDate}
                              </Text>
                            ) : null}
                            <Text color={colors.textMuted} fontSize="$2">
                              {sl.songs.length} song{sl.songs.length !== 1 ? 's' : ''}
                            </Text>
                          </YStack>
                          <Pressable onPress={() => handleDelete(sl)}>
                            <XStack
                              backgroundColor="#c0392b18"
                              borderRadius="$2"
                              paddingHorizontal="$2"
                              paddingVertical="$1"
                            >
                              <Text color="#c0392b" fontSize="$2">
                                Delete
                              </Text>
                            </XStack>
                          </Pressable>
                        </XStack>

                        {sl.songs.length > 0 ? (
                          <XStack flexWrap="wrap" gap="$1">
                            {sl.songs.slice(0, 5).map((song) => (
                              <XStack
                                key={song.id}
                                backgroundColor={colors.primary + '18'}
                                borderRadius="$4"
                                paddingHorizontal="$2"
                                paddingVertical="$0.5"
                              >
                                <Text color={colors.primary} fontSize="$1">
                                  {song.name || '—'}
                                  {song.key ? ` (${song.key})` : ''}
                                </Text>
                              </XStack>
                            ))}
                            {sl.songs.length > 5 ? (
                              <XStack
                                backgroundColor={colors.primary + '18'}
                                borderRadius="$4"
                                paddingHorizontal="$2"
                                paddingVertical="$0.5"
                              >
                                <Text color={colors.primary} fontSize="$1">
                                  +{sl.songs.length - 5} more
                                </Text>
                              </XStack>
                            ) : null}
                          </XStack>
                        ) : null}
                      </YStack>
                    </Pressable>
                  )
                })}
              </YStack>
            </ScrollView>
          )}

          <Pressable
            onPress={() => setShowForm(true)}
            style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 16 }]}
          >
            <Text color="white" fontWeight="700" fontSize="$3">
              ⊕ New Set List
            </Text>
          </Pressable>

          <SetListFormModal
            visible={showForm}
            onClose={() => setShowForm(false)}
            onSave={handleSave}
            createdBy={uid}
          />

          <SetListDetailModal setList={detailSetList} onClose={() => setDetailSetList(null)} />
        </>
      ) : activeTab === 'chords' ? (
        <ChordSheetsTab createdBy={uid} />
      ) : (
        <InputListTab />
      )}
    </YStack>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
})
