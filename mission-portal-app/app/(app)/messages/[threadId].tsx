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
import { isAdmin } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import { updateDoc, doc, arrayUnion } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Message, MessageAttachment } from '@/types/events'

export default function ThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>()
  const router = useRouter()
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
  const flashListRef = useRef<FlashListRef<Message>>(null)

  const room = rooms.find((r) => sameId(r.id, threadId))

  useEffect(() => {
    subscribe()
    subUsers()
    if (threadId) openRoom(threadId)
    return () => {
      closeRoom()
      unsubscribe()
      unsubUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  // Mark messages as read when they arrive
  useEffect(() => {
    if (messages.length > 0 && uid) {
      markRead(uid).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, uid])

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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      })
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0]
        // Upload to storage then send
        const { ref: storageRef, uploadBytes, getDownloadURL } = await import('firebase/storage')
        const { storage } = await import('@/lib/firebase')
        const filename = `${Date.now()}_${uid}_${asset.fileName ?? 'image.jpg'}`
        const sRef = storageRef(storage, `rooms/${threadId}/attachments/${filename}`)
        const blob = await (await fetch(asset.uri)).blob()
        await uploadBytes(sRef, blob)
        const url = await getDownloadURL(sRef)
        const attachment: MessageAttachment = { type: 'image', url, name: filename }
        await sendMessageAs(String(threadId), uid, '', attachment)
      }
    } catch {
      toast('Failed to attach image', 'error')
    }
  }

  const handleFlagForReview = async () => {
    if (!room || !admin) return
    try {
      await updateDoc(doc(db, 'rooms', String(room.id)), {
        reviewers: arrayUnion(uid),
      })
      toast('Room flagged for review', 'info')
    } catch {
      toast('Failed to flag room', 'error')
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
        />
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, users]
  )

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: room?.name ?? 'Messages' }} />
      {/* Chat header: room name + admin flag button */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2"
        borderBottomWidth={1}
        borderBottomColor={colors.border}
        alignItems="center"
        justifyContent="space-between"
        gap="$2"
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))}
          hitSlop={10}
          style={{ paddingVertical: 4, paddingRight: 4 }}
        >
          <Text color={colors.primary} fontSize="$5" fontWeight="700">
            ‹
          </Text>
        </Pressable>
        <Text color={colors.text} fontWeight="600" fontSize="$3" numberOfLines={1} flex={1}>
          {room?.name ?? 'Messages'}
        </Text>
        {admin ? (
          <Pressable onPress={handleFlagForReview} style={{ marginLeft: 8 }}>
            <Text color={colors.primary} fontSize="$2">
              Flag
            </Text>
          </Pressable>
        ) : null}
      </XStack>

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

        {/* Message list */}
        <View style={{ flex: 1 }}>
          {messages.length === 0 && !msgLoading ? (
            <YStack flex={1} alignItems="center" justifyContent="center">
              <Text color={colors.textMuted}>No messages yet. Say hello!</Text>
            </YStack>
          ) : (
            <FlashList<Message>
              ref={flashListRef as React.Ref<FlashListRef<Message>>}
              data={messages}
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

        {/* Input row */}
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
      </KeyboardAvoidingView>
    </YStack>
  )
}

const styles = StyleSheet.create({
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
