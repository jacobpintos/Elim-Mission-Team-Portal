import { doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDoc } from '@/lib/liveFirestore'
import { useConfigStore } from '@/stores/configStore'
import { doesJob, jobHoldersOf, type TeamJob } from '@/lib/teamJobs'
import { canReachDesk, deskLinkTo } from '@/lib/mixer/link'
import { loadDeskAddress } from '@/lib/mixer/deskAddress'
import { canReachSwitcher, switcherAt } from '@/lib/switcher/link'
import { loadSwitcherAddress } from '@/lib/switcher/switcherAddress'
import type { DeskAccess } from './mixerTalk'
import type { SwitcherAccess } from './switcherTalk'

/**
 * Whether this person, on this phone, can reach the church's equipment: the
 * sound desk (Miriam: ./mixerTalk) and the video switcher (Miriam:
 * ./switcherTalk, and the Video screen).
 */

/**
 * Who holds a job (lib/teamJobs): as loaded, else from the phone's copy of
 * the config, which answers with no signal.
 */
export async function jobHolders(job: TeamJob): Promise<string[]> {
  const config = useConfigStore.getState()
  if (config._refCount) return config[job]
  const snap = await Promise.race([
    getDoc(doc(db, 'config', 'main')).catch(() => undefined),
    new Promise<undefined>((done) => setTimeout(() => done(undefined), 3000)),
  ])
  const stored = (snap?.data() as { connectConfig?: Record<string, unknown> } | undefined)
    ?.connectConfig?.[job]
  return jobHoldersOf(stored)
}

/**
 * Whether this person, on this phone, can reach the sound desk (./mixerTalk):
 * a Sound Engineer, in the phone app, with the desk's address set in Settings.
 */
export async function deskAccess(uid: string): Promise<DeskAccess> {
  if (!doesJob('soundEngineers', uid, await jobHolders('soundEngineers')))
    return { kind: 'not engineer' }
  return deskHere()
}

/**
 * The desk from this phone, whoever is asking: in the phone app, with its
 * address saved here (Settings → Sound desk, or found from Worship → In-ear
 * Adjustment). Who may change what is for the asker to check.
 */
export async function deskHere(): Promise<Exclude<DeskAccess, { kind: 'not engineer' }>> {
  if (!canReachDesk()) return { kind: 'no app' }
  const address = await loadDeskAddress()
  if (!address) return { kind: 'no address' }
  const link = deskLinkTo(address)
  return link ? { kind: 'ready', link } : { kind: 'no app' }
}

/**
 * Whether this person, on this phone, can reach the video switcher
 * (./switcherTalk): a Video Operator, in the phone app, with the switcher's
 * address set in Settings.
 */
export async function switcherAccess(uid: string): Promise<SwitcherAccess> {
  if (!doesJob('videoOperators', uid, await jobHolders('videoOperators')))
    return { kind: 'not operator' }
  if (!canReachSwitcher()) return { kind: 'no app' }
  const address = await loadSwitcherAddress()
  if (!address) return { kind: 'no address' }
  const open = switcherAt(address)
  return open ? { kind: 'ready', open } : { kind: 'no app' }
}
