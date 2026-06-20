import type { ComponentType } from 'react'
import type { ShowcaseKey } from '../types'
import {
  CalendarShowcase,
  EventFormShowcase,
  EventDetailShowcase,
  AvailabilityShowcase,
  PlanningBoardShowcase,
} from './EventsShowcases'
import {
  AnnounceShowcase,
  SecurityReportShowcase,
  InventoryShowcase,
  SetlistShowcase,
  KanbanShowcase,
  MessagesShowcase,
  TasksShowcase,
} from './OtherShowcases'

export const SHOWCASES: Record<ShowcaseKey, ComponentType> = {
  calendar: CalendarShowcase,
  eventForm: EventFormShowcase,
  eventDetail: EventDetailShowcase,
  availability: AvailabilityShowcase,
  planningBoard: PlanningBoardShowcase,
  announce: AnnounceShowcase,
  securityReport: SecurityReportShowcase,
  inventory: InventoryShowcase,
  setlist: SetlistShowcase,
  kanban: KanbanShowcase,
  messages: MessagesShowcase,
  tasks: TasksShowcase,
}
