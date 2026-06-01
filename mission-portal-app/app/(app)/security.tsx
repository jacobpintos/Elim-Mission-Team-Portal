import { useEffect, useState } from 'react'
import { ScrollView, Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useSecurityStore } from '@/stores/securityStore'
import { useUsersStore } from '@/stores/usersStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin, isSecurity } from '@/lib/roles'
import { ReportFormModal } from '@/features/security/ReportFormModal'
import { ReportDetailModal } from '@/features/security/ReportDetailModal'
import type { SecurityReport } from '@/types/security'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatTs(ts: unknown): string {
  const n =
    ts && typeof ts === 'object' && 'toMillis' in (ts as object)
      ? (ts as { toMillis: () => number }).toMillis()
      : typeof ts === 'number'
        ? ts
        : 0
  if (!n) return '—'
  const d = new Date(n)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export default function SecurityScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = String(profile?.uid ?? '')
  const displayName = profile?.displayName ?? 'Security'
  const admin = isAdmin(profile)
  const secUser = isSecurity(profile)
  const toast = useUIStore((s) => s.toast)

  const {
    reports,
    resolved,
    loading,
    loadingResolved,
    subscribe,
    unsubscribe,
    subscribeResolved,
    unsubscribeResolved,
    createReport,
    setOnMyWay,
    resolveReport,
  } = useSecurityStore()
  const { users, subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()

  const [showForm, setShowForm] = useState(false)
  const [detailReport, setDetailReport] = useState<SecurityReport | null>(null)
  const [showArchive, setShowArchive] = useState(false)

  useEffect(() => {
    subscribe()
    subUsers()
    return () => {
      unsubscribe()
      unsubUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (showArchive) {
      subscribeResolved()
    } else {
      unsubscribeResolved()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchive])

  const securityUsers = users.filter((u) => isSecurity(u))

  const handleSubmit = async (data: {
    description: string
    location: string
    witnesses: string
    photoFile: File | null
  }) => {
    try {
      await createReport(
        {
          description: data.description,
          location: data.location,
          witnesses: data.witnesses,
          reportedBy: uid,
          reporterName: displayName,
        },
        data.photoFile
      )

      // Notify all security and admin users
      const sendNotif = httpsCallable(functions, 'sendNotification')
      securityUsers.forEach((u) => {
        sendNotif({
          uid: String(u.uid),
          type: 'announcement',
          data: {
            title: '🚨 Security Report',
            body: `New incident at ${data.location}: ${data.description.slice(0, 80)}${data.description.length > 80 ? '…' : ''}`,
          },
        }).catch(() => {})
      })

      toast('Report submitted', 'success')
      setShowForm(false)
    } catch {
      toast('Failed to submit report', 'error')
    }
  }

  const handleMyWay = async (report: SecurityReport) => {
    try {
      await setOnMyWay(report.id, uid, displayName)

      // Notify security/admin team
      const sendNotif = httpsCallable(functions, 'sendNotification')
      securityUsers.forEach((u) => {
        if (String(u.uid) === uid) return
        sendNotif({
          uid: String(u.uid),
          type: 'announcement',
          data: {
            title: '🚨 Responding to Incident',
            body: `${displayName} is on the way to: ${report.location}`,
          },
        }).catch(() => {})
      })

      // Also notify the reporter (if not security themselves)
      if (report.reportedBy && report.reportedBy !== uid) {
        sendNotif({
          uid: report.reportedBy,
          type: 'announcement',
          data: {
            title: '🚨 Help is on the way',
            body: `${displayName} is heading to ${report.location}`,
          },
        }).catch(() => {})
      }

      toast(`${displayName} is on the way`, 'success')
      setDetailReport(null)
    } catch {
      toast('Failed to update status', 'error')
    }
  }

  const handleResolve = async (report: SecurityReport, resolution: string) => {
    try {
      await resolveReport(report.id, resolution)

      // Notify security/admin and reporter
      const sendNotif = httpsCallable(functions, 'sendNotification')
      const body = `Incident at ${report.location} resolved. ${resolution.slice(0, 100)}${resolution.length > 100 ? '…' : ''}`
      securityUsers.forEach((u) => {
        sendNotif({
          uid: String(u.uid),
          type: 'announcement',
          data: { title: '✓ Incident Resolved', body },
        }).catch(() => {})
      })
      if (report.reportedBy && !securityUsers.some((u) => String(u.uid) === report.reportedBy)) {
        sendNotif({
          uid: report.reportedBy,
          type: 'announcement',
          data: { title: '✓ Your report has been resolved', body },
        }).catch(() => {})
      }

      toast('Report resolved', 'success')
    } catch {
      toast('Failed to resolve report', 'error')
    }
  }

  const statusColor = (s: SecurityReport['status']) =>
    s === 'open' ? '#e74c3c' : s === 'responding' ? '#f39c12' : '#27ae60'
  const statusLabel = (s: SecurityReport['status']) =>
    s === 'open' ? 'OPEN' : s === 'responding' ? 'RESPONDING' : 'RESOLVED'

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Security' }} />

      <XStack
        padding="$3"
        borderBottomWidth={1}
        borderBottomColor={colors.border}
        justifyContent="space-between"
        alignItems="center"
        gap="$2"
      >
        <Text color={colors.text} fontWeight="700" fontSize="$4">
          Security Queue
        </Text>
        <Pressable onPress={() => setShowForm(true)}>
          <XStack
            backgroundColor="#c0392b"
            borderRadius="$3"
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignItems="center"
          >
            <Text color="white" fontWeight="700" fontSize="$3">
              ⊕ Report Incident
            </Text>
          </XStack>
        </Pressable>
      </XStack>

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Text color={colors.textMuted}>Loading…</Text>
        </YStack>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          <YStack padding="$3" gap="$3">
            {reports.length === 0 ? (
              <YStack alignItems="center" justifyContent="center" padding="$6">
                <Text color={colors.textMuted} textAlign="center" fontSize="$4">
                  No open incidents.
                </Text>
              </YStack>
            ) : (
              reports.map((r) => (
                <Pressable key={String(r.id)} onPress={() => setDetailReport(r)}>
                  <YStack
                    backgroundColor={colors.surface}
                    borderRadius="$3"
                    padding="$3"
                    gap="$2"
                    borderWidth={1}
                    borderColor={colors.border}
                    borderLeftWidth={4}
                    borderLeftColor={statusColor(r.status)}
                  >
                    <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                      <Text color={colors.text} fontWeight="700" fontSize="$3" flex={1}>
                        {r.location}
                      </Text>
                      <XStack
                        backgroundColor={statusColor(r.status) + '22'}
                        borderRadius={99}
                        paddingHorizontal="$2"
                        paddingVertical={2}
                      >
                        <Text color={statusColor(r.status)} fontSize={10} fontWeight="700">
                          {statusLabel(r.status)}
                        </Text>
                      </XStack>
                    </XStack>
                    <Text color={colors.text} fontSize="$3" numberOfLines={2}>
                      {r.description}
                    </Text>
                    <XStack justifyContent="space-between" alignItems="center">
                      <Text color={colors.textMuted} fontSize="$2">
                        {r.reporterName} · {formatTs(r.createdAt)}
                      </Text>
                      {r.status === 'responding' && r.responderName ? (
                        <Text color="#f39c12" fontSize="$2" fontWeight="600">
                          🚨 {r.responderName}
                        </Text>
                      ) : null}
                    </XStack>
                  </YStack>
                </Pressable>
              ))
            )}

            {/* Completed Archive */}
            <Pressable onPress={() => setShowArchive((v) => !v)}>
              <XStack
                paddingVertical="$3"
                paddingHorizontal="$2"
                gap="$2"
                alignItems="center"
                borderTopWidth={1}
                borderTopColor={colors.border}
                marginTop="$2"
              >
                <Text color={colors.textMuted} fontSize="$3" fontWeight="600" flex={1}>
                  Completed Archive
                </Text>
                <Text color={colors.textMuted} fontSize="$3">
                  {showArchive ? '▲' : '▼'}
                </Text>
              </XStack>
            </Pressable>

            {showArchive ? (
              loadingResolved ? (
                <YStack alignItems="center" padding="$3">
                  <Text color={colors.textMuted}>Loading archive…</Text>
                </YStack>
              ) : resolved.length === 0 ? (
                <YStack alignItems="center" padding="$3">
                  <Text color={colors.textMuted} fontSize="$3">
                    No resolved reports yet.
                  </Text>
                </YStack>
              ) : (
                resolved.map((r) => (
                  <Pressable key={String(r.id)} onPress={() => setDetailReport(r)}>
                    <YStack
                      backgroundColor={colors.surface}
                      borderRadius="$3"
                      padding="$3"
                      gap="$2"
                      borderWidth={1}
                      borderColor={colors.border}
                      borderLeftWidth={4}
                      borderLeftColor="#27ae60"
                      opacity={0.8}
                    >
                      <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                        <Text color={colors.text} fontWeight="700" fontSize="$3" flex={1}>
                          {r.location}
                        </Text>
                        <XStack
                          backgroundColor="#27ae6022"
                          borderRadius={99}
                          paddingHorizontal="$2"
                          paddingVertical={2}
                        >
                          <Text color="#27ae60" fontSize={10} fontWeight="700">
                            RESOLVED
                          </Text>
                        </XStack>
                      </XStack>
                      <Text color={colors.text} fontSize="$3" numberOfLines={1}>
                        {r.description}
                      </Text>
                      <Text color={colors.textMuted} fontSize="$2">
                        Resolved {formatTs(r.completedAt)}
                        {r.deleteAt ? ` · Auto-deletes ${formatTs(r.deleteAt)}` : ''}
                      </Text>
                    </YStack>
                  </Pressable>
                ))
              )
            ) : null}
          </YStack>
        </ScrollView>
      )}

      <ReportFormModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={handleSubmit}
      />

      <ReportDetailModal
        report={detailReport}
        currentUserId={uid}
        currentUserName={displayName}
        canAct={secUser || admin}
        onClose={() => setDetailReport(null)}
        onMyWay={handleMyWay}
        onResolve={handleResolve}
      />
    </YStack>
  )
}
