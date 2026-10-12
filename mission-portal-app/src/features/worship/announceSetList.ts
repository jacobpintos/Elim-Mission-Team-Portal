import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import { isWorship } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import { useUsersStore } from '@/stores/usersStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useTasksStore } from '@/stores/tasksStore'
import type { SetList } from '@/types/worship'

/**
 * A set list arriving, told to the worship team: everyone on worship is
 * notified; on its event, anyone on a team whose name has "worship" in it is
 * told it was set for them, and the worship people on the event are asked
 * to acknowledge it (a task each). Done when one is made on the Worship
 * screen, or by Miriam, and again when Miriam is asked to notify the team.
 */
export async function announceSetList(
  setListId: string | number,
  data: Pick<SetList, 'title' | 'eventTemplateId' | 'eventDate'>,
  by: string
) {
  const users = useUsersStore.getState().users
  const templates = useEventsStore.getState().templates
  const worshipUsers = users.filter((u) => isWorship(u) && !u.roles?.includes('admin'))

  // Notify all worship users
  const sendNotif = httpsCallable(functions, 'sendNotification')
  worshipUsers.forEach((u) => {
    sendNotif({
      uid: String(u.uid),
      type: 'announcement',
      data: { title: 'New Set List', body: data.title },
    }).catch(() => {})
  })

  // Create acknowledge tasks for worship users assigned to the linked event
  if (data.eventTemplateId) {
    const evTemplate = templates.find((t) => sameId(t.id, data.eventTemplateId!))
    const evUsers = evTemplate?.users ?? []
    const assignedWorshipUsers = evUsers.length
      ? worshipUsers.filter((wu) => evUsers.some((eu) => sameId(eu, wu.uid)))
      : []

    // Notify anyone on a team whose NAME contains "worship" for this event
    // (per spec this is team-name-based, not role-based, so e.g. a
    // "Worship Band" team member gets it even without the worship role).
    const worshipTeamUids = new Set<string>()
    for (const team of evTemplate?.teams ?? []) {
      if (!team.name?.toLowerCase().includes('worship')) continue
      ;[...team.leaders, ...team.members].forEach((m) => worshipTeamUids.add(String(m)))
    }
    worshipTeamUids.forEach((wuid) => {
      sendNotif({
        uid: wuid,
        type: 'worshipSetAssigned',
        data: {
          setListTitle: data.title,
          eventTitle: evTemplate?.title ?? 'an event',
        },
      }).catch(() => {})
    })

    for (const wu of assignedWorshipUsers) {
      await useTasksStore.getState().createTask({
        title: `Acknowledge set list: ${data.title}`,
        assignees: [String(wu.uid)],
        lead: String(wu.uid),
        by,
        status: 'pending',
        evTemplateId: data.eventTemplateId,
        evDate: data.eventDate ?? null,
        taskType: 'worship_setlist_ack',
        setListId,
        dueDate: data.eventDate ?? null,
      })
    }
  }
}
