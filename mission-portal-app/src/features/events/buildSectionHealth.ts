import { isOverdue } from '@/lib/availability'
import { TASK_SECTIONS } from '@/lib/events'
import type { EventTemplate, Task } from '@/types/events'
import type { SectionHealth } from '@/components/ui/MiniHealthBars'

const todayStr = () => new Date().toISOString().split('T')[0]

export function buildSectionHealth(
  tmpl: EventTemplate,
  evTasks: Task[],
  taskTemplates: { id: string | number; items?: { title: string; section: string }[] }[]
): SectionHealth[] {
  const td = todayStr()
  return TASK_SECTIONS.flatMap((sec) => {
    const tpl = taskTemplates.find((tt) => String(tt.id) === String(tmpl.taskTemplateId))
    if (!tpl) return []
    const secTasks = evTasks.filter((t) =>
      (tpl.items ?? []).some((i) => i.title === t.title && i.section === sec.id)
    )
    if (!secTasks.length) return []
    const total = secTasks.length
    const done = secTasks.filter((t) => t.status === 'done').length
    const overdue = secTasks.filter((t) => isOverdue(t)).length
    const behind = secTasks.filter((t) => t.status === 'behind').length
    const exp = secTasks.filter((t) => t.dueDate != null && t.dueDate < td).length
    const expPct = total ? Math.round((exp / total) * 100) : 0
    const actPct = total ? Math.round((done / total) * 100) : 0
    return [
      {
        sec,
        total,
        done,
        overdue,
        behind,
        expectedPct: expPct,
        actualPct: actPct,
        isLagging: actPct < expPct || overdue > 0,
      } satisfies SectionHealth,
    ]
  })
}
