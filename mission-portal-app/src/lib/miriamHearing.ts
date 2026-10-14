import { heardRight as putRight, type HeardFix } from '../../functions/src/miriam/hearing'
import { loadWords, type MisheardWord } from './miriamMemory'

/**
 * What was heard, put right where it was plainly misheard
 * (functions/src/miriam/hearing) — "create an even name Worship Gathering"
 * as "create an event named Worship Gathering" — and with the words this
 * device has learned it mishears (lib/miriamMemory). Used wherever something
 * said is first read: Miriam's button, a chord sheet's voice, the song finder.
 */
let learned: MisheardWord[] = []

/** This device's learned words, read again: at start, and once more are learned. */
export function refreshHearing(): void {
  loadWords()
    .then((words) => {
      learned = words
    })
    .catch(() => {})
}
refreshHearing()

export function heardRight(text: string): HeardFix {
  return putRight(text, learned)
}
