import { useEffect, useState } from 'react'
import { ScrollView, TextInput, StyleSheet, Pressable, Alert } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useAnnounceStore } from '@/stores/announceStore'
import { useUsersStore } from '@/stores/usersStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { useUIStore } from '@/stores/uiStore'
import { isAdmin } from '@/lib/roles'
import { Modal } from '@/components/ui/Modal'
import type { Attachment } from '@/types/shared'
import type { Announcement } from '@/types/announcements'

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// ── Attachment display ─────────────────────────────────────────────────────────

function AttachmentView({ att }: { att: Attachment }) {
  const colors = useThemeColors()
  const isImage = att.type.startsWith('image/')
  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={att.url}
        alt={att.name}
        style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginTop: 8, objectFit: 'cover' }}
      />
    )
  }
  return (
    <Pressable onPress={() => { if (typeof window !== 'undefined') window.open(att.url, '_blank') }}>
      <XStack
        paddingHorizontal={10}
        paddingVertical={6}
        borderRadius={6}
        borderWidth={1}
        borderColor={colors.border}
        alignSelf="flex-start"
        gap={4}
        marginTop={4}
      >
        <Text style={{ color: '#007AFF', fontSize: 13 }}>📎 {att.name}</Text>
      </XStack>
    </Pressable>
  )
}

// ── Create Announcement Modal ──────────────────────────────────────────────────

function CreateModal({
  open,
  onClose,
  allUserUids,
}: {
  open: boolean
  onClose: () => void
  allUserUids: string[]
}) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const store = useAnnounceStore()
  const { users } = useUsersStore()
  const toast = useUIStore((s) => s.toast)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [audience, setAudience] = useState<string[]>([])
  const [audienceSearch, setAudienceSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle('')
      setBody('')
      setIsPublic(false)
      setAudience([])
      setAudienceSearch('')
    }
  }, [open])

  const addToAudience = (uid: string) => {
    if (!audience.includes(uid)) setAudience((a) => [...a, uid])
    setAudienceSearch('')
  }

  const removeFromAudience = (uid: string) => {
    setAudience((a) => a.filter((x) => x !== uid))
  }

  const filteredUsers = audienceSearch
    ? users.filter(
        (u) =>
          !audience.includes(u.uid as string) &&
          (u.displayName?.toLowerCase().includes(audienceSearch.toLowerCase()) ||
            (u.uid as string).toLowerCase().includes(audienceSearch.toLowerCase()))
      )
    : []

  const getUserName = (uid: string) => {
    const u = users.find((x) => x.uid === uid)
    return u?.displayName ?? uid
  }

  const handleSubmit = async () => {
    if (!title.trim()) return Alert.alert('Title required')
    if (!body.trim()) return Alert.alert('Message required')
    if (!profile) return

    setSaving(true)
    try {
      await store.createAnnouncement(
        { title: title.trim(), body: body.trim(), isPublic, audience },
        profile.uid as string,
        allUserUids
      )
      toast('Announcement posted!', 'success')
      onClose()
    } catch {
      Alert.alert('Failed to post announcement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={onClose}>
      <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
        <YStack gap={14} padding={4}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text as string }}>
            New Announcement
          </Text>

          <TextInput
            style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Title *"
            placeholderTextColor={colors.textMuted as string}
          />

          <TextInput
            style={[styles.area, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
            value={body}
            onChangeText={setBody}
            placeholder="Message *"
            multiline
            numberOfLines={4}
            placeholderTextColor={colors.textMuted as string}
          />

          {/* Audience */}
          <YStack gap={8}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text as string }}>
              Send To
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted as string, fontStyle: 'italic' }}>
              {audience.length === 0
                ? 'No one selected = broadcast to ALL users'
                : `${audience.length} recipient${audience.length !== 1 ? 's' : ''} selected`}
            </Text>

            {/* Selected audience tags */}
            {audience.length > 0 && (
              <XStack flexWrap="wrap" gap={6}>
                {audience.map((uid) => (
                  <XStack
                    key={uid}
                    paddingHorizontal={8}
                    paddingVertical={4}
                    borderRadius={12}
                    backgroundColor={colors.primary + '20'}
                    borderWidth={1}
                    borderColor={colors.primary}
                    alignItems="center"
                    gap={4}
                  >
                    <Text style={{ fontSize: 12, color: colors.primary as string }}>{getUserName(uid)}</Text>
                    <Pressable onPress={() => removeFromAudience(uid)}>
                      <Text style={{ color: colors.primary as string, fontSize: 12 }}>✕</Text>
                    </Pressable>
                  </XStack>
                ))}
              </XStack>
            )}

            {/* Search to add */}
            <TextInput
              style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
              value={audienceSearch}
              onChangeText={setAudienceSearch}
              placeholder="Add person…"
              placeholderTextColor={colors.textMuted as string}
            />

            {filteredUsers.length > 0 && (
              <YStack
                backgroundColor={colors.surface}
                borderRadius={6}
                borderWidth={1}
                borderColor={colors.border}
                maxHeight={150}
              >
                <ScrollView>
                  {filteredUsers.slice(0, 10).map((u) => (
                    <Pressable key={u.uid as string} onPress={() => addToAudience(u.uid as string)}>
                      <XStack
                        paddingHorizontal={12}
                        paddingVertical={8}
                        borderBottomWidth={1}
                        borderBottomColor={colors.border}
                      >
                        <Text style={{ color: colors.text as string }}>{u.displayName ?? u.uid}</Text>
                      </XStack>
                    </Pressable>
                  ))}
                </ScrollView>
              </YStack>
            )}
          </YStack>

          {/* Public toggle */}
          <Pressable onPress={() => setIsPublic((v) => !v)}>
            <XStack alignItems="center" gap={8}>
              <YStack
                width={22}
                height={22}
                borderRadius={4}
                borderWidth={2}
                borderColor={colors.primary}
                backgroundColor={isPublic ? colors.primary : 'transparent'}
                justifyContent="center"
                alignItems="center"
              >
                {isPublic && <Text style={{ color: '#fff', fontSize: 14 }}>✓</Text>}
              </YStack>
              <Text style={{ color: colors.text as string, fontSize: 13 }}>
                Public Announcement (visible to public users)
              </Text>
            </XStack>
          </Pressable>

          <XStack gap={10} justifyContent="flex-end">
            <Pressable onPress={onClose}>
              <YStack paddingHorizontal={16} paddingVertical={8} borderRadius={6} borderWidth={1} borderColor={colors.border}>
                <Text style={{ color: colors.text as string }}>Cancel</Text>
              </YStack>
            </Pressable>
            <Pressable onPress={handleSubmit} disabled={saving}>
              <YStack paddingHorizontal={16} paddingVertical={8} borderRadius={6} backgroundColor={colors.primary as string}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {saving ? 'Posting…' : 'Post Announcement'}
                </Text>
              </YStack>
            </Pressable>
          </XStack>
        </YStack>
      </ScrollView>
    </Modal>
  )
}

// ── Announcement Card ──────────────────────────────────────────────────────────

function AnnouncementCard({
  ann,
  admin,
  authorName,
}: {
  ann: Announcement
  admin: boolean
  authorName: string
}) {
  const colors = useThemeColors()
  const store = useAnnounceStore()

  const handleDelete = () => {
    Alert.alert('Delete Announcement', `Delete "${ann.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => store.deleteAnnouncement(ann.id),
      },
    ])
  }

  return (
    <YStack
      backgroundColor={colors.surface}
      borderRadius={10}
      padding={14}
      borderWidth={1}
      borderColor={colors.border}
      gap={8}
    >
      <XStack justifyContent="space-between" alignItems="flex-start">
        <Text
          style={{ fontWeight: '700', fontSize: 16, color: colors.primary as string, flex: 1 }}
          numberOfLines={2}
        >
          {ann.title}
        </Text>
        {admin && (
          <Pressable onPress={handleDelete} style={{ marginLeft: 8 }}>
            <Text style={{ color: '#c0392b', fontSize: 18 }}>🗑</Text>
          </Pressable>
        )}
      </XStack>

      <Text style={{ color: colors.textMuted as string, fontSize: 12 }}>{fmtDate(ann.ts)}</Text>

      <Text style={{ color: colors.text as string, fontSize: 14, lineHeight: 22, opacity: 0.85 }}>
        {ann.body}
      </Text>

      {ann.attachment && <AttachmentView att={ann.attachment} />}

      <Text style={{ color: colors.textMuted as string, fontSize: 12, fontStyle: 'italic' }}>
        From: {authorName}
      </Text>

      {ann.isPublic && (
        <XStack paddingHorizontal={8} paddingVertical={2} borderRadius={4} backgroundColor="#007AFF20" alignSelf="flex-start">
          <Text style={{ fontSize: 11, color: '#007AFF' }}>🌐 Public</Text>
        </XStack>
      )}
    </YStack>
  )
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function AnnounceScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = (profile?.uid as string) ?? ''
  const admin = isAdmin(profile)

  const store = useAnnounceStore()
  const { users, subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    store.subscribe()
    subUsers()
    return () => {
      store.unsubscribe()
      unsubUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const myAnnouncements = store.myAnnouncements(uid)
  const allUserUids = users.map((u) => u.uid as string)

  const getUserName = (byUid: string) => {
    const u = users.find((x) => x.uid === byUid)
    return u?.displayName ?? byUid
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Announcements' }} />

      {/* Header row */}
      <XStack
        paddingHorizontal={16}
        paddingVertical={10}
        alignItems="center"
        justifyContent="space-between"
        borderBottomWidth={1}
        borderBottomColor={colors.border}
      >
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text as string }}>
          Announcements
        </Text>
        {admin && (
          <Pressable onPress={() => setCreateOpen(true)}>
            <XStack
              paddingHorizontal={14}
              paddingVertical={7}
              borderRadius={8}
              backgroundColor={colors.primary as string}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                + New Announcement
              </Text>
            </XStack>
          </Pressable>
        )}
      </XStack>

      <ScrollView>
        <YStack padding={16} gap={12}>
          {myAnnouncements.length === 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius={10}
              padding={24}
              borderWidth={1}
              borderColor={colors.border}
              alignItems="center"
            >
              <Text style={{ color: colors.textMuted as string }}>No announcements yet.</Text>
            </YStack>
          ) : (
            myAnnouncements.map((ann) => (
              <AnnouncementCard
                key={ann.id}
                ann={ann}
                admin={admin}
                authorName={getUserName(ann.by)}
              />
            ))
          )}
        </YStack>
      </ScrollView>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} allUserUids={allUserUids} />
    </YStack>
  )
}

const styles = StyleSheet.create({
  input: {
    height: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 14,
  },
  area: {
    minHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 14,
    textAlignVertical: 'top',
  },
})
