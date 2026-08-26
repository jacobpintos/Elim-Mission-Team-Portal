import { useEffect, useState } from 'react'
import {
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  View,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { YStack, XStack, Text, Image } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useAnnounceStore } from '@/stores/announceStore'
import { useUsersStore } from '@/stores/usersStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { RecipientPicker } from '@/components/ui/RecipientPicker'
import { useThemeColors } from '@/theme/useThemeColors'
import { useUIStore } from '@/stores/uiStore'
import { isAdmin, isPublic } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { InboxTabs, INBOX_TITLE } from '@/features/inbox/InboxTabs'
import {
  cardImageHeight,
  clampImageHeight,
  naturalHeight,
  isCropped,
  notExpired,
  MIN_IMAGE_HEIGHT,
  MAX_IMAGE_HEIGHT,
} from '@/lib/announcementImage'
import { uploadAnnouncementImage, deleteAnnouncementImage } from '@/lib/announcementUpload'
import { todayStr } from '@/lib/events'
import { confirmAsync } from '@/lib/confirm'
import type { Announcement, AnnouncementAttachment } from '@/types/events'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatTs(ts: number): string {
  const d = new Date(ts)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export default function AnnounceScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = String(profile?.uid ?? '')
  const admin = isAdmin(profile)
  const publicUser = isPublic(profile)
  const toast = useUIStore((s) => s.toast)

  const {
    announcements,
    loading,
    subscribe,
    unsubscribe,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    myAnnouncements,
    publicAnnouncements,
  } = useAnnounceStore()
  const { users, subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const { groups, subscribe: subGroups, unsubscribe: unsubGroups } = useGroupsStore()

  useEffect(() => {
    subscribe()
    if (admin) {
      subUsers()
      subGroups()
    }
    return () => {
      unsubscribe()
      if (admin) {
        unsubUsers()
        unsubGroups()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin])

  // Anything past its date is already gone as far as readers are concerned.
  // expireAnnouncements deletes it a few minutes past midnight; hiding it here
  // means the last day ends when it says it does rather than whenever the job
  // next runs. Admins see them too — with a marker, so an expiring
  // announcement can be found and its date changed before it goes.
  const today = todayStr()
  const all = publicUser
    ? publicAnnouncements()
    : admin
      ? [...announcements].sort((a, b) => b.ts - a.ts)
      : myAnnouncements(uid)
  const visible = admin ? all : notExpired(all, today)

  // Composer state. One modal serves both new and existing announcements —
  // `editing` holds the one being changed, or null when this is a new post.
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [aTitle, setATitle] = useState('')
  const [aBody, setABody] = useState('')
  const [aPublic, setAPublic] = useState(false)
  const [aAudience, setAAudience] = useState<string[]>([])
  const [aExpires, setAExpires] = useState('')
  const [aAttachment, setAAttachment] = useState<AnnouncementAttachment | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  // Fixed when the composer opens. Reading the clock during render is impure
  // and makes the preview's date churn on every keystroke.
  const [composerTs, setComposerTs] = useState(0)
  const [creating, setCreating] = useState(false)

  // The composer's preview draws the card at the real width it will have, so
  // the height shown is the height that ships.
  const { width: winWidth } = useWindowDimensions()
  const cardWidth = Math.min(winWidth * 0.92, 540) - 40

  const resetComposer = () => {
    setEditing(null)
    setATitle('')
    setABody('')
    setAPublic(false)
    setAAudience([])
    setAExpires('')
    setAAttachment(null)
  }

  const openCreate = () => {
    resetComposer()
    setComposerTs(Date.now())
    setShowCreate(true)
  }

  const openEdit = (a: Announcement) => {
    setEditing(a)
    setATitle(a.title)
    setABody(a.body)
    setAPublic(a.isPublic)
    setAAudience((a.audience ?? []).map(String))
    setAExpires(a.expiresAt ?? '')
    setAAttachment(a.attachment)
    setComposerTs(a.ts)
    setShowCreate(true)
  }

  /**
   * Pick a photo and upload it.
   *
   * Files are stored under the announcement's id, which a new announcement
   * does not have yet — so an unsaved one borrows a `draft_` folder and the
   * file simply stays there. Moving it on save would mean a second upload and
   * a delete for no visible benefit; the URL is what the card reads, and it
   * does not care which folder it names.
   */
  const handlePickPhoto = async () => {
    setPhotoBusy(true)
    try {
      const ImagePicker = await import('expo-image-picker')
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      })
      if (result.canceled || result.assets.length === 0) return

      const folder = editing ? String(editing.id) : `draft_${uid}_${Date.now()}`
      const next = await uploadAnnouncementImage(folder, result.assets[0])
      // Replacing a photo leaves the old one behind otherwise.
      if (aAttachment?.url && aAttachment.url !== next.url) {
        await deleteAnnouncementImage(aAttachment.url)
      }
      setAAttachment(next)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to add photo', 'error')
    } finally {
      setPhotoBusy(false)
    }
  }

  const handleRemovePhoto = async () => {
    const url = aAttachment?.url
    setAAttachment(null)
    // The file goes now rather than on save: if the admin closes the composer
    // without saving, nothing points at it any more either way.
    await deleteAnnouncementImage(url)
  }

  /** Back to the height the photo's own proportions ask for. */
  const handleFitPhoto = () => {
    if (!aAttachment) return
    setAAttachment({ ...aAttachment, displayHeight: undefined })
  }

  const handleSave = async () => {
    if (!aTitle.trim() || !aBody.trim()) {
      toast('Title and body are required', 'error')
      return
    }
    if (aExpires && !/^\d{4}-\d{2}-\d{2}$/.test(aExpires)) {
      toast('Expiry date must be YYYY-MM-DD', 'error')
      return
    }
    setCreating(true)
    try {
      const shared = {
        title: aTitle.trim(),
        body: aBody.trim(),
        isPublic: aPublic,
        audience: aPublic ? [] : aAudience,
        attachment: aAttachment,
        ...(aExpires ? { expiresAt: aExpires } : {}),
      }

      if (editing) {
        // expiresAt is written explicitly as '' when cleared — omitting it
        // would leave the old date in place and delete the announcement on a
        // day the admin has just decided against.
        await updateAnnouncement(editing.id, {
          ...shared,
          expiresAt: aExpires || '',
          editedTs: Date.now(),
        })
        toast('Announcement updated', 'success')
      } else {
        await createAnnouncement({ ...shared, by: uid, ts: Date.now() })
        toast('Announcement posted', 'success')
      }
      setShowCreate(false)
      resetComposer()
    } catch {
      toast(editing ? 'Failed to update announcement' : 'Failed to post announcement', 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (a: Announcement) => {
    const ok = await confirmAsync(
      `Delete "${a.title}"? This cannot be undone${a.attachment ? ', and its photo is deleted too' : ''}.`,
      { destructive: true }
    )
    if (!ok) return
    try {
      // The photo first: a file whose announcement is gone is unreachable and
      // just costs storage, but an announcement pointing at a deleted file
      // shows a broken card to everyone until someone notices.
      await deleteAnnouncementImage(a.attachment?.url)
      await deleteAnnouncement(a.id)
      toast('Deleted', 'info')
    } catch {
      toast('Failed to delete', 'error')
    }
  }

  const nonPublicUsers = users.filter((u) => !u.roles?.includes('public'))
  const displayName = (id: string | number) => {
    const u = users.find((x) => sameId(x.uid, id))
    return u?.displayName ?? String(id)
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: INBOX_TITLE(profile) }} />
      <InboxTabs active="announce" />

      {admin ? (
        <XStack
          padding="$3"
          borderBottomWidth={1}
          borderBottomColor={colors.border}
          justifyContent="flex-end"
        >
          <Pressable onPress={openCreate}>
            <XStack
              backgroundColor={colors.primary}
              borderRadius="$3"
              paddingHorizontal="$3"
              paddingVertical="$2"
              alignItems="center"
              gap="$1"
            >
              <Text color="white" fontWeight="700" fontSize="$3">
                ⊕ Post Announcement
              </Text>
            </XStack>
          </Pressable>
        </XStack>
      ) : null}

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Text color={colors.textMuted}>Loading…</Text>
        </YStack>
      ) : visible.length === 0 ? (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
          <Text color={colors.textMuted} textAlign="center" fontSize="$4">
            No announcements yet.
          </Text>
        </YStack>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          <YStack padding="$3" gap="$3">
            {visible.map((a) => (
              <YStack
                key={String(a.id)}
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$4"
                gap="$2"
                borderWidth={1}
                borderColor={colors.border}
              >
                <XStack justifyContent="space-between" alignItems="flex-start">
                  <Text color={colors.text} fontWeight="700" fontSize="$4" flex={1}>
                    {a.title}
                  </Text>
                  {a.isPublic ? (
                    <XStack
                      backgroundColor={colors.primary + '22'}
                      borderRadius={99}
                      paddingHorizontal="$2"
                      paddingVertical={2}
                    >
                      <Text color={colors.primary} fontSize={10} fontWeight="600">
                        PUBLIC
                      </Text>
                    </XStack>
                  ) : null}
                </XStack>

                {/* `src`, not `source` — Tamagui's Image rebuilds its own
                    source from `src` and overwrites anything passed as
                    `source`, rendering an empty box at the requested size.
                    resizeMode 'cover' is what keeps the proportions when the
                    admin has set a height: it crops rather than stretches. */}
                {a.attachment?.type === 'image' && a.attachment.url ? (
                  <Image
                    src={a.attachment.url}
                    width={cardWidth}
                    height={cardImageHeight(a.attachment, cardWidth)}
                    resizeMode="cover"
                    borderRadius="$2"
                  />
                ) : null}

                <Text color={colors.text} fontSize="$3" lineHeight={20}>
                  {a.body}
                </Text>

                <XStack justifyContent="space-between" alignItems="center" marginTop="$1">
                  <YStack flex={1}>
                    <Text color={colors.textMuted} fontSize="$2">
                      {formatTs(a.ts)}
                      {a.by ? ` · ${displayName(a.by)}` : ''}
                      {a.editedTs ? ' · edited' : ''}
                    </Text>
                    {/* Only admins see this, and only they can act on it —
                        it is the warning that the announcement is about to be
                        deleted for good, in time to change the date. */}
                    {admin && a.expiresAt ? (
                      <Text
                        color={a.expiresAt < today ? '#c0392b' : colors.textMuted}
                        fontSize={11}
                      >
                        {a.expiresAt < today
                          ? `Expired ${a.expiresAt} — deletes overnight`
                          : `Deletes after ${a.expiresAt}`}
                      </Text>
                    ) : null}
                  </YStack>
                  {admin ? (
                    <XStack gap="$3">
                      <Pressable onPress={() => openEdit(a)}>
                        <Text color={colors.primary} fontSize="$2">
                          Edit
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => handleDelete(a)}>
                        <Text color="#c0392b" fontSize="$2">
                          Delete
                        </Text>
                      </Pressable>
                    </XStack>
                  ) : null}
                </XStack>
              </YStack>
            ))}
          </YStack>
        </ScrollView>
      )}

      {/* Create Modal */}
      <Modal
        visible={showCreate}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreate(false)}
      >
        <View style={styles.overlay}>
          <YStack
            backgroundColor={colors.surface}
            borderRadius="$4"
            padding="$5"
            gap="$3"
            width="92%"
            maxWidth={540}
            maxHeight="90%"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={colors.text} fontSize="$5" fontWeight="700">
                {editing ? 'Edit Announcement' : 'New Announcement'}
              </Text>
              <Pressable
                onPress={() => {
                  setShowCreate(false)
                  resetComposer()
                }}
              >
                <Text color={colors.textMuted} fontSize="$4">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            <ScrollView showsVerticalScrollIndicator={false}>
              <YStack gap="$3">
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    TITLE
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    value={aTitle}
                    onChangeText={setATitle}
                    placeholder="Announcement title"
                    placeholderTextColor={colors.textMuted}
                  />
                </YStack>

                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    BODY
                  </Text>
                  <TextInput
                    style={[
                      styles.textarea,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    value={aBody}
                    onChangeText={setABody}
                    placeholder="Write your announcement…"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={5}
                  />
                </YStack>

                <XStack justifyContent="space-between" alignItems="center">
                  <Text color={colors.text} fontSize="$3" fontWeight="600">
                    Public (visible to everyone)
                  </Text>
                  <Pressable onPress={() => setAPublic((v) => !v)}>
                    <XStack
                      paddingHorizontal="$3"
                      paddingVertical="$1"
                      borderRadius={99}
                      backgroundColor={aPublic ? colors.primary : colors.surface}
                      borderWidth={1}
                      borderColor={aPublic ? colors.primary : colors.border}
                    >
                      <Text
                        color={aPublic ? 'white' : colors.textMuted}
                        fontSize="$2"
                        fontWeight="600"
                      >
                        {aPublic ? 'ON' : 'OFF'}
                      </Text>
                    </XStack>
                  </Pressable>
                </XStack>

                {/* Photo */}
                <YStack gap="$2">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    PHOTO
                  </Text>

                  <XStack gap="$2">
                    <Pressable onPress={handlePickPhoto} disabled={photoBusy}>
                      <XStack
                        backgroundColor={colors.background}
                        borderWidth={1}
                        borderColor={colors.border}
                        borderRadius="$2"
                        paddingHorizontal="$3"
                        paddingVertical="$2"
                        opacity={photoBusy ? 0.5 : 1}
                      >
                        <Text color={colors.text} fontSize="$2" fontWeight="600">
                          {photoBusy ? 'Uploading…' : aAttachment ? 'Replace photo' : 'Add photo'}
                        </Text>
                      </XStack>
                    </Pressable>
                    {aAttachment ? (
                      <Pressable onPress={handleRemovePhoto} disabled={photoBusy}>
                        <XStack
                          borderWidth={1}
                          borderColor="#c0392b"
                          borderRadius="$2"
                          paddingHorizontal="$3"
                          paddingVertical="$2"
                        >
                          <Text color="#c0392b" fontSize="$2" fontWeight="600">
                            Remove
                          </Text>
                        </XStack>
                      </Pressable>
                    ) : null}
                  </XStack>

                  {aAttachment ? (
                    <YStack gap="$2">
                      <XStack alignItems="center" gap="$2">
                        <Text color={colors.textMuted} fontSize="$2" flex={1}>
                          Height (px) — width always fills the card
                        </Text>
                        <TextInput
                          style={[
                            styles.input,
                            {
                              width: 90,
                              color: colors.text,
                              borderColor: colors.border,
                              backgroundColor: colors.background,
                            },
                          ]}
                          value={String(cardImageHeight(aAttachment, cardWidth))}
                          onChangeText={(v) => {
                            const n = Number(v.replace(/\D/g, ''))
                            setAAttachment({
                              ...aAttachment,
                              displayHeight: n ? clampImageHeight(n) : undefined,
                            })
                          }}
                          keyboardType="number-pad"
                        />
                      </XStack>

                      <XStack gap="$2" alignItems="center">
                        <Pressable onPress={handleFitPhoto}>
                          <Text color={colors.primary} fontSize="$2">
                            Fit to photo
                          </Text>
                        </Pressable>
                        <Text color={colors.textMuted} fontSize={11}>
                          {MIN_IMAGE_HEIGHT}–{MAX_IMAGE_HEIGHT} px
                          {naturalHeight(aAttachment, cardWidth)
                            ? ` · natural ${naturalHeight(aAttachment, cardWidth)}`
                            : ''}
                        </Text>
                      </XStack>

                      {/* The photo is never stretched. Past its natural height
                          the extra has to come from somewhere, and that is a
                          crop — worth saying, since the admin cannot see what
                          is being cut until they look at the preview. */}
                      {isCropped(aAttachment, cardWidth) ? (
                        <Text color={colors.textMuted} fontSize={11}>
                          Cropped to fit this height — the photo is never stretched. “Fit to photo”
                          shows all of it.
                        </Text>
                      ) : null}
                    </YStack>
                  ) : null}
                </YStack>

                {/* Expiry */}
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    EXPIRES (OPTIONAL)
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    value={aExpires}
                    onChangeText={setAExpires}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />
                  <Text color={colors.textMuted} fontSize={11}>
                    Shown through the whole of this day, then permanently deleted overnight —
                    together with its photo. This cannot be undone. Leave blank to keep it until you
                    remove it yourself.
                  </Text>
                </YStack>

                {/* Preview — the card as it will appear, at the width it will
                    have, so the height chosen above is the height that ships. */}
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    PREVIEW
                  </Text>
                  <YStack
                    backgroundColor={colors.surface}
                    borderRadius="$3"
                    padding="$4"
                    gap="$2"
                    borderWidth={1}
                    borderColor={colors.border}
                  >
                    <XStack justifyContent="space-between" alignItems="flex-start">
                      <Text color={colors.text} fontWeight="700" fontSize="$4" flex={1}>
                        {aTitle.trim() || 'Announcement title'}
                      </Text>
                      {aPublic ? (
                        <XStack
                          backgroundColor={colors.primary + '22'}
                          borderRadius={99}
                          paddingHorizontal="$2"
                          paddingVertical={2}
                        >
                          <Text color={colors.primary} fontSize={10} fontWeight="600">
                            PUBLIC
                          </Text>
                        </XStack>
                      ) : null}
                    </XStack>

                    {aAttachment?.type === 'image' && aAttachment.url ? (
                      <Image
                        src={aAttachment.url}
                        width={cardWidth}
                        height={cardImageHeight(aAttachment, cardWidth)}
                        resizeMode="cover"
                        borderRadius="$2"
                      />
                    ) : null}

                    <Text color={colors.text} fontSize="$3" lineHeight={20}>
                      {aBody.trim() || 'Your announcement will look like this.'}
                    </Text>

                    <Text color={colors.textMuted} fontSize="$2" marginTop="$1">
                      {formatTs(composerTs)}
                      {profile?.displayName ? ` · ${profile.displayName}` : ''}
                    </Text>
                  </YStack>
                </YStack>

                {!aPublic ? (
                  <YStack gap="$1">
                    <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                      TARGET RECIPIENTS (
                      {aAudience.length === 0 ? 'All members' : `${aAudience.length} selected`})
                    </Text>
                    <Text color={colors.textMuted} fontSize={11} marginBottom="$1">
                      Leave empty to send to all non-public members
                    </Text>
                    <RecipientPicker
                      users={nonPublicUsers.map((u) => ({
                        uid: u.uid,
                        displayName: u.displayName,
                        email: u.email,
                      }))}
                      groups={groups.map((g) => ({
                        id: g.id,
                        name: g.name,
                        members: g.members,
                      }))}
                      value={aAudience}
                      onChange={setAAudience}
                      placeholder="Search people or groups…"
                    />
                  </YStack>
                ) : null}

                <Pressable
                  onPress={handleSave}
                  disabled={creating || !aTitle.trim() || !aBody.trim()}
                >
                  <XStack
                    backgroundColor={colors.primary}
                    borderRadius="$2"
                    paddingVertical="$3"
                    justifyContent="center"
                    opacity={creating || !aTitle.trim() || !aBody.trim() ? 0.5 : 1}
                  >
                    <Text color="white" fontWeight="700" fontSize="$3">
                      {creating
                        ? editing
                          ? 'Saving…'
                          : 'Posting…'
                        : editing
                          ? 'Save Changes'
                          : 'Post Announcement'}
                    </Text>
                  </XStack>
                </Pressable>
              </YStack>
            </ScrollView>
          </YStack>
        </View>
      </Modal>
    </YStack>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
  },
})
