export type IssueCategory = 'equipment' | 'safety' | 'facility' | 'logistics' | 'other'

export type IssueStatus =
  | 'pending_review'
  | 'root_cause_identified'
  | 'actions_assigned'
  | 'resolved'
  | 'closed'

export interface IssueCorrectiveAction {
  id: string
  description: string
  assignee: string | number
  dueDate: string
  taskId?: string | number
}

export interface IssueReport {
  id: string | number
  title: string
  description: string
  category: IssueCategory
  suggestedAction: string
  reportedBy: string | number
  status: IssueStatus
  whys: string[]
  rootCause: string
  correctiveActions: IssueCorrectiveAction[]
  adminId?: string | number
  createdAt: unknown
  updatedAt: unknown
}

export type KaizenStatus = 'idea' | 'in_progress' | 'implementation' | 'completed'

export interface KaizenActionTask {
  assignee: string | number
  description: string
  dueDate: string
  taskId?: string | number
}

export interface KaizenVerificationResult {
  effectiveness: 'effective' | 'partially_effective' | 'not_effective'
  notes: string
  completedAt: unknown
  completedBy: string | number
}

export interface KaizenActionPlan {
  description: string
  tasks: KaizenActionTask[]
  verificationMethod: string
  verifierId: string | number
  reviewDate: string
  verificationTaskId?: string | number
  createdBy: string | number
  verificationResult?: KaizenVerificationResult
}

export interface KaizenCard {
  id: string | number
  title: string
  description: string
  status: KaizenStatus
  createdBy: string | number
  upvotes: (string | number)[]
  actionPlan?: KaizenActionPlan
  createdAt: unknown
  updatedAt: unknown
}

export type PlanningItemType = 'note' | 'goal' | 'checklist' | 'link' | 'draw' | 'connector'

export interface DrawPoint { x: number; y: number }

export interface PlanningItem {
  id: string
  type: PlanningItemType
  x: number
  y: number
  width: number
  height: number
  content: string
  color?: string
  completed?: boolean
  dueDate?: string
  url?: string
  fromId?: string   // connector source item id
  toId?: string     // connector target item id
  points?: DrawPoint[]  // draw path
}

export interface PlanningBoard {
  id: string | number
  name: string
  eventId?: string | number
  items: PlanningItem[]
  createdBy: string | number
  createdAt: unknown
  updatedAt: unknown
}
