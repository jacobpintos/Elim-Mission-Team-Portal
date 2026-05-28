import { XStack, YStack, Text, Button } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'

interface PendingDeletion {
  uid: string
  name: string
  requestedBy: string
  approvals: string[]
  totalAdmins: number
}

interface PendingDeletionCardProps {
  deletion: PendingDeletion
  onApprove: (deletion: PendingDeletion) => void
  onCancel: (deletion: PendingDeletion) => void
}

export function PendingDeletionCard({ deletion, onApprove, onCancel }: PendingDeletionCardProps) {
  const { profile } = useAuthStore()
  const currentUid = profile?.uid ?? ''
  const hasApproved = deletion.approvals.includes(currentUid)

  return (
    <YStack
      backgroundColor="$background"
      borderRadius="$3"
      padding="$3"
      borderWidth={1}
      borderColor="$borderColor"
      gap="$2"
    >
      <XStack alignItems="center" justifyContent="space-between">
        <YStack gap="$1" flex={1}>
          <Text fontWeight="700" fontSize="$4">
            Delete: {deletion.name}
          </Text>
          <Text fontSize="$2" color="$gray10">
            {deletion.approvals.length} of {deletion.totalAdmins} approvals
          </Text>
          <Text fontSize="$2" color="$gray9">
            Requested by: {deletion.requestedBy}
          </Text>
        </YStack>

        <YStack gap="$2" alignItems="flex-end">
          {hasApproved ? (
            <XStack
              backgroundColor="$green4"
              borderRadius="$4"
              paddingHorizontal="$3"
              paddingVertical="$1"
            >
              <Text fontSize="$2" color="$green10" fontWeight="600">
                You approved.
              </Text>
            </XStack>
          ) : (
            <Button size="$2" onPress={() => onApprove(deletion)} backgroundColor="$green9">
              <Text color="white" fontSize="$2" fontWeight="600">
                Approve Deletion
              </Text>
            </Button>
          )}
          <Button size="$2" onPress={() => onCancel(deletion)} theme="red">
            Cancel Request
          </Button>
        </YStack>
      </XStack>
    </YStack>
  )
}

export type { PendingDeletion }
