import { Stack } from 'expo-router'
import { PageBuilderScreen } from '@/features/page-builder/PageBuilderScreen'

export default function ConnectPage() {
  return (
    <>
      <Stack.Screen options={{ title: 'Connect' }} />
      <PageBuilderScreen pageKey="connect" pageTitle="Connect" />
    </>
  )
}
