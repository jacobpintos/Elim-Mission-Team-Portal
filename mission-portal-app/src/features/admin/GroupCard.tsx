import { XStack, YStack, Text, Button } from 'tamagui'
import { useUsersStore } from '@/stores/usersStore'
import { sameId } from '@/lib/ids'

interface GroupDoc {
  id: string
  name: string
  members: string[]
}

interface GroupCardProps {
  group: GroupDoc
  onEdit: (group: GroupDoc) => void
  onDelete: (group: GroupDoc) => void
}

export function GroupCard({ group, onEdit, onDelete }: GroupCardProps) {
  const users = useUsersStore((s) => s.users)
  const loading = useUsersStore((s) => s.loading)
  const isAllGroup = group.name === 'All'

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
        <XStack alignItems="center" gap="$2">
          <Text fontWeight="700" fontSize="$4">
            {group.name}
          </Text>
          <XStack
            backgroundColor="$gray5"
            borderRadius="$4"
            paddingHorizontal="$2"
            paddingVertical="$0.5"
          >
            <Text fontSize="$2" color="$gray11">
              {group.members.length} members
            </Text>
          </XStack>
        </XStack>

        <XStack gap="$2">
          <Button size="$2" onPress={() => onEdit(group)} theme="active">
            Edit
          </Button>
          {!isAllGroup && (
            <Button size="$2" onPress={() => onDelete(group)} theme="red">
              Delete
            </Button>
          )}
        </XStack>
      </XStack>

      {group.members.length > 0 && (
        <XStack flexWrap="wrap" gap="$1">
          {group.members.slice(0, 20).map((uid) => {
            const name = loading ? '…' : (users.find((u) => sameId(u.uid, uid))?.displayName ?? uid)
            return (
              <XStack
                key={uid}
                backgroundColor="$gray4"
                borderRadius="$4"
                paddingHorizontal="$2"
                paddingVertical="$0.5"
              >
                <Text fontSize="$1" color="$gray11">
                  {name}
                </Text>
              </XStack>
            )
          })}
          {group.members.length > 20 && (
            <XStack
              backgroundColor="$gray4"
              borderRadius="$4"
              paddingHorizontal="$2"
              paddingVertical="$0.5"
            >
              <Text fontSize="$1" color="$gray10">
                +{group.members.length - 20} more
              </Text>
            </XStack>
          )}
        </XStack>
      )}
    </YStack>
  )
}

export type { GroupDoc }
