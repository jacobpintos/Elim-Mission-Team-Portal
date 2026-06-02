import { useState } from 'react'
import { Modal, View, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import type { InventoryCategory, InventoryItem } from '@/types/inventory'

interface CategoryManagerModalProps {
  visible: boolean
  onClose: () => void
  categories: InventoryCategory[]
  items: InventoryItem[]
  onCreate: (name: string) => Promise<void>
  onDelete: (id: string | number) => Promise<void>
}

export function CategoryManagerModal({
  visible, onClose, categories, items, onCreate, onDelete,
}: CategoryManagerModalProps) {
  const colors = useThemeColors()
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await onCreate(newName.trim())
      setNewName('')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string | number) => {
    await onDelete(id)
    setConfirmDeleteId(null)
  }

  const itemCountForCategory = (id: string | number) =>
    items.filter((i) => String(i.categoryId) === String(id)).length

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$4"
          gap="$3"
          width="92%"
          maxWidth={400}
          maxHeight="80%"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={colors.text} fontWeight="700" fontSize="$4">Manage Categories</Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4">✕</Text>
            </Pressable>
          </XStack>

          {/* Add new */}
          <XStack gap="$2" alignItems="center">
            <TextInput
              style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="New category name…"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable
              onPress={handleCreate}
              disabled={saving || !newName.trim()}
              style={[styles.addBtn, { backgroundColor: colors.primary, opacity: saving || !newName.trim() ? 0.5 : 1 }]}
            >
              <Text color="white" fontWeight="700">Add</Text>
            </Pressable>
          </XStack>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <YStack gap="$1">
              {categories.length === 0 ? (
                <Text color={colors.textMuted} fontSize="$2" textAlign="center" paddingVertical="$4">
                  No categories yet.
                </Text>
              ) : (
                categories.map((cat) => {
                  const count = itemCountForCategory(cat.id)
                  const isConfirming = String(confirmDeleteId) === String(cat.id)
                  return (
                    <XStack
                      key={String(cat.id)}
                      backgroundColor={colors.background}
                      borderRadius="$2"
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <YStack>
                        <Text color={colors.text} fontWeight="600">{cat.name}</Text>
                        <Text color={colors.textMuted} fontSize="$1">{count} item{count !== 1 ? 's' : ''}</Text>
                      </YStack>
                      <XStack gap="$1">
                        {isConfirming ? (
                          <>
                            <Pressable onPress={() => setConfirmDeleteId(null)}>
                              <View style={[styles.actionBtn, { borderColor: colors.border }]}>
                                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>Cancel</Text>
                              </View>
                            </Pressable>
                            <Pressable onPress={() => handleDelete(cat.id)}>
                              <View style={[styles.actionBtn, { backgroundColor: '#c0392b', borderColor: '#c0392b' }]}>
                                <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>Confirm</Text>
                              </View>
                            </Pressable>
                          </>
                        ) : (
                          <Pressable onPress={() => setConfirmDeleteId(cat.id)}>
                            <View style={[styles.actionBtn, { backgroundColor: '#c0392b18', borderColor: '#c0392b44' }]}>
                              <Text style={{ color: '#c0392b', fontSize: 12, fontWeight: '600' }}>Delete</Text>
                            </View>
                          </Pressable>
                        )}
                      </XStack>
                    </XStack>
                  )
                })
              )}
            </YStack>
          </ScrollView>
        </YStack>
      </View>
    </Modal>
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
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  addBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
})
