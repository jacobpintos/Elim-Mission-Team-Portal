import { useEffect, useState } from 'react'
import { ScrollView, Pressable, TextInput as RNTextInput, Platform, Alert } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack, router } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useUsersStore } from '@/stores/usersStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useWorshipStore } from '@/stores/worshipStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isWorship, isAdmin } from '@/lib/roles'
import { FD } from '@/lib/format'
import { Modal } from '@/components/ui/Modal'
import type { Setlist, SetlistSong, InputRow, InputListKey } from '@/types/worship'
import { INPUT_LIST_SIZES } from '@/types/worship'

type MainTab = 'setlist' | 'inputList'
type InputSubTab = InputListKey

const today = () => new Date().toISOString().split('T')[0]

function makeEmptySetlist(): Setlist {
  return { id: 0, date: today(), eventId: null, songs: [], published: true }
}

export default function WorshipScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const { users, subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const evStore = useEventsStore()
  const store = useWorshipStore()
  const toast = useUIStore((s) => s.toast)

  const [tab, setTab] = useState<MainTab>('setlist')
  const [inputTab, setInputTab] = useState<InputSubTab>('sunday')

  // Setlist editor
  const [editSL, setEditSL] = useState<Setlist | null>(null)
  const [saving, setSaving] = useState(false)

  const admin = isAdmin(profile)
  const worshipUser = isWorship(profile)

  useEffect(() => {
    if (!profile) return
    if (!worshipUser && !admin) {
      router.replace('/(app)/home')
      return
    }
    Promise.all([
      store.loadSetlists(),
      store.pruneExpired(),
      store.loadInputLists(),
    ]).catch(() => {})
    subUsers()
    evStore.subscribe()
    return () => {
      unsubUsers()
      evStore.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid])

  const worshipAdminUids = users.filter((u) => isWorship(u) || isAdmin(u)).map((u) => u.uid)

  // Events for setlist linking
  const today8 = today()
  const in90 = new Date(); in90.setDate(in90.getDate() + 90)
  const upcomingEvents = evStore.instances(today8, in90.toISOString().split('T')[0])

  async function handleSaveSetlist() {
    if (!editSL) return
    if (!editSL.date) { toast('Date is required.', 'error'); return }
    if (editSL.date < today()) { toast('Date cannot be in the past.', 'error'); return }
    setSaving(true)
    try {
      await store.saveSetlist(editSL, worshipAdminUids)
      setEditSL(null)
      toast('Setlist saved.', 'success')
    } catch {
      toast('Failed to save setlist.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSetlist(id: number) {
    if (Platform.OS === 'web') {
      if (!window.confirm('Delete this setlist?')) return
    } else {
      Alert.alert('Delete Setlist', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => store.deleteSetlist(id).catch(() => {}) },
      ])
      return
    }
    await store.deleteSetlist(id)
  }

  function updateSong(idx: number, patch: Partial<SetlistSong>) {
    if (!editSL) return
    const songs = editSL.songs.map((s, i) => i === idx ? { ...s, ...patch } : s)
    setEditSL({ ...editSL, songs })
  }

  function addSong() {
    if (!editSL) return
    setEditSL({ ...editSL, songs: [...editSL.songs, { song: '' }] })
  }

  function removeSong(idx: number) {
    if (!editSL) return
    setEditSL({ ...editSL, songs: editSL.songs.filter((_, i) => i !== idx) })
  }

  function updateInputCell(listKey: InputListKey, rowIdx: number, field: keyof InputRow, value: string) {
    const lists = { ...store.inputLists }
    const rows = [...lists[listKey]]
    rows[rowIdx] = { ...rows[rowIdx], [field]: value }
    lists[listKey] = rows
    store.updateInputLists(lists)
  }

  const tabStyle = (t: MainTab) => ({
    flex: 1 as const,
    paddingVertical: 10,
    alignItems: 'center' as const,
    borderBottomWidth: tab === t ? 2 : 0,
    borderBottomColor: colors.primary,
    backgroundColor: tab === t ? colors.primary + '11' : 'transparent',
  })
  const inputTabStyle = (t: InputSubTab) => ({
    flex: 1 as const,
    paddingVertical: 8,
    alignItems: 'center' as const,
    backgroundColor: inputTab === t ? colors.primary + '22' : 'transparent',
  })

  if (!worshipUser && !admin) return null

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Worship' }} />

      {/* Main tab bar */}
      <XStack borderBottomWidth={1} borderBottomColor={colors.border} backgroundColor={colors.surface}>
        <Pressable style={tabStyle('setlist')} onPress={() => setTab('setlist')}>
          <Text color={tab === 'setlist' ? colors.primary : colors.text} fontWeight={tab === 'setlist' ? '700' : '400'}>Setlist</Text>
        </Pressable>
        <Pressable style={tabStyle('inputList')} onPress={() => setTab('inputList')}>
          <Text color={tab === 'inputList' ? colors.primary : colors.text} fontWeight={tab === 'inputList' ? '700' : '400'}>Input List</Text>
        </Pressable>
      </XStack>

      {/* ── Setlist Tab ── */}
      {tab === 'setlist' && (
        <ScrollView style={{ flex: 1 }}>
          <YStack padding="$3" gap="$3">
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={colors.text} fontSize="$5" fontWeight="700">Setlists</Text>
              <Pressable onPress={() => setEditSL(makeEmptySetlist())}>
                <XStack backgroundColor={colors.primary} paddingHorizontal="$3" paddingVertical="$2" borderRadius="$2">
                  <Text color="#fff" fontWeight="700">+ New Setlist</Text>
                </XStack>
              </Pressable>
            </XStack>

            {store.setlists.length === 0 ? (
              <YStack alignItems="center" padding="$6">
                <Text color={colors.textMuted}>No setlists yet. Create one to get started.</Text>
              </YStack>
            ) : (
              store.setlists.map((sl) => (
                <YStack key={sl.id} backgroundColor={colors.surface} borderRadius="$3" borderWidth={1} borderColor={colors.border} padding="$3" gap="$2">
                  <XStack justifyContent="space-between" alignItems="center">
                    <YStack>
                      <Text color={colors.text} fontWeight="700">Setlist for {FD(sl.date)}</Text>
                      <Text color={colors.textMuted} fontSize="$2">
                        {sl.songs.length} song{sl.songs.length !== 1 ? 's' : ''} · {sl.published ? '✅ Published' : '📝 Draft'}
                      </Text>
                    </YStack>
                    <XStack gap="$2">
                      <Pressable onPress={() => setEditSL({ ...sl, songs: [...sl.songs] })}>
                        <Text color={colors.primary}>Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDeleteSetlist(sl.id)}>
                        <Text color="#c0392b">Delete</Text>
                      </Pressable>
                    </XStack>
                  </XStack>
                  {sl.songs.length > 0 && (
                    <YStack gap="$1">
                      <XStack borderBottomWidth={1} borderBottomColor={colors.border} paddingBottom="$1">
                        <Text color={colors.textMuted} fontSize="$1" style={{ width: '35%' }}>Song</Text>
                        <Text color={colors.textMuted} fontSize="$1" style={{ width: '15%' }}>Key</Text>
                        <Text color={colors.textMuted} fontSize="$1" style={{ width: '25%' }}>Link</Text>
                        <Text color={colors.textMuted} fontSize="$1" style={{ flex: 1 }}>Notes</Text>
                      </XStack>
                      {sl.songs.map((s, i) => (
                        <XStack key={i} paddingVertical="$1">
                          <Text color={colors.text} fontSize="$2" style={{ width: '35%' }} numberOfLines={1}>{s.song}</Text>
                          <Text color={colors.text} fontSize="$2" style={{ width: '15%' }}>{s.key ?? ''}</Text>
                          <Pressable style={{ width: '25%' }} onPress={() => s.link && Linking.openURL(s.link)}>
                            <Text color={s.link ? colors.primary : colors.textMuted} fontSize="$2" numberOfLines={1}>{s.link ? 'Link ↗' : ''}</Text>
                          </Pressable>
                          <Text color={colors.textMuted} fontSize="$2" style={{ flex: 1 }} numberOfLines={1}>{s.notes ?? ''}</Text>
                        </XStack>
                      ))}
                    </YStack>
                  )}
                  {sl.songs.length === 0 && <Text color={colors.textMuted} fontSize="$2">No songs added yet.</Text>}
                </YStack>
              ))
            )}
          </YStack>
        </ScrollView>
      )}

      {/* ── Input List Tab ── */}
      {tab === 'inputList' && (
        <YStack flex={1}>
          {/* Sub-tabs */}
          <XStack borderBottomWidth={1} borderBottomColor={colors.border}>
            {(['sunday', 'event', 'wh2'] as InputSubTab[]).map((t) => (
              <Pressable key={t} style={inputTabStyle(t)} onPress={() => setInputTab(t)}>
                <Text color={inputTab === t ? colors.primary : colors.text} fontWeight={inputTab === t ? '700' : '400'} style={{ textTransform: 'capitalize' }}>
                  {t === 'wh2' ? 'WH2' : t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </Pressable>
            ))}
          </XStack>
          <ScrollView style={{ flex: 1 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <YStack padding="$2" minWidth={600}>
                {/* Header */}
                <XStack backgroundColor={colors.surface} paddingVertical="$1">
                  <Text color={colors.textMuted} fontSize="$1" fontWeight="700" style={{ width: 40 }}>#</Text>
                  <Text color={colors.textMuted} fontSize="$1" fontWeight="700" style={{ width: 220 }}>Input</Text>
                  <Text color={colors.textMuted} fontSize="$1" fontWeight="700" style={{ width: 220 }}>Output</Text>
                </XStack>
                {store.inputLists[inputTab].map((row, i) => (
                  <XStack key={i} borderBottomWidth={1} borderBottomColor={colors.border + '44'} paddingVertical="$1">
                    <Text color={colors.textMuted} fontSize="$1" style={{ width: 40, paddingTop: 8 }}>{i + 1}</Text>
                    <RNTextInput
                      value={row.input}
                      onChangeText={(v) => updateInputCell(inputTab, i, 'input', v)}
                      style={{ width: 210, marginRight: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, color: colors.text, backgroundColor: colors.surface, fontSize: 12 }}
                      placeholderTextColor={colors.textMuted}
                      placeholder="Input channel"
                    />
                    <RNTextInput
                      value={row.output}
                      onChangeText={(v) => updateInputCell(inputTab, i, 'output', v)}
                      style={{ width: 210, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, color: colors.text, backgroundColor: colors.surface, fontSize: 12 }}
                      placeholderTextColor={colors.textMuted}
                      placeholder="Output / destination"
                    />
                  </XStack>
                ))}
              </YStack>
            </ScrollView>
          </ScrollView>
        </YStack>
      )}

      {/* ── Edit Setlist Modal ── */}
      <Modal
        open={!!editSL}
        onOpenChange={(open) => { if (!open) setEditSL(null) }}
        title={editSL?.id === 0 ? 'New Setlist' : 'Edit Setlist'}
      >
        {editSL && (
          <ScrollView>
            <YStack gap="$3" paddingBottom="$4">
              {/* Date */}
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2">Date *</Text>
                <RNTextInput
                  value={editSL.date}
                  onChangeText={(v) => setEditSL({ ...editSL, date: v })}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, color: colors.text, backgroundColor: colors.surface }}
                />
              </YStack>

              {/* Linked Event */}
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2">Linked Event (optional)</Text>
                {editSL.eventId ? (
                  <XStack gap="$2" alignItems="center">
                    <Text color={colors.text} fontSize="$2">
                      {upcomingEvents.find((e) => String(e.templateId) === String(editSL.eventId))?.title ?? `Event ${editSL.eventId}`}
                    </Text>
                    <Pressable onPress={() => setEditSL({ ...editSL, eventId: null })}>
                      <Text color="#c0392b">✕</Text>
                    </Pressable>
                  </XStack>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 120 }}>
                    <YStack gap="$1">
                      {upcomingEvents.slice(0, 10).map((ev) => (
                        <Pressable key={ev.instanceKey} onPress={() => setEditSL({ ...editSL, eventId: Number(ev.templateId) })}>
                          <XStack padding="$2" borderWidth={1} borderColor={colors.border} borderRadius="$2">
                            <Text color={colors.text} fontSize="$2">{FD(ev.date)} — {ev.title}</Text>
                          </XStack>
                        </Pressable>
                      ))}
                    </YStack>
                  </ScrollView>
                )}
              </YStack>

              {/* Songs */}
              <Text color={colors.text} fontWeight="700">Songs</Text>
              {editSL.songs.map((s, i) => (
                <YStack key={i} gap="$1" backgroundColor={colors.surface} padding="$2" borderRadius="$2" borderWidth={1} borderColor={colors.border}>
                  <XStack gap="$2">
                    <RNTextInput
                      value={s.song}
                      onChangeText={(v) => updateSong(i, { song: v })}
                      placeholder="Song title *"
                      placeholderTextColor={colors.textMuted}
                      style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 8, color: colors.text, backgroundColor: colors.background, fontSize: 13 }}
                    />
                    <RNTextInput
                      value={s.key ?? ''}
                      onChangeText={(v) => updateSong(i, { key: v })}
                      placeholder="Key"
                      placeholderTextColor={colors.textMuted}
                      style={{ width: 70, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 8, color: colors.text, backgroundColor: colors.background, fontSize: 13 }}
                    />
                  </XStack>
                  <RNTextInput
                    value={s.link ?? ''}
                    onChangeText={(v) => updateSong(i, { link: v })}
                    placeholder="Link URL (optional)"
                    placeholderTextColor={colors.textMuted}
                    style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 8, color: colors.text, backgroundColor: colors.background, fontSize: 13 }}
                  />
                  <XStack justifyContent="space-between">
                    <RNTextInput
                      value={s.notes ?? ''}
                      onChangeText={(v) => updateSong(i, { notes: v })}
                      placeholder="Notes"
                      placeholderTextColor={colors.textMuted}
                      style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 8, color: colors.text, backgroundColor: colors.background, fontSize: 13, marginRight: 8 }}
                    />
                    <Pressable onPress={() => removeSong(i)}>
                      <Text color="#c0392b" fontSize="$3" style={{ paddingTop: 8 }}>✕</Text>
                    </Pressable>
                  </XStack>
                </YStack>
              ))}

              <Pressable onPress={addSong}>
                <XStack borderWidth={1} borderColor={colors.primary} borderStyle="dashed" padding="$2" borderRadius="$2" justifyContent="center">
                  <Text color={colors.primary}>+ Add Song / Podcast</Text>
                </XStack>
              </Pressable>

              {/* Published toggle */}
              <XStack gap="$2" alignItems="center">
                <Pressable onPress={() => setEditSL({ ...editSL, published: !editSL.published })}>
                  <XStack
                    width={40} height={22} borderRadius={11}
                    backgroundColor={editSL.published ? colors.primary : colors.border}
                    alignItems="center"
                    paddingHorizontal="$1"
                    justifyContent={editSL.published ? 'flex-end' : 'flex-start'}
                  >
                    <XStack width={18} height={18} borderRadius={9} backgroundColor="#fff" />
                  </XStack>
                </Pressable>
                <Text color={colors.text} fontSize="$3">Published</Text>
              </XStack>

              <XStack gap="$2">
                <Pressable style={{ flex: 1 }} onPress={() => setEditSL(null)}>
                  <XStack borderWidth={1} borderColor={colors.border} padding="$2" borderRadius="$2" justifyContent="center">
                    <Text color={colors.text}>Cancel</Text>
                  </XStack>
                </Pressable>
                <Pressable style={{ flex: 2 }} onPress={handleSaveSetlist} disabled={saving}>
                  <XStack backgroundColor={colors.primary} padding="$2" borderRadius="$2" justifyContent="center" opacity={saving ? 0.6 : 1}>
                    <Text color="#fff" fontWeight="700">{saving ? 'Saving…' : 'Save'}</Text>
                  </XStack>
                </Pressable>
              </XStack>
            </YStack>
          </ScrollView>
        )}
      </Modal>
    </YStack>
  )
}
