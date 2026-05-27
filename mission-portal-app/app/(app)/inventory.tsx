import { useEffect, useState, useRef, useCallback } from 'react'
import { ScrollView, TextInput, StyleSheet, Pressable, Alert, Linking, View, Platform } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack, useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useInventoryStore } from '@/stores/inventoryStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin, isMerch } from '@/lib/roles'
import {
  MERCH_CATEGORIES,
  CLOTHING_SUBS,
  CLOTHING_SIZES,
  getSeason,
  linReg,
} from '@/lib/merch'
import { Modal } from '@/components/ui/Modal'
import type { MerchItem, MerchTransaction, ProductionItem, ReorderItem } from '@/types/inventory'

const PRODUCTION_LOCATIONS = ['Big Trailer', 'Small Trailer', 'WH2', 'E1', 'E2'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── Helpers ───────────────────────────────────────────────────────────────────

function currency(n: number) {
  return `$${n.toFixed(2)}`
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function buildMerchAnalysis(txs: MerchTransaction[], items: MerchItem[]) {
  const sales = txs.filter((t) => t.kind === 'sale')
  const revenueByItem: Record<string, number> = {}
  const unitsByItem: Record<string, number> = {}
  const revBySeason: Record<string, number> = { Spring: 0, Summer: 0, Fall: 0, Winter: 0 }
  const revByMonth: number[] = Array(12).fill(0)
  const unitsByMonth: number[] = Array(12).fill(0)
  const revByLocation: Record<string, number> = {}
  const revByEventName: Record<string, number> = {}

  for (const tx of sales) {
    const rev = tx.qty * tx.price
    const season = getSeason(tx.ts)
    const month = new Date(tx.ts).getMonth()
    revenueByItem[tx.itemName] = (revenueByItem[tx.itemName] ?? 0) + rev
    unitsByItem[tx.itemName] = (unitsByItem[tx.itemName] ?? 0) + tx.qty
    revBySeason[season] += rev
    revByMonth[month] += rev
    unitsByMonth[month] += tx.qty
    const loc = tx.eventLocation || 'Direct'
    revByLocation[loc] = (revByLocation[loc] ?? 0) + rev
    if (tx.eventName) revByEventName[tx.eventName] = (revByEventName[tx.eventName] ?? 0) + rev
  }

  const totalRevenue = Object.values(revenueByItem).reduce((a, b) => a + b, 0)
  const totalUnits = Object.values(unitsByItem).reduce((a, b) => a + b, 0)
  const avgSale = sales.length > 0 ? totalRevenue / sales.length : 0

  const reg = linReg(
    Array.from({ length: 12 }, (_, i) => i),
    revByMonth
  )
  const trend = reg.m > 5 ? 'rising' : reg.m < -5 ? 'falling' : 'stable'
  const bestSeason = Object.entries(revBySeason).sort((a, b) => b[1] - a[1])[0]
  const topSeller = Object.entries(revenueByItem).sort((a, b) => b[1] - a[1])[0]

  return {
    totalRevenue,
    totalUnits,
    totalTx: sales.length,
    totalProducts: items.length,
    avgSale,
    revenueByItem,
    unitsByItem,
    revBySeason,
    revByMonth,
    unitsByMonth,
    revByLocation,
    revByEventName,
    slope: reg.m,
    r2: reg.r2,
    trend,
    bestSeason,
    topSeller,
  }
}

function buildProductionAnalysis(items: ProductionItem[], typeFilter: string) {
  const filtered = typeFilter ? items.filter((i) => i.type === typeFilter) : items
  const valueByKey: Record<string, number> = {}
  const qtyByKey: Record<string, number> = {}
  for (const row of filtered) {
    const key = row.item + (row.length ? ` (${row.length}ft)` : '')
    valueByKey[key] = (valueByKey[key] ?? 0) + row.qty * row.unitPrice
    qtyByKey[key] = (qtyByKey[key] ?? 0) + row.qty
  }
  const totalQty = filtered.reduce((a, r) => a + r.qty, 0)
  const totalValue = filtered.reduce((a, r) => a + r.qty * r.unitPrice, 0)
  const uniqueItems = new Set(filtered.map((r) => r.item)).size
  return { valueByKey, qtyByKey, totalQty, totalValue, uniqueItems }
}

// ── Mini bar chart ─────────────────────────────────────────────────────────────

function BarChart({
  data,
  color = '#007AFF',
  formatValue,
}: {
  data: { label: string; value: number }[]
  color?: string
  formatValue?: (v: number) => string
}) {
  const colors = useThemeColors()
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <YStack gap={4}>
      {data.map(({ label, value }) => (
        <XStack key={label} gap={8} alignItems="center">
          <Text
            style={{ fontSize: 11, color: colors.textMuted, width: 110 }}
            numberOfLines={1}
          >
            {label}
          </Text>
          <View
            style={{
              flex: 1,
              height: 14,
              backgroundColor: colors.border as string,
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${(value / max) * 100}%`,
                height: '100%',
                backgroundColor: color,
                borderRadius: 3,
              }}
            />
          </View>
          <Text style={{ fontSize: 11, color: colors.text, width: 60, textAlign: 'right' }}>
            {formatValue ? formatValue(value) : String(value)}
          </Text>
        </XStack>
      ))}
    </YStack>
  )
}

// ── Tab bar helper ─────────────────────────────────────────────────────────────

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: string[]
  active: string
  onChange: (t: string) => void
}) {
  const colors = useThemeColors()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <XStack gap={4} padding={8}>
        {tabs.map((t) => (
          <Pressable key={t} onPress={() => onChange(t)}>
            <YStack
              paddingHorizontal={12}
              paddingVertical={6}
              borderRadius={16}
              backgroundColor={active === t ? colors.primary : 'transparent'}
              borderWidth={1}
              borderColor={active === t ? colors.primary : colors.border}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: active === t ? '700' : '400',
                  color: active === t ? '#fff' : (colors.text as string),
                }}
              >
                {t}
              </Text>
            </YStack>
          </Pressable>
        ))}
      </XStack>
    </ScrollView>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors()
  return (
    <YStack
      flex={1}
      backgroundColor={colors.surface}
      borderRadius={8}
      padding={10}
      borderWidth={1}
      borderColor={colors.border}
      alignItems="center"
      minWidth={80}
    >
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.primary as string }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.textMuted as string, textAlign: 'center' }}>{label}</Text>
    </YStack>
  )
}

// ── Adjustment Modal ───────────────────────────────────────────────────────────

function AdjustmentModal({
  item,
  kind,
  open,
  onClose,
}: {
  item: MerchItem | null
  kind: 'cycle' | 'produce' | 'sale'
  open: boolean
  onClose: () => void
}) {
  const colors = useThemeColors()
  const store = useInventoryStore()
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [eventName, setEventName] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setQtys({})
      setNotes('')
      setEventName('')
      setEventLocation('')
      setEventDate('')
    }
  }, [open])

  if (!item) return null

  const isClothing = item.category === 'clothing'
  const sizeKeys = isClothing ? [...CLOTHING_SIZES] : ['one']

  const titles: Record<typeof kind, string> = {
    cycle: 'Cycle Count (Set Exact Qty)',
    produce: 'Record Production (Add Stock)',
    sale: 'Record Sale (Deduct Stock)',
  }

  const handleSave = async () => {
    const parsed: Record<string, number> = {}
    let hasAny = false
    for (const sz of sizeKeys) {
      const v = parseFloat(qtys[sz] ?? '')
      if (!isNaN(v)) {
        parsed[sz] = v
        if (v !== 0) hasAny = true
      } else if (kind === 'cycle') {
        parsed[sz] = 0
      }
    }
    if (!hasAny && kind !== 'cycle') {
      Alert.alert('Enter at least one quantity')
      return
    }
    setSaving(true)
    try {
      await store.recordAdj(item, kind, parsed, {
        notes: notes || undefined,
        eventName: kind === 'sale' ? eventName : undefined,
        eventLocation: kind === 'sale' ? eventLocation : undefined,
        eventDate: kind === 'sale' ? eventDate : undefined,
      })
      onClose()
    } catch {
      Alert.alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={onClose} title={titles[kind]}>
      <ScrollView style={{ maxHeight: 500 }} keyboardShouldPersistTaps="handled">
        <YStack gap={12} padding={4}>
          <Text style={{ color: colors.textMuted as string, fontSize: 13 }}>{item.name}</Text>

          {isClothing ? (
            <YStack gap={8}>
              <Text style={{ color: colors.text as string, fontWeight: '600', fontSize: 13 }}>
                {kind === 'cycle' ? 'Set exact quantities:' : 'Quantities to adjust:'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CLOTHING_SIZES.map((sz) => {
                  const current = item.sizes[sz] ?? 0
                  return (
                    <YStack key={sz} alignItems="center" width={80} gap={2}>
                      <Text style={{ fontSize: 12, color: colors.textMuted as string }}>
                        {sz} ({current})
                      </Text>
                      <TextInput
                        style={[
                          styles.sizeInput,
                          { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string },
                        ]}
                        keyboardType="numeric"
                        value={qtys[sz] ?? ''}
                        onChangeText={(v) => setQtys((x) => ({ ...x, [sz]: v }))}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted as string}
                      />
                    </YStack>
                  )
                })}
              </View>
            </YStack>
          ) : (
            <YStack gap={4}>
              <Text style={{ color: colors.text as string, fontSize: 13 }}>
                Quantity{kind !== 'cycle' ? ' to adjust' : ''} (current: {item.sizes['one'] ?? 0})
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string },
                ]}
                keyboardType="numeric"
                value={qtys['one'] ?? ''}
                onChangeText={(v) => setQtys({ one: v })}
                placeholder="0"
                placeholderTextColor={colors.textMuted as string}
              />
            </YStack>
          )}

          {kind === 'sale' && (
            <YStack gap={8} borderTopWidth={1} borderTopColor={colors.border} paddingTop={10}>
              <Text style={{ color: colors.text as string, fontWeight: '600', fontSize: 13 }}>
                Event Context (optional)
              </Text>
              <TextInput
                style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
                value={eventName}
                onChangeText={setEventName}
                placeholder="Event Name"
                placeholderTextColor={colors.textMuted as string}
              />
              <TextInput
                style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
                value={eventLocation}
                onChangeText={setEventLocation}
                placeholder="Event Location"
                placeholderTextColor={colors.textMuted as string}
              />
              <TextInput
                style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="Event Date (YYYY-MM-DD)"
                placeholderTextColor={colors.textMuted as string}
              />
            </YStack>
          )}

          <TextInput
            style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes (optional)"
            placeholderTextColor={colors.textMuted as string}
          />

          <XStack gap={10} justifyContent="flex-end">
            <Pressable onPress={onClose}>
              <YStack paddingHorizontal={16} paddingVertical={8} borderRadius={6} borderWidth={1} borderColor={colors.border}>
                <Text style={{ color: colors.text as string }}>Cancel</Text>
              </YStack>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving}>
              <YStack paddingHorizontal={16} paddingVertical={8} borderRadius={6} backgroundColor={colors.primary as string}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving…' : 'Save'}</Text>
              </YStack>
            </Pressable>
          </XStack>
        </YStack>
      </ScrollView>
    </Modal>
  )
}

// ── Add Item Modal ─────────────────────────────────────────────────────────────

function AddItemModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const colors = useThemeColors()
  const store = useInventoryStore()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<'books' | 'hats' | 'clothing'>('books')
  const [sub, setSub] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setCategory('books')
      setSub('')
      setPrice('')
    }
  }, [open])

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Name required')
    const p = parseFloat(price)
    if (isNaN(p)) return Alert.alert('Valid price required')
    setSaving(true)
    try {
      await store.addMerchItem({ name: name.trim(), category, sub: category === 'clothing' ? sub || null : null, price: p })
      onClose()
    } catch {
      Alert.alert('Failed to add item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={onClose} title="Add Merch Item">
      <YStack gap={12}>
        <TextInput
          style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
          value={name}
          onChangeText={setName}
          placeholder="Item Name *"
          placeholderTextColor={colors.textMuted as string}
        />

        <YStack gap={4}>
          <Text style={{ fontSize: 13, color: colors.textMuted as string }}>Category</Text>
          <XStack gap={8}>
            {MERCH_CATEGORIES.map((c) => (
              <Pressable key={c} onPress={() => setCategory(c)}>
                <YStack
                  paddingHorizontal={12}
                  paddingVertical={6}
                  borderRadius={12}
                  backgroundColor={category === c ? colors.primary : 'transparent'}
                  borderWidth={1}
                  borderColor={category === c ? colors.primary : colors.border}
                >
                  <Text style={{ fontSize: 13, color: category === c ? '#fff' : (colors.text as string), textTransform: 'capitalize' }}>
                    {c}
                  </Text>
                </YStack>
              </Pressable>
            ))}
          </XStack>
        </YStack>

        {category === 'clothing' && (
          <YStack gap={4}>
            <Text style={{ fontSize: 13, color: colors.textMuted as string }}>Sub-category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <XStack gap={6}>
                {CLOTHING_SUBS.map((s) => (
                  <Pressable key={s} onPress={() => setSub(s)}>
                    <YStack
                      paddingHorizontal={10}
                      paddingVertical={4}
                      borderRadius={10}
                      backgroundColor={sub === s ? colors.primary : 'transparent'}
                      borderWidth={1}
                      borderColor={sub === s ? colors.primary : colors.border}
                    >
                      <Text style={{ fontSize: 12, color: sub === s ? '#fff' : (colors.text as string), textTransform: 'capitalize' }}>
                        {s}
                      </Text>
                    </YStack>
                  </Pressable>
                ))}
              </XStack>
            </ScrollView>
          </YStack>
        )}

        <TextInput
          style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
          value={price}
          onChangeText={setPrice}
          placeholder="Price *"
          keyboardType="decimal-pad"
          placeholderTextColor={colors.textMuted as string}
        />

        <XStack gap={10} justifyContent="flex-end">
          <Pressable onPress={onClose}>
            <YStack paddingHorizontal={16} paddingVertical={8} borderRadius={6} borderWidth={1} borderColor={colors.border}>
              <Text style={{ color: colors.text as string }}>Cancel</Text>
            </YStack>
          </Pressable>
          <Pressable onPress={handleSave} disabled={saving}>
            <YStack paddingHorizontal={16} paddingVertical={8} borderRadius={6} backgroundColor={colors.primary as string}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Adding…' : 'Add Item'}</Text>
            </YStack>
          </Pressable>
        </XStack>
      </YStack>
    </Modal>
  )
}

// ── Merch Analysis Tab ─────────────────────────────────────────────────────────

function MerchAnalysisTab() {
  const colors = useThemeColors()
  const { items, transactions } = useInventoryStore()
  const analysis = buildMerchAnalysis(transactions, items)

  const topItemsByRev = Object.entries(analysis.revenueByItem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([label, value]) => ({ label, value }))

  const seasonData = Object.entries(analysis.revBySeason).map(([label, value]) => ({ label, value }))

  const monthlyData = MONTHS.map((label, i) => ({ label, value: analysis.revByMonth[i] }))

  const locationData = Object.entries(analysis.revByLocation)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, value]) => ({ label, value }))

  const noSales = analysis.totalTx === 0

  const trendLabel = analysis.trend === 'rising'
    ? `📈 Trending Up: Revenue increasing at ${currency(Math.abs(analysis.slope))}/month (R²=${analysis.r2.toFixed(2)})`
    : analysis.trend === 'falling'
    ? `📉 Trending Down: Revenue declining at ${currency(Math.abs(analysis.slope))}/month (R²=${analysis.r2.toFixed(2)})`
    : '➡️ Stable: Revenue relatively flat'

  return (
    <ScrollView>
      <YStack padding={16} gap={20}>
        {/* Summary stat cards */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatCard label="Total Revenue" value={currency(analysis.totalRevenue)} />
          <StatCard label="Units Sold" value={String(analysis.totalUnits)} />
          <StatCard label="Transactions" value={String(analysis.totalTx)} />
          <StatCard label="Products" value={String(analysis.totalProducts)} />
          <StatCard label="Avg Sale" value={currency(analysis.avgSale)} />
        </View>

        {noSales ? (
          <YStack
            backgroundColor={colors.surface}
            borderRadius={8}
            padding={20}
            borderWidth={1}
            borderColor={colors.border}
            alignItems="center"
          >
            <Text style={{ color: colors.textMuted as string }}>No sales data yet.</Text>
          </YStack>
        ) : (
          <>
            {/* Top sellers bar chart */}
            <YStack
              backgroundColor={colors.surface}
              borderRadius={8}
              padding={16}
              borderWidth={1}
              borderColor={colors.border}
              gap={12}
            >
              <Text style={{ fontWeight: '700', color: colors.text as string }}>
                Top Sellers by Revenue
              </Text>
              <BarChart data={topItemsByRev} color="#007AFF" formatValue={currency} />
            </YStack>

            {/* Sales by season */}
            <YStack
              backgroundColor={colors.surface}
              borderRadius={8}
              padding={16}
              borderWidth={1}
              borderColor={colors.border}
              gap={12}
            >
              <Text style={{ fontWeight: '700', color: colors.text as string }}>Sales by Season</Text>
              <BarChart data={seasonData} color="#34C759" formatValue={currency} />
            </YStack>

            {/* Monthly trend */}
            <YStack
              backgroundColor={colors.surface}
              borderRadius={8}
              padding={16}
              borderWidth={1}
              borderColor={colors.border}
              gap={12}
            >
              <Text style={{ fontWeight: '700', color: colors.text as string }}>Monthly Revenue Trend</Text>
              <BarChart data={monthlyData} color="#FF9500" formatValue={currency} />
            </YStack>

            {/* Location */}
            {locationData.length > 0 && (
              <YStack
                backgroundColor={colors.surface}
                borderRadius={8}
                padding={16}
                borderWidth={1}
                borderColor={colors.border}
                gap={12}
              >
                <Text style={{ fontWeight: '700', color: colors.text as string }}>
                  Location Intelligence
                </Text>
                <BarChart data={locationData} color="#5856D6" formatValue={currency} />
              </YStack>
            )}

            {/* Insights */}
            <YStack gap={8}>
              {[
                analysis.bestSeason && `🏆 Best season: ${analysis.bestSeason[0]} with ${currency(analysis.bestSeason[1])}`,
                analysis.topSeller && `🎯 Top seller: ${analysis.topSeller[0]} — ${currency(analysis.topSeller[1])} revenue (${analysis.unitsByItem[analysis.topSeller[0]]} units)`,
                trendLabel,
              ]
                .filter(Boolean)
                .map((msg, i) => (
                  <YStack
                    key={i}
                    backgroundColor={colors.surface}
                    borderRadius={8}
                    padding={12}
                    borderWidth={1}
                    borderColor={colors.border}
                  >
                    <Text style={{ color: colors.text as string, fontSize: 13 }}>{msg}</Text>
                  </YStack>
                ))}
            </YStack>
          </>
        )}
      </YStack>
    </ScrollView>
  )
}

// ── Merch Inventory Tab ────────────────────────────────────────────────────────

function MerchInventoryTab({ admin }: { admin: boolean }) {
  const colors = useThemeColors()
  const store = useInventoryStore()
  const { items } = store
  const [adjItem, setAdjItem] = useState<MerchItem | null>(null)
  const [adjKind, setAdjKind] = useState<'cycle' | 'produce' | 'sale'>('cycle')
  const [addOpen, setAddOpen] = useState(false)

  const openAdj = (item: MerchItem, kind: 'cycle' | 'produce' | 'sale') => {
    setAdjItem(item)
    setAdjKind(kind)
  }

  const grouped: Record<string, Record<string, MerchItem[]>> = {}
  for (const item of items) {
    const cat = item.category
    const sub = item.sub ?? '__none__'
    if (!grouped[cat]) grouped[cat] = {}
    if (!grouped[cat][sub]) grouped[cat][sub] = []
    grouped[cat][sub].push(item)
  }

  return (
    <ScrollView>
      <YStack padding={12} gap={16}>
        {admin && (
          <Pressable onPress={() => setAddOpen(true)}>
            <XStack
              backgroundColor={colors.primary}
              borderRadius={8}
              paddingHorizontal={16}
              paddingVertical={10}
              alignSelf="flex-start"
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>+ Add Item</Text>
            </XStack>
          </Pressable>
        )}

        {items.length === 0 ? (
          <YStack
            backgroundColor={colors.surface}
            borderRadius={8}
            padding={20}
            borderWidth={1}
            borderColor={colors.border}
            alignItems="center"
          >
            <Text style={{ color: colors.textMuted as string }}>No items yet.</Text>
          </YStack>
        ) : null}

        {Object.entries(grouped).map(([cat, subs]) => (
          <YStack key={cat} gap={8}>
            <Text style={{ fontWeight: '700', color: colors.primary as string, fontSize: 15, textTransform: 'capitalize' }}>
              {cat}
            </Text>
            {Object.entries(subs).map(([sub, catItems]) => (
              <YStack key={sub} gap={6}>
                {sub !== '__none__' && (
                  <Text style={{ fontSize: 13, color: colors.textMuted as string, fontStyle: 'italic', textTransform: 'capitalize', paddingLeft: 4 }}>
                    {sub}
                  </Text>
                )}
                {catItems.map((item) => {
                  const isClothing = item.category === 'clothing'
                  return (
                    <YStack
                      key={item.id}
                      backgroundColor={colors.surface}
                      borderRadius={8}
                      padding={12}
                      borderWidth={1}
                      borderColor={colors.border}
                      gap={10}
                    >
                      <XStack justifyContent="space-between" alignItems="center">
                        <YStack>
                          <Text style={{ fontWeight: '700', color: colors.text as string }}>
                            {item.name}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.textMuted as string }}>
                            {currency(item.price)} each{item.sub ? ` · ${item.sub}` : ''}
                          </Text>
                        </YStack>
                        {admin && (
                          <Pressable
                            onPress={() => {
                              Alert.alert('Delete', `Delete ${item.name}?`, [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Delete', style: 'destructive', onPress: () => store.deleteMerchItem(item.id) },
                              ])
                            }}
                          >
                            <Text style={{ color: '#c0392b', fontSize: 18 }}>✕</Text>
                          </Pressable>
                        )}
                      </XStack>

                      {isClothing ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {CLOTHING_SIZES.map((sz) => {
                            const qty = item.sizes[sz] ?? 0
                            return (
                              <YStack
                                key={sz}
                                alignItems="center"
                                paddingHorizontal={8}
                                paddingVertical={4}
                                borderRadius={6}
                                borderWidth={1}
                                borderColor={qty === 0 ? '#e74c3c' : colors.border}
                              >
                                <Text style={{ fontSize: 11, color: colors.textMuted as string }}>{sz}</Text>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: qty === 0 ? '#e74c3c' : (colors.text as string) }}>
                                  {qty}
                                </Text>
                              </YStack>
                            )
                          })}
                        </View>
                      ) : (
                        <XStack alignItems="center" gap={8}>
                          <YStack
                            paddingHorizontal={10}
                            paddingVertical={4}
                            borderRadius={6}
                            borderWidth={1}
                            borderColor={colors.border}
                          >
                            <Text style={{ fontSize: 12, color: colors.textMuted as string }}>Stock</Text>
                            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text as string }}>
                              {item.sizes['one'] ?? 0}
                            </Text>
                          </YStack>
                        </XStack>
                      )}

                      <XStack gap={6} flexWrap="wrap">
                        <Pressable onPress={() => openAdj(item, 'cycle')}>
                          <YStack paddingHorizontal={10} paddingVertical={6} borderRadius={6} backgroundColor="#007AFF20" borderWidth={1} borderColor="#007AFF">
                            <Text style={{ color: '#007AFF', fontSize: 12, fontWeight: '600' }}>Cycle Count</Text>
                          </YStack>
                        </Pressable>
                        <Pressable onPress={() => openAdj(item, 'produce')}>
                          <YStack paddingHorizontal={10} paddingVertical={6} borderRadius={6} backgroundColor="#34C75920" borderWidth={1} borderColor="#34C759">
                            <Text style={{ color: '#34C759', fontSize: 12, fontWeight: '600' }}>+ Produce</Text>
                          </YStack>
                        </Pressable>
                        <Pressable onPress={() => openAdj(item, 'sale')}>
                          <YStack paddingHorizontal={10} paddingVertical={6} borderRadius={6} backgroundColor="#FF3B3020" borderWidth={1} borderColor="#FF3B30">
                            <Text style={{ color: '#FF3B30', fontSize: 12, fontWeight: '600' }}>Record Sale</Text>
                          </YStack>
                        </Pressable>
                      </XStack>
                    </YStack>
                  )
                })}
              </YStack>
            ))}
          </YStack>
        ))}
      </YStack>

      <AdjustmentModal
        item={adjItem}
        kind={adjKind}
        open={!!adjItem}
        onClose={() => setAdjItem(null)}
      />
      <AddItemModal open={addOpen} onClose={() => setAddOpen(false)} />
    </ScrollView>
  )
}

// ── Merch Transactions Tab ─────────────────────────────────────────────────────

function MerchTransactionsTab() {
  const colors = useThemeColors()
  const { transactions } = useInventoryStore()
  const [search, setSearch] = useState('')
  const [eventFilter, setEventFilter] = useState<'all' | 'direct'>('all')

  const filtered = transactions
    .filter((tx) => {
      if (eventFilter === 'direct' && tx.kind === 'sale' && tx.eventName) return false
      const q = search.toLowerCase()
      if (!q) return true
      return (
        tx.itemName.toLowerCase().includes(q) ||
        (tx.eventName?.toLowerCase().includes(q) ?? false) ||
        (tx.notes?.toLowerCase().includes(q) ?? false)
      )
    })
    .sort((a, b) => b.ts - a.ts)

  const kindColors: Record<string, string> = { cycle: '#007AFF', produce: '#34C759', sale: '#FF3B30' }
  const kindLabels: Record<string, string> = { cycle: 'Cycle Count', produce: 'Production', sale: 'Sale' }

  return (
    <YStack flex={1}>
      <YStack padding={12} gap={8}>
        <TextInput
          style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.surface as string }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search transactions…"
          placeholderTextColor={colors.textMuted as string}
        />
        <XStack gap={8}>
          {(['all', 'direct'] as const).map((f) => (
            <Pressable key={f} onPress={() => setEventFilter(f)}>
              <YStack
                paddingHorizontal={12}
                paddingVertical={6}
                borderRadius={12}
                backgroundColor={eventFilter === f ? colors.primary : 'transparent'}
                borderWidth={1}
                borderColor={eventFilter === f ? colors.primary : colors.border}
              >
                <Text style={{ fontSize: 12, color: eventFilter === f ? '#fff' : (colors.text as string) }}>
                  {f === 'all' ? 'All Events' : 'Direct Sales Only'}
                </Text>
              </YStack>
            </Pressable>
          ))}
        </XStack>
        <Text style={{ fontSize: 12, color: colors.textMuted as string }}>
          {filtered.length} transactions (filtered)
        </Text>
      </YStack>

      <ScrollView>
        <YStack padding={12} gap={10}>
          {filtered.length === 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius={8}
              padding={20}
              borderWidth={1}
              borderColor={colors.border}
              alignItems="center"
            >
              <Text style={{ color: colors.textMuted as string }}>No transactions found.</Text>
            </YStack>
          ) : null}
          {filtered.map((tx) => {
            const revenue = tx.kind === 'sale' ? tx.qty * tx.price : null
            const sign = tx.kind === 'sale' ? '-' : '+'
            return (
              <YStack
                key={tx.id}
                backgroundColor={colors.surface}
                borderRadius={8}
                padding={12}
                borderWidth={1}
                borderColor={colors.border}
                gap={6}
              >
                <XStack justifyContent="space-between" alignItems="center">
                  <Text style={{ fontWeight: '700', color: colors.text as string, flex: 1 }}>
                    {tx.itemName}
                  </Text>
                  <YStack
                    paddingHorizontal={8}
                    paddingVertical={2}
                    borderRadius={4}
                    backgroundColor={kindColors[tx.kind] + '20'}
                  >
                    <Text style={{ fontSize: 11, color: kindColors[tx.kind], fontWeight: '700' }}>
                      {kindLabels[tx.kind]}
                    </Text>
                  </YStack>
                </XStack>

                <Text style={{ fontSize: 13, color: colors.text as string }}>
                  {sign}{tx.qty} × {tx.size}
                  {tx.kind !== 'cycle' ? '' : ' (set)'}
                </Text>

                {revenue !== null && (
                  <Text style={{ fontSize: 13, color: '#34C759', fontWeight: '600' }}>
                    Revenue: {currency(revenue)}
                  </Text>
                )}

                {tx.eventName && (
                  <XStack gap={6} alignItems="center">
                    <YStack paddingHorizontal={6} paddingVertical={2} borderRadius={4} backgroundColor={colors.border}>
                      <Text style={{ fontSize: 11, color: colors.textMuted as string }}>{tx.eventName}</Text>
                    </YStack>
                    {tx.eventDate && (
                      <Text style={{ fontSize: 11, color: colors.textMuted as string }}>{tx.eventDate}</Text>
                    )}
                    {tx.eventLocation && (
                      <Text style={{ fontSize: 11, color: colors.textMuted as string }}>@ {tx.eventLocation}</Text>
                    )}
                  </XStack>
                )}

                {tx.kind === 'sale' && !tx.eventName && (
                  <Text style={{ fontSize: 11, color: colors.textMuted as string, fontStyle: 'italic' }}>
                    Direct sale
                  </Text>
                )}

                {tx.notes && (
                  <Text style={{ fontSize: 12, color: colors.textMuted as string }}>Note: {tx.notes}</Text>
                )}

                <Text style={{ fontSize: 11, color: colors.textMuted as string }}>{fmtDate(tx.ts)}</Text>
              </YStack>
            )
          })}
        </YStack>
      </ScrollView>
    </YStack>
  )
}

// ── Merch View ─────────────────────────────────────────────────────────────────

function MerchView({ admin }: { admin: boolean }) {
  const [inner, setInner] = useState('Inventory')
  const innerTabs = ['Inventory', 'Transactions', 'Analysis & Trends']
  return (
    <YStack flex={1}>
      <TabBar tabs={innerTabs} active={inner} onChange={setInner} />
      {inner === 'Inventory' && <MerchInventoryTab admin={admin} />}
      {inner === 'Transactions' && <MerchTransactionsTab />}
      {inner === 'Analysis & Trends' && <MerchAnalysisTab />}
    </YStack>
  )
}

// ── Reorder View ───────────────────────────────────────────────────────────────

function ReorderView() {
  const colors = useThemeColors()
  const store = useInventoryStore()
  const { reorderItems } = store
  const [name, setName] = useState('')
  const [link, setLink] = useState('')
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editLink, setEditLink] = useState('')
  const [adding, setAdding] = useState(false)

  const filtered = reorderItems.filter((r) =>
    !search || r.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = async () => {
    const trimName = name.trim()
    const trimLink = link.trim()
    if (!trimName) return Alert.alert('Name required')
    if (!trimLink.startsWith('http://') && !trimLink.startsWith('https://')) {
      return Alert.alert('URL must start with http:// or https://')
    }
    if (reorderItems.some((r) => r.name.toLowerCase() === trimName.toLowerCase())) {
      return Alert.alert('Duplicate name', 'An item with this name already exists.')
    }
    setAdding(true)
    try {
      await store.addReorderItem(trimName, trimLink)
      setName('')
      setLink('')
    } catch {
      Alert.alert('Failed to add')
    } finally {
      setAdding(false)
    }
  }

  const handleEditSave = async (id: number) => {
    const trimName = editName.trim()
    const trimLink = editLink.trim()
    if (!trimName) return Alert.alert('Name required')
    if (!trimLink.startsWith('http://') && !trimLink.startsWith('https://')) {
      return Alert.alert('URL must start with http:// or https://')
    }
    await store.updateReorderItem(id, { name: trimName, link: trimLink })
    setEditId(null)
  }

  return (
    <ScrollView>
      <YStack padding={12} gap={16}>
        {/* Add form */}
        <YStack
          backgroundColor={colors.surface}
          borderRadius={8}
          padding={12}
          borderWidth={1}
          borderColor={colors.border}
          gap={8}
        >
          <Text style={{ fontWeight: '700', color: colors.text as string }}>+ Add Reorder Item</Text>
          <TextInput
            style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
            value={name}
            onChangeText={setName}
            placeholder="Item Name *"
            placeholderTextColor={colors.textMuted as string}
          />
          <TextInput
            style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
            value={link}
            onChangeText={setLink}
            placeholder="Reorder URL (https://...) *"
            keyboardType="url"
            autoCapitalize="none"
            placeholderTextColor={colors.textMuted as string}
          />
          <Pressable onPress={handleAdd} disabled={adding}>
            <YStack
              paddingHorizontal={16}
              paddingVertical={8}
              borderRadius={6}
              backgroundColor={colors.primary as string}
              alignSelf="flex-start"
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{adding ? 'Adding…' : 'Add'}</Text>
            </YStack>
          </Pressable>
        </YStack>

        {/* Search */}
        <TextInput
          style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.surface as string }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Filter items…"
          placeholderTextColor={colors.textMuted as string}
        />

        {/* List */}
        <YStack gap={8}>
          {filtered.length === 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius={8}
              padding={20}
              borderWidth={1}
              borderColor={colors.border}
              alignItems="center"
            >
              <Text style={{ color: colors.textMuted as string }}>No reorder items yet.</Text>
            </YStack>
          ) : null}
          {filtered.map((item) =>
            editId === item.id ? (
              <YStack
                key={item.id}
                backgroundColor={colors.surface}
                borderRadius={8}
                padding={12}
                borderWidth={1}
                borderColor={colors.primary}
                gap={8}
              >
                <TextInput
                  style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
                  value={editName}
                  onChangeText={setEditName}
                />
                <TextInput
                  style={[styles.input, { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.background as string }]}
                  value={editLink}
                  onChangeText={setEditLink}
                  keyboardType="url"
                  autoCapitalize="none"
                />
                <XStack gap={8}>
                  <Pressable onPress={() => handleEditSave(item.id)}>
                    <YStack paddingHorizontal={12} paddingVertical={6} borderRadius={6} backgroundColor={colors.primary as string}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
                    </YStack>
                  </Pressable>
                  <Pressable onPress={() => setEditId(null)}>
                    <YStack paddingHorizontal={12} paddingVertical={6} borderRadius={6} borderWidth={1} borderColor={colors.border}>
                      <Text style={{ color: colors.text as string }}>Cancel</Text>
                    </YStack>
                  </Pressable>
                </XStack>
              </YStack>
            ) : (
              <YStack
                key={item.id}
                backgroundColor={colors.surface}
                borderRadius={8}
                padding={12}
                borderWidth={1}
                borderColor={colors.border}
                gap={4}
              >
                <XStack justifyContent="space-between" alignItems="center">
                  <Text style={{ fontWeight: '600', color: colors.text as string, flex: 1 }}>{item.name}</Text>
                  <XStack gap={8} alignItems="center">
                    <Pressable
                      onPress={() => {
                        setEditId(item.id)
                        setEditName(item.name)
                        setEditLink(item.link)
                      }}
                    >
                      <Text style={{ color: colors.primary as string, fontSize: 13 }}>✎ Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => Linking.openURL(item.link).catch(() => {})}>
                      <Text style={{ color: '#007AFF', fontSize: 13 }}>Order ↗</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        Alert.alert('Delete', `Delete "${item.name}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => store.deleteReorderItem(item.id) },
                        ])
                      }}
                    >
                      <Text style={{ color: '#c0392b', fontSize: 16 }}>✕</Text>
                    </Pressable>
                  </XStack>
                </XStack>
                <Text
                  style={{ fontSize: 12, color: '#007AFF' }}
                  numberOfLines={1}
                >
                  {item.link}
                </Text>
              </YStack>
            )
          )}
        </YStack>
      </YStack>
    </ScrollView>
  )
}

// ── Production Analysis Tab ────────────────────────────────────────────────────

function ProductionAnalysisTab() {
  const colors = useThemeColors()
  const { productionItems } = useInventoryStore()
  const types = ['', ...Array.from(new Set(productionItems.map((r) => r.type))).sort()]
  const [typeFilter, setTypeFilter] = useState('')

  const analysis = buildProductionAnalysis(productionItems, typeFilter)

  const topValues = Object.entries(analysis.valueByKey)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([label, value]) => ({ label, value }))

  const topQtys = Object.entries(analysis.qtyByKey)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([label, value]) => ({ label, value }))

  return (
    <ScrollView>
      <YStack padding={16} gap={20}>
        {/* Type filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap={6}>
            {types.map((t) => (
              <Pressable key={t || '__all'} onPress={() => setTypeFilter(t)}>
                <YStack
                  paddingHorizontal={12}
                  paddingVertical={6}
                  borderRadius={12}
                  backgroundColor={typeFilter === t ? colors.primary : 'transparent'}
                  borderWidth={1}
                  borderColor={typeFilter === t ? colors.primary : colors.border}
                >
                  <Text style={{ fontSize: 13, color: typeFilter === t ? '#fff' : (colors.text as string) }}>
                    {t || 'Aggregate'}
                  </Text>
                </YStack>
              </Pressable>
            ))}
          </XStack>
        </ScrollView>

        {/* Summary stats */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <StatCard label="Total Quantity" value={String(analysis.totalQty)} />
          <StatCard label="Total Value" value={currency(analysis.totalValue)} />
          <StatCard label="Unique Items" value={String(analysis.uniqueItems)} />
        </View>

        {/* Bar charts */}
        {topValues.length > 0 && (
          <YStack
            backgroundColor={colors.surface}
            borderRadius={8}
            padding={16}
            borderWidth={1}
            borderColor={colors.border}
            gap={12}
          >
            <Text style={{ fontWeight: '700', color: colors.text as string }}>
              Total Value by Item
            </Text>
            <BarChart data={topValues} color="#007AFF" formatValue={currency} />
          </YStack>
        )}

        {topQtys.length > 0 && (
          <YStack
            backgroundColor={colors.surface}
            borderRadius={8}
            padding={16}
            borderWidth={1}
            borderColor={colors.border}
            gap={12}
          >
            <Text style={{ fontWeight: '700', color: colors.text as string }}>
              Quantity by Item
            </Text>
            <BarChart data={topQtys} color="#34C759" />
          </YStack>
        )}

        {topValues.length === 0 && (
          <YStack
            backgroundColor={colors.surface}
            borderRadius={8}
            padding={20}
            borderWidth={1}
            borderColor={colors.border}
            alignItems="center"
          >
            <Text style={{ color: colors.textMuted as string }}>No production data yet.</Text>
          </YStack>
        )}
      </YStack>
    </ScrollView>
  )
}

// ── Production Inventory Tab ───────────────────────────────────────────────────

function ProductionInventoryTab() {
  const colors = useThemeColors()
  const store = useInventoryStore()
  const { productionItems } = store

  const [filterItem, setFilterItem] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterLength, setFilterLength] = useState('')
  const [filterLoc, setFilterLoc] = useState('')

  const saveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const debounceUpdate = (id: number, patch: Partial<ProductionItem>) => {
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id])
    saveTimers.current[id] = setTimeout(() => {
      store.updateProductionRow(id, patch)
    }, 250)
  }

  const filtered = productionItems.filter((r) => {
    if (filterItem && !r.item.toLowerCase().includes(filterItem.toLowerCase())) return false
    if (filterType && !r.type.toLowerCase().includes(filterType.toLowerCase())) return false
    if (filterLength && !r.length.toLowerCase().includes(filterLength.toLowerCase())) return false
    if (filterLoc && r.location !== filterLoc) return false
    return true
  })

  const subtotalQty = filtered.reduce((a, r) => a + r.qty, 0)
  const subtotalValue = filtered.reduce((a, r) => a + r.qty * r.unitPrice, 0)

  return (
    <YStack flex={1}>
      {/* Filter row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <XStack padding={8} gap={6}>
          {[
            { label: 'Item', value: filterItem, onChange: setFilterItem },
            { label: 'Type', value: filterType, onChange: setFilterType },
            { label: 'Length', value: filterLength, onChange: setFilterLength },
          ].map(({ label, value, onChange }) => (
            <TextInput
              key={label}
              style={[
                styles.filterInput,
                { color: colors.text as string, borderColor: colors.border as string, backgroundColor: colors.surface as string },
              ]}
              value={value}
              onChangeText={onChange}
              placeholder={label}
              placeholderTextColor={colors.textMuted as string}
            />
          ))}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 34 }}>
            <XStack gap={4}>
              {['', ...PRODUCTION_LOCATIONS].map((loc) => (
                <Pressable key={loc || '__all'} onPress={() => setFilterLoc(loc)}>
                  <YStack
                    paddingHorizontal={10}
                    paddingVertical={6}
                    borderRadius={6}
                    backgroundColor={filterLoc === loc ? colors.primary : 'transparent'}
                    borderWidth={1}
                    borderColor={filterLoc === loc ? colors.primary : colors.border}
                    height={34}
                    justifyContent="center"
                  >
                    <Text style={{ fontSize: 12, color: filterLoc === loc ? '#fff' : (colors.text as string) }}>
                      {loc || 'All Locs'}
                    </Text>
                  </YStack>
                </Pressable>
              ))}
            </XStack>
          </ScrollView>
        </XStack>
      </ScrollView>

      {/* Add row button */}
      <XStack padding={8}>
        <Pressable onPress={() => store.addProductionRow()}>
          <XStack
            paddingHorizontal={12}
            paddingVertical={6}
            borderRadius={6}
            backgroundColor={colors.primary as string}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>+ Add Row</Text>
          </XStack>
        </Pressable>
      </XStack>

      {/* Spreadsheet */}
      <ScrollView style={{ flex: 1 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
          <YStack>
            {/* Header */}
            <View style={[styles.tableRow, { backgroundColor: colors.surface as string, borderBottomColor: colors.border as string, borderBottomWidth: 1 }]}>
              {['Item', 'Qty', 'Type', 'Length (ft)', 'Location', 'Unit Price', 'Total', ''].map((h, i) => (
                <View key={i} style={[styles.tableCell, i === 0 ? styles.cellItem : i === 4 ? styles.cellLoc : i === 6 ? styles.cellTotal : i === 7 ? styles.cellDel : {}]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted as string }}>{h}</Text>
                </View>
              ))}
            </View>

            {filtered.map((row) => {
              const total = row.qty * row.unitPrice
              return (
                <View key={row.id} style={[styles.tableRow, { borderBottomColor: colors.border as string, borderBottomWidth: 1 }]}>
                  <View style={[styles.tableCell, styles.cellItem]}>
                    <TextInput
                      style={[styles.cellInput, { color: colors.text as string }]}
                      defaultValue={row.item}
                      onEndEditing={(e) => debounceUpdate(row.id, { item: e.nativeEvent.text })}
                      placeholder="Item"
                      placeholderTextColor={colors.textMuted as string}
                    />
                  </View>
                  <View style={styles.tableCell}>
                    <TextInput
                      style={[styles.cellInput, { color: colors.text as string }]}
                      defaultValue={String(row.qty)}
                      keyboardType="numeric"
                      onEndEditing={(e) => debounceUpdate(row.id, { qty: Number(e.nativeEvent.text) || 0 })}
                      placeholderTextColor={colors.textMuted as string}
                    />
                  </View>
                  <View style={styles.tableCell}>
                    <TextInput
                      style={[styles.cellInput, { color: colors.text as string }]}
                      defaultValue={row.type}
                      onEndEditing={(e) => debounceUpdate(row.id, { type: e.nativeEvent.text })}
                      placeholder="Type"
                      placeholderTextColor={colors.textMuted as string}
                    />
                  </View>
                  <View style={styles.tableCell}>
                    <TextInput
                      style={[styles.cellInput, { color: colors.text as string }]}
                      defaultValue={row.length}
                      onEndEditing={(e) => debounceUpdate(row.id, { length: e.nativeEvent.text })}
                      placeholder="—"
                      placeholderTextColor={colors.textMuted as string}
                    />
                  </View>
                  <View style={[styles.tableCell, styles.cellLoc]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 30 }}>
                      <XStack gap={3}>
                        {PRODUCTION_LOCATIONS.map((loc) => (
                          <Pressable key={loc} onPress={() => store.updateProductionRow(row.id, { location: loc })}>
                            <YStack
                              paddingHorizontal={6}
                              paddingVertical={2}
                              borderRadius={4}
                              backgroundColor={row.location === loc ? colors.primary : 'transparent'}
                              borderWidth={1}
                              borderColor={row.location === loc ? colors.primary : colors.border}
                            >
                              <Text style={{ fontSize: 10, color: row.location === loc ? '#fff' : (colors.text as string) }}>
                                {loc}
                              </Text>
                            </YStack>
                          </Pressable>
                        ))}
                      </XStack>
                    </ScrollView>
                  </View>
                  <View style={styles.tableCell}>
                    <TextInput
                      style={[styles.cellInput, { color: colors.text as string }]}
                      defaultValue={String(row.unitPrice)}
                      keyboardType="decimal-pad"
                      onEndEditing={(e) => debounceUpdate(row.id, { unitPrice: parseFloat(e.nativeEvent.text) || 0 })}
                      placeholderTextColor={colors.textMuted as string}
                    />
                  </View>
                  <View style={[styles.tableCell, styles.cellTotal]}>
                    <Text style={{ fontSize: 13, color: colors.text as string }}>{currency(total)}</Text>
                  </View>
                  <View style={[styles.tableCell, styles.cellDel]}>
                    <Pressable
                      onPress={() => {
                        Alert.alert('Delete row?', undefined, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => store.deleteProductionRow(row.id) },
                        ])
                      }}
                    >
                      <Text style={{ color: '#c0392b', fontSize: 16 }}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              )
            })}

            {/* Subtotal row */}
            {filtered.length > 0 && (
              <View style={[styles.tableRow, { backgroundColor: colors.surface as string, borderTopWidth: 2, borderTopColor: colors.border as string }]}>
                <View style={[styles.tableCell, styles.cellItem]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text as string }}>
                    Subtotal ({filtered.length} rows)
                  </Text>
                </View>
                <View style={styles.tableCell}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text as string }}>{subtotalQty}</Text>
                </View>
                <View style={styles.tableCell} />
                <View style={styles.tableCell} />
                <View style={[styles.tableCell, styles.cellLoc]} />
                <View style={styles.tableCell} />
                <View style={[styles.tableCell, styles.cellTotal]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text as string }}>{currency(subtotalValue)}</Text>
                </View>
                <View style={[styles.tableCell, styles.cellDel]} />
              </View>
            )}
          </YStack>
        </ScrollView>
      </ScrollView>
    </YStack>
  )
}

// ── Production View ────────────────────────────────────────────────────────────

function ProductionView() {
  const [inner, setInner] = useState('Inventory')
  return (
    <YStack flex={1}>
      <TabBar tabs={['Inventory', 'Analysis']} active={inner} onChange={setInner} />
      {inner === 'Inventory' && <ProductionInventoryTab />}
      {inner === 'Analysis' && <ProductionAnalysisTab />}
    </YStack>
  )
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function InventoryScreen() {
  const colors = useThemeColors()
  const router = useRouter()
  const { profile } = useAuthStore()
  const admin = isAdmin(profile)
  const merch = isMerch(profile)
  const store = useInventoryStore()

  // Role guard
  useEffect(() => {
    if (!merch && !admin) router.replace('/home')
  }, [merch, admin])

  useEffect(() => {
    store.loadMerch()
    if (admin) {
      store.loadReorder()
      store.loadProduction()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin])

  const tabs = admin ? ['Merch', 'Reorder', 'Production'] : ['Merch']
  const [tab, setTab] = useState('Merch')

  if (!merch && !admin) return null

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Inventory' }} />

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'Merch' && <MerchView admin={admin} />}
      {tab === 'Reorder' && admin && <ReorderView />}
      {tab === 'Production' && admin && <ProductionView />}
    </YStack>
  )
}

const styles = StyleSheet.create({
  input: {
    height: 40,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 14,
  },
  filterInput: {
    height: 34,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 6,
    fontSize: 13,
    minWidth: 80,
  },
  sizeInput: {
    height: 36,
    width: 60,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: 6,
    fontSize: 14,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  tableCell: {
    width: 90,
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  cellItem: { width: 140 },
  cellLoc: { width: 260 },
  cellTotal: { width: 80 },
  cellDel: { width: 36 },
  cellInput: {
    fontSize: 13,
    paddingVertical: 2,
    paddingHorizontal: 2,
    minWidth: 50,
  },
})
