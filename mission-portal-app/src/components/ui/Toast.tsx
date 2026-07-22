import { YStack, XStack, Text, Button } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUIStore } from '@/stores/uiStore'

const KIND_BG = {
  info: '#2563eb',
  success: '#16a34a',
  error: '#dc2626',
} as const

export function ToastContainer() {
  const { toasts, dismissToast } = useUIStore()
  const insets = useSafeAreaInsets()

  if (toasts.length === 0) return null

  return (
    <YStack
      position="absolute"
      bottom={insets.bottom + 16}
      left={16}
      right={16}
      gap="$2"
      pointerEvents="box-none"
    >
      {toasts.map((t) => (
        <XStack
          key={t.id}
          borderRadius="$3"
          padding="$3"
          alignItems="center"
          gap="$2"
          backgroundColor={KIND_BG[t.kind] as `#${string}`}
        >
          <Text color="white" flex={1} fontSize="$3">
            {t.message}
          </Text>
          <Button size="$2" chromeless onPress={() => dismissToast(t.id)}>
            <Text color="white">✕</Text>
          </Button>
        </XStack>
      ))}
    </YStack>
  )
}

export function useToast() {
  const toast = useUIStore((s) => s.toast)
  return toast
}

// TEMPORARY DIAGNOSTIC MARKER — see index.js.
;(globalThis as any).__diag_toastLoaded = true
