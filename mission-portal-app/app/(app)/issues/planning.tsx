import { useState } from 'react'
import { Stack } from 'expo-router'
import { ScrollView, Pressable, Modal, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useAuthStore } from '@/stores/authStore'
import { usePlanningStore } from '@/stores/planningStore'
import { useEventsStore } from '@/stores/eventsStore'
import { sameId } from '@/lib/ids'
import { PlanningBoardCanvas } from '@/features/planning/PlanningBoardCanvas'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

export default function Planning() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''

  const { boards, loading, subscribe, unsubscribe, createBoard, renameBoard, linkToEvent, deleteBoard } =
    usePlanningStore()
  const { templates, subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()

  // Subscribe on mount
  useState(() => {
    subscribe()
    subEvents()
    return () => {
      unsubscribe()
      unsubEvents()
    }
  })

  // New board modal
  const [newBoardModal, setNewBoardModal] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')

  // Rename modal
  const [renameModal, setRenameModal] = useState<{ id: string | number; name: string } | null>(null)
  const [renameName, setRenameName] = useState('')

  // Link event modal
  const [linkModal, setLinkModal] = useState<{
    boardId: string | number
    currentEventId?: string | number | null
  } | null>(null)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | number | null>(null)

  // Canvas
  const [openBoardId, setOpenBoardId] = useState<string | number | null>(null)

  async function handleCreateBoard() {
    if (!newBoardName.trim()) return
    await createBoard(newBoardName.trim(), uid)
    setNewBoardName('')
    setNewBoardModal(false)
  }

  async function handleRename() {
    if (!renameModal || !renameName.trim()) return
    await renameBoard(renameModal.id, renameName.trim())
    setRenameModal(null)
    setRenameName('')
  }

  async function handleLinkEvent(eventId: string | number | null) {
    if (!linkModal) return
    await linkToEvent(linkModal.boardId, eventId, linkModal.currentEventId)
    setLinkModal(null)
  }

  async function handleDeleteBoard(id: string | number) {
    await deleteBoard(id)
    setDeleteConfirm(null)
  }

  function getEventName(eventId?: string | number | null): string {
    if (!eventId) return ''
    const t = templates.find((tmpl) => sameId(tmpl.id, eventId))
    return t?.title ?? String(eventId)
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Planning Boards' }} />

      {/* Header */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        alignItems="center"
        justifyContent="space-between"
        borderBottomWidth={1}
        borderBottomColor={colors.border}
      >
        <Text color={colors.text} fontSize="$5" fontWeight="700">
          Planning Boards
        </Text>
        <Pressable
          onPress={() => {
            setNewBoardName('')
            setNewBoardModal(true)
          }}
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
          }}
        >
          <Text color={colors.onPrimary} fontWeight="600" fontSize={13}>
            + New Board
          </Text>
        </Pressable>
      </XStack>

      {/* Board list */}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {loading && (
          <Text color={colors.textMuted} fontSize={14} textAlign="center">
            Loading...
          </Text>
        )}
        {!loading && boards.length === 0 && (
          <Text color={colors.textMuted} fontSize={14} textAlign="center">
            No planning boards yet. Create one to get started.
          </Text>
        )}
        {boards.map((board) => {
          const eventName = getEventName(board.eventId)
          return (
            <YStack
              key={String(board.id)}
              backgroundColor={colors.surface}
              borderWidth={1}
              borderColor={colors.border}
              borderRadius="$3"
              padding="$3"
              gap="$2"
            >
              <XStack alignItems="center" justifyContent="space-between">
                <Text color={colors.text} fontSize={15} fontWeight="700" flex={1} numberOfLines={1}>
                  {board.name}
                </Text>
                <Pressable
                  onPress={() => setOpenBoardId(board.id)}
                  style={{
                    backgroundColor: colors.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                  }}
                >
                  <Text color={colors.onPrimary} fontSize={12} fontWeight="600">
                    Open Board
                  </Text>
                </Pressable>
              </XStack>

              {eventName ? (
                <XStack gap={4} alignItems="center">
                  <Text fontSize={12}>📅</Text>
                  <Text color={colors.textMuted} fontSize={12}>
                    Linked to: {eventName}
                  </Text>
                </XStack>
              ) : (
                <Text color={colors.textMuted} fontSize={12}>
                  No event linked
                </Text>
              )}

              {/* Admin controls */}
              <XStack gap={8} flexWrap="wrap">
                <Pressable
                  onPress={() => {
                    setRenameName(board.name)
                    setRenameModal({ id: board.id, name: board.name })
                  }}
                  style={[styles.adminBtn, { borderColor: colors.border }]}
                >
                  <Text color={colors.text} fontSize={12}>
                    ✎ Rename
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() =>
                    setLinkModal({ boardId: board.id, currentEventId: board.eventId })
                  }
                  style={[styles.adminBtn, { borderColor: colors.border }]}
                >
                  <Text color={colors.text} fontSize={12}>
                    🔗 Link Event
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setDeleteConfirm(board.id)}
                  style={[styles.adminBtn, { borderColor: '#e53935' }]}
                >
                  <Text color="#e53935" fontSize={12}>
                    🗑 Delete
                  </Text>
                </Pressable>
              </XStack>
            </YStack>
          )
        })}
      </ScrollView>

      {/* New Board Modal */}
      <Modal
        visible={newBoardModal}
        transparent
        animationType="slide"
        onRequestClose={() => setNewBoardModal(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setNewBoardModal(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text color={colors.text} fontWeight="700" fontSize={16} marginBottom={12}>
              New Planning Board
            </Text>
            <TextInput
              placeholder="Board name"
              placeholderTextColor={colors.textMuted}
              value={newBoardName}
              onChangeText={setNewBoardName}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              autoFocus
            />
            <XStack gap={10} marginTop={14} justifyContent="flex-end">
              <Pressable onPress={() => setNewBoardModal(false)} style={[styles.btnOutline, { borderColor: colors.border }]}>
                <Text color={colors.textMuted} fontSize={13}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleCreateBoard} style={[styles.btnPrimary, { backgroundColor: colors.primary }]}>
                <Text color={colors.onPrimary} fontSize={13} fontWeight="600">Create</Text>
              </Pressable>
            </XStack>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={renameModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setRenameModal(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setRenameModal(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text color={colors.text} fontWeight="700" fontSize={16} marginBottom={12}>
              Rename Board
            </Text>
            <TextInput
              placeholder="New name"
              placeholderTextColor={colors.textMuted}
              value={renameName}
              onChangeText={setRenameName}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              autoFocus
            />
            <XStack gap={10} marginTop={14} justifyContent="flex-end">
              <Pressable onPress={() => setRenameModal(null)} style={[styles.btnOutline, { borderColor: colors.border }]}>
                <Text color={colors.textMuted} fontSize={13}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleRename} style={[styles.btnPrimary, { backgroundColor: colors.primary }]}>
                <Text color={colors.onPrimary} fontSize={13} fontWeight="600">Save</Text>
              </Pressable>
            </XStack>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Link Event Modal */}
      <Modal
        visible={linkModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setLinkModal(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setLinkModal(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: '70%' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text color={colors.text} fontWeight="700" fontSize={16} marginBottom={12}>
              Link to Event
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {linkModal?.currentEventId != null && (
                <Pressable
                  onPress={() => handleLinkEvent(null)}
                  style={[styles.eventRow, { borderColor: '#e53935' }]}
                >
                  <Text color="#e53935" fontSize={13}>
                    ✕ Remove link
                  </Text>
                </Pressable>
              )}
              {templates.map((tmpl) => {
                const isLinked = linkModal?.currentEventId != null && sameId(tmpl.id, linkModal.currentEventId)
                return (
                  <Pressable
                    key={String(tmpl.id)}
                    onPress={() => handleLinkEvent(tmpl.id)}
                    style={[
                      styles.eventRow,
                      {
                        borderColor: isLinked ? colors.primary : colors.border,
                        backgroundColor: isLinked ? `${colors.primary}18` : 'transparent',
                      },
                    ]}
                  >
                    <Text color={colors.text} fontSize={13} numberOfLines={1}>
                      {tmpl.title}
                    </Text>
                    {isLinked && (
                      <Text color={colors.primary} fontSize={11}>
                        ✓ Current
                      </Text>
                    )}
                  </Pressable>
                )
              })}
            </ScrollView>
            <Pressable onPress={() => setLinkModal(null)} style={[styles.btnOutline, { borderColor: colors.border, marginTop: 12, alignSelf: 'flex-end' }]}>
              <Text color={colors.textMuted} fontSize={13}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        visible={deleteConfirm !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirm(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setDeleteConfirm(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text color={colors.text} fontWeight="700" fontSize={16} marginBottom={8}>
              Delete Board?
            </Text>
            <Text color={colors.textMuted} fontSize={13} marginBottom={16}>
              This will permanently delete the board and all its items.
            </Text>
            <XStack gap={10} justifyContent="flex-end">
              <Pressable onPress={() => setDeleteConfirm(null)} style={[styles.btnOutline, { borderColor: colors.border }]}>
                <Text color={colors.textMuted} fontSize={13}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => deleteConfirm !== null && handleDeleteBoard(deleteConfirm)}
                style={[styles.btnPrimary, { backgroundColor: '#e53935' }]}
              >
                <Text color="#fff" fontSize={13} fontWeight="600">Delete</Text>
              </Pressable>
            </XStack>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Planning Board Canvas */}
      <PlanningBoardCanvas
        boardId={openBoardId}
        visible={openBoardId !== null}
        onClose={() => setOpenBoardId(null)}
      />
    </YStack>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  adminBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  btnOutline: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  btnPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  eventRow: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
})
