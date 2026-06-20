import { Modal, Pressable, ScrollView, View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/theme/useThemeColors'
import { useTourStore } from './tourStore'
import { SHOWCASES } from './showcases'

export function TourOverlay() {
  const c = useThemeColors()
  const insets = useSafeAreaInsets()
  const { active, title, steps, index, next, prev, end } = useTourStore()

  if (!active || !steps.length) return null
  const step = steps[Math.min(index, steps.length - 1)]
  const Showcase = step.showcase ? SHOWCASES[step.showcase] : null
  const isFirst = index === 0
  const isLast = index === steps.length - 1
  const isWelcome = isFirst && !!step.primaryLabel
  const progress = (index + 1) / steps.length

  return (
    <Modal visible transparent animationType="fade" onRequestClose={end}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Dim backdrop over the real screen (blocks interaction during the tour). */}
        <Pressable
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
          }}
        />

        <YStack
          backgroundColor={c.surface}
          borderTopLeftRadius={20}
          borderTopRightRadius={20}
          borderColor={c.border}
          borderWidth={1}
          paddingHorizontal="$4"
          paddingTop="$3"
          paddingBottom={insets.bottom + 12}
          maxHeight="86%"
        >
          {/* Progress bar */}
          <View style={{ height: 3, borderRadius: 2, backgroundColor: c.border, marginBottom: 12 }}>
            <View
              style={{
                height: 3,
                borderRadius: 2,
                width: `${progress * 100}%`,
                backgroundColor: c.primary,
              }}
            />
          </View>

          {/* Header */}
          <XStack alignItems="center" justifyContent="space-between" marginBottom="$2">
            <YStack flex={1}>
              <Text color={c.primary} fontSize={11} fontWeight="800" letterSpacing={1}>
                GUIDED TOUR · {title.toUpperCase()}
              </Text>
              {!isWelcome ? (
                <Text color={c.textMuted} fontSize={12}>
                  Step {index + 1} of {steps.length}
                </Text>
              ) : null}
            </YStack>
            <Pressable onPress={end} hitSlop={10} style={{ padding: 4 }}>
              <Text color={c.textMuted} fontSize={18} fontWeight="700">
                ✕
              </Text>
            </Pressable>
          </XStack>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text color={c.text} fontSize={20} fontWeight="800" marginBottom="$2">
              {step.title}
            </Text>
            <Text color={c.text} fontSize={14} lineHeight={21}>
              {step.body}
            </Text>

            {step.bullets?.length ? (
              <YStack gap="$1.5" marginTop="$3">
                {step.bullets.map((b, i) => (
                  <XStack key={i} gap="$2">
                    <Text color={c.primary} fontSize={14} fontWeight="800">
                      •
                    </Text>
                    <Text color={c.textMuted} fontSize={13} flex={1} lineHeight={19}>
                      {b}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            ) : null}

            {Showcase ? (
              <YStack
                marginTop="$3"
                backgroundColor={c.background}
                borderColor={c.border}
                borderWidth={1}
                borderRadius={14}
                padding="$3"
              >
                <Text
                  color={c.textMuted}
                  fontSize={10}
                  fontWeight="800"
                  letterSpacing={1}
                  marginBottom="$2"
                >
                  ✦ TRY IT — NOTHING HERE IS SAVED
                </Text>
                <Showcase />
              </YStack>
            ) : null}
          </ScrollView>

          {/* Footer controls */}
          <XStack gap="$2" marginTop="$3" alignItems="center">
            {isWelcome ? (
              <>
                <FooterButton
                  label={step.secondaryLabel ?? 'No thanks'}
                  onPress={end}
                  kind="outline"
                  flex
                />
                <FooterButton
                  label={step.primaryLabel ?? 'Start'}
                  onPress={next}
                  kind="primary"
                  flex
                />
              </>
            ) : (
              <>
                {!isFirst ? (
                  <FooterButton label="Back" onPress={prev} kind="outline" />
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                <View style={{ flex: 1 }} />
                <FooterButton label={isLast ? 'Done' : 'Next'} onPress={next} kind="primary" />
              </>
            )}
          </XStack>
        </YStack>
      </View>
    </Modal>
  )
}

function FooterButton({
  label,
  onPress,
  kind,
  flex,
}: {
  label: string
  onPress: () => void
  kind: 'primary' | 'outline'
  flex?: boolean
}) {
  const c = useThemeColors()
  return (
    <Pressable onPress={onPress} style={{ flex: flex ? 1 : undefined }}>
      <YStack
        backgroundColor={kind === 'primary' ? c.primary : 'transparent'}
        borderColor={kind === 'primary' ? c.primary : c.border}
        borderWidth={1}
        borderRadius={10}
        paddingVertical="$2.5"
        paddingHorizontal="$5"
        alignItems="center"
      >
        <Text color={kind === 'primary' ? c.onPrimary : c.text} fontSize={15} fontWeight="700">
          {label}
        </Text>
      </YStack>
    </Pressable>
  )
}
