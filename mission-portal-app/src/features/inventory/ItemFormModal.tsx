import { useState, useEffect } from 'react'
import { Modal, View, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import type { InventoryItem, InventoryCategory } from '@/types/inventory'

interface ItemFormModalProps {
  visible: boolean
  onClose: () => void
  onSave: (data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  editItem: InventoryItem | null
  categories: InventoryCategory[]
}

const EMPTY = { name: '', categoryId: null as string | number | null, qty: '', price: '' }

export function ItemFormModal({ visible, onClose, onSave, editItem, categories }: ItemFormModalProps) {
  const colors = useThemeColors()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [showCatPicker, setShowCatPicker] = useState(false)

  useEffect(() => {
    if (visible) {
      if (editItem) {
        setForm({
          name: editItem.name,
          categoryId: editItem.categoryId,
          qty: String(editItem.qty),
          price: String(editItem.price),
        })
      } else {
        setForm(EMPTY)
      }
    }
  }, [visible, editItem])

  const selectedCat = categories.find((c) => String(c.id) === String(form.categoryId))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        categoryId: form.categoryId,
        qty: parseInt(form.qty) || 0,
        price: parseFloat(form.price) || 0,
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
          maxWidth={480}
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={colors.text} fontWeight="700" fontSize="$4">
              {editItem ? 'Edit Item' : 'New Item'}
            </Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4">✕</Text>
            </Pressable>
          </XStack>

          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2">Item Name *</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="e.g. T-Shirt (Large)"
              placeholderTextColor={colors.textMuted}
            />
          </YStack>

          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2">Category</Text>
            <Pressable onPress={() => setShowCatPicker((v) => !v)}>
              <XStack
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background }]}
                justifyContent="space-between"
                alignItems="center"
              >
                <Text color={selectedCat ? colors.text : colors.textMuted}>
                  {selectedCat ? selectedCat.name : 'None'}
                </Text>
                <Text color={colors.textMuted}>{showCatPicker ? '▲' : '▼'}</Text>
              </XStack>
            </Pressable>
            {showCatPicker ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$2"
                borderWidth={1}
                borderColor={colors.border}
                overflow="hidden"
              >
                <Pressable onPress={() => { setForm((f) => ({ ...f, categoryId: null })); setShowCatPicker(false) }}>
                  <XStack
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    backgroundColor={form.categoryId == null ? colors.primary + '22' : 'transparent'}
                  >
                    <Text color={form.categoryId == null ? colors.primary : colors.text} fontSize="$2">
                      None
                    </Text>
                  </XStack>
                </Pressable>
                {categories.map((cat) => (
                  <Pressable
                    key={String(cat.id)}
                    onPress={() => { setForm((f) => ({ ...f, categoryId: cat.id })); setShowCatPicker(false) }}
                  >
                    <XStack
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      backgroundColor={String(form.categoryId) === String(cat.id) ? colors.primary + '22' : 'transparent'}
                    >
                      <Text
                        color={String(form.categoryId) === String(cat.id) ? colors.primary : colors.text}
                        fontSize="$2"
                      >
                        {cat.name}
                      </Text>
                    </XStack>
                  </Pressable>
                ))}
              </YStack>
            ) : null}
          </YStack>

          <XStack gap="$2">
            <YStack flex={1} gap="$1">
              <Text color={colors.textMuted} fontSize="$2">Qty</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={form.qty}
                onChangeText={(v) => setForm((f) => ({ ...f, qty: v }))}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />
            </YStack>
            <YStack flex={1} gap="$1">
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
          </XStack>

          <XStack gap="$2" justifyContent="flex-end" marginTop="$1">
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
  btn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
})
