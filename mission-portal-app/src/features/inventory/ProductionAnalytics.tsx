import { ScrollView, View, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import type { InventoryItem, InventoryCategory } from '@/types/inventory'

const CHART_COLORS = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ac',
]

interface ProductionAnalyticsProps {
  items: InventoryItem[]
  categories: InventoryCategory[]
}

interface BarRowProps {
  label: string
  value: number
  maxValue: number
  color: string
  valueLabel: string
}

function BarRow({ label, value, maxValue, color, valueLabel }: BarRowProps) {
  const colors = useThemeColors()
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 2 : 0) : 0
  return (
    <XStack gap="$2" alignItems="center" paddingVertical={5}>
      <Text style={styles.barLabel} color={colors.text} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.barFill,
            { width: `${pct}%` as unknown as number, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.barValue} color={colors.textMuted}>
        {valueLabel}
      </Text>
    </XStack>
  )
}

export function ProductionAnalytics({ items, categories }: ProductionAnalyticsProps) {
  const colors = useThemeColors()

  const categoryMap = new Map(categories.map((c) => [String(c.id), c.name]))

  const valueByCategory = [
    ...categories.map((cat) => {
      const catItems = items.filter((i) => String(i.categoryId) === String(cat.id))
      const value = catItems.reduce((s, i) => s + (i.price ?? 0) * (i.qty ?? 0), 0)
      const qty = catItems.reduce((s, i) => s + (i.qty ?? 0), 0)
      return { name: cat.name, value, qty }
    }),
    (() => {
      const uncatItems = items.filter((i) => !i.categoryId)
      const value = uncatItems.reduce((s, i) => s + (i.price ?? 0) * (i.qty ?? 0), 0)
      const qty = uncatItems.reduce((s, i) => s + (i.qty ?? 0), 0)
      return { name: 'Uncategorized', value, qty }
    })(),
  ].filter((c) => c.value > 0 || c.qty > 0)

  valueByCategory.sort((a, b) => b.value - a.value)

  const maxValue = Math.max(...valueByCategory.map((c) => c.value), 1)
  const maxQty = Math.max(...valueByCategory.map((c) => c.qty), 1)
  const totalValue = valueByCategory.reduce((s, c) => s + c.value, 0)
  const totalQty = items.reduce((s, i) => s + (i.qty ?? 0), 0)

  if (items.length === 0) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
        <Text color={colors.textMuted} textAlign="center">
          No items yet. Add items in the Items tab.
        </Text>
      </YStack>
    )
  }

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
      <YStack padding="$3" paddingBottom="$8" gap="$4">
        {/* Summary cards */}
        <XStack gap="$2">
          <YStack
            flex={1}
            backgroundColor={colors.surface}
            borderRadius="$3"
            borderWidth={1}
            borderColor={colors.border}
            padding="$3"
            gap="$0.5"
          >
            <Text color={colors.textMuted} fontSize="$2">
              Total Value
            </Text>
            <Text color={colors.primary} fontWeight="700" fontSize="$5">
              $
              {totalValue.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
          </YStack>
          <YStack
            flex={1}
            backgroundColor={colors.surface}
            borderRadius="$3"
            borderWidth={1}
            borderColor={colors.border}
            padding="$3"
            gap="$0.5"
          >
            <Text color={colors.textMuted} fontSize="$2">
              Total Items
            </Text>
            <Text color={colors.primary} fontWeight="700" fontSize="$5">
              {totalQty.toLocaleString()}
            </Text>
          </YStack>
        </XStack>

        {/* Value by category */}
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$3"
          borderWidth={1}
          borderColor={colors.border}
          padding="$3"
          gap="$2"
        >
          <Text color={colors.text} fontWeight="700" fontSize="$3">
            Inventory Value by Category
          </Text>
          {valueByCategory.map((cat, i) => (
            <BarRow
              key={cat.name}
              label={cat.name}
              value={cat.value}
              maxValue={maxValue}
              color={CHART_COLORS[i % CHART_COLORS.length]}
              valueLabel={`$${cat.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
          ))}
          {/* Color legend */}
          <XStack flexWrap="wrap" gap="$2" marginTop="$1">
            {valueByCategory.map((cat, i) => (
              <XStack key={cat.name} gap="$1" alignItems="center">
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] },
                  ]}
                />
                <Text color={colors.textMuted} fontSize="$1">
                  {cat.name} ({totalValue > 0 ? ((cat.value / totalValue) * 100).toFixed(1) : '0'}%)
                </Text>
              </XStack>
            ))}
          </XStack>
        </YStack>

        {/* Quantity by category */}
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$3"
          borderWidth={1}
          borderColor={colors.border}
          padding="$3"
          gap="$2"
        >
          <Text color={colors.text} fontWeight="700" fontSize="$3">
            Quantity by Category
          </Text>
          {valueByCategory.map((cat, i) => (
            <BarRow
              key={cat.name}
              label={cat.name}
              value={cat.qty}
              maxValue={maxQty}
              color={CHART_COLORS[i % CHART_COLORS.length]}
              valueLabel={`${cat.qty} unit${cat.qty !== 1 ? 's' : ''}`}
            />
          ))}
        </YStack>
      </YStack>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  barLabel: {
    width: 100,
    fontSize: 13,
  },
  barTrack: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 7,
  },
  barValue: {
    width: 80,
    fontSize: 12,
    textAlign: 'right',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
