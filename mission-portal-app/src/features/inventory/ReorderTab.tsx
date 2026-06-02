import { useState, useEffect } from 'react'
import { ScrollView, Pressable, TextInput, StyleSheet, View, Modal, Linking } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useInventoryStore } from '@/stores/inventoryStore'
import { useUIStore } from '@/stores/uiStore'
import type { ReorderItem } from '@/types/inventory'

interface ReorderTabProps {
  isAdmin: boolean
}

interface ReorderFormModalProps {
  visible: boolean
  onClose: () => void
  onSave: (data: Omit<ReorderItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  editItem: ReorderItem | null
}

const EMPTY_FORM = { name: '', price: '', link: '' }

function ReorderFormModal({ visible, onClose, onSave, editItem }: ReorderFormModalProps) {
  const colors = useThemeColors()
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setForm(
        editItem
          ? { name: editItem.name, price: editItem.price != null ? String(editItem.price) : '', link: editItem.link }
          : EMPTY_FORM,
      )
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [visible, editItem])

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        price: form.price ? parseFloat(form.price) : null,
        link: form.link.trim(),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$4"
          gap="$3"
          width="92%"
          maxWidth={440}
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={colors.text} fontWeight="700" fontSize="$4">
              {editItem ? 'Edit Reorder Item' : 'New Reorder Item'}
            </Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4">✕</Text>
            </Pressable>
          </XStack>

          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2">Item *</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="Item name…"
              placeholderTextColor={colors.textMuted}
            />
          </YStack>

          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2">Price ($)</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={form.price}
              onChangeText={(v) => setForm((f) => ({ ...f, price: v }))}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
          </YStack>

          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2">Link (URL)</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={form.link}
              onChangeText={(v) => setForm((f) => ({ ...f, link: v }))}
              placeholder="https://…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="url"
            />
          </YStack>

          <XStack gap="$2" justifyContent="flex-end">
            <Pressable onPress={onClose} style={[styles.btn, { borderColor: colors.border }]}>
              <Text color={colors.textMuted} fontWeight="600">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving || !form.name.trim()}
              style={[styles.btn, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: saving || !form.name.trim() ? 0.5 : 1 }]}
            >
              <Text color="white" fontWeight="700">{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </XStack>
        </YStack>
      </View>
    </Modal>
  )
}

export function ReorderTab({ isAdmin }: ReorderTabProps) {
  const colors = useThemeColors()
  const { reorderItems, createReorderItem, updateReorderItem, deleteReorderItem } = useInventoryStore()
  const toast = useUIStore((s) => s.toast)

  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<ReorderItem | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null)

  const filtered = reorderItems
    .filter((i) => !search.trim() || i.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  const handleSave = async (data: Omit<ReorderItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (editItem) {
        await updateReorderItem(editItem.id, data)
        toast('Updated!', 'success')
      } else {
        await createReorderItem(data)
        toast('Added!', 'success')
      }
      setShowForm(false)
      setEditItem(null)
    } catch {
      toast('Failed to save', 'error')
    }
  }

  const handleDelete = async (id: string | number) => {
    try {
      await deleteReorderItem(id)
      toast('Deleted', 'success')
    } catch {
      toast('Failed to delete', 'error')
    } finally {
      setConfirmDeleteId(null)
    }
  }

  return (
    <YStack flex={1}>
      {/* Search + Add */}
      <XStack paddingHorizontal="$3" paddingVertical="$2" gap="$2" alignItems="center">
        <TextInput
          style={[styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, flex: 1 }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search items…"
          placeholderTextColor={colors.textMuted}
        />
        {isAdmin ? (
          <Pressable
            onPress={() => { setEditItem(null); setShowForm(true) }}
            style={[styles.btn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
          >
            <Text color="white" fontSize="$1" fontWeight="700">+ Add</Text>
          </Pressable>
        ) : null}
      </XStack>

      {/* Table header */}
      <View style={[styles.headerRow, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={styles.colItem} color={colors.textMuted} fontWeight="700" fontSize={12}>ITEM</Text>
        <Text style={styles.colPrice} color={colors.textMuted} fontWeight="700" fontSize={12}>PRICE</Text>
        <Text style={styles.colLink} color={colors.textMuted} fontWeight="700" fontSize={12}>LINK</Text>
        {isAdmin ? <View style={styles.colActions} /> : null}
      </View>

      {filtered.length === 0 ? (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
          <Text color={colors.textMuted} textAlign="center">
            {search.trim() ? 'No items match your search.' : 'No reorder items yet.'}
          </Text>
        </YStack>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <YStack paddingBottom="$8">
            {filtered.map((item, idx) => {
              const isConfirming = String(confirmDeleteId) === String(item.id)
              return (
                <View
                  key={String(item.id)}
                  style={[
                    styles.dataRow,
                    { backgroundColor: idx % 2 === 0 ? colors.surface : colors.background, borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={styles.colItem} color={colors.text} fontSize={13} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.colPrice} color={colors.text} fontSize={13}>
                    {item.price != null ? `$${item.price.toFixed(2)}` : '—'}
                  </Text>
                  <View style={styles.colLink}>
                    {item.link ? (
                      <Pressable onPress={() => Linking.openURL(item.link).catch(() => {})}>
                        <Text color={colors.primary} fontSize={13} numberOfLines={1} style={{ textDecorationLine: 'underline' }}>
                          Open ↗
                        </Text>
                      </Pressable>
                    ) : (
                      <Text color={colors.textMuted} fontSize={13}>—</Text>
                    )}
                  </View>
                  {isAdmin ? (
                    <View style={styles.colActions}>
                      {isConfirming ? (
                        <XStack gap={4}>
                          <Pressable onPress={() => setConfirmDeleteId(null)}>
                            <View style={[styles.actionBtn, { borderColor: colors.border }]}>
                              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>Cancel</Text>
                            </View>
                          </Pressable>
                          <Pressable onPress={() => handleDelete(item.id)}>
                            <View style={[styles.actionBtn, { backgroundColor: '#c0392b', borderColor: '#c0392b' }]}>
                              <Text style={{ color: 'white', fontSize: 11, fontWeight: '600' }}>Confirm</Text>
                            </View>
                          </Pressable>
                        </XStack>
                      ) : (
                        <XStack gap={4}>
                          <Pressable onPress={() => { setEditItem(item); setShowForm(true) }}>
                            <View style={[styles.actionBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' }]}>
                              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>Edit</Text>
                            </View>
                          </Pressable>
                          <Pressable onPress={() => setConfirmDeleteId(item.id)}>
                            <View style={[styles.actionBtn, { backgroundColor: '#c0392b18', borderColor: '#c0392b44' }]}>
                              <Text style={{ color: '#c0392b', fontSize: 11, fontWeight: '600' }}>Delete</Text>
                            </View>
                          </Pressable>
                        </XStack>
                      )}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </YStack>
        </ScrollView>
      )}

      <ReorderFormModal
        visible={showForm}
        onClose={() => { setShowForm(false); setEditItem(null) }}
        onSave={handleSave}
        editItem={editItem}
      />
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
  search: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 14,
  },
  btn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  colItem: { flex: 2, paddingRight: 4 },
  colPrice: { width: 72, textAlign: 'right', paddingRight: 8 },
  colLink: { flex: 1, paddingRight: 4 },
  colActions: { width: 120, alignItems: 'flex-end' },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
})
