import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDoc } from '@/lib/liveFirestore'
import type { CarpoolCarData } from '@/types/events'
import { emptyMemory, memoryFrom, withRide, type CarpoolMemory } from './carpoolMemory'

/**
 * The carpool memory (./carpoolMemory), read and added to: carpoolMemory/main,
 * an admin's alone (firestore.rules). Neither fails anything else: read with
 * no signal and nothing kept, it is empty; a ride that can't be kept is only
 * not remembered.
 */
const memoryRef = () => doc(db, 'carpoolMemory', 'main')

export async function readCarpoolMemory(): Promise<CarpoolMemory> {
  try {
    return memoryFrom((await getDoc(memoryRef())).data())
  } catch {
    return emptyMemory()
  }
}

/**
 * An event's cars, as saved, remembered: `key` the event and date they go
 * to ("ev1_2026-11-20"), so saving them again replaces what was kept.
 */
export async function rememberRide(
  key: string,
  date: string,
  cars: CarpoolCarData[]
): Promise<void> {
  try {
    const memory = await readCarpoolMemory()
    await setDoc(memoryRef(), withRide(memory, key, date, cars))
  } catch {
    // Not remembered: the cars themselves are saved all the same.
  }
}
