import type { Skill } from './skills'

/**
 * Which of her skills a change Claude made was, for her to learn from
 * (../askMiriam: learnFrom): answering for one event, a plain reminder for
 * herself — one before an event, or every event, is Claude's to set — or
 * signing up to bring something on an event's food sign-up.
 * Null when it is none of hers.
 */
export function skillOfAction(name: string, input: Record<string, unknown>): Skill | null {
  if (name === 'set_availability') return 'availability'
  if (name === 'create_reminder' && !input.every_event && !input.event_key) return 'reminder'
  if (name === 'sign_up_food') return 'food_signup'
  return null
}
