import { View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { autoTextColor } from '@/theme/contrast'
import type { ThemeDoc } from '@/types/theme'

interface ThemePreviewProps {
  theme: ThemeDoc
}

export function ThemePreview({ theme }: ThemePreviewProps) {
  const navTextColor = theme.onPrimaryOverride ?? autoTextColor(theme.primary)
  const cardBg = theme.dark.surface
  const cardText = theme.dark.text
  const btnText = theme.onPrimaryOverride ?? autoTextColor(theme.primary)

  return (
    <YStack
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$3"
      overflow="hidden"
      style={{ width: '100%', maxWidth: 320 }}
    >
      {/* App bar */}
      <View
        style={{
          backgroundColor: theme.primary,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: navTextColor, fontWeight: '700', fontSize: 16 }}>
          Mission Portal
        </Text>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: 'rgba(255,255,255,0.3)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: navTextColor, fontSize: 12 }}>JD</Text>
        </View>
      </View>

      {/* Content area */}
      <View style={{ backgroundColor: theme.dark.background, padding: 16, gap: 12 }}>
        {/* Card */}
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 8,
            padding: 14,
            gap: 8,
          }}
        >
          <Text style={{ color: cardText, fontWeight: '700', fontSize: 15 }}>
            Upcoming Event
          </Text>
          <Text style={{ color: theme.dark.textMuted, fontSize: 13 }}>
            Sunday Service — Dec 8, 2024
          </Text>
          <XStack gap="$2" marginTop="$1">
            {/* Badge */}
            <View
              style={{
                backgroundColor: theme.accent,
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <Text
                style={{ color: autoTextColor(theme.accent), fontSize: 11, fontWeight: '600' }}
              >
                Confirmed
              </Text>
            </View>
          </XStack>
        </View>

        {/* Button */}
        <View
          style={{
            backgroundColor: theme.primary,
            borderRadius: 8,
            padding: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: btnText, fontWeight: '700', fontSize: 14 }}>
            View Schedule
          </Text>
        </View>

        {/* Second card */}
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 8,
            padding: 14,
            gap: 6,
          }}
        >
          <Text style={{ color: cardText, fontWeight: '700', fontSize: 14 }}>
            My Tasks
          </Text>
          {['Set up chairs', 'Sound check', 'Merch table'].map((task) => (
            <XStack key={task} alignItems="center" gap="$2">
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  borderWidth: 2,
                  borderColor: theme.primary,
                }}
              />
              <Text style={{ color: theme.dark.textMuted, fontSize: 12 }}>{task}</Text>
            </XStack>
          ))}
        </View>
      </View>
    </YStack>
  )
}
