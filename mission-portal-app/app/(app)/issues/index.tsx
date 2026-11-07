import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { CustomOperationsChecklist } from '@/custom/ui'
import { PreServiceChecklist } from '@/features/preservice/PreServiceChecklist'

/**
 * Operations' first tab: the organization's own checklist where it has one
 * (The Well's Production Checklist, src/custom), and otherwise the app's
 * Pre-service Checklist (features/preservice). The Issues list is
 * Operations' next tab (./list).
 */
export default function OperationsChecklist() {
  return (
    <>
      <ScreenTitle options={{ title: 'Operations' }} />
      {CustomOperationsChecklist ? <CustomOperationsChecklist /> : <PreServiceChecklist />}
    </>
  )
}
