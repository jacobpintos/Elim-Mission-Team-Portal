export interface ProductionIssue {
  id:          number
  title:       string
  date:        string          // 'YYYY-MM-DD'
  eventTitle?: string
  problem:     string
  why1?:       string
  why2?:       string
  why3?:       string
  why4?:       string
  why5?:       string
  ca?:         string
  caOwner?:    string
  caDueDate?:  string
  caDueTaskId?: number | null
  status:      'open' | 'in_progress' | 'closed'
  verif?:      string
  verifDate?:  string
  reporter:    string
  ts:          number
}
