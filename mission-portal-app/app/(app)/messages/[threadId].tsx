import { useEffect, useRef, useState, useCallback } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  View,
  TextInput,
  StyleSheet,
  Pressable,
} from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { FlashList, FlashListRef } from '@shopify/flash-list'
import { useAuthStore } from '@/stores/authStore'
import { useMessagesStore, sendMessageAs } from '@/stores/messagesStore'
import { useUsersStore } from '@/stores/usersStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { MessageBubble } from '@/components/ui/MessageBubble'
import { MessageActionsSheet } from '@/features/moderation/MessageActionsSheet'
import { RoomMembersSheet } from '@/features/moderation/RoomMembersSheet'
import { isAdmin } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import { partitionHiddenMessages } from '@/lib/moderation'
import { useBackTo } from '@/lib/useBackTo'
import { uriToBlob } from '@/lib/uriToBlob'
import { confirmAsync } from '@/lib/confirm'
import { roomKind, roomTitle } from '@/lib/rooms'
import { updateDoc, doc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { RoomAvatar } from '@/features/messages/RoomAvatar'
import { pickCover, setRoomCover } from '@/features/messages/roomCover'
import type { Message, MessageAttachment, Room } from '@/types/events'
import { DictateButton } from '@/components/ui/Dictation'

export default function ThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>()
  const router = useRouter()
  const goBack = useBackTo('/(app)/messages')
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''
  const admin = isAdmin(profile)

  const {
    rooms,
    messages,
    msgLoading,
    hasMore,
    openRoom,
    closeRoom,
    loadMore,
    markRead,
    subscribe,
    unsubscribe,
  } = useMessagesStore()
  const { users, subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const toast = useUIStore((s) => s.toast)

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [actionsFor, setActionsFor] = useState<Message | null>(null)
  const [showMembers, setShowMembers] = useState(false)
  const flashListRef = useRef<FlashListRef<Message>>(null)

  // Messages from users this person blocked, and messages they reported, are
  // hidden from them (App Store Review Guideline 1.2). This applies in every
  // room, including ones created after the block.
  const {
    visible: visibleMessages,
    blockedCount,
    reportedCount,
  } = partitionHiddenMessages(messages, profile?.blockedUsers, profile?.reportedMessages)
  const hiddenCount = blockedCount + reportedCount

  // One they are in, from their list; or — for an admin — one reported to
  // them, read from Moderation, which isn't on it.
  const listed = rooms.find((r) => sameId(r.id, threadId))
  const [reportedRoom, setReportedRoom] = useState<Room | null>(null)
  const room = listed ?? reportedRoom
  const member = !!room && room.members.some((m) => sameId(m, uid))
  const dm = !!room && roomKind(room) === 'dm'
  const title = room ? roomTitle(room, uid, users) : 'Messages'

  useEffect(() => {
    subscribe(uid)
    subUsers()
    if (threadId) openRoom(threadId)
    return () => {
      closeRoom()
      unsubscribe()
      unsubUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, uid])

  useEffect(() => {
    if (!admin || !threadId || listed) return
    return onSnapshot(
      doc(db, 'rooms', String(threadId)),
      (snap) => setReportedRoom(snap.exists() ? { ...(snap.data() as Room), id: snap.id } : null),
      () => setReportedRoom(null)
    )
  }, [admin, threadId, listed])

  // Mark messages as read when they arrive — theirs to read, not an admin's
  // looking into a report.
  useEffect(() => {
    if (messages.length > 0 && uid && member) {
      markRead(uid).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, uid, member])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending || !threadId) return
    setSending(true)
    setText('')
    try {
      await sendMessageAs(threadId, uid, trimmed)
    } catch {
      toast('Failed to send message', 'error')
      setText(trimmed)
    } finally {
      setSending(false)
    }
  }

  const handleImageAttachment = async () => {
    try {
      const ImagePicker = await import('expo-image-picker')
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      })
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0]
        // Upload to storage then send
        const { ref: storageRef, uploadBytes, getDownloadURL } = await import('firebase/storage')
        const { storage } = await import('@/lib/firebase')
        const filename = `${Date.now()}_${uid}_${asset.fileName ?? 'image.jpg'}`
        const sRef = storageRef(storage, `rooms/${threadId}/attachments/${filename}`)
        const blob = await uriToBlob(asset.uri)
        // The Storage rule requires an image/* content type, which a Blob read
        // off a file:// URI does not reliably carry.
        await uploadBytes(sRef, blob, { contentType: asset.mimeType ?? 'image/jpeg' })
        const url = await getDownloadURL(sRef)
        const attachment: MessageAttachment = { type: 'image', url, name: filename }
        await sendMessageAs(String(threadId), uid, '', attachment)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast(`Failed to attach image: ${message}`, 'error')
    }
  }

  const isFlagged = room?.reported === true || (room?.reviewers?.length ?? 0) > 0

  /**
   * The conversation reported to the admins, by anyone in it: they may read
   * it until they have reviewed it and cleared the report (Moderation) —
   * otherwise only those in a conversation ever read it.
   */
  const handleReport = async () => {
    if (!room) return
    if (isFlagged) {
      if (admin) router.push('/(app)/messages/moderation' as never)
      else toast('Reported — the admins are reviewing it', 'info')
      return
    }
    const ok = await confirmAsync(
      'Report this conversation to the admins? They’ll be able to read it until they’ve reviewed it.',
      { title: 'Report conversation', confirmLabel: 'Report', destructive: true }
    )
    if (!ok) return
    try {
      await updateDoc(doc(db, 'rooms', String(room.id)), {
        reviewers: arrayUnion(uid),
        reported: true,
      })
      // The admins told it needs review.
      const sendNotif = httpsCallable(functions, 'sendNotification')
      users
        .filter((u) => u.roles?.includes('admin') && !sameId(u.uid, uid))
        .forEach((u) => {
          sendNotif({
            uid: String(u.uid),
            type: 'chatFlagged',
            data: { roomName: dm ? '' : (room.name ?? ''), roomId: String(room.id) },
          }).catch(() => {})
        })
      toast('Reported — the admins will review it', 'info')
    } catch {
      toast('Failed to report the conversation', 'error')
    }
  }

  /** A group chat's cover photo, changed by anyone in it. */
  const handleCover = async () => {
    if (!room || dm || !member) return
    try {
      const picked = await pickCover()
      if (!picked) return
      await setRoomCover(String(room.id), picked)
      toast('Cover photo changed', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Couldn’t change the cover photo', 'error')
    }
  }

  const isMuted = (room?.mutedBy ?? []).some((m) => sameId(m, uid))

  const handleToggleMute = async () => {
    if (!room) return
    try {
      await updateDoc(doc(db, 'rooms', String(room.id)), {
        mutedBy: isMuted ? arrayRemove(uid) : arrayUnion(uid),
      })
      toast(isMuted ? 'Notifications on' : 'Chat muted', 'info')
    } catch {
      toast('Failed to update mute setting', 'error')
    }
  }

  const getUserInfo = (msgUid: string | number) => {
    const u = users.find((x) => sameId(x.uid, msgUid))
    return { displayName: u?.displayName, photoURL: u?.photoURL }
  }

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isMine = sameId(item.uid, uid)
      const { displayName, photoURL } = getUserInfo(item.uid)
      return (
        <MessageBubble
          message={item}
          isMine={isMine}
          displayName={displayName}
          photoURL={photoURL}
          onShowActions={isMine ? undefined : () => setActionsFor(item)}
        />
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, users]
  )

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title }} />
      {/* Chat header: who it is with, or the group — and reporting it */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderBottomWidth={1}
        borderBottomColor={colors.border}
        alignItems="center"
        justifyContent="space-between"
        gap="$2"
      >
        <Pressable onPress={goBack} hitSlop={12} accessibilityLabel="Back to conversations">
          <XStack
            alignItems="center"
            gap="$1"
            minHeight={44}
            paddingRight="$3"
            paddingLeft="$1"
            cursor="pointer"
            hoverStyle={{ opacity: 0.7 }}
          >
            <Text color={colors.primary} fontSize="$6" fontWeight="700">
              ‹
            </Text>
            <Text color={colors.primary} fontSize="$3" fontWeight="600">
              Back
            </Text>
          </XStack>
        </Pressable>
        <XStack flex={1} alignItems="center" gap="$2">
          {room ? (
            // A group's picture: tapped, its cover photo changed.
            <Pressable
              onPress={handleCover}
              disabled={dm || !member}
              accessibilityRole={dm || !member ? undefined : 'button'}
              accessibilityLabel={dm || !member ? undefined : 'Change cover photo'}
            >
              <View>
                <RoomAvatar room={room} uid={uid} people={users} size={34} />
                {!dm && member ? (
                  <View style={[styles.camera, { backgroundColor: colors.surface }]}>
                    <Text fontSize={9}>📷</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ) : null}
          <Text color={colors.text} fontWeight="600" fontSize="$3" numberOfLines={1} flex={1}>
            {title}
          </Text>
        </XStack>
        <Pressable onPress={() => setShowMembers(true)} hitSlop={8} style={{ marginLeft: 8 }}>
          <Text color={colors.primary} fontSize="$2">
            👥 People
          </Text>
        </Pressable>
        {member ? (
          <Pressable onPress={handleToggleMute} hitSlop={8} style={{ marginLeft: 8 }}>
            <Text color={isMuted ? colors.textMuted : colors.primary} fontSize="$2">
              {isMuted ? '🔕 Muted' : '🔔 Mute'}
            </Text>
          </Pressable>
        ) : null}
        {member || (admin && isFlagged) ? (
          <Pressable onPress={handleReport} hitSlop={8} style={{ marginLeft: 8 }}>
            <Text color={isFlagged ? '#e67e22' : colors.primary} fontSize="$2">
              {isFlagged ? '🚩 Reported' : 'Report'}
            </Text>
          </Pressable>
        ) : null}
      </XStack>

      {/* An admin reading a conversation reported to them, without being in it. */}
      {room && !member ? (
        <XStack
          paddingHorizontal="$3"
          paddingVertical="$2"
          backgroundColor={colors.surface}
          borderBottomWidth={1}
          borderBottomColor={colors.border}
        >
          <Text color={colors.textMuted} fontSize="$2" flex={1}>
            You can read this conversation because it was reported to the admins, until the report
            is cleared. Only the people in it can write here.
          </Text>
        </XStack>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Load more button */}
        {hasMore ? (
          <Pressable onPress={loadMore} disabled={msgLoading}>
            <XStack
              padding="$2"
              justifyContent="center"
              borderBottomWidth={1}
              borderBottomColor={colors.border}
            >
              <Text color={colors.primary} fontSize="$2">
                {msgLoading ? 'Loading…' : 'Load earlier messages'}
              </Text>
            </XStack>
          </Pressable>
        ) : null}

        {/* Hidden-message notice — blocked authors and messages you reported */}
        {hiddenCount > 0 ? (
          <Pressable onPress={() => router.push('/(app)/blocked' as never)}>
            <XStack
              paddingHorizontal="$3"
              paddingVertical="$2"
              gap="$2"
              alignItems="center"
              backgroundColor={colors.surface}
              borderBottomWidth={1}
              borderBottomColor={colors.border}
            >
              <Text fontSize="$2">🚫</Text>
              <Text color={colors.textMuted} fontSize="$2" flex={1}>
                {[
                  blockedCount > 0
                    ? `${blockedCount} ${blockedCount === 1 ? 'message' : 'messages'} from someone you blocked`
                    : null,
                  reportedCount > 0
                    ? `${reportedCount} ${reportedCount === 1 ? 'message you reported' : 'messages you reported'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' and ')}{' '}
                {hiddenCount === 1 ? 'is' : 'are'} hidden.
              </Text>
              <Text color={colors.primary} fontSize="$2">
                Manage
              </Text>
            </XStack>
          </Pressable>
        ) : null}

        {/* Message list */}
        <View style={{ flex: 1 }}>
          {visibleMessages.length === 0 && !msgLoading ? (
            <YStack flex={1} alignItems="center" justifyContent="center">
              <Text color={colors.textMuted}>No messages yet. Say hello!</Text>
            </YStack>
          ) : (
            <FlashList<Message>
              ref={flashListRef as React.Ref<FlashListRef<Message>>}
              data={visibleMessages}
              renderItem={renderMessage}
              keyExtractor={(item, _index) => `${item.ts}_${item.uid}`}
              getItemType={() => 'message'}
              contentContainerStyle={{ paddingVertical: 8 }}
              onContentSizeChange={() => {
                flashListRef.current?.scrollToEnd?.({ animated: false })
              }}
            />
          )}
        </View>

        {/* Input row — for those in the conversation */}
        {member ? (
          <XStack
            padding="$2"
            gap="$2"
            alignItems="flex-end"
            borderTopWidth={1}
            borderTopColor={colors.border}
            backgroundColor={colors.surface}
          >
            <Pressable onPress={handleImageAttachment}>
              <XStack
                width={36}
                height={36}
                borderRadius={18}
                backgroundColor={colors.border}
                alignItems="center"
                justifyContent="center"
              >
                <Text fontSize="$3">📎</Text>
              </XStack>
            </Pressable>

            {/* Dictation, beside the attachment: a reply said rather than typed. */}
            <DictateButton value={text} onChangeText={setText} multiline />

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={text}
              onChangeText={setText}
              placeholder="Message…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
              onSubmitEditing={Platform.OS === 'web' ? handleSend : undefined}
            />

            <Pressable onPress={handleSend} disabled={!text.trim() || sending}>
              <XStack
                width={36}
                height={36}
                borderRadius={18}
                backgroundColor={text.trim() && !sending ? colors.primary : colors.border}
                alignItems="center"
                justifyContent="center"
              >
                <Text color="white" fontSize="$3">
                  ↑
                </Text>
              </XStack>
            </Pressable>
          </XStack>
        ) : null}
      </KeyboardAvoidingView>

      <RoomMembersSheet
        open={showMembers}
        onOpenChange={setShowMembers}
        memberUids={room?.members ?? []}
        users={users}
        viewerUid={uid}
        blockedUsers={profile?.blockedUsers ?? []}
      />

      <MessageActionsSheet
        open={actionsFor !== null}
        onOpenChange={(v) => !v && setActionsFor(null)}
        message={actionsFor}
        roomId={String(threadId)}
        viewerUid={uid}
        authorName={actionsFor ? getUserInfo(actionsFor.uid).displayName : undefined}
      />
    </YStack>
  )
}

const styles = StyleSheet.create({
  camera: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
  },
})
