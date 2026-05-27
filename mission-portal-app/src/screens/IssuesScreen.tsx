import React, { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet,
  RefreshControl, Alert, Modal, Platform,
} from 'react-native'
import { useAuthStore } from '@/stores/authStore'
import { useUsersStore } from '@/stores/usersStore'
import { useIssuesStore } from '@/stores/issuesStore'
import { useUIStore } from '@/stores/uiStore'
import { isAdmin } from '@/lib/roles'
import { FD } from '@/lib/format'
import { useThemeColors } from '@/theme/useThemeColors'
import type { ProductionIssue } from '@/types/issues'

type FilterTab = 'open' | 'in_progress' | 'closed'

const STATUS_COLORS: Record<ProductionIssue['status'], string> = {
  open: '#e74c3c',
  in_progress: '#e67e22',
  closed: '#27ae60',
}
const STATUS_LABELS: Record<ProductionIssue['status'], string> = {
  open: 'Open',
  in_progress: 'CA In Progress',
  closed: 'Resolved',
}

/* ─── Edit Modal ────────────────────────────────────────────────── */

interface EditIssueModalProps {
  visible: boolean
  issue: ProductionIssue | null
  onClose: () => void
}

function EditIssueModal({ visible, issue, onClose }: EditIssueModalProps) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const { users } = useUsersStore()
  const store = useIssuesStore()
  const { toast } = useUIStore()
  const adminUsers = users.filter(u => u.roles?.includes('admin'))

  // form state
  const [title, setTitle]         = useState('')
  const [date, setDate]           = useState(new Date().toISOString().split('T')[0])
  const [eventTitle, setEventTitle] = useState('')
  const [problem, setProblem]     = useState('')
  const [why1, setWhy1]           = useState('')
  const [why2, setWhy2]           = useState('')
  const [why3, setWhy3]           = useState('')
  const [why4, setWhy4]           = useState('')
  const [why5, setWhy5]           = useState('')
  const [ca, setCa]               = useState('')
  const [caOwner, setCaOwner]     = useState('')
  const [caDueDate, setCaDueDate] = useState('')
  const [status, setStatus]       = useState<ProductionIssue['status']>('open')
  const [verif, setVerif]         = useState('')
  const [verifDate, setVerifDate] = useState('')
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    if (issue) {
      setTitle(issue.title)
      setDate(issue.date)
      setEventTitle(issue.eventTitle ?? '')
      setProblem(issue.problem)
      setWhy1(issue.why1 ?? '')
      setWhy2(issue.why2 ?? '')
      setWhy3(issue.why3 ?? '')
      setWhy4(issue.why4 ?? '')
      setWhy5(issue.why5 ?? '')
      setCa(issue.ca ?? '')
      setCaOwner(issue.caOwner ?? '')
      setCaDueDate(issue.caDueDate ?? '')
      setStatus(issue.status)
      setVerif(issue.verif ?? '')
      setVerifDate(issue.verifDate ?? '')
    } else {
      setTitle(''); setDate(new Date().toISOString().split('T')[0])
      setEventTitle(''); setProblem('')
      setWhy1(''); setWhy2(''); setWhy3(''); setWhy4(''); setWhy5('')
      setCa(''); setCaOwner(''); setCaDueDate('')
      setStatus('open'); setVerif(''); setVerifDate('')
    }
  }, [issue, visible])

  const handleSave = async () => {
    if (!title.trim() || !problem.trim()) {
      toast('Title and problem are required', 'error'); return
    }
    if (!profile?.uid) return
    setSaving(true)
    try {
      const data: Omit<ProductionIssue, 'id' | 'reporter' | 'ts'> = {
        title: title.trim(),
        date,
        eventTitle: eventTitle.trim() || undefined,
        problem: problem.trim(),
        why1: why1.trim() || undefined,
        why2: why2.trim() || undefined,
        why3: why3.trim() || undefined,
        why4: why4.trim() || undefined,
        why5: why5.trim() || undefined,
        ca: ca.trim() || undefined,
        caOwner: caOwner || undefined,
        caDueDate: caDueDate || undefined,
        caDueTaskId: issue?.caDueTaskId ?? null,
        status,
        verif: verif.trim() || undefined,
        verifDate: verifDate || undefined,
      }
      if (issue) {
        await store.updateIssue(issue.id, data, profile.uid)
        toast('Issue updated', 'success')
      } else {
        const adminUids = adminUsers.map(u => u.uid)
        await store.createIssue(data, profile.uid, adminUids)
        toast('Issue created', 'success')
      }
      onClose()
    } catch (e) {
      toast('Failed to save issue', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (!issue) return
    Alert.alert('Delete Issue', 'Remove this issue permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await store.deleteIssue(issue.id)
          toast('Issue deleted', 'info')
          onClose()
        },
      },
    ])
  }

  const inputStyle = [s.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]
  const labelStyle = [s.label, { color: colors.textMuted }]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[s.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[s.modalTitle, { color: colors.text }]}>
            {issue ? 'Edit Issue' : 'New Production Issue'}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {/* Issue Info */}
          <Text style={[s.sectionTitle, { color: colors.text }]}>Issue Info</Text>
          <Text style={labelStyle}>Title *</Text>
          <TextInput style={inputStyle} value={title} onChangeText={setTitle} placeholder="Issue title" placeholderTextColor={colors.textMuted} />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Date *</Text>
              <TextInput style={inputStyle} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Related Event</Text>
              <TextInput style={inputStyle} value={eventTitle} onChangeText={setEventTitle} placeholder="Event name" placeholderTextColor={colors.textMuted} />
            </View>
          </View>

          <View style={[s.divider, { backgroundColor: colors.border }]} />

          {/* Problem Statement */}
          <Text style={[s.sectionTitle, { color: colors.text }]}>Problem Statement</Text>
          <Text style={labelStyle}>What happened? *</Text>
          <TextInput
            style={[inputStyle, s.textArea]}
            value={problem}
            onChangeText={setProblem}
            multiline
            numberOfLines={3}
            placeholder="Describe what happened…"
            placeholderTextColor={colors.textMuted}
          />

          <View style={[s.divider, { backgroundColor: colors.border }]} />

          {/* 5-Why */}
          <Text style={[s.sectionTitle, { color: colors.text }]}>5-Why Root Cause Analysis</Text>
          <Text style={[labelStyle, { marginBottom: 8 }]}>Ask "Why?" five times to find the root cause.</Text>
          {([
            [why1, setWhy1, 'Why did this happen?'],
            [why2, setWhy2, 'Why? (2nd level)'],
            [why3, setWhy3, 'Why? (3rd level)'],
            [why4, setWhy4, 'Why? (4th level)'],
            [why5, setWhy5, 'Why? (Root cause)'],
          ] as [string, (v: string) => void, string][]).map(([val, setter, ph], idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <View style={[s.whyBadge, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{idx + 1}</Text>
              </View>
              <TextInput
                style={[inputStyle, s.textArea, { flex: 1 }]}
                value={val}
                onChangeText={setter}
                multiline
                numberOfLines={2}
                placeholder={ph}
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ))}

          <View style={[s.divider, { backgroundColor: colors.border }]} />

          {/* Corrective Action */}
          <Text style={[s.sectionTitle, { color: colors.text }]}>Corrective Action</Text>
          <Text style={labelStyle}>What will be done to prevent recurrence?</Text>
          <TextInput
            style={[inputStyle, s.textArea]}
            value={ca}
            onChangeText={setCa}
            multiline
            numberOfLines={3}
            placeholder="Describe corrective action…"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={labelStyle}>CA Owner</Text>
          <View style={[s.picker, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[s.pickerOption, !caOwner && { backgroundColor: colors.primary }]}
                onPress={() => setCaOwner('')}
              >
                <Text style={{ color: !caOwner ? '#fff' : colors.text, fontSize: 12 }}>None</Text>
              </TouchableOpacity>
              {adminUsers.map(u => (
                <TouchableOpacity
                  key={u.uid}
                  style={[s.pickerOption, caOwner === u.uid && { backgroundColor: colors.primary }]}
                  onPress={() => setCaOwner(u.uid)}
                >
                  <Text style={{ color: caOwner === u.uid ? '#fff' : colors.text, fontSize: 12 }}>
                    {u.displayName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          {caOwner && (
            <>
              <Text style={labelStyle}>CA Due Date</Text>
              <TextInput
                style={inputStyle}
                value={caDueDate}
                onChangeText={setCaDueDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
              />
            </>
          )}

          <View style={[s.divider, { backgroundColor: colors.border }]} />

          {/* Verification */}
          <Text style={[s.sectionTitle, { color: colors.text }]}>Verification</Text>
          <Text style={[labelStyle, { marginBottom: 8 }]}>
            Did the corrective action work? Complete this after the next event.
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Verification Date</Text>
              <TextInput
                style={inputStyle}
                value={verifDate}
                onChangeText={setVerifDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Status</Text>
              {(['open', 'in_progress', 'closed'] as ProductionIssue['status'][]).map(st => (
                <TouchableOpacity
                  key={st}
                  style={[s.statusBtn, { borderColor: STATUS_COLORS[st] }, status === st && { backgroundColor: STATUS_COLORS[st] }]}
                  onPress={() => setStatus(st)}
                >
                  <Text style={{ color: status === st ? '#fff' : STATUS_COLORS[st], fontSize: 11, fontWeight: '600' }}>
                    {STATUS_LABELS[st]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={labelStyle}>Verification Notes</Text>
          <TextInput
            style={[inputStyle, s.textArea]}
            value={verif}
            onChangeText={setVerif}
            multiline
            numberOfLines={3}
            placeholder="Notes on whether the CA worked…"
            placeholderTextColor={colors.textMuted}
          />

          <View style={{ height: 32 }} />
        </ScrollView>

        {/* Footer */}
        <View style={[s.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          {issue && (
            <TouchableOpacity style={[s.footerBtn, s.deleteBtn]} onPress={handleDelete}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Delete</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[s.footerBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {saving ? 'Saving…' : issue ? 'Save' : 'Submit'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

/* ─── Main Screen ───────────────────────────────────────────────── */

export default function IssuesScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const { subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const store = useIssuesStore()

  const [filterTab, setFilterTab] = useState<FilterTab>('open')
  const [editIssue, setEditIssue] = useState<ProductionIssue | null | undefined>(undefined)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    subUsers()
    store.loadIssues()
    return () => { unsubUsers() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await store.loadIssues()
    setRefreshing(false)
  }

  const counts = {
    open:        store.issues.filter(i => i.status === 'open').length,
    in_progress: store.issues.filter(i => i.status === 'in_progress').length,
    closed:      store.issues.filter(i => i.status === 'closed').length,
  }

  const filtered = store.issues.filter(i => i.status === filterTab)

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.text }]}>Production Issues</Text>
        <TouchableOpacity
          style={[s.newBtn, { backgroundColor: colors.primary }]}
          onPress={() => setEditIssue(null)}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>+ New Issue</Text>
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View style={[s.statsRow, { borderBottomColor: colors.border }]}>
        {(['open', 'in_progress', 'closed'] as FilterTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.statBox, { borderColor: STATUS_COLORS[tab], backgroundColor: filterTab === tab ? STATUS_COLORS[tab] : 'transparent' }]}
            onPress={() => setFilterTab(tab)}
          >
            <Text style={{ color: filterTab === tab ? '#fff' : STATUS_COLORS[tab], fontSize: 18, fontWeight: '700' }}>
              {counts[tab]}
            </Text>
            <Text style={{ color: filterTab === tab ? '#fff' : STATUS_COLORS[tab], fontSize: 11, marginTop: 2 }}>
              {STATUS_LABELS[tab]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {store.loading && !refreshing && (
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 24 }}>Loading…</Text>
        )}
        {!store.loading && filtered.length === 0 && (
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 24 }}>
            No issues in this category.
          </Text>
        )}
        {filtered.map(issue => (
          <IssueCard key={issue.id} issue={issue} onPress={() => setEditIssue(issue)} colors={colors} />
        ))}
      </ScrollView>

      <EditIssueModal
        visible={editIssue !== undefined}
        issue={editIssue ?? null}
        onClose={() => setEditIssue(undefined)}
      />
    </View>
  )
}

function IssueCard({ issue, onPress, colors }: { issue: ProductionIssue; onPress: () => void; colors: ReturnType<typeof useThemeColors> }) {
  const { displayName } = useUsersStore()
  const snippet = issue.problem.length > 120 ? issue.problem.slice(0, 120) + '…' : issue.problem
  const caSnippet = issue.ca ? (issue.ca.length > 80 ? issue.ca.slice(0, 80) + '…' : issue.ca) : null

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={[s.cardTitle, { color: colors.text }]} numberOfLines={1}>{issue.title}</Text>
        <View style={[s.badge, { backgroundColor: STATUS_COLORS[issue.status] }]}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{STATUS_LABELS[issue.status]}</Text>
        </View>
      </View>
      <Text style={[s.cardSub, { color: colors.textMuted }]}>
        {[issue.eventTitle, FD(issue.date), `Reported by ${displayName(issue.reporter)}`].filter(Boolean).join(' · ')}
      </Text>
      <Text style={[s.cardSnippet, { color: colors.text }]}>{snippet}</Text>
      {caSnippet && (
        <Text style={[s.caLine, { color: '#27ae60' }]}>✔ CA: {caSnippet}</Text>
      )}
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  newBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  statsRow: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1 },
  statBox: { flex: 1, borderWidth: 2, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  card: { borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  cardSub: { fontSize: 12, marginTop: 4 },
  cardSnippet: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  caLine: { fontSize: 12, marginTop: 6, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 8 },
  // modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  label: { fontSize: 12, marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginBottom: 4 },
  textArea: { minHeight: 72, textAlignVertical: 'top', paddingTop: 8 },
  divider: { height: 1, marginVertical: 16 },
  whyBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  picker: { borderWidth: 1, borderRadius: 8, padding: 6, marginBottom: 8 },
  pickerOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginRight: 6 },
  statusBtn: { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4, alignItems: 'center' },
  footer: { flexDirection: 'row', padding: 16, borderTopWidth: 1, alignItems: 'center', gap: 12 },
  footerBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  deleteBtn: { backgroundColor: '#e74c3c' },
})
