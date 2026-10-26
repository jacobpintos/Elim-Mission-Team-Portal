import { collection, doc, type WriteBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDoc, getDocs } from '@/lib/liveFirestore'
import { teamsWithout } from '@/lib/commonTeamMembers'

/**
 * A deleted account taken out of the lists that name people — every group,
 * and every common team — in the batch that deletes its profile. Common
 * teams were left out: added to an event afterwards, one showed the deleted
 * person as their bare uid.
 */
export async function removeFromLists(batch: WriteBatch, uid: string): Promise<void> {
  for (const g of (await getDocs(collection(db, 'groups'))).docs) {
    const members: string[] = g.data().members ?? []
    if (members.includes(uid)) {
      batch.update(g.ref, { members: members.filter((m) => m !== uid) })
    }
  }
  const main = await getDoc(doc(db, 'config', 'main'))
  const teams = teamsWithout(main.data()?.COMMON_TEAMS, uid)
  if (teams) batch.update(main.ref, { COMMON_TEAMS: teams })
}
