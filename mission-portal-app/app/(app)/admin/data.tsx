import { useEffect, useState } from 'react'
import { Pressable, ScrollView } from 'react-native'
import { YStack, XStack, Text, Spinner } from 'tamagui'
import { collection, doc, query, where } from 'firebase/firestore'
import { onSnapshot, getDocs } from '@/lib/liveFirestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useUsersStore } from '@/stores/usersStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { saveTextFile } from '@/lib/saveTextFile'
import { sameId } from '@/lib/ids'
import {
  peopleCsv,
  eventsCsv,
  availabilityCsv,
  tasksCsv,
  reimbursementsCsv,
} from '@/lib/dataExport'
import type { EventTemplate, AvailResponse, Task } from '@/types/events'
import type { Reimbursement } from '@/types/reimbursement'
import { ADMINS, EVERYONE, mergeEvent } from '../../../functions/src/eventPrivate'

interface BackupStatus {
  lastOk?: string
  lastOkAt?: number
  lastError?: string | null
  lastErrorAt?: number
}

type ExportKey = 'people' | 'events' | 'availability' | 'tasks' | 'reimbursements'

const EXPORTS: { key: ExportKey; label: string; detail: string }[] = [
  { key: 'people', label: 'People', detail: 'Names, emails, roles and titles' },
  { key: 'events', label: 'Events', detail: 'Every event with its dates and place' },
  { key: 'availability', label: 'Availability', detail: 'Every answer, by event and person' },
  { key: 'tasks', label: 'Tasks', detail: 'Tasks, who has them and when they are due' },
  {
    key: 'reimbursements',
    label: 'Reimbursements',
    detail: 'Every request, what was approved and when it was paid',
  },
]

/**
 * Admin → Data: whether last night's backup ran, and the records as
 * spreadsheets.
 *
 * The backup is the safety net — a full copy of the database the project can
 * be restored from. The spreadsheets are for people: a list to print, to hand
 * the treasurer, or to keep somewhere other than this app.
 */
export default function AdminData() {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const { users, subscribe, unsubscribe } = useUsersStore()
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [busy, setBusy] = useState<ExportKey | null>(null)

  useEffect(() => {
    subscribe()
    const unsub = onSnapshot(
      doc(db, 'backupStatus', 'latest'),
      (snap) => setStatus((snap.data() as BackupStatus) ?? {}),
      () => setStatus({})
    )
    return () => {
      unsubscribe()
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nameOf = (uid: string) => {
    const u = users.find((x) => sameId(x.uid, uid))
    return u?.displayName || u?.email || uid
  }

  // As an admin may read them (firestore.rules): every event and its
  // availability but others' drafts — asked for as the rules require — with
  // their private details (functions/src/eventPrivate).
  const me = String(useAuthStore.getState().profile?.uid ?? '')
  const seenByAdmin = (name: 'events' | 'avail') =>
    query(collection(db, name), where('seenBy', 'array-contains-any', [me, EVERYONE, ADMINS]))
  const readEvents = async () => {
    const [open, closed] = await Promise.all([
      getDocs(seenByAdmin('events')),
      getDocs(
        query(collection(db, 'eventPrivate'), where('access', 'array-contains-any', [me, ADMINS]))
      ),
    ])
    const privateOf = new Map(closed.docs.map((d) => [d.id, d.data()]))
    return open.docs.map(
      (d) =>
        ({ ...mergeEvent(d.data(), privateOf.get(d.id)), id: d.id }) as unknown as EventTemplate
    )
  }

  const build = async (key: ExportKey): Promise<string> => {
    if (key === 'people') return peopleCsv(users)
    if (key === 'events') return eventsCsv(await readEvents())
    if (key === 'availability') {
      const [events, availSnap] = await Promise.all([readEvents(), getDocs(seenByAdmin('avail'))])
      const avail: Record<string, Record<string, AvailResponse>> = {}
      availSnap.docs.forEach((d) => {
        const data = d.data() as { responses?: Record<string, AvailResponse> }
        avail[d.id] = data.responses ?? {}
      })
      return availabilityCsv(avail, events, nameOf)
    }
    if (key === 'tasks') {
      const [events, taskSnap] = await Promise.all([readEvents(), getDocs(collection(db, 'tasks'))])
      const tasks = taskSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as Task)
      const title = (t: Task) => {
        const id = t.evId ?? t.evTemplateId
        return id == null ? '' : (events.find((e) => sameId(e.id, id))?.title ?? '')
      }
      return tasksCsv(tasks, nameOf, title)
    }
    const snap = await getDocs(collection(db, 'reimbursements'))
    return reimbursementsCsv(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Reimbursement))
  }

  const download = async (key: ExportKey) => {
    setBusy(key)
    try {
      const csv = await build(key)
      const day = new Date().toISOString().slice(0, 10)
      await saveTextFile(`mission-portal-${key}-${day}.csv`, csv, 'text/csv')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not build that file.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const backupLine = (() => {
    if (status === null) return 'Checking…'
    const failedSince =
      status.lastErrorAt && (!status.lastOkAt || status.lastErrorAt > status.lastOkAt)
    if (failedSince) {
      return `The last backup failed${status.lastOk ? ` (last good copy: ${status.lastOk})` : ''}: ${status.lastError}`
    }
    if (status.lastOk) return `Last backup: ${status.lastOk}. The last 30 nights are kept.`
    return 'No backup has run yet. The first runs tonight at 2:30 am, once this version is deployed.'
  })()
  const backupFailing =
    !!status?.lastErrorAt && (!status.lastOkAt || status.lastErrorAt > status.lastOkAt)

  return (
    <ScrollView>
      <ScreenTitle options={{ title: 'Data', headerShown: false }} />
      <YStack padding="$4" gap="$3" maxWidth={720}>
        <Text color={colors.text} fontSize="$6" fontWeight="700">
          Data
        </Text>

        <YStack
          backgroundColor={colors.surface}
          borderRadius="$3"
          padding="$3"
          gap="$1"
          borderWidth={1}
          borderColor={backupFailing ? '#c0392b' : colors.border}
        >
          <Text color={colors.text} fontSize="$4" fontWeight="700">
            Nightly backup
          </Text>
          <Text color={backupFailing ? '#c0392b' : colors.textMuted} fontSize="$3">
            {backupLine}
          </Text>
          <Text color={colors.textMuted} fontSize="$2">
            A full copy of the database is saved to the project&rsquo;s storage every night. To
            restore from one, see &ldquo;Backups&rdquo; in the README.
          </Text>
        </YStack>

        <Text color={colors.text} fontSize="$4" fontWeight="700" marginTop="$2">
          Export to a spreadsheet
        </Text>
        <Text color={colors.textMuted} fontSize="$2">
          CSV files that open in Excel, Numbers or Google Sheets.
        </Text>

        {EXPORTS.map((e) => (
          <Pressable key={e.key} onPress={() => download(e.key)} disabled={busy !== null}>
            <XStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={colors.border}
              alignItems="center"
              gap="$3"
              opacity={busy !== null && busy !== e.key ? 0.5 : 1}
            >
              <YStack flex={1} gap="$1">
                <Text color={colors.text} fontSize="$3" fontWeight="600">
                  {e.label}
                </Text>
                <Text color={colors.textMuted} fontSize="$2">
                  {e.detail}
                </Text>
              </YStack>
              {busy === e.key ? (
                <Spinner size="small" />
              ) : (
                <Text color={colors.primary} fontSize="$3" fontWeight="600">
                  Download
                </Text>
              )}
            </XStack>
          </Pressable>
        ))}
      </YStack>
    </ScrollView>
  )
}
