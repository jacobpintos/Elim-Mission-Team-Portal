import { Redirect } from 'expo-router'
import { PUBLIC_TABS } from './_layout'

export default function PublicIndex() {
  return <Redirect href={(PUBLIC_TABS[0]?.path ?? '/(app)/public/connect') as never} />
}
