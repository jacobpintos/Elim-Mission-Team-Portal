import { useState } from 'react'
import { ScrollView, Pressable, TextInput, StyleSheet, View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useInventoryStore } from '@/stores/inventoryStore'
import { useUIStore } from '@/stores/uiStore'
import { ItemFormModal } from './ItemFormModal'
import { CategoryManagerModal } from './CategoryManagerModal'
import { ProductionAnalytics } from './ProductionAnalytics'
import type { InventoryItem } from '@/types/inventory'

interface ProductionTabProps {
  isAdmin: boolean
}

export function ProductionTab({ isAdmin }: ProductionTabProps) {
  const colors = useThemeColors()
  const { categories, items, createItem, updateItem, deleteItem, createCategory, deleteCategory } =
    useInventoryStore()
  const toast = useUIStore((s) => s.toast)

  const [subTab, setSubTab] = useState<'items' | 'analytics'>('items')
  const [search, setSearch] = useState('')
  const [filterCatId, setFilterCatId] = useState<string | number | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [showCatManager, setShowCatManager] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null)

  const categoryMap = new Map(categories.map((c) => [String(c.id), c.name]))

  const filtered = items
    .filter((item) => {
      const q = search.toLowerCase()
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.categoryId
          ? (categoryMap.get(String(item.categoryId)) ?? '').toLowerCase().includes(q)
          : false)
      const matchesCat = filterCatId === null || String(item.categoryId) === String(filterCatId)
      return matchesSearch && matchesCat
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const handleSave = async (data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (editItem) {
        await updateItem(editItem.id, data)
        toast('Item updated!', 'success')
      } else {
        await createItem(data)
        toast('Item added!', 'success')
      }
      setShowItemForm(false)
      setEditItem(null)
    } catch {
      toast('Failed to save item', 'error')
    }
  }

  const handleDeleteItem = async (id: string | number) => {
    try {
      await deleteItem(id)
      toast('Deleted', 'success')
    } catch {
      toast('Failed to delete', 'error')
    } finally {
      setConfirmDeleteId(null)
    }
  }

  return (
    <YStack flex={1}>
      {/* Sub-tab switcher */}
      <XStack paddingHorizontal="$3" paddingTop="$2" paddingBottom="$1" gap="$2">
        {(['items', 'analytics'] as const).map((t) => (
          <Pressable key={t} onPress={() => setSubTab(t)}>
            <XStack
              backgroundColor={subTab === t ? colors.primary + '22' : 'transparent'}
              borderRadius={99}
              borderWidth={1}
              borderColor={subTab === t ? colors.primary : colors.border}
              paddingHorizontal="$3"
              paddingVertical="$0.5"
            >
              <Text
                color={subTab === t ? colors.primary : colors.textMuted}
                fontWeight={subTab === t ? '700' : '400'}
                fontSize="$2"
              >
                {t === 'items' ? 'Items' : '📊 Analytics'}
              </Text>
            </XStack>
          </Pressable>
        ))}
      </XStack>

      {subTab === 'analytics' ? (
        <ProductionAnalytics items={items} categories={categories} />
      ) : (
        <>
          {/* Search + admin controls */}
          <XStack paddingHorizontal="$3" paddingVertical="$2" gap="$2" alignItems="center">
            <TextInput
              style={[
                styles.search,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  flex: 1,
                },
              ]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search items or category…"
              placeholderTextColor={colors.textMuted}
            />
            {isAdmin ? (
              <>
                <Pressable
                  onPress={() => setShowCatManager(true)}
                  style={[styles.btn, { borderColor: colors.border }]}
                >
                  <Text color={colors.textMuted} fontSize="$1" fontWeight="600">
                    Categories
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setEditItem(null)
                    setShowItemForm(true)
                  }}
                  style={[
                    styles.btn,
                    { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                >
                  <Text color="white" fontSize="$1" fontWeight="700">
                    + Add
                  </Text>
                </Pressable>
              </>
            ) : null}
          </XStack>

          {/* Category filter chips */}
          {categories.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 36 }}>
              <XStack paddingHorizontal="$3" gap="$1" paddingBottom="$1">
                <Pressable onPress={() => setFilterCatId(null)}>
                  <XStack
                    borderRadius={99}
                    borderWidth={1}
                    borderColor={filterCatId === null ? colors.primary : colors.border}
                    backgroundColor={filterCatId === null ? colors.primary + '18' : 'transparent'}
                    paddingHorizontal="$2"
                    paddingVertical={2}
                  >
                    <Text
                      color={filterCatId === null ? colors.primary : colors.textMuted}
                      fontSize="$1"
                    >
                      All
                    </Text>
                  </XStack>
                </Pressable>
                {categories.map((cat) => (
                  <Pressable
                    key={String(cat.id)}
                    onPress={() =>
                      setFilterCatId(String(cat.id) === String(filterCatId) ? null : cat.id)
                    }
                  >
                    <XStack
                      borderRadius={99}
                      borderWidth={1}
                      borderColor={
                        String(filterCatId) === String(cat.id) ? colors.primary : colors.border
                      }
                      backgroundColor={
                        String(filterCatId) === String(cat.id)
                          ? colors.primary + '18'
                          : 'transparent'
                      }
                      paddingHorizontal="$2"
                      paddingVertical={2}
                    >
                      <Text
                        color={
                          String(filterCatId) === String(cat.id) ? colors.primary : colors.textMuted
                        }
                        fontSize="$1"
                      >
                        {cat.name}
                      </Text>
                    </XStack>
                  </Pressable>
                ))}
              </XStack>
            </ScrollView>
          ) : null}

          {/* Table: item/category need real minimum widths to stay legible, so
              the whole table (header + rows) scrolls horizontally together —
              header and rows share styles.tableWidth to stay in sync. */}
          <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
            <YStack style={styles.tableWidth}>
              <View
                style={[
                  styles.headerRow,
                  { borderBottomColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                <Text
                  style={styles.colItem}
                  color={colors.textMuted}
                  fontWeight="700"
                  fontSize={12}
                >
                  ITEM
                </Text>
                <Text style={styles.colCat} color={colors.textMuted} fontWeight="700" fontSize={12}>
                  CATEGORY
                </Text>
                <Text style={styles.colQty} color={colors.textMuted} fontWeight="700" fontSize={12}>
                  QTY
                </Text>
                <Text
                  style={styles.colPrice}
                  color={colors.textMuted}
                  fontWeight="700"
                  fontSize={12}
                >
                  PRICE
                </Text>
                <Text
                  style={styles.colValue}
                  color={colors.textMuted}
                  fontWeight="700"
                  fontSize={12}
                >
                  VALUE
                </Text>
                {isAdmin ? <View style={styles.colActions} /> : null}
              </View>

              {filtered.length === 0 ? (
                <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
                  <Text color={colors.textMuted} textAlign="center">
                    {search || filterCatId
                      ? 'No items match your search.'
                      : 'No items yet. Tap + Add to create one.'}
                  </Text>
                </YStack>
              ) : (
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  <YStack paddingBottom="$8">
                    {filtered.map((item, idx) => {
                      const catName = item.categoryId
                        ? (categoryMap.get(String(item.categoryId)) ?? '—')
                        : '—'
                      const value = (item.price ?? 0) * (item.qty ?? 0)
                      const isConfirming = String(confirmDeleteId) === String(item.id)
                      return (
                        <View
                          key={String(item.id)}
                          style={[
                            styles.dataRow,
                            {
                              backgroundColor: idx % 2 === 0 ? colors.surface : colors.background,
                              borderBottomColor: colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={styles.colItem}
                            color={colors.text}
                            fontSize={13}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          <Text
                            style={styles.colCat}
                            color={colors.textMuted}
                            fontSize={13}
                            numberOfLines={1}
                          >
                            {catName}
                          </Text>
                          <Text style={styles.colQty} color={colors.text} fontSize={13}>
                            {item.qty}
                          </Text>
                          <Text style={styles.colPrice} color={colors.text} fontSize={13}>
                            ${(item.price ?? 0).toFixed(2)}
                          </Text>
                          <Text
                            style={styles.colValue}
                            color={colors.primary}
                            fontSize={13}
                            fontWeight="600"
                          >
                            ${value.toFixed(2)}
                          </Text>
                          {isAdmin ? (
                            <View style={styles.colActions}>
                              {isConfirming ? (
                                <XStack gap={4}>
                                  <Pressable onPress={() => setConfirmDeleteId(null)}>
                                    <View
                                      style={[styles.actionBtn, { borderColor: colors.border }]}
                                    >
                                      <Text
                                        style={{
                                          color: colors.textMuted,
                                          fontSize: 11,
                                          fontWeight: '600',
                                        }}
                                      >
                                        Cancel
                                      </Text>
                                    </View>
                                  </Pressable>
                                  <Pressable onPress={() => handleDeleteItem(item.id)}>
                                    <View
                                      style={[
                                        styles.actionBtn,
                                        { backgroundColor: '#c0392b', borderColor: '#c0392b' },
                                      ]}
                                    >
                                      <Text
                                        style={{ color: 'white', fontSize: 11, fontWeight: '600' }}
                                      >
                                        Confirm
                                      </Text>
                                    </View>
                                  </Pressable>
                                </XStack>
                              ) : (
                                <XStack gap={4}>
                                  <Pressable
                                    onPress={() => {
                                      setEditItem(item)
                                      setShowItemForm(true)
                                    }}
                                  >
                                    <View
                                      style={[
                                        styles.actionBtn,
                                        {
                                          backgroundColor: colors.primary + '18',
                                          borderColor: colors.primary + '44',
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          color: colors.primary,
                                          fontSize: 11,
                                          fontWeight: '600',
                                        }}
                                      >
                                        Edit
                                      </Text>
                                    </View>
                                  </Pressable>
                                  <Pressable onPress={() => setConfirmDeleteId(item.id)}>
                                    <View
                                      style={[
                                        styles.actionBtn,
                                        { backgroundColor: '#c0392b18', borderColor: '#c0392b44' },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          color: '#c0392b',
                                          fontSize: 11,
                                          fontWeight: '600',
                                        }}
                                      >
                                        Delete
                                      </Text>
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
            </YStack>
          </ScrollView>

          <ItemFormModal
            visible={showItemForm}
            onClose={() => {
              setShowItemForm(false)
              setEditItem(null)
            }}
            onSave={handleSave}
            editItem={editItem}
            categories={categories}
          />
          <CategoryManagerModal
            visible={showCatManager}
            onClose={() => setShowCatManager(false)}
            categories={categories}
            items={items}
            onCreate={createCategory}
            onDelete={deleteCategory}
          />
        </>
      )}
    </YStack>
  )
}

const styles = StyleSheet.create({
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
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  // Fixed (not flex) widths: on a phone-width screen, flex-based columns
  // squeezed Item/Category down to one or two visible letters. Real minimum
  // widths plus the enclosing horizontal ScrollView (see render) keep them
  // legible, letting the table scroll sideways instead of collapsing.
  tableWidth: { minWidth: 600 },
  colItem: { width: 150, paddingRight: 8 },
  colCat: { width: 110, paddingRight: 8 },
  colQty: { width: 50, textAlign: 'right', paddingRight: 8 },
  colPrice: { width: 70, textAlign: 'right', paddingRight: 8 },
  colValue: { width: 70, textAlign: 'right', paddingRight: 8 },
  colActions: { width: 120, alignItems: 'flex-end' },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
})
