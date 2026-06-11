import { useState, useEffect } from 'react'
import { ScrollView, Pressable, TextInput } from 'react-native'
import { YStack, XStack, Text, Input, Button, Spinner } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { MemberAndGroupPicker } from './MemberAndGroupPicker'
import { TASK_SECTIONS, type TaskItem, type TaskSection, type TaskTemplate } from './TaskTemplateCard'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const SECTION_COLORS = [
  '#e8624a', '#2980b9', '#27ae60', '#f39c12',
  '#9b59b6', '#1abc9c', '#e91e8c', '#607d8b',
]

function slugify(label: string, existing: string[]): string {
  const base = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'section'
  if (!existing.includes(base)) return base
  let i = 2
  while (existing.includes(`${base}_${i}`)) i++
  return `${base}_${i}`
}

interface EditTaskTemplateSheetProps {
  open: boolean
  onClose: () => void
  template: TaskTemplate | null
}

interface SectionTasks {
  [sectionId: string]: TaskItem[]
}

interface BulkAssign {
  userIds: string[]
  groupIds: string[]
}

function buildSectionTasks(tasks: TaskItem[], sections: TaskSection[]): SectionTasks {
  const result: SectionTasks = {}
  for (const s of sections) {
    result[s.id] = tasks
      .filter((t) => t.section === s.id)
      .map((t) => ({ ...t, assignees: t.assignees ?? [], assigneeGroups: t.assigneeGroups ?? [] }))
  }
  return result
}

function flattenSectionTasks(sectionTasks: SectionTasks, sections: TaskSection[]): TaskItem[] {
  const result: TaskItem[] = []
  for (const s of sections) {
    result.push(...(sectionTasks[s.id] ?? []))
  }
  return result
}

export function EditTaskTemplateSheet({ open, onClose, template }: EditTaskTemplateSheetProps) {
  const { toast } = useUIStore()
  const { profile } = useAuthStore()

  const [name, setName] = useState('')
  const [templateSections, setTemplateSections] = useState<TaskSection[]>([...TASK_SECTIONS])
  const [sectionTasks, setSectionTasks] = useState<SectionTasks>({})
  const [bulkAssign, setBulkAssign] = useState<Record<string, BulkAssign>>({})
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [addingSection, setAddingSection] = useState(false)
  const [newSectionLabel, setNewSectionLabel] = useState('')
  const [newSectionColor, setNewSectionColor] = useState(SECTION_COLORS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (template) {
      const secs = template.sections ?? TASK_SECTIONS
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(template.name)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTemplateSections(secs)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSectionTasks(buildSectionTasks(template.tasks, secs))
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName('')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTemplateSections([...TASK_SECTIONS])
      const initial: SectionTasks = {}
      for (const s of TASK_SECTIONS) initial[s.id] = []
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSectionTasks(initial)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBulkAssign({})
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedSections({})
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmRemove(null)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddingSection(false)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNewSectionLabel('')
  }, [template, open])

  const updateSectionLabel = (id: string, label: string) => {
    setTemplateSections((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)))
  }

  const removeSection = (id: string) => {
    setTemplateSections((prev) => prev.filter((s) => s.id !== id))
    setSectionTasks((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setBulkAssign((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setConfirmRemove(null)
  }

  const addSection = () => {
    const label = newSectionLabel.trim()
    if (!label) return
    const id = slugify(label, templateSections.map((s) => s.id))
    const newSec: TaskSection = { id, label, color: newSectionColor }
    setTemplateSections((prev) => [...prev, newSec])
    setSectionTasks((prev) => ({ ...prev, [id]: [] }))
    setAddingSection(false)
    setNewSectionLabel('')
    setNewSectionColor(SECTION_COLORS[0])
    setExpandedSections((prev) => ({ ...prev, [id]: true }))
  }

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const addTask = (sectionId: string) => {
    const bulk = bulkAssign[sectionId]
    setSectionTasks((prev) => ({
      ...prev,
      [sectionId]: [
        ...(prev[sectionId] ?? []),
        {
          title: '',
          assignees: bulk?.userIds ?? [],
          assigneeGroups: bulk?.groupIds ?? [],
          daysBefore: 7,
          daysAfterEvent: undefined,
          section: sectionId,
        },
      ],
    }))
    setExpandedSections((prev) => ({ ...prev, [sectionId]: true }))
  }

  const updateTask = (sectionId: string, index: number, patch: Partial<TaskItem>) => {
    setSectionTasks((prev) => {
      const tasks = [...(prev[sectionId] ?? [])]
      tasks[index] = { ...tasks[index], ...patch }
      return { ...prev, [sectionId]: tasks }
    })
  }

  const removeTask = (sectionId: string, index: number) => {
    setSectionTasks((prev) => {
      const tasks = [...(prev[sectionId] ?? [])]
      tasks.splice(index, 1)
      return { ...prev, [sectionId]: tasks }
    })
  }

  const applyBulkAssign = (sectionId: string) => {
    const bulk = bulkAssign[sectionId]
    if (!bulk || (bulk.userIds.length === 0 && bulk.groupIds.length === 0)) return
    setSectionTasks((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] ?? []).map((t) => ({
        ...t,
        assignees: bulk.userIds,
        assigneeGroups: bulk.groupIds,
      })),
    }))
    toast(`Applied to all tasks in section`, 'success')
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast('Template name is required', 'error')
      return
    }
    if (templateSections.length === 0) {
      toast('Add at least one category', 'error')
      return
    }
    const allTasks = flattenSectionTasks(sectionTasks, templateSections)
      .filter((t) => t.title.trim())
      .map((t) => {
        const item: Record<string, unknown> = {
          ...t,
          assignees: t.assignees ?? [],
          assigneeGroups: t.assigneeGroups ?? [],
        }
        Object.keys(item).forEach((k) => item[k] === undefined && delete item[k])
        return item as TaskItem
      })
    if (allTasks.length === 0) {
      toast('Add at least one task with a title', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        tasks: allTasks,
        sections: templateSections,
        updatedAt: new Date(),
      }
      if (template) {
        await updateDoc(doc(db, 'taskTemplates', String(template.id)), payload)
        await audit('taskTemplate.updated', `Updated task template "${name.trim()}"`, profile?.displayName ?? '')
        toast('Template updated!', 'success')
      } else {
        await addDoc(collection(db, 'taskTemplates'), { ...payload, createdAt: new Date() })
        await audit('taskTemplate.created', `Created task template "${name.trim()}"`, profile?.displayName ?? '')
        toast('Template created!', 'success')
      }
      onClose()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to save template', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={template ? 'Edit Template' : 'New Template'}>
      <ScrollView style={{ maxHeight: 600 }}>
        <YStack gap="$3" padding="$2">
          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600">Template Name *</Text>
            <Input placeholder="Template Name" value={name} onChangeText={setName} size="$3" />
          </YStack>

          {templateSections.map((section) => {
            const tasks = sectionTasks[section.id] ?? []
            const isExpanded = expandedSections[section.id] ?? false
            const bulk = bulkAssign[section.id] ?? { userIds: [], groupIds: [] }
            const hasBulk = bulk.userIds.length > 0 || bulk.groupIds.length > 0
            const isConfirmingRemove = confirmRemove === section.id

            return (
              <YStack
                key={section.id}
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$2"
                overflow="hidden"
              >
                {/* Section header */}
                <XStack
                  padding="$2"
                  alignItems="center"
                  justifyContent="space-between"
                  backgroundColor={section.color + '22'}
                >
                  <XStack alignItems="center" gap="$2" flex={1}>
                    <XStack
                      width={12}
                      height={12}
                      borderRadius={6}
                      backgroundColor={section.color}
                      flexShrink={0}
                    />
                    <TextInput
                      value={section.label}
                      onChangeText={(v) => updateSectionLabel(section.id, v)}
                      style={{ fontWeight: '700', fontSize: 14, color: section.color, minWidth: 60, maxWidth: 160, padding: 0 }}
                      placeholder="Category name"
                    />
                    <Text fontSize="$2" color="$gray10">({tasks.length})</Text>
                  </XStack>

                  <XStack alignItems="center" gap="$1">
                    {/* Remove / confirm */}
                    {isConfirmingRemove ? (
                      <>
                        <Pressable onPress={() => setConfirmRemove(null)}>
                          <Text fontSize="$2" color="$gray10" paddingHorizontal="$2">Cancel</Text>
                        </Pressable>
                        <Pressable onPress={() => removeSection(section.id)}>
                          <XStack backgroundColor="#c0392b" borderRadius="$1" paddingHorizontal="$2" paddingVertical="$0.5">
                            <Text fontSize="$2" color="white" fontWeight="700">Remove</Text>
                          </XStack>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable onPress={() => setConfirmRemove(section.id)}>
                        <Text fontSize="$3" color="$gray8" paddingHorizontal="$1">✕</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => toggleSection(section.id)}>
                      <Text fontSize="$3" color="$gray10" paddingHorizontal="$2">
                        {isExpanded ? '▲' : '▼'}
                      </Text>
                    </Pressable>
                  </XStack>
                </XStack>

                {isExpanded && (
                  <YStack padding="$2" gap="$3">
                    {/* Bulk assign panel */}
                    <YStack
                      gap="$2"
                      padding="$2"
                      borderWidth={1}
                      borderColor={section.color + '55'}
                      borderRadius="$2"
                      backgroundColor={section.color + '11'}
                    >
                      <Text fontSize="$2" fontWeight="700" color={section.color}>
                        Assign all tasks in this section
                      </Text>
                      <MemberAndGroupPicker
                        selectedUsers={bulk.userIds}
                        onUsersChange={(uids) =>
                          setBulkAssign((prev) => ({ ...prev, [section.id]: { ...bulk, userIds: uids } }))
                        }
                        selectedGroups={bulk.groupIds}
                        onGroupsChange={(gids) =>
                          setBulkAssign((prev) => ({ ...prev, [section.id]: { ...bulk, groupIds: gids } }))
                        }
                      />
                      {hasBulk && tasks.length > 0 ? (
                        <Button size="$2" theme="active" alignSelf="flex-start" onPress={() => applyBulkAssign(section.id)}>
                          Apply to all {tasks.length} task{tasks.length !== 1 ? 's' : ''}
                        </Button>
                      ) : null}
                    </YStack>

                    {/* Individual tasks */}
                    {tasks.map((task, index) => (
                      <YStack key={index} gap="$2" padding="$2" backgroundColor="$gray2" borderRadius="$2">
                        <XStack alignItems="center" justifyContent="space-between">
                          <Text fontSize="$2" fontWeight="600" color="$gray10">Task {index + 1}</Text>
                          <Button size="$1" onPress={() => removeTask(section.id, index)} theme="red">Remove</Button>
                        </XStack>

                        <Input
                          placeholder="Task title"
                          value={task.title}
                          onChangeText={(v) => updateTask(section.id, index, { title: v })}
                          size="$3"
                        />

                        <XStack alignItems="center" gap="$2" flexWrap="wrap">
                          <XStack borderWidth={1} borderColor="$borderColor" borderRadius="$2" overflow="hidden">
                            {(['before', 'after'] as const).map((side) => {
                              const active = side === 'after'
                                ? (task.daysAfterEvent ?? 0) > 0
                                : !(task.daysAfterEvent && task.daysAfterEvent > 0)
                              return (
                                <Pressable
                                  key={side}
                                  onPress={() => {
                                    if (side === 'after') {
                                      updateTask(section.id, index, { daysAfterEvent: task.daysAfterEvent || 1, daysBefore: 0 })
                                    } else {
                                      updateTask(section.id, index, { daysAfterEvent: undefined, daysBefore: task.daysBefore || 7 })
                                    }
                                  }}
                                >
                                  <XStack paddingHorizontal="$2" paddingVertical="$1" backgroundColor={active ? '$blue9' : 'transparent'}>
                                    <Text fontSize="$2" color={active ? 'white' : '$gray10'} fontWeight={active ? '700' : '400'}>
                                      {side === 'before' ? 'Before' : 'After'}
                                    </Text>
                                  </XStack>
                                </Pressable>
                              )
                            })}
                          </XStack>
                          {(task.daysAfterEvent ?? 0) > 0 ? (
                            <>
                              <Input
                                placeholder="1"
                                value={String(task.daysAfterEvent ?? 1)}
                                onChangeText={(v) => updateTask(section.id, index, { daysAfterEvent: parseInt(v) || 1 })}
                                keyboardType="numeric"
                                size="$3"
                                width={70}
                              />
                              <Text fontSize="$2" color="$gray10">days after event</Text>
                            </>
                          ) : (
                            <>
                              <Input
                                placeholder="7"
                                value={String(task.daysBefore)}
                                onChangeText={(v) => updateTask(section.id, index, { daysBefore: parseInt(v) || 0 })}
                                keyboardType="numeric"
                                size="$3"
                                width={70}
                              />
                              <Text fontSize="$2" color="$gray10">days before event</Text>
                            </>
                          )}
                        </XStack>

                        <MemberAndGroupPicker
                          selectedUsers={task.assignees}
                          onUsersChange={(v) => updateTask(section.id, index, { assignees: v })}
                          selectedGroups={task.assigneeGroups ?? []}
                          onGroupsChange={(v) => updateTask(section.id, index, { assigneeGroups: v })}
                          label="Assignees"
                        />
                      </YStack>
                    ))}

                    <Button size="$2" onPress={() => addTask(section.id)} theme="active" alignSelf="flex-start">
                      + Add Task
                    </Button>
                  </YStack>
                )}
              </YStack>
            )
          })}

          {/* Add category */}
          {addingSection ? (
            <YStack gap="$2" padding="$2" borderWidth={1} borderColor="$borderColor" borderRadius="$2">
              <Text fontSize="$3" fontWeight="600">New Category</Text>
              <Input
                placeholder="Category name"
                value={newSectionLabel}
                onChangeText={setNewSectionLabel}
                size="$3"
                autoFocus
              />
              <XStack gap="$2" flexWrap="wrap">
                {SECTION_COLORS.map((c) => (
                  <Pressable key={c} onPress={() => setNewSectionColor(c)}>
                    <XStack
                      width={28}
                      height={28}
                      borderRadius={14}
                      backgroundColor={c}
                      borderWidth={newSectionColor === c ? 3 : 0}
                      borderColor="white"
                      style={{ outline: newSectionColor === c ? `2px solid ${c}` : 'none' } as object}
                    />
                  </Pressable>
                ))}
              </XStack>
              <XStack gap="$2">
                <Button size="$2" theme="gray" onPress={() => { setAddingSection(false); setNewSectionLabel('') }}>
                  Cancel
                </Button>
                <Button size="$2" theme="active" onPress={addSection} disabled={!newSectionLabel.trim()}>
                  Add
                </Button>
              </XStack>
            </YStack>
          ) : (
            <Pressable onPress={() => setAddingSection(true)}>
              <XStack
                padding="$2"
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$2"
                alignItems="center"
                justifyContent="center"
                gap="$2"
              >
                <Text fontSize="$3" color="$gray10">+</Text>
                <Text fontSize="$3" color="$gray10">Add Category</Text>
              </XStack>
            </Pressable>
          )}

          <XStack gap="$2" justifyContent="flex-end">
            <Button size="$3" onPress={onClose} theme="gray">Cancel</Button>
            <Button size="$3" onPress={handleSave} disabled={saving} theme="active">
              {saving ? <Spinner size="small" /> : 'Save Template'}
            </Button>
          </XStack>
        </YStack>
      </ScrollView>
    </Modal>
  )
}
