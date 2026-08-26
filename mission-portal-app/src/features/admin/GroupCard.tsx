import { XStack, YStack, Text, Button } from 'tamagui'
import { useUsersStore } from '@/stores/usersStore'
import { groupDisplayName, countsTowardAllGroup } from '@/lib/roles'

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
  const loading = useUsersStore((s) => s.loading)
  const getDisplayName = useUsersStore((s) => s.displayName)
  const getUser = useUsersStore((s) => s.getUser)
  // 'All' and 'Guest' are structural: user creation puts new accounts into one
  // or the other, so neither can be renamed or deleted out from under it.
  const isAllGroup = group.name === 'All' || group.name === 'Guest'
  const members = group.members ?? []

  // All is the team, so its number counts members and not public followers,
  // guests, or uids left behind by a deleted account. Every other group is
  // hand-picked and its list is exactly what was chosen, so it counts itself.
  //
  // While the users are still loading nothing can be resolved, and filtering
  // then would show every group as empty before snapping to a real number.
  const memberCount =
    group.name === 'All' && !loading
      ? members.filter((uid) => countsTowardAllGroup(getUser(uid))).length
      : members.length

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
            {groupDisplayName(group.name)}
          </Text>
          <XStack
            backgroundColor="$gray5"
            borderRadius="$4"
            paddingHorizontal="$2"
            paddingVertical="$0.5"
          >
            <Text fontSize="$2" color="$gray11">
              {memberCount} members
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

      {members.length > 0 && (
        <XStack flexWrap="wrap" gap="$1">
          {members.slice(0, 20).map((uid) => {
            const name = loading ? '…' : getDisplayName(uid)
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
          {members.length > 20 && (
            <XStack
              backgroundColor="$gray4"
              borderRadius="$4"
              paddingHorizontal="$2"
              paddingVertical="$0.5"
            >
              <Text fontSize="$1" color="$gray10">
                +{members.length - 20} more
              </Text>
            </XStack>
          )}
        </XStack>
      )}
    </YStack>
  )
}

export type { GroupDoc }
