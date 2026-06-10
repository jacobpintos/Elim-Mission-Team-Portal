import { useState } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Input, Spinner } from 'tamagui'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useQuery } from '@tanstack/react-query'
import { useThemeColors } from '@/theme/useThemeColors'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import type { EventTemplate } from '@/types/events'

interface ArchivedEvent extends EventTemplate {
  _archivedAt?: unknown
}

const PAGE_SIZE = 25

async function fetchArchivedEvents(): Promise<ArchivedEvent[]> {
  const q = query(collection(db, 'eventsArchive'), orderBy('date', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as ArchivedEvent))
}

export default function AdminArchive() {
  const colors = useThemeColors()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: ['eventsArchive'],
    queryFn: fetchArchivedEvents,
  })

  const filtered = search.trim()
    ? allEvents.filter(
        (e) =>
          e.title?.toLowerCase().includes(search.toLowerCase()) ||
          e.location?.toLowerCase().includes(search.toLowerCase()) ||
          e.date?.includes(search)
      )
    : allEvents

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const paginated = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <YStack flex={1} padding="$4" gap="$3">
      <ScreenTitle options={{ title: 'Events Archive', headerShown: false }} />

      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$6" fontWeight="700" color={colors.text}>
          Events Archive
        </Text>
        <Text fontSize="$2" color={colors.textMuted}>
          {filtered.length} archived
        </Text>
      </XStack>

      <Input
        placeholder="Search title, location, date..."
        value={search}
        onChangeText={(v) => {
          setSearch(v)
          setPage(0)
        }}
        size="$3"
      />

      {isLoading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" />
        </YStack>
      ) : (
        <>
          <ScrollView style={{ flex: 1 }}>
            {paginated.length === 0 ? (
              <Text color="$gray10" textAlign="center" paddingVertical="$4">
                No archived events found
              </Text>
            ) : (
              paginated.map((item) => (
                <YStack
                  key={String(item.id)}
                  backgroundColor={colors.surface}
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor={colors.border}
                  padding="$3"
                  marginBottom="$2"
                  gap="$1"
                >
                  <Text fontSize="$4" fontWeight="600" color={colors.text}>
                    {item.title}
                  </Text>
                  <XStack gap="$3">
                    {item.date ? (
                      <Text fontSize="$2" color={colors.textMuted}>
                        {item.date}
                      </Text>
                    ) : null}
                    {item.location ? (
                      <Text fontSize="$2" color={colors.textMuted} flex={1} numberOfLines={1}>
                        {item.location}
                      </Text>
                    ) : null}
                  </XStack>
                </YStack>
              ))
            )}
          </ScrollView>

          <XStack justifyContent="center" gap="$3" alignItems="center">
            <Text
              fontSize="$3"
              color={safePage === 0 ? colors.textMuted : colors.text}
              onPress={() => {
                if (safePage > 0) setPage(safePage - 1)
              }}
            >
              ← Prev
            </Text>
            <Text fontSize="$3" color={colors.textMuted}>
              {safePage + 1} / {totalPages}
            </Text>
            <Text
              fontSize="$3"
              color={safePage >= totalPages - 1 ? colors.textMuted : colors.text}
              onPress={() => {
                if (safePage < totalPages - 1) setPage(safePage + 1)
              }}
            >
              Next →
            </Text>
          </XStack>
        </>
      )}
    </YStack>
  )
}
