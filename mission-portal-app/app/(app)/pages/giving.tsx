import { Stack } from 'expo-router'
import { PageBuilderScreen } from '@/features/page-builder/PageBuilderScreen'

export default function GivingPage() {
  return (
    <>
      <Stack.Screen options={{ title: 'Giving' }} />
      <PageBuilderScreen pageKey="giving" pageTitle="Giving" />
    </>
  )
}
