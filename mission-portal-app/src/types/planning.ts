export type ElementType = 'sticky' | 'text' | 'box' | 'arrow' | 'pin' | 'pen' | 'image'

export interface PlanningBoard {
  id:         number
  name:       string
  eventId?:   number | null
  createdBy:  string
  ts:         number
}

export interface BoardElement {
  id:          string
  type:        ElementType
  x:           number
  y:           number
  zIndex:      number
  content?:    string
  width?:      number
  height?:     number
  bgColor?:    string
  textColor?:  string
  fontSize?:   number
  strokeColor?: string
  strokeWidth?: number
  x2?:         number
  y2?:         number
  pinColor?:   string
  points?:     number[][]
  imageUrl?:   string
  createdBy:   string
  updatedAt:   number
  locked?:     boolean
}
