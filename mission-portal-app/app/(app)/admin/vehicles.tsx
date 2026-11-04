import { Redirect } from 'expo-router'
import { CustomVehiclesScreen } from '@/custom/ui'

/** Admin → Vehicles: custom to The Well (src/custom), and only in its build. */
export default function AdminVehicles() {
  if (!CustomVehiclesScreen) return <Redirect href="/(app)/admin/users" />
  return <CustomVehiclesScreen />
}
