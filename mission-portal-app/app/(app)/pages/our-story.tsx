import { Stack } from 'expo-router'
import { PageBuilderScreen } from '@/features/page-builder/PageBuilderScreen'

export default function OurStoryPage() {
  return (
    <>
      <Stack.Screen options={{ title: 'Our Story' }} />
      <PageBuilderScreen pageKey="ourstory" pageTitle="Our Story" />
    </>
  )
}
