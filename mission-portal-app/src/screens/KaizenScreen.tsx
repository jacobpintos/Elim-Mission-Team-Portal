import React, { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, Modal, Alert, useWindowDimensions,
} from 'react-native'
import { useAuthStore } from '@/stores/authStore'
import { useUsersStore } from '@/stores/usersStore'
import { useKaizenStore } from '@/stores/kaizenStore'
import { useIssuesStore } from '@/stores/issuesStore'
import { useUIStore } from '@/stores/uiStore'
import { isAdmin } from '@/lib/roles'
import { useThemeColors } from '@/theme/useThemeColors'
import { KAIZEN_COLS, KAIZEN_CATS, activeAP } from '@/lib/kaizen'
import { FD } from '@/lib/format'
import type { KaizenItem, ActionPlan, ActionStep } from '@/types/kaizen'

/* ─── Idea Modal ─────────────────────────────────────────────────── */

interface IdeaModalProps {
  visible: boolean
  item: KaizenItem | null
  onClose: () => void
}
function IdeaModal({ visible, item, onClose }: IdeaModalProps) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const { users } = useUsersStore()
  const { issues } = useIssuesStore()
  const store = useKaizenStore()
  const { toast } = useUIStore()
  const admin = isAdmin(profile)

  const [title, setTitle]     = useState('')
  const [cat, setCat]         = useState(KAIZEN_CATS[0])
  const [desc, setDesc]       = useState('')
  const [linkedId, setLinkedId] = useState<number | null>(null)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (item) {
      setTitle(item.title); setCat(item.category as typeof cat)
      setDesc(item.description ?? ''); setLinkedId(item.linkedIssueId ?? null)
    } else {
      setTitle(''); setCat(KAIZEN_CATS[0]); setDesc(''); setLinkedId(null)
    }
  }, [item, visible])

  const handleSave = async () => {
    if (!title.trim()) { toast('Title is required', 'error'); return }
    if (!profile?.uid) return
    setSaving(true)
    try {
      const adminUids = users.filter(u => u.roles?.includes('admin')).map(u => u.uid)
      if (item) {
        await store.updateItem(item.id, { title: title.trim(), category: cat, description: desc.trim() || undefined, linkedIssueId: linkedId })
        toast('Idea updated', 'success')
      } else {
        await store.submitIdea({ title: title.trim(), category: cat, description: desc.trim() || undefined, linkedIssueId: linkedId }, profile.uid, adminUids)
        toast('Idea submitted!', 'success')
      }
      onClose()
    } catch { toast('Failed to save', 'error') } finally { setSaving(false) }
  }

  const colors2 = { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[mk.container, { backgroundColor: colors.background }]}>
        <View style={[mk.header, { borderBottomColor: colors.border }]}>
          <Text style={[mk.title, { color: colors.text }]}>{item ? 'Edit Idea' : 'Submit Improvement Idea'}</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={[mk.label, { color: colors.textMuted }]}>Idea Title *</Text>
          <TextInput style={[mk.input, colors2]} value={title} onChangeText={setTitle} placeholder="What's the improvement?" placeholderTextColor={colors.textMuted} />

          <Text style={[mk.label, { color: colors.textMuted }]}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {KAIZEN_CATS.map(c => (
              <TouchableOpacity key={c} style={[mk.chip, c === cat && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setCat(c as typeof cat)}>
                <Text style={{ color: c === cat ? '#fff' : colors.text, fontSize: 12 }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[mk.label, { color: colors.textMuted }]}>Description (optional)</Text>
          <TextInput style={[mk.input, colors2, { minHeight: 72, textAlignVertical: 'top' }]} value={desc} onChangeText={setDesc} multiline numberOfLines={4} placeholder="Add more detail…" placeholderTextColor={colors.textMuted} />

          <Text style={[mk.label, { color: colors.textMuted }]}>Linked Issue (optional)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            <TouchableOpacity style={[mk.chip, !linkedId && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setLinkedId(null)}>
              <Text style={{ color: !linkedId ? '#fff' : colors.text, fontSize: 12 }}>None</Text>
            </TouchableOpacity>
            {issues.slice(0, 10).map(i => (
              <TouchableOpacity key={i.id} style={[mk.chip, linkedId === i.id && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setLinkedId(i.id)}>
                <Text style={{ color: linkedId === i.id ? '#fff' : colors.text, fontSize: 12 }} numberOfLines={1}>#{i.id} {i.title.slice(0, 30)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <View style={[mk.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={[mk.btn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{saving ? 'Saving…' : item ? 'Save' : 'Submit'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

/* ─── Action Plan Modal ───────────────────────────────────────────── */

interface APModalProps {
  visible: boolean
  item: KaizenItem | null
  onClose: () => void
}
function APModal({ visible, item, onClose }: APModalProps) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const { users } = useUsersStore()
  const store = useKaizenStore()
  const { toast } = useUIStore()

  const [statement, setStatement] = useState('')
  const [criteria, setCriteria]   = useState('')
  const [reviewDate, setReviewDate] = useState('')
  const [steps, setSteps] = useState<ActionStep[]>([{ title: '', assignee: null, dueDate: null, done: false }])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) { setStatement(''); setCriteria(''); setReviewDate(''); setSteps([{ title: '', assignee: null, dueDate: null, done: false }]) }
  }, [visible])

  const addStep = () => setSteps(s => [...s, { title: '', assignee: null, dueDate: null, done: false }])
  const removeStep = (i: number) => setSteps(s => s.filter((_, idx) => idx !== i))
  const updateStep = (i: number, patch: Partial<ActionStep>) =>
    setSteps(s => s.map((step, idx) => idx === i ? { ...step, ...patch } : step))

  const handleSave = async () => {
    if (!statement.trim()) { toast('Statement is required', 'error'); return }
    if (steps.every(st => !st.title.trim())) { toast('At least one step is required', 'error'); return }
    if (!profile?.uid || !item) return
    setSaving(true)
    try {
      await store.createActionPlan(item.id, {
        statement: statement.trim(),
        successCriteria: criteria.trim(),
        reviewDate: reviewDate || undefined,
        steps: steps.filter(st => st.title.trim()).map(st => ({ ...st, title: st.title.trim() })),
        outcome: undefined, outcomeNotes: undefined, outcomeDate: undefined,
      }, profile.uid)
      toast('Action plan created!', 'success')
      onClose()
    } catch { toast('Failed to save plan', 'error') } finally { setSaving(false) }
  }

  const nonAdminUsers = users.filter(u => !u.roles?.includes('unverified'))
  const inputStyle = [mk.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[mk.container, { backgroundColor: colors.background }]}>
        <View style={[mk.header, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[mk.title, { color: colors.text }]}>Action Plan</Text>
            {item && <Text style={{ color: colors.textMuted, fontSize: 12 }}>For: {item.title}</Text>}
          </View>
          <TouchableOpacity onPress={onClose}><Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={[mk.label, { color: colors.textMuted }]}>Opportunity / Problem Statement *</Text>
          <TextInput style={[inputStyle, { minHeight: 66, textAlignVertical: 'top' }]} value={statement} onChangeText={setStatement} multiline numberOfLines={3} placeholder="What are we trying to improve?" placeholderTextColor={colors.textMuted} />
          <Text style={[mk.label, { color: colors.textMuted }]}>Success Criteria</Text>
          <TextInput style={[inputStyle, { minHeight: 52, textAlignVertical: 'top' }]} value={criteria} onChangeText={setCriteria} multiline numberOfLines={2} placeholder="How will we know this worked?" placeholderTextColor={colors.textMuted} />
          <Text style={[mk.label, { color: colors.textMuted }]}>Review Date</Text>
          <TextInput style={inputStyle} value={reviewDate} onChangeText={setReviewDate} placeholder="YYYY-MM-DD (optional)" placeholderTextColor={colors.textMuted} />

          <View style={[mk.divider, { backgroundColor: colors.border }]} />
          <Text style={[mk.sectionTitle, { color: colors.text }]}>Action Steps</Text>

          {steps.map((step, i) => (
            <View key={i} style={[mk.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>Step {i + 1}</Text>
                {steps.length > 1 && (
                  <TouchableOpacity onPress={() => removeStep(i)}>
                    <Text style={{ color: '#e74c3c', fontSize: 12 }}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput style={[inputStyle, { marginTop: 6 }]} value={step.title} onChangeText={v => updateStep(i, { title: v })} placeholder="Step description *" placeholderTextColor={colors.textMuted} />
              <Text style={[mk.label, { color: colors.textMuted }]}>Assignee</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                <TouchableOpacity style={[mk.chip, !step.assignee && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => updateStep(i, { assignee: null })}>
                  <Text style={{ color: !step.assignee ? '#fff' : colors.text, fontSize: 11 }}>None</Text>
                </TouchableOpacity>
                {nonAdminUsers.slice(0, 8).map(u => (
                  <TouchableOpacity key={u.uid} style={[mk.chip, step.assignee === u.uid && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => updateStep(i, { assignee: u.uid })}>
                    <Text style={{ color: step.assignee === u.uid ? '#fff' : colors.text, fontSize: 11 }}>{u.displayName}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={[mk.label, { color: colors.textMuted }]}>Due Date</Text>
              <TextInput style={inputStyle} value={step.dueDate ?? ''} onChangeText={v => updateStep(i, { dueDate: v || null })} placeholder="YYYY-MM-DD (optional)" placeholderTextColor={colors.textMuted} />
            </View>
          ))}
          <TouchableOpacity style={[mk.addStepBtn, { borderColor: colors.primary }]} onPress={addStep}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add Step</Text>
          </TouchableOpacity>
        </ScrollView>
        <View style={[mk.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={[mk.btn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{saving ? 'Saving…' : 'Save & Activate Plan'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

/* ─── Outcome Modal ────────────────────────────────────────────── */

interface OutcomeModalProps {
  visible: boolean
  item: KaizenItem | null
  worked: boolean
  onClose: () => void
  onOpenNewPlan: () => void
}
function OutcomeModal({ visible, item, worked, onClose, onOpenNewPlan }: OutcomeModalProps) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const store = useKaizenStore()
  const { toast } = useUIStore()
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (visible) setNotes('') }, [visible])

  const ap = item ? activeAP(item) : null

  const handleSave = async () => {
    if (!profile?.uid || !item) return
    setSaving(true)
    try {
      await store.recordOutcome(item.id, worked, notes.trim(), profile.uid)
      toast(worked ? 'Marked complete!' : 'Outcome recorded', 'success')
      onClose()
      if (!worked) { setTimeout(onOpenNewPlan, 300) }
    } catch { toast('Failed to record outcome', 'error') } finally { setSaving(false) }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet">
      <View style={[mk.container, { backgroundColor: colors.background }]}>
        <View style={[mk.header, { borderBottomColor: colors.border }]}>
          <Text style={[mk.title, { color: colors.text }]}>{worked ? 'Mark as Completed' : 'Initiate New Action Plan'}</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {ap && (
            <View style={[mk.infoBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>Current plan: v{ap.version} — {ap.statement.slice(0, 60)}{ap.statement.length > 60 ? '…' : ''}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                Steps: {ap.steps.filter(s => s.done).length}/{ap.steps.length} complete
              </Text>
            </View>
          )}
          <Text style={[mk.label, { color: colors.textMuted }]}>
            {worked ? 'What worked? (outcome notes)' : 'What failed? Why?'}
          </Text>
          <TextInput
            style={[mk.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, minHeight: 88, textAlignVertical: 'top' }]}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            placeholder={worked ? 'Describe what worked…' : 'Describe what failed and why…'}
            placeholderTextColor={colors.textMuted}
          />
        </ScrollView>
        <View style={[mk.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[mk.btn, { backgroundColor: worked ? '#27ae60' : colors.primary }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {saving ? 'Saving…' : worked ? 'Mark Completed' : 'Start New Plan'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

/* ─── History Modal ─────────────────────────────────────────────── */

function HistoryModal({ visible, item, onClose }: { visible: boolean; item: KaizenItem | null; onClose: () => void }) {
  const colors = useThemeColors()
  const { displayName } = useUsersStore()
  if (!item) return null
  const OUTCOME_COLORS = { worked: '#27ae60', failed: '#e74c3c', archived: '#888', pending: '#e67e22' }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[mk.container, { backgroundColor: colors.background }]}>
        <View style={[mk.header, { borderBottomColor: colors.border }]}>
          <Text style={[mk.title, { color: colors.text }]} numberOfLines={1}>{item.title} — History</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ color: colors.primary, fontSize: 16 }}>Close</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {item.actionPlans.map((ap, idx) => {
            const oc = ap.outcome ?? 'pending'
            return (
              <View key={idx} style={[mk.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Plan v{ap.version}</Text>
                  <View style={[mk.badge, { backgroundColor: OUTCOME_COLORS[oc] }]}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{oc === 'worked' ? 'Worked' : oc === 'failed' ? 'Did Not Work' : oc === 'archived' ? 'Archived' : 'Pending'}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.text, fontSize: 13 }}>{ap.statement}</Text>
                {ap.successCriteria ? <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>Success: {ap.successCriteria}</Text> : null}
                {ap.steps.map((step, si) => (
                  <Text key={si} style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {step.done ? '✔' : '○'} {step.title}{step.assignee ? ` (${displayName(step.assignee)})` : ''}{step.dueDate ? ` — due ${FD(step.dueDate)}` : ''}
                  </Text>
                ))}
                {ap.outcomeNotes ? <Text style={{ color: OUTCOME_COLORS[oc], fontSize: 12, fontStyle: 'italic', marginTop: 6 }}>{ap.outcomeNotes}</Text> : null}
                {ap.outcomeDate ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{FD(ap.outcomeDate)}</Text> : null}
              </View>
            )
          })}
        </ScrollView>
      </View>
    </Modal>
  )
}

/* ─── Delete Modal ──────────────────────────────────────────────── */

interface DeleteModalProps { visible: boolean; item: KaizenItem | null; onClose: () => void }
function DeleteModal({ visible, item, onClose }: DeleteModalProps) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const { displayName } = useUsersStore()
  const store = useKaizenStore()
  const { toast } = useUIStore()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (visible) setReason('') }, [visible])

  const handleDelete = async () => {
    if (!reason.trim()) { toast('Reason is required', 'error'); return }
    if (!profile?.uid || !item) return
    setSaving(true)
    try {
      await store.deleteItem(item.id, reason.trim(), profile.uid, displayName(profile.uid))
      toast('Idea deleted and submitter notified', 'info')
      onClose()
    } catch { toast('Failed to delete', 'error') } finally { setSaving(false) }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet">
      <View style={[mk.container, { backgroundColor: colors.background }]}>
        <View style={[mk.header, { borderBottomColor: colors.border }]}>
          <Text style={[mk.title, { color: colors.text }]}>Delete Idea</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ color: colors.primary }}>Cancel</Text></TouchableOpacity>
        </View>
        <View style={{ padding: 16 }}>
          {item && <Text style={{ color: colors.textMuted, marginBottom: 12 }}>Deleting "{item.title}". The submitter will be notified.</Text>}
          <Text style={[mk.label, { color: colors.textMuted }]}>Reason for deletion *</Text>
          <TextInput
            style={[mk.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface, minHeight: 66, textAlignVertical: 'top' }]}
            value={reason} onChangeText={setReason} multiline numberOfLines={3}
            placeholder="Why is this idea being removed?"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={[mk.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={[mk.btn, { backgroundColor: '#e74c3c' }]} onPress={handleDelete} disabled={saving}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{saving ? 'Deleting…' : 'Delete & Notify'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

/* ─── Kaizen Item Card ──────────────────────────────────────────── */

function KaizenCard({ item, admin }: { item: KaizenItem; admin: boolean }) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const { displayName } = useUsersStore()
  const { issues } = useIssuesStore()
  const store = useKaizenStore()
  const { toast } = useUIStore()
  const [showMore, setShowMore] = useState(false)
  const [showAP, setShowAP] = useState(false)
  const [showOutcome, setShowOutcome] = useState(false)
  const [outcomeWorked, setOutcomeWorked] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const uid = profile?.uid ?? ''
  const hasVoted = item.voters.includes(uid)
  const ap = activeAP(item)
  const linkedIssue = item.linkedIssueId ? issues.find(i => i.id === item.linkedIssueId) : null
  const colInfo = KAIZEN_COLS.find(c => c.id === item.stage)

  const handleVote = async () => {
    try { await store.toggleVote(item.id, uid) } catch { toast('Vote failed', 'error') }
  }

  const handleForward = async () => {
    const order: KaizenItem['stage'][] = ['idea', 'review', 'action', 'complete']
    const idx = order.indexOf(item.stage)
    if (idx >= order.length - 1) return
    const next = order[idx + 1]
    if (next === 'action') { setShowAP(true); return }
    if (next === 'complete') { setOutcomeWorked(true); setShowOutcome(true); return }
    try { await store.advanceStage(item.id, next); toast('Stage advanced', 'success') } catch { toast('Failed', 'error') }
  }

  const handleBack = () => {
    const hasAP = item.stage === 'action' && item.actionPlans.length > 0
    Alert.alert(
      'Move Back', hasAP ? 'This will archive the active plan and remove its tasks. Continue?' : 'Move to previous stage?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Move Back', onPress: async () => {
          try { await store.retractStage(item.id); toast('Moved back', 'info') } catch { toast('Failed', 'error') }
        }},
      ]
    )
  }

  const descTruncated = (item.description?.length ?? 0) > 80

  return (
    <View style={[kc.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Category tag */}
      <View style={[kc.catTag, { backgroundColor: colInfo?.color ?? colors.primary }]}>
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{item.category}</Text>
      </View>
      <Text style={[kc.title, { color: colors.text }]}>{item.title}</Text>

      {item.description ? (
        <View>
          <Text style={[kc.desc, { color: colors.textMuted }]} numberOfLines={showMore ? undefined : 3}>
            {item.description}
          </Text>
          {descTruncated && (
            <TouchableOpacity onPress={() => setShowMore(m => !m)}>
              <Text style={{ color: colors.primary, fontSize: 11 }}>{showMore ? 'Show less' : 'Show more'}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {linkedIssue && (
        <Text style={[kc.issueLink, { color: colors.accent }]}>↗ From: {linkedIssue.title}</Text>
      )}

      {/* Action plan summary */}
      {item.stage === 'action' && ap && (
        <View style={[kc.apBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Plan v{ap.version}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={2}>{ap.statement}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
            {ap.steps.filter(s => s.done).length}/{ap.steps.length} steps done
          </Text>
          {ap.steps.map((step, i) => (
            <TouchableOpacity key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}
              onPress={admin ? () => store.toggleStepDone(item.id, i) : undefined}>
              <Text style={{ color: step.done ? '#27ae60' : colors.textMuted, fontSize: 13 }}>{step.done ? '✔' : '○'}</Text>
              <Text style={{ color: colors.text, fontSize: 12, flex: 1 }} numberOfLines={1}>{step.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* History for completed */}
      {item.stage === 'complete' && item.actionPlans.length > 0 && (
        <TouchableOpacity onPress={() => setShowHistory(true)}>
          <Text style={{ color: colors.primary, fontSize: 12, marginTop: 6 }}>View History ({item.actionPlans.length} plan{item.actionPlans.length > 1 ? 's' : ''})</Text>
        </TouchableOpacity>
      )}

      {/* Vote row */}
      <View style={[kc.voteRow, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[kc.voteBtn, hasVoted && { backgroundColor: colors.primary }]}
          onPress={handleVote}
        >
          <Text style={{ color: hasVoted ? '#fff' : colors.textMuted, fontSize: 13, fontWeight: '600' }}>▲ {item.votes}</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1, textAlign: 'right' }}>
          {displayName(item.submitter)}
        </Text>
      </View>

      {/* Admin row */}
      {admin && (
        <View style={[kc.adminRow, { borderTopColor: colors.border }]}>
          {item.stage !== 'idea' && (
            <TouchableOpacity style={kc.adminBtn} onPress={handleBack}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>← Back</Text>
            </TouchableOpacity>
          )}
          {item.stage !== 'complete' && (
            <TouchableOpacity style={kc.adminBtn} onPress={handleForward}>
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>
                {item.stage === 'review' ? '→ Plan' : item.stage === 'action' ? '→ Complete' : '→ Review'}
              </Text>
            </TouchableOpacity>
          )}
          {item.stage === 'action' && (
            <TouchableOpacity style={kc.adminBtn} onPress={() => { setOutcomeWorked(false); setShowOutcome(true) }}>
              <Text style={{ color: '#e67e22', fontSize: 11, fontWeight: '600' }}>New Plan</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={kc.adminBtn} onPress={() => {/* open idea modal */}}>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={kc.adminBtn} onPress={() => setShowDelete(true)}>
            <Text style={{ color: '#e74c3c', fontSize: 11 }}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      <APModal visible={showAP} item={item} onClose={() => setShowAP(false)} />
      <OutcomeModal
        visible={showOutcome}
        item={item}
        worked={outcomeWorked}
        onClose={() => setShowOutcome(false)}
        onOpenNewPlan={() => setShowAP(true)}
      />
      <HistoryModal visible={showHistory} item={item} onClose={() => setShowHistory(false)} />
      <DeleteModal visible={showDelete} item={item} onClose={() => setShowDelete(false)} />
    </View>
  )
}

/* ─── Main Screen ───────────────────────────────────────────────── */

export default function KaizenScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const store = useKaizenStore()
  const issuesStore = useIssuesStore()
  const { subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const [showIdea, setShowIdea] = useState(false)
  const admin = isAdmin(profile)
  const { width } = useWindowDimensions()
  const colWidth = Math.max(210, Math.min(280, (width - 32) / 2))

  useEffect(() => {
    subUsers()
    store.loadItems()
    issuesStore.loadIssues()
    return () => { unsubUsers() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[kc.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[kc.headerTitle, { color: colors.text }]}>Kaizen Board</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            Continuous improvement. Vote to surface the best ideas.
          </Text>
        </View>
        <TouchableOpacity style={[kc.newBtn, { backgroundColor: colors.primary }]} onPress={() => setShowIdea(true)}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>+ Submit Idea</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
        {KAIZEN_COLS.map(col => {
          const colItems = store.items.filter(i => i.stage === col.id).sort((a, b) => b.votes - a.votes)
          return (
            <View key={col.id} style={[kc.col, { width: colWidth, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[kc.colHeader, { borderBottomColor: colors.border }]}>
                <View style={[kc.colDot, { backgroundColor: col.color }]} />
                <Text style={[kc.colName, { color: colors.text }]}>{col.label}</Text>
                <View style={[kc.colCount, { backgroundColor: col.color }]}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{colItems.length}</Text>
                </View>
              </View>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {colItems.length === 0 && (
                  <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 16 }}>No items</Text>
                )}
                {colItems.map(item => (
                  <KaizenCard key={item.id} item={item} admin={admin} />
                ))}
              </ScrollView>
            </View>
          )
        })}
      </ScrollView>

      <IdeaModal visible={showIdea} item={null} onClose={() => setShowIdea(false)} />
    </View>
  )
}

const mk = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 12, marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#ccc', marginRight: 6, marginBottom: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  divider: { height: 1, marginVertical: 12 },
  stepCard: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 10 },
  addStepBtn: { borderWidth: 1.5, borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 4 },
  footer: { flexDirection: 'row', padding: 16, borderTopWidth: 1, alignItems: 'center', gap: 12 },
  btn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  infoBanner: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  historyCard: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
})

const kc = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  newBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginLeft: 8, marginTop: 2 },
  col: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', maxHeight: '100%' },
  colHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 6, borderBottomWidth: 1 },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colName: { flex: 1, fontSize: 13, fontWeight: '700' },
  colCount: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  card: { borderWidth: 1, borderRadius: 8, padding: 10, margin: 8 },
  catTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginBottom: 6 },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  desc: { fontSize: 12, lineHeight: 16 },
  issueLink: { fontSize: 12, marginTop: 4 },
  apBox: { borderWidth: 1, borderRadius: 6, padding: 8, marginTop: 8 },
  voteRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  voteBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#ccc' },
  adminRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6, paddingTop: 6, borderTopWidth: 1 },
  adminBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(128,128,128,0.3)' },
})
