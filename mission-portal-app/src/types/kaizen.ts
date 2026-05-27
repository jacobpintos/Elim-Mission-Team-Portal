export interface ActionStep {
  title:     string
  assignee?: string | null
  dueDate?:  string | null
  done:      boolean
}

export interface ActionPlan {
  version:         number
  statement:       string
  successCriteria: string
  reviewDate?:     string
  steps:           ActionStep[]
  ts:              number
  outcome?:        'worked' | 'failed' | 'archived'
  outcomeNotes?:   string
  outcomeDate?:    string
}

export interface KaizenItem {
  id:              number
  title:           string
  category:        string
  description?:    string
  linkedIssueId?:  number | null
  stage:           'idea' | 'review' | 'action' | 'complete'
  submitter:       string
  votes:           number
  voters:          string[]
  actionPlans:     ActionPlan[]
  completedDate?:  string
  ts:              number
}
