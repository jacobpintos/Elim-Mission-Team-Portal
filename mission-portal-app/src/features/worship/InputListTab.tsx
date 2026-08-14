import { useEffect, useCallback, useState } from 'react'
import { ScrollView, TextInput, View, Pressable, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useInputListStore } from '@/stores/inputListStore'
import type { InputListLocation } from '@/stores/inputListStore'

const LOCATIONS: { key: InputListLocation; label: string }[] = [
  { key: 'sunday', label: 'Sunday' },
  { key: 'event', label: 'Event' },
  { key: 'wh2', label: 'WH2' },
]

export function InputListTab() {
  const colors = useThemeColors()
  const [activeLoc, setActiveLoc] = useState<InputListLocation>('sunday')
  const { rows, loading, loadLocation, setRow, saveLocation } = useInputListStore()

  useEffect(() => {
    loadLocation(activeLoc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLoc])

  const handleBlur = useCallback(() => {
    saveLocation(activeLoc).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLoc])

  const handleSwitchLocation = (loc: InputListLocation) => {
    // Save current before switching
    saveLocation(activeLoc).catch(() => {})
    setActiveLoc(loc)
  }

  const currentRows = rows[activeLoc] ?? []
  const isLoading = loading[activeLoc]

  const evenBg = colors.surface
  const oddBg = colors.background

  return (
    <YStack flex={1}>
      {/* Location tabs */}
      <XStack paddingHorizontal="$3" paddingTop="$2" paddingBottom="$1" gap="$2">
        {LOCATIONS.map(({ key, label }) => (
          <Pressable key={key} onPress={() => handleSwitchLocation(key)}>
            <XStack
              backgroundColor={activeLoc === key ? colors.primary : colors.surface}
              borderRadius={99}
              borderWidth={1}
              borderColor={activeLoc === key ? colors.primary : colors.border}
              paddingHorizontal="$3"
              paddingVertical="$1"
            >
              <Text
                color={activeLoc === key ? 'white' : colors.textMuted}
                fontWeight={activeLoc === key ? '700' : '400'}
                fontSize="$3"
              >
                {label}
              </Text>
            </XStack>
          </Pressable>
        ))}
      </XStack>

      {isLoading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Text color={colors.textMuted}>Loading…</Text>
        </YStack>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true}>
          {/* Table header */}
          <View
            style={[
              styles.headerRow,
              { backgroundColor: colors.primary + '18', borderBottomColor: colors.border },
            ]}
          >
            <Text style={styles.numCell} color={colors.primary} fontWeight="700" fontSize={12}>
              #
            </Text>
            <Text style={styles.inputCell} color={colors.primary} fontWeight="700" fontSize={12}>
              INPUT
            </Text>
            <Text style={styles.outputCell} color={colors.primary} fontWeight="700" fontSize={12}>
              OUTPUT
            </Text>
          </View>

          {currentRows.map((row, idx) => (
            <View
              key={idx}
              style={[
                styles.dataRow,
                {
                  backgroundColor: idx % 2 === 0 ? evenBg : oddBg,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <Text style={styles.numCell} color={colors.textMuted} fontSize={12}>
                {idx + 1}
              </Text>
              <View style={styles.inputCell}>
                <TextInput
                  style={[styles.cellInput, { color: colors.text }]}
                  value={row.input}
                  onChangeText={(v) => setRow(activeLoc, idx, 'input', v)}
                  onBlur={handleBlur}
                  placeholder="—"
                  placeholderTextColor={colors.border}
                />
              </View>
              <View style={styles.outputCell}>
                <TextInput
                  style={[styles.cellInput, { color: colors.text }]}
                  value={row.output}
                  onChangeText={(v) => setRow(activeLoc, idx, 'output', v)}
                  onBlur={handleBlur}
                  placeholder="—"
                  placeholderTextColor={colors.border}
                />
              </View>
            </View>
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </YStack>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    minHeight: 38,
  },
  numCell: {
    width: 32,
    textAlign: 'center',
    fontSize: 12,
  },
  inputCell: {
    flex: 1,
    paddingRight: 4,
  },
  outputCell: {
    flex: 1,
    paddingLeft: 4,
  },
  cellInput: {
    fontSize: 13,
    paddingVertical: 6,
    paddingHorizontal: 4,
    outlineStyle: 'none',
  } as object,
})
