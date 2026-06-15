import { XStack, YStack, Text, Button } from 'tamagui'
import { Avatar } from '@/components/ui/Avatar'
import type { UserProfile } from '@/types/user'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  security: 'Security',
  merch: 'Merch',
  worship: 'Worship',
  regular: 'Member',
  intern: 'Intern',
  public: 'Public',
}

export function userRoleDisplay(user: UserProfile): string {
  const roles = user.roles ?? []
  return roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#f56c5a',
  security: '#e74c3c',
  merch: '#27ae60',
  worship: '#9b59b6',
  regular: '#16a085',
  intern: '#d4a017',
  public: '#95a5a6',
}

interface UserCardProps {
  user: UserProfile
  currentUid?: string
  onEditRole: (user: UserProfile) => void
  onDelete: (user: UserProfile) => void
}

export function UserCard({ user, currentUid, onEditRole, onDelete }: UserCardProps) {
  const isSelf = user.uid === currentUid
  const primaryRole = user.roles?.[0] ?? 'public'
  const roleColor = ROLE_COLORS[primaryRole] ?? '#95a5a6'

  return (
    <XStack
      backgroundColor="$background"
      borderRadius="$3"
      padding="$3"
      borderWidth={1}
      borderColor="$borderColor"
      alignItems="center"
      gap="$3"
    >
      <Avatar uri={user.photoURL} displayName={user.displayName} size={48} />

      <YStack flex={1} gap="$1">
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <Text fontWeight="700" fontSize="$4">
            {user.displayName}
          </Text>
          {isSelf && (
            <XStack
              backgroundColor="$gray4"
              borderRadius="$4"
              paddingHorizontal="$2"
              paddingVertical="$0.5"
            >
              <Text fontSize="$1" color="$gray10">
                You
              </Text>
            </XStack>
          )}
        </XStack>
        <Text fontSize="$2" color="$gray10">
          {user.email}
        </Text>
        <XStack flexWrap="wrap" gap="$1" marginTop="$1">
          {(user.roles ?? []).map((r) => (
            <XStack
              key={r}
              backgroundColor={ROLE_COLORS[r] ?? '#7f8c8d'}
              borderRadius="$4"
              paddingHorizontal="$2"
              paddingVertical="$0.5"
            >
              <Text fontSize="$1" color="white" fontWeight="600">
                {ROLE_LABELS[r] ?? r}
              </Text>
            </XStack>
          ))}
        </XStack>
      </YStack>

      {!isSelf && (
        <YStack gap="$2">
          <Button size="$2" onPress={() => onEditRole(user)} theme="active">
            Edit Role
          </Button>
          <Button size="$2" onPress={() => onDelete(user)} theme="red">
            Delete
          </Button>
        </YStack>
      )}
    </XStack>
  )
}
