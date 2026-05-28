import { useState } from 'react'
import { Alert } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { YStack, XStack, Text, Button, Input, Spinner } from 'tamagui'
import { Stack } from 'expo-router'
import {
  collection,
  getDocs,
  orderBy,
  query,
  limit,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useQuery } from '@tanstack/react-query'
import { AuditEntry, type AuditDoc } from '@/features/admin/AuditEntry'
import { useAdminStore } from '@/stores/adminStore'
import { useUIStore } from '@/stores/uiStore'

const PAGE_SIZE = 25

async function fetchAuditLog(): Promise<AuditDoc[]> {
  const q = query(collection(db, 'auditLog'), orderBy('ts', 'desc'), limit(1000))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditDoc))
}

export default function AdminAudit() {
  const { auditSearch, setAuditSearch, auditPage, setAuditPage } = useAdminStore()
  const { toast } = useUIStore()
  const [clearing, setClearing] = useState(false)

  const { data: allEntries = [], isLoading, refetch } = useQuery({
    queryKey: ['auditLog'],
    queryFn: fetchAuditLog,
  })

  const filtered = auditSearch.trim()
    ? allEntries.filter(
        (e) =>
          e.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
          e.detail.toLowerCase().includes(auditSearch.toLowerCase()) ||
          e.name.toLowerCase().includes(auditSearch.toLowerCase())
      )
    : allEntries

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(auditPage, totalPages - 1)
  const paginated = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const handleClearLog = () => {
    Alert.alert(
      'Clear Audit Log',
      'This will permanently delete all audit log entries. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setClearing(true)
            try {
              // Batch delete up to 500 at a time
              const q = query(collection(db, 'auditLog'), limit(500))
              let snap = await getDocs(q)
              while (!snap.empty) {
                const batch = writeBatch(db)
                snap.docs.forEach((d) => batch.delete(d.ref))
                await batch.commit()
                snap = await getDocs(q)
              }
              await refetch()
              toast('Audit log cleared', 'success')
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Failed to clear log'
              toast(message, 'error')
            } finally {
              setClearing(false)
            }
          },
        },
      ]
    )
  }

  return (
    <YStack flex={1} padding="$4" gap="$3">
      <Stack.Screen options={{ title: 'Audit Trail', headerShown: false }} />

      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$6" fontWeight="700">
          Audit Trail
        </Text>
        <Button
          size="$2"
          onPress={handleClearLog}
          theme="red"
          disabled={clearing || isLoading}
        >
          {clearing ? <Spinner size="small" /> : 'Clear Log'}
        </Button>
      </XStack>

      <Input
        placeholder="Search actions, details, users..."
        value={auditSearch}
        onChangeText={(v) => {
          setAuditSearch(v)
          setAuditPage(0)
        }}
        size="$3"
      />

      <Text fontSize="$2" color="$gray10">
        {filtered.length} entries
        {auditSearch ? ` matching "${auditSearch}"` : ''}
        {' — '}Page {safePage + 1} of {totalPages}
      </Text>

      {isLoading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" />
        </YStack>
      ) : (
        <>
          <FlashList
            data={paginated}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => (
              <YStack marginBottom="$2">
                <AuditEntry entry={item} />
              </YStack>
            )}
            ListEmptyComponent={
              <Text color="$gray10" textAlign="center" paddingVertical="$4">
                No audit entries found
              </Text>
            }
          />

          <XStack justifyContent="center" gap="$3" alignItems="center">
            <Button
              size="$2"
              onPress={() => setAuditPage(safePage - 1)}
              disabled={safePage === 0}
              theme="gray"
            >
              ← Prev
            </Button>
            <Text fontSize="$3">
              {safePage + 1} / {totalPages}
            </Text>
            <Button
              size="$2"
              onPress={() => setAuditPage(safePage + 1)}
              disabled={safePage >= totalPages - 1}
              theme="gray"
            >
              Next →
            </Button>
          </XStack>
        </>
      )}
    </YStack>
  )
}
