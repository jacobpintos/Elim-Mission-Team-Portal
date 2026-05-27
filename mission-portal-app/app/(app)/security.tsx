import { useEffect, useState, useRef } from 'react'
import { ScrollView, Alert, Pressable, TextInput as RNTextInput, Platform, Linking } from 'react-native'
import { YStack, XStack, Text, TextArea } from 'tamagui'
import { Stack, router } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useUsersStore } from '@/stores/usersStore'
import { useSecurityStore } from '@/stores/securityStore'
import { useUIStore } from '@/stores/uiStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isSecurity, isAdmin } from '@/lib/roles'
import { FD } from '@/lib/format'
import { useFileUpload } from '@/hooks/useFileUpload'
import { Modal } from '@/components/ui/Modal'
import type { SecurityReport } from '@/types/security'
import type { Attachment } from '@/types/shared'
import { REPORT_TYPES } from '@/types/security'

type MainTab = 'report' | 'queue' | 'all'

export default function SecurityScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const { users, subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const store = useSecurityStore()
  const toast = useUIStore((s) => s.toast)
  const { pickAndUpload } = useFileUpload()

  const [tab, setTab] = useState<MainTab>('report')
  // Report form
  const [rType, setRType] = useState(REPORT_TYPES[0])
  const [rLoc, setRLoc] = useState('')
  const [rDesc, setRDesc] = useState('')
  const [rWitness, setRWitness] = useState('')
  const [rAttachment, setRAttachment] = useState<Attachment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showTypePicker, setShowTypePicker] = useState(false)

  // Acknowledge modal
  const [ackReport, setAckReport] = useState<SecurityReport | null>(null)
  const [ackNote, setAckNote] = useState('')
  const [ackAttachment, setAckAttachment] = useState<Attachment | null>(null)
  const [acknowledging, setAcknowledging] = useState(false)

  const admin = isAdmin(profile)
  const secUser = isSecurity(profile)

  useEffect(() => {
    if (!profile) return
    if (!secUser && !admin) {
      router.replace('/(app)/home')
      return
    }
    store.subscribe()
    subUsers()
    return () => {
      store.unsubscribe()
      unsubUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid])

  const securityUserUids = users
    .filter((u) => isSecurity(u) || isAdmin(u))
    .map((u) => u.uid)

  const pendingReports = store.reports.filter((r) => !r.ack)
  const clearedCount = store.reports.filter((r) => r.ack).length

  function displayName(uid: string) {
    return users.find((u) => u.uid === uid)?.displayName ?? uid
  }

  async function handleSubmit() {
    if (!rType || !rLoc.trim() || !rDesc.trim()) {
      toast('Please fill in all required fields.', 'error')
      return
    }
    if (!profile) return
    setSubmitting(true)
    try {
      await store.submitReport(
        { type: rType, loc: rLoc.trim(), desc: rDesc.trim(), witness: rWitness.trim() || undefined, attachment: rAttachment },
        profile.uid,
        securityUserUids
      )
      setRType(REPORT_TYPES[0])
      setRLoc('')
      setRDesc('')
      setRWitness('')
      setRAttachment(null)
      toast('Report submitted. Security team notified.', 'success')
    } catch {
      toast('Failed to submit report.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAcknowledge() {
    if (!ackReport || !ackNote.trim()) {
      toast('Response notes are required.', 'error')
      return
    }
    if (!profile) return
    setAcknowledging(true)
    try {
      await store.acknowledgeReport(ackReport.id, ackNote.trim(), profile.uid, ackAttachment)
      setAckReport(null)
      setAckNote('')
      setAckAttachment(null)
      toast('Report acknowledged.', 'success')
    } catch {
      toast('Failed to acknowledge report.', 'error')
    } finally {
      setAcknowledging(false)
    }
  }

  async function handleClear() {
    if (Platform.OS === 'web') {
      if (!window.confirm(`Delete ${clearedCount} cleared report(s)?`)) return
    } else {
      Alert.alert('Clear Completed Reports', `Delete ${clearedCount} cleared report(s)?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doClear },
      ])
      return
    }
    await doClear()
  }

  async function doClear() {
    try {
      await store.clearAcknowledged()
      toast('Cleared reports deleted.', 'success')
    } catch {
      toast('Failed to clear reports.', 'error')
    }
  }

  const tabBg = (t: MainTab) => tab === t ? colors.primary : 'transparent'
  const tabTextColor = (t: MainTab) => tab === t ? '#fff' : colors.text

  if (!secUser && !admin) return null

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Security' }} />

      {/* Tab bar */}
      <XStack
        borderBottomWidth={1}
        borderBottomColor={colors.border}
        backgroundColor={colors.surface}
      >
        {(['report', 'queue', 'all'] as MainTab[]).map((t) => {
          if (t === 'all' && !admin) return null
          const label =
            t === 'report'
              ? 'Report a Concern'
              : t === 'queue'
              ? `Queue (${pendingReports.length})`
              : 'All Reports'
          return (
            <Pressable key={t} onPress={() => setTab(t)} style={{ flex: 1 }}>
              <YStack
                paddingVertical="$2"
                alignItems="center"
                backgroundColor={tabBg(t)}
                borderBottomWidth={tab === t ? 2 : 0}
                borderBottomColor={colors.primary}
              >
                <Text color={tabTextColor(t)} fontWeight={tab === t ? '700' : '400'} fontSize="$2">
                  {label}
                </Text>
              </YStack>
            </Pressable>
          )
        })}
      </XStack>

      <ScrollView style={{ flex: 1 }}>
        <YStack padding="$3" gap="$3">
          {/* ── Report a Concern ── */}
          {tab === 'report' && (
            <YStack gap="$3">
              {/* Type picker */}
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2">Type *</Text>
                <Pressable onPress={() => setShowTypePicker(true)}>
                  <XStack
                    borderWidth={1}
                    borderColor={colors.border}
                    borderRadius="$2"
                    padding="$2"
                    backgroundColor={colors.surface}
                    justifyContent="space-between"
                  >
                    <Text color={colors.text}>{rType}</Text>
                    <Text color={colors.textMuted}>▾</Text>
                  </XStack>
                </Pressable>
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2">Location *</Text>
                <RNTextInput
                  value={rLoc}
                  onChangeText={setRLoc}
                  placeholder="Where did this occur?"
                  placeholderTextColor={colors.textMuted}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, color: colors.text, backgroundColor: colors.surface }}
                />
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2">Description *</Text>
                <TextArea
                  value={rDesc}
                  onChangeText={setRDesc}
                  placeholder="Describe what happened..."
                  color={colors.text}
                  backgroundColor={colors.surface}
                  borderColor={colors.border}
                  minHeight={90}
                />
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2">Witness (optional)</Text>
                <RNTextInput
                  value={rWitness}
                  onChangeText={setRWitness}
                  placeholder="Witness name or description"
                  placeholderTextColor={colors.textMuted}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, color: colors.text, backgroundColor: colors.surface }}
                />
              </YStack>

              <AttachmentPicker attachment={rAttachment} onChange={setRAttachment} colors={colors} pickAndUpload={pickAndUpload} />

              <Pressable onPress={handleSubmit} disabled={submitting}>
                <XStack
                  backgroundColor={colors.primary}
                  padding="$3"
                  borderRadius="$2"
                  justifyContent="center"
                  opacity={submitting ? 0.6 : 1}
                >
                  <Text color="#fff" fontWeight="700">{submitting ? 'Submitting…' : 'Submit Report'}</Text>
                </XStack>
              </Pressable>
            </YStack>
          )}

          {/* ── Queue ── */}
          {tab === 'queue' && (
            <YStack gap="$3">
              {pendingReports.length === 0 ? (
                <EmptyState text="No pending reports. 🎉" colors={colors} />
              ) : (
                pendingReports.map((r) => (
                  <ReportCard
                    key={r.id}
                    report={r}
                    displayName={displayName}
                    colors={colors}
                    showAck={secUser || admin}
                    onAck={() => { setAckReport(r); setAckNote(''); setAckAttachment(null) }}
                  />
                ))
              )}
            </YStack>
          )}

          {/* ── All Reports (admin) ── */}
          {tab === 'all' && admin && (
            <YStack gap="$3">
              {clearedCount > 0 && (
                <Pressable onPress={handleClear}>
                  <XStack
                    backgroundColor="#c0392b"
                    padding="$2"
                    borderRadius="$2"
                    justifyContent="center"
                  >
                    <Text color="#fff" fontWeight="700">
                      Clear Completed Reports ({clearedCount})
                    </Text>
                  </XStack>
                </Pressable>
              )}
              {store.reports.length === 0 ? (
                <EmptyState text="No reports yet." colors={colors} />
              ) : (
                store.reports.map((r) => (
                  <ReportCard
                    key={r.id}
                    report={r}
                    displayName={displayName}
                    colors={colors}
                    showStatus
                    showAck={!r.ack}
                    onAck={() => { setAckReport(r); setAckNote(''); setAckAttachment(null) }}
                  />
                ))
              )}
            </YStack>
          )}
        </YStack>
      </ScrollView>

      {/* Type picker modal */}
      <Modal open={showTypePicker} onOpenChange={setShowTypePicker} title="Select Type">
        <YStack gap="$2">
          {REPORT_TYPES.map((t) => (
            <Pressable key={t} onPress={() => { setRType(t); setShowTypePicker(false) }}>
              <XStack
                padding="$3"
                borderRadius="$2"
                backgroundColor={t === rType ? colors.primary + '22' : 'transparent'}
              >
                <Text color={t === rType ? colors.primary : colors.text}>{t}</Text>
              </XStack>
            </Pressable>
          ))}
        </YStack>
      </Modal>

      {/* Acknowledge modal */}
      <Modal
        open={!!ackReport}
        onOpenChange={(open) => { if (!open) setAckReport(null) }}
        title="Acknowledge Report"
      >
        {ackReport && (
          <YStack gap="$3">
            <Text color={colors.textMuted} fontSize="$3">
              {ackReport.type} at {ackReport.loc}
            </Text>
            <Text color={colors.text} fontSize="$2">Describe what was done to address this concern...</Text>
            <TextArea
              value={ackNote}
              onChangeText={setAckNote}
              placeholder="Response notes (required)"
              color={colors.text}
              backgroundColor={colors.surface}
              borderColor={colors.border}
              minHeight={90}
            />
            <AttachmentPicker attachment={ackAttachment} onChange={setAckAttachment} colors={colors} pickAndUpload={pickAndUpload} />
            <Text color={colors.textMuted} fontSize="$1" fontStyle="italic">
              These notes are visible to security team and admins only.
            </Text>
            <XStack gap="$2">
              <Pressable style={{ flex: 1 }} onPress={() => setAckReport(null)}>
                <XStack borderWidth={1} borderColor={colors.border} padding="$2" borderRadius="$2" justifyContent="center">
                  <Text color={colors.text}>Cancel</Text>
                </XStack>
              </Pressable>
              <Pressable style={{ flex: 2 }} onPress={handleAcknowledge} disabled={acknowledging}>
                <XStack backgroundColor={colors.primary} padding="$2" borderRadius="$2" justifyContent="center" opacity={acknowledging ? 0.6 : 1}>
                  <Text color="#fff" fontWeight="700">{acknowledging ? 'Saving…' : 'Acknowledge & Submit'}</Text>
                </XStack>
              </Pressable>
            </XStack>
          </YStack>
        )}
      </Modal>
    </YStack>
  )
}

function ReportCard({
  report,
  displayName,
  colors,
  showStatus,
  showAck,
  onAck,
}: {
  report: SecurityReport
  displayName: (uid: string) => string
  colors: ReturnType<typeof import('@/theme/useThemeColors').useThemeColors>
  showStatus?: boolean
  showAck?: boolean
  onAck?: () => void
}) {
  const ts = new Date(report.ts)
  return (
    <YStack
      backgroundColor={colors.surface}
      borderRadius="$3"
      borderWidth={1}
      borderColor={colors.border}
      padding="$3"
      gap="$2"
    >
      <XStack justifyContent="space-between" alignItems="center">
        <XStack gap="$2" alignItems="center">
          <XStack backgroundColor={colors.primary + '22'} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$1">
            <Text color={colors.primary} fontSize="$1" fontWeight="700">{report.type}</Text>
          </XStack>
          {showStatus && (
            <XStack
              width={10} height={10} borderRadius={5}
              backgroundColor={report.ack ? '#27ae60' : '#f39c12'}
            />
          )}
        </XStack>
        <Text color={colors.textMuted} fontSize="$1">
          {ts.toLocaleDateString()} {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </XStack>
      <Text color={colors.textMuted} fontSize="$2">📍 {report.loc}</Text>
      <Text color={colors.text} fontSize="$3">{report.desc}</Text>
      {report.witness ? <Text color={colors.textMuted} fontSize="$2">👁 Witness: {report.witness}</Text> : null}
      <Text color={colors.textMuted} fontSize="$2">By: {displayName(report.reporter)}</Text>
      {(report.ackNotes ?? []).map((n, i) => (
        <YStack key={i} backgroundColor={colors.background} borderRadius="$2" padding="$2" gap="$1">
          <Text color={colors.textMuted} fontSize="$1">Response by {displayName(n.by)}:</Text>
          <Text color={colors.text} fontSize="$2">{n.note}</Text>
        </YStack>
      ))}
      {showAck && (
        <Pressable onPress={onAck}>
          <XStack backgroundColor={colors.primary} padding="$2" borderRadius="$2" justifyContent="center">
            <Text color="#fff" fontWeight="700">Acknowledge</Text>
          </XStack>
        </Pressable>
      )}
    </YStack>
  )
}

function AttachmentPicker({
  attachment, onChange, colors, pickAndUpload,
}: {
  attachment: Attachment | null
  onChange: (a: Attachment | null) => void
  colors: ReturnType<typeof import('@/theme/useThemeColors').useThemeColors>
  pickAndUpload: () => Promise<Attachment | null>
}) {
  const [uploading, setUploading] = useState(false)
  async function handle() {
    setUploading(true)
    try {
      const att = await pickAndUpload()
      if (att) onChange(att)
    } finally {
      setUploading(false)
    }
  }
  return (
    <YStack gap="$1">
      {attachment ? (
        <XStack gap="$2" alignItems="center">
          <Text color={colors.primary} fontSize="$2">📎 {attachment.name}</Text>
          <Pressable onPress={() => onChange(null)}>
            <Text color="#c0392b" fontSize="$2">✕</Text>
          </Pressable>
        </XStack>
      ) : (
        <Pressable onPress={handle} disabled={uploading}>
          <Text color={colors.primary} fontSize="$2">{uploading ? 'Uploading…' : '📎 Attach photo/file (optional)'}</Text>
        </Pressable>
      )}
    </YStack>
  )
}

function EmptyState({ text, colors }: { text: string; colors: ReturnType<typeof import('@/theme/useThemeColors').useThemeColors> }) {
  return (
    <YStack alignItems="center" padding="$6">
      <Text color={colors.textMuted}>{text}</Text>
    </YStack>
  )
}
