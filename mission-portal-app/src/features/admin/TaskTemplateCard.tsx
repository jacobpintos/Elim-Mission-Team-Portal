import { useState } from 'react'
import { XStack, YStack, Text, Button } from 'tamagui'

export const TASK_SECTIONS = [
  { id: 'production', label: 'Production', color: '#e8624a' },
  { id: 'setup', label: 'Setup', color: '#2980b9' },
  { id: 'teardown', label: 'Teardown', color: '#27ae60' },
  { id: 'food', label: 'Food', color: '#f39c12' },
  { id: 'other', label: 'Other', color: '#9b59b6' },
]

export interface TaskItem {
  title: string
  assignees: string[]
  daysBefore: number
  daysAfterEvent?: number
  section: string
}

export interface TaskTemplate {
  id: string
  name: string
  tasks: TaskItem[]
  sectionLabels?: Record<string, string>
}

interface TaskTemplateCardProps {
  template: TaskTemplate
  onEdit: (template: TaskTemplate) => void
  onDelete: (template: TaskTemplate) => void
}

export function TaskTemplateCard({ template, onEdit, onDelete }: TaskTemplateCardProps) {
  const tasks = template.tasks ?? []
  const usedSections = TASK_SECTIONS.filter((s) => tasks.some((t) => t.section === s.id))
  const [confirming, setConfirming] = useState(false)

  return (
    <YStack
      backgroundColor="$background"
      borderRadius="$3"
      padding="$3"
      borderWidth={1}
      borderColor="$borderColor"
      gap="$2"
    >
      <XStack alignItems="center" justifyContent="space-between">
        <YStack flex={1} gap="$1">
          <Text fontWeight="700" fontSize="$4">
            {template.name}
          </Text>
          <Text fontSize="$2" color="$gray10">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </Text>
        </YStack>

        <XStack gap="$2">
          {confirming ? (
            <>
              <Button size="$2" onPress={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                size="$2"
                theme="red"
                onPress={() => {
                  setConfirming(false)
                  onDelete(template)
                }}
              >
                Confirm
              </Button>
            </>
          ) : (
            <>
              <Button size="$2" onPress={() => onEdit(template)} theme="active">
                Edit
              </Button>
              <Button size="$2" onPress={() => setConfirming(true)} theme="red">
                Delete
              </Button>
            </>
          )}
        </XStack>
      </XStack>

      {usedSections.length > 0 && (
        <XStack flexWrap="wrap" gap="$1">
          {usedSections.map((s) => (
            <XStack
              key={s.id}
              backgroundColor={s.color}
              borderRadius="$4"
              paddingHorizontal="$2"
              paddingVertical="$0.5"
            >
              <Text fontSize="$1" color="white" fontWeight="600">
                {template.sectionLabels?.[s.id] ?? s.label}
              </Text>
            </XStack>
          ))}
        </XStack>
      )}
    </YStack>
  )
}
