import React, { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, Modal, Alert,
} from 'react-native'
import { useAuthStore } from '@/stores/authStore'
import { usePlanningStore } from '@/stores/planningStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useUIStore } from '@/stores/uiStore'
import { isAdmin } from '@/lib/roles'
import { FD } from '@/lib/format'
import { useThemeColors } from '@/theme/useThemeColors'
import type { PlanningBoard } from '@/types/planning'
import PlanningBoardCanvas from '@/screens/PlanningBoardCanvas'

/* ─── New/Edit Board Modal ─────────────────────────────────────── */
interface BoardModalProps {
  visible: boolean
  board: PlanningBoard | null
  onClose: () => void
}
function BoardModal({ visible, board, onClose }: BoardModalProps) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const store = usePlanningStore()
  const eventsStore = useEventsStore()
  const { toast } = useUIStore()

  const [name, setName]       = useState('')
  const [eventId, setEventId] = useState<number | null>(null)
  const [saving, setSaving]   = useState(false)

  const events = eventsStore.templates ?? []

  useEffect(() => {
    if (board) { setName(board.name); setEventId(board.eventId ?? null) }
    else        { setName(''); setEventId(null) }
  }, [board, visible])

  const handleSave = async () => {
    if (!name.trim()) { toast('Board name is required', 'error'); return }
    if (!profile?.uid) return
    setSaving(true)
    try {
      if (board) {
        await store.updateBoard(board.id, { name: name.trim(), eventId })
        toast('Board updated', 'success')
      } else {
        await store.createBoard({ name: name.trim(), eventId }, profile.uid)
        toast('Board created', 'success')
      }
      onClose()
    } catch { toast('Failed to save board', 'error') } finally { setSaving(false) }
  }

  const inputStyle = [ps.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet">
      <View style={[ps.modal, { backgroundColor: colors.background }]}>
        <View style={[ps.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[ps.modalTitle, { color: colors.text }]}>{board ? 'Edit Board' : 'New Planning Board'}</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
        </View>
        <View style={{ padding: 16 }}>
          <Text style={[ps.label, { color: colors.textMuted }]}>Board Name *</Text>
          <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="e.g. Easter 2025 Planning" placeholderTextColor={colors.textMuted} />

          <Text style={[ps.label, { color: colors.textMuted }]}>Link to Event</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <TouchableOpacity
              style={[ps.chip, !eventId && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setEventId(null)}
            >
              <Text style={{ color: !eventId ? '#fff' : colors.text, fontSize: 12 }}>No event (standalone)</Text>
            </TouchableOpacity>
            {events.slice(0, 20).map(e => {
              const numId = Number(e.id)
              return (
                <TouchableOpacity
                  key={e.id}
                  style={[ps.chip, eventId === numId && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setEventId(numId)}
                >
                  <Text style={{ color: eventId === numId ? '#fff' : colors.text, fontSize: 12 }} numberOfLines={1}>
                    {e.title}{e.date ? ` · ${FD(e.date)}` : ''}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
        <View style={[ps.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={[ps.btn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{saving ? 'Saving…' : board ? 'Save' : 'Create'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

/* ─── Main Screen ───────────────────────────────────────────────── */
export default function PlanningScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const store = usePlanningStore()
  const eventsStore = useEventsStore()
  const { toast } = useUIStore()

  const [showModal, setShowModal]         = useState(false)
  const [editBoard, setEditBoard]         = useState<PlanningBoard | null>(null)
  const [openBoardId, setOpenBoardId]     = useState<number | null>(null)

  const admin = isAdmin(profile)

  useEffect(() => {
    if (!admin) return
    store.loadBoards()
    eventsStore.subscribe?.()
    return () => {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin])

  if (!admin) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Admin access required.</Text>
      </View>
    )
  }

  const handleDelete = (board: PlanningBoard) => {
    Alert.alert('Delete Board', `Delete "${board.name}" and all its elements?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await store.deleteBoard(board.id); toast('Board deleted', 'info') }
        catch { toast('Failed to delete board', 'error') }
      }},
    ])
  }

  // Group boards by event
  const templates = eventsStore.templates ?? []
  const linked = store.boards.filter(b => b.eventId)
  const unlinked = store.boards.filter(b => !b.eventId)

  // Group linked boards by eventId
  const byEvent: Record<number, PlanningBoard[]> = {}
  for (const b of linked) {
    if (b.eventId != null) {
      byEvent[b.eventId] = byEvent[b.eventId] ?? []
      byEvent[b.eventId].push(b)
    }
  }
  const eventIds = Object.keys(byEvent).map(Number)
  const sortedEventIds = eventIds.sort((a, b) => {
    const eA = templates.find(e => Number(e.id) === a)
    const eB = templates.find(e => Number(e.id) === b)
    if (!eA || !eB) return 0
    return (eA.date ?? '').localeCompare(eB.date ?? '')
  })

  const hasElements = (boardId: number) => (store.elements[boardId]?.length ?? 0) > 0

  const BoardCard = ({ board }: { board: PlanningBoard }) => (
    <View style={[ps.boardCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity style={{ flex: 1 }} onPress={() => setOpenBoardId(board.id)}>
        <Text style={[ps.boardName, { color: colors.text }]}>{board.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
          {hasElements(board.id) ? 'Has content' : 'Empty board'}
        </Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          style={[ps.boardBtn, { borderColor: colors.primary }]}
          onPress={() => setOpenBoardId(board.id)}
        >
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Open</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ps.boardBtn, { borderColor: '#e74c3c' }]}
          onPress={() => handleDelete(board)}
        >
          <Text style={{ color: '#e74c3c', fontSize: 13 }}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[ps.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[ps.headerTitle, { color: colors.text }]}>Planning Boards</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            Freeform planning whiteboards linked to events.
          </Text>
        </View>
        <TouchableOpacity
          style={[ps.newBtn, { backgroundColor: colors.primary }]}
          onPress={() => { setEditBoard(null); setShowModal(true) }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>+ New Board</Text>
        </TouchableOpacity>
      </View>

      {store.loading && (
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 24 }}>Loading…</Text>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* Grouped by event */}
        {sortedEventIds.map(evId => {
          const ev = templates.find(e => Number(e.id) === evId)
          const boards = byEvent[evId]
          return (
            <View key={evId} style={{ marginBottom: 20 }}>
              <Text style={[ps.sectionHeader, { color: colors.accent }]}>
                {ev ? `${ev.title.toUpperCase()} · ${FD(ev.date ?? '')}` : `EVENT #${evId}`}
              </Text>
              {boards.map(b => <BoardCard key={b.id} board={b} />)}
            </View>
          )
        })}

        {/* Unlinked */}
        {unlinked.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={[ps.sectionHeader, { color: colors.accent }]}>STANDALONE</Text>
            {unlinked.map(b => <BoardCard key={b.id} board={b} />)}
          </View>
        )}

        {store.boards.length === 0 && !store.loading && (
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 32 }}>
            No boards yet. Create one to get started.
          </Text>
        )}
      </ScrollView>

      <BoardModal visible={showModal} board={editBoard} onClose={() => setShowModal(false)} />

      {/* Full-screen canvas */}
      {openBoardId !== null && (
        <PlanningBoardCanvas boardId={openBoardId} onClose={() => setOpenBoardId(null)} />
      )}
    </View>
  )
}

const ps = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  newBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginLeft: 8, marginTop: 2 },
  sectionHeader: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' },
  boardCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 10, gap: 10 },
  boardName: { fontSize: 15, fontWeight: '700' },
  boardBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  // modal
  modal: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 12, marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginBottom: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#ccc', marginRight: 6 },
  footer: { flexDirection: 'row', padding: 16, borderTopWidth: 1, alignItems: 'center' },
  btn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
})
