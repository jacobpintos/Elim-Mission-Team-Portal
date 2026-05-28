import { XStack, YStack, Text } from 'tamagui'

interface AuditDoc {
  id: string
  action: string
  detail: string
  name: string
  ts: unknown
}

interface AuditEntryProps {
  entry: AuditDoc
}

function formatTimestamp(ts: unknown): string {
  if (!ts) return ''
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate: unknown }).toDate === 'function') {
    const date = (ts as { toDate: () => Date }).toDate()
    return date.toLocaleString()
  }
  if (typeof ts === 'number') {
    return new Date(ts).toLocaleString()
  }
  return String(ts)
}

export function AuditEntry({ entry }: AuditEntryProps) {
  return (
    <YStack
      backgroundColor="$background"
      borderRadius="$2"
      padding="$3"
      borderWidth={1}
      borderColor="$borderColor"
      gap="$1"
    >
      <XStack alignItems="center" justifyContent="space-between">
        <Text fontWeight="700" fontSize="$3" flex={1}>
          {entry.action}
        </Text>
        <Text fontSize="$2" color="$gray10">
          {formatTimestamp(entry.ts)}
        </Text>
      </XStack>

      {entry.detail ? (
        <Text fontSize="$2" color="$gray11">
          {entry.detail}
        </Text>
      ) : null}

      {entry.name ? (
        <Text fontSize="$1" color="$gray9">
          By: {entry.name}
        </Text>
      ) : null}
    </YStack>
  )
}

export type { AuditDoc }
