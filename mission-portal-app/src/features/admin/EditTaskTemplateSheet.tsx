import { useState, useEffect } from 'react'
import { ScrollView, Pressable, TextInput } from 'react-native'
import { YStack, XStack, Text, Input, Button, Spinner } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { MemberPicker } from './MemberPicker'
import { TASK_SECTIONS, type TaskItem, type TaskTemplate } from './TaskTemplateCard'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface EditTaskTemplateSheetProps {
  open: boolean
  onClose: () => void
  template: TaskTemplate | null
}

interface SectionTasks {
  [sectionId: string]: TaskItem[]
}

function buildSectionTasks(tasks: TaskItem[]): SectionTasks {
  const result: SectionTasks = {}
  for (const s of TASK_SECTIONS) {
    result[s.id] = tasks
      .filter((t) => t.section === s.id)
      .map((t) => ({ ...t, assignees: t.assignees ?? [] }))
  }
  return result
}

function flattenSectionTasks(sectionTasks: SectionTasks): TaskItem[] {
  const result: TaskItem[] = []
  for (const s of TASK_SECTIONS) {
    result.push(...(sectionTasks[s.id] ?? []))
  }
  return result
}

export function EditTaskTemplateSheet({ open, onClose, template }: EditTaskTemplateSheetProps) {
  const { toast } = useUIStore()
  const { profile } = useAuthStore()

  const [name, setName] = useState('')
  const [sectionTasks, setSectionTasks] = useState<SectionTasks>({})
  const [sectionLabels, setSectionLabels] = useState<Record<string, string>>({})
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (template) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(template.name)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSectionTasks(buildSectionTasks(template.tasks))
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSectionLabels(template.sectionLabels ?? {})
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName('')
      const initial: SectionTasks = {}
      for (const s of TASK_SECTIONS) {
        initial[s.id] = []
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSectionTasks(initial)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSectionLabels({})
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedSections({})
  }, [template, open])

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const addTask = (sectionId: string) => {
    setSectionTasks((prev) => ({
      ...prev,
      [sectionId]: [
        ...(prev[sectionId] ?? []),
        { title: '', assignees: [], daysBefore: 7, daysAfterEvent: undefined, section: sectionId },
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

  const handleSave = async () => {
    if (!name.trim()) {
      toast('Template name is required', 'error')
      return
    }
    const allTasks = flattenSectionTasks(sectionTasks)
      .filter((t) => t.title.trim())
      .map((t) => ({ ...t, assignees: t.assignees ?? [] }))
    if (allTasks.length === 0) {
      toast('Add at least one task with a title', 'error')
      return
    }
    setSaving(true)
    try {
      const cleanLabels = Object.fromEntries(
        Object.entries(sectionLabels).filter(([, v]) => v.trim())
      )
      if (template) {
        await updateDoc(doc(db, 'taskTemplates', String(template.id)), {
          name: name.trim(),
          tasks: allTasks,
          sectionLabels: cleanLabels,
          updatedAt: new Date(),
        })
        await audit(
          'taskTemplate.updated',
          `Updated task template "${name.trim()}"`,
          profile?.displayName ?? ''
        )
        toast('Template updated!', 'success')
      } else {
        await addDoc(collection(db, 'taskTemplates'), {
          name: name.trim(),
          tasks: allTasks,
          sectionLabels: cleanLabels,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        await audit(
          'taskTemplate.created',
          `Created task template "${name.trim()}"`,
          profile?.displayName ?? ''
        )
        toast('Template created!', 'success')
      }
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save template'
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} title={template ? 'Edit Template' : 'New Template'}>
      <ScrollView style={{ maxHeight: 600 }}>
        <YStack gap="$3" padding="$2">
          <YStack gap="$1">
            <Text fontSize="$3" fontWeight="600">
              Template Name *
            </Text>
            <Input
              placeholder="Template Name"
              value={name}
              onChangeText={setName}
              size="$3"
            />
          </YStack>

          {TASK_SECTIONS.map((section) => {
            const tasks = sectionTasks[section.id] ?? []
            const isExpanded = expandedSections[section.id] ?? false

            return (
              <YStack
                key={section.id}
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$2"
                overflow="hidden"
              >
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
                      value={sectionLabels[section.id] ?? section.label}
                      onChangeText={(v) =>
                        setSectionLabels((prev) => ({ ...prev, [section.id]: v }))
                      }
                      style={{
                        fontWeight: '700',
                        fontSize: 14,
                        color: section.color,
                        minWidth: 60,
                        maxWidth: 160,
                        padding: 0,
                      }}
                      placeholder={section.label}
                    />
                    <Text fontSize="$2" color="$gray10">
                      ({tasks.length})
                    </Text>
                  </XStack>
                  <Pressable onPress={() => toggleSection(section.id)}>
                    <Text fontSize="$3" color="$gray10" paddingHorizontal="$2">
                      {isExpanded ? '▲' : '▼'}
                    </Text>
                  </Pressable>
                </XStack>

                {isExpanded && (
                  <YStack padding="$2" gap="$3">
                    {tasks.map((task, index) => (
                      <YStack
                        key={index}
                        gap="$2"
                        padding="$2"
                        backgroundColor="$gray2"
                        borderRadius="$2"
                      >
                        <XStack alignItems="center" justifyContent="space-between">
                          <Text fontSize="$2" fontWeight="600" color="$gray10">
                            Task {index + 1}
                          </Text>
                          <Button
                            size="$1"
                            onPress={() => removeTask(section.id, index)}
                            theme="red"
                          >
                            Remove
                          </Button>
                        </XStack>

                        <Input
                          placeholder="Task title"
                          value={task.title}
                          onChangeText={(v) => updateTask(section.id, index, { title: v })}
                          size="$3"
                        />

                        <XStack alignItems="center" gap="$2" flexWrap="wrap">
                          {/* Before / After toggle */}
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
                                  <XStack
                                    paddingHorizontal="$2"
                                    paddingVertical="$1"
                                    backgroundColor={active ? '$blue9' : 'transparent'}
                                  >
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

                        <MemberPicker
                          selected={task.assignees}
                          onChange={(v) => updateTask(section.id, index, { assignees: v })}
                          label="Assignees"
                        />
                      </YStack>
                    ))}

                    <Button
                      size="$2"
                      onPress={() => addTask(section.id)}
                      theme="active"
                      alignSelf="flex-start"
                    >
                      + Add Task
                    </Button>
                  </YStack>
                )}
              </YStack>
            )
          })}

          <XStack gap="$2" justifyContent="flex-end">
            <Button size="$3" onPress={onClose} theme="gray">
              Cancel
            </Button>
            <Button size="$3" onPress={handleSave} disabled={saving} theme="active">
              {saving ? <Spinner size="small" /> : 'Save Template'}
            </Button>
          </XStack>
        </YStack>
      </ScrollView>
    </Modal>
  )
}
