import { Stack } from 'expo-router'
import { useThemeStore } from '@/stores/themeStore'

export default function AuthLayout() {
  const mode = useThemeStore((s) => s.mode)
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: mode === 'dark' ? '#1a1a2e' : '#f8f8fc' },
        headerTintColor: mode === 'dark' ? '#ffffff' : '#1a1a2e',
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    />
  )
}
