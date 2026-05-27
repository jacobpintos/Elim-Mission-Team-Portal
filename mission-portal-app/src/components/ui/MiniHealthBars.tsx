import { XStack, YStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'

export interface SectionHealth {
  sec: { id: string; label: string; color: string }
  total: number
  done: number
  overdue: number
  behind: number
  expectedPct: number
  actualPct: number
  isLagging: boolean
}

interface MiniHealthBarsProps {
  sections: SectionHealth[]
  compact?: boolean
}

export function MiniHealthBars({ sections, compact }: MiniHealthBarsProps) {
  const colors = useThemeColors()
  if (!sections.length) return null

  return (
    <YStack gap="$1">
      {sections.map((sh) => (
        <YStack key={sh.sec.id} gap={2}>
          {!compact ? (
            <XStack justifyContent="space-between">
              <Text color={colors.textMuted} fontSize={10}>
                {sh.sec.label}
              </Text>
              <Text color={colors.textMuted} fontSize={10}>
                {sh.done}/{sh.total}
                {sh.overdue > 0 ? ` · ⚠ ${sh.overdue}` : ''}
              </Text>
            </XStack>
          ) : null}
          <XStack height={6} backgroundColor={colors.border} borderRadius={3} overflow="hidden">
            {/* Expected progress (grey) */}
            <YStack
              position="absolute"
              left={0}
              top={0}
              bottom={0}
              width={`${sh.expectedPct}%`}
              backgroundColor={colors.border}
              borderRadius={3}
            />
            {/* Actual progress (colored) */}
            <YStack
              position="absolute"
              left={0}
              top={0}
              bottom={0}
              width={`${sh.actualPct}%`}
              backgroundColor={sh.isLagging ? '#c0392b' : '#27ae60'}
              borderRadius={3}
            />
          </XStack>
        </YStack>
      ))}
    </YStack>
  )
}
