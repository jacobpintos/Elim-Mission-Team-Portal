import { Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { db } from '@/lib/firebase'
import { getDoc } from '@/lib/liveFirestore'
import { doc } from 'firebase/firestore'
import { noteAddedSaid, noteText } from '@/lib/dateNotes'
import { directionsUrl, googleDirectionsUrl, placeOf } from '@/lib/directions'
import { localToday } from '@/lib/events'
import { openDirections } from '@/lib/location'
import { anyOverlayOpen } from '@/lib/overlays'
import { reminderWhen, repeatWhen } from '@/lib/reminders'
import { isAdmin } from '@/lib/roles'
import { useAuthStore } from '@/stores/authStore'
import { useDateNotesStore } from '@/stores/dateNotesStore'
import { useMiriamStore } from '@/stores/miriamStore'
import { useRemindersStore, type BeforeEach, type ReminderExtra } from '@/stores/remindersStore'
import { prepareAction } from './actions'
import { recordCard } from './recordTurn'
import { unlockSpeech, whenSpoken } from './speak'
import type { Listening } from './useListening'
import type { PanelState } from './usePanelState'

/** How long a confirmed change is waited on before it is said to be waiting for a signal. */
const SEND_WAIT_MS = 12_000
/** How long she listens for that yes or no before leaving it to a tap. */
const CONFIRM_LISTEN_MS = 8000

/**
 * What Miriam does for them: a reminder, a note or the way to an event, done
 * at once with Undo — and any other change, shown as exactly what will be
 * done, and done only once they confirm it (./actions), by a tap or a spoken yes.
 */
export function useMiriamActions(
  panel: PanelState,
  listening: Listening,
  {
    carryOn,
  }: {
    /** A change done that was one of several asked for: on to the rest (./useMiriamConversation). */
    carryOn: () => Promise<void>
  }
) {
  const router = useRouter()
  const {
    setStage,
    setAnswer,
    pending,
    setPending,
    askedRef,
    confirmingByVoiceRef,
    setConfirmByVoice,
    openRef,
    setLink,
    undo,
    setUndo,
    saidAloudRef,
    speak,
    noteDone,
    endVoiceConfirm,
  } = panel
  const { available, requestRef, stopListening, listen } = listening

  /** A reminder set for them, said back with when — and a tap to take it back. */
  const setReminder = async (text: string, at: Date, spoken: string, extra: ReminderExtra = {}) => {
    const uid = useAuthStore.getState().profile?.uid
    if (!uid) return
    setStage('thinking')
    try {
      const id = await useRemindersStore.getState().add(String(uid), text, at, extra)
      // A monthly one says when it starts; the others say it in how often.
      const when = extra.repeat
        ? extra.repeat === 'monthly'
          ? `${repeatWhen(at, extra.repeat)}, starting ${reminderWhen(at, new Date())}`
          : repeatWhen(at, extra.repeat)
        : reminderWhen(at, new Date())
      const said = `Okay — I’ll remind you ${when} ${spoken}.`
      setAnswer(said)
      speak(said)
      setUndo({
        label: 'Undo',
        run: async () => {
          await useRemindersStore.getState().remove(id)
          return 'Okay — that reminder is gone.'
        },
      })
    } catch {
      const no = 'That reminder didn’t save. Try again in a moment.'
      setAnswer(no)
      speak(no)
    }
    setStage('answered')
  }

  /**
   * One reminder before every event of theirs, from now on (stores/
   * remindersStore: addBeforeEach): set at once, with a tap to take it back.
   */
  const setReminderBeforeEach = async (
    text: string,
    spoken: string,
    before: BeforeEach,
    relation: string,
    first: { ev: { instanceKey: string; templateId: unknown; title: string }; at: Date } | null
  ) => {
    const uid = useAuthStore.getState().profile?.uid
    if (!uid) return
    setStage('thinking')
    try {
      const id = await useRemindersStore.getState().addBeforeEach(
        String(uid),
        text,
        before,
        relation,
        first
          ? {
              at: first.at,
              eventKey: first.ev.instanceKey,
              eventTemplateId: String(first.ev.templateId),
              eventTitle: first.ev.title,
            }
          : null
      )
      const said = `Okay — I’ll remind you${spoken ? ` ${spoken}` : ''} ${relation} each of your events, from now on${
        first
          ? ` — first ${reminderWhen(first.at, new Date())}, before ${first.ev.title}`
          : ', starting with the next one you’re on'
      }. It’s in your tasks.`
      useMiriamStore.getState().remember(askedRef.current, said)
      setAnswer(said)
      speak(said)
      setUndo({
        label: 'Undo',
        run: async () => {
          await useRemindersStore.getState().remove(id)
          return 'Okay — that reminder is gone.'
        },
      })
    } catch {
      const no = 'That reminder didn’t save. Try again in a moment.'
      setAnswer(no)
      speak(no)
    }
    setStage('answered')
  }

  /**
   * A note on a day of their calendar (stores/dateNotesStore): theirs alone,
   * added at once, with a tap to take it back.
   */
  const addNote = async (date: string, text: string) => {
    setStage('thinking')
    try {
      const id = await useDateNotesStore.getState().add(date, text)
      const said = noteAddedSaid(date, noteText(text), localToday())
      noteDone(said)
      setAnswer(said)
      speak(said)
      setUndo({
        label: 'Undo',
        run: async () => {
          await useDateNotesStore.getState().remove([id])
          return 'Okay — that note is gone.'
        },
      })
    } catch (err) {
      const no =
        err instanceof Error && err.message === 'full'
          ? 'You have as many notes as can be kept — delete some old ones on the Events calendar first.'
          : 'That note didn’t save. Try again in a moment.'
      setAnswer(no)
      speak(no)
    }
    setStage('answered')
  }

  /**
   * The way to an event, opened in maps — the phone's own, or Google Maps in a
   * new tab. A browser opens a tab only straight after a tap or a key: when it
   * won't, the way there is a button to tap instead (as a reorder link is).
   */
  const showDirections = async (ev: {
    title: string
    location?: string
    address?: string
    city?: string
    state?: string
  }) => {
    const place = placeOf(ev)
    const opened = await openDirections(place)
    const text = opened
      ? `Opening directions to ${ev.title}${Platform.OS === 'web' ? ' in Google Maps' : ''}.`
      : `Here’s the way to ${ev.title}, at ${place} — tap to open it.`
    if (!opened) {
      setLink({
        url: Platform.OS === 'web' ? googleDirectionsUrl(place) : directionsUrl(place, Platform.OS),
        name: ev.title,
        label: Platform.OS === 'web' ? 'Open in Google Maps' : 'Open in Maps',
      })
    }
    noteDone(text)
    setAnswer(text)
    speak(text)
    setStage('answered')
  }

  /** A change asked for: shown as exactly what will be done, or why it can't be. */
  const offerAction = async (name: string, input: Record<string, unknown>, more = false) => {
    setStage('thinking')
    const prepared = await prepareAction(name, input)
    if (prepared.kind === 'cannot') {
      setPending(null)
      setAnswer(prepared.message)
      speak(prepared.message)
    } else if (prepared.kind === 'open') {
      // A form to finish: nothing is changed until it is saved there.
      setPending(null)
      const said = await prepared.run()
      setAnswer(said)
      speak(said)
      if (name === 'create_user' && !anyOverlayOpen()) router.push('/admin/users' as never)
    } else {
      setPending({ name, prepared, more })
      setAnswer(prepared.title)
      speak(prepared.title)
      setStage('answered')
      // Asked out loud: a yes or no listened for once it has been said.
      if (saidAloudRef.current && available) listenForYes()
      return
    }
    setStage('answered')
  }

  /** The change on screen, answered by voice: listened for once she has asked, a short while. */
  const listenForYes = async () => {
    confirmingByVoiceRef.current = true
    setConfirmByVoice(true)
    await whenSpoken()
    if (!openRef.current || !confirmingByVoiceRef.current) return endVoiceConfirm()
    listen(false, true)
    setTimeout(() => {
      // Nothing said: left to a tap.
      if (!confirmingByVoiceRef.current || requestRef.current.trim()) return
      endVoiceConfirm()
      stopListening()
      setStage('answered')
    }, CONFIRM_LISTEN_MS)
  }
  /** Confirmed: done, and said so. */
  const confirmAction = async (shown = pending) => {
    endVoiceConfirm()
    if (shown?.prepared.kind !== 'ready') return
    recordCard('confirmed')
    const { run, undo: takeBack } = shown.prepared
    const more = !!shown.more
    unlockSpeech()
    setPending(null)
    setStage('thinking')
    let said: string
    let done = false
    try {
      // Without a signal the change waits on the phone to be sent: said so,
      // rather than left on "Working on it…".
      said = await Promise.race([
        run(),
        new Promise<string>((done) =>
          setTimeout(
            () => done('No signal yet — it will go through as soon as you’re connected.'),
            SEND_WAIT_MS
          )
        ),
      ])
      done = true
    } catch {
      said = 'That didn’t go through. Nothing was changed — try it on the screen.'
    }
    setAnswer(said)
    speak(said)
    // Done, and it can be taken back: a tap to, while it is shown.
    if (done && takeBack) setUndo({ label: 'Undo', run: takeBack })
    setStage('answered')
    // One of several things asked: on to the next, with this one remembered as done.
    if (more && done) {
      useMiriamStore.getState().remember(askedRef.current, said)
      await carryOn()
    }
  }
  const cancelAction = () => {
    recordCard('cancelled')
    endVoiceConfirm()
    setPending(null)
    useMiriamStore.getState().setAwaiting(false)
    setAnswer('Okay — nothing was changed.')
    speak('Okay.')
  }
  /** Something just done, taken back at a tap. */
  const undoLast = async () => {
    if (!undo) return
    const { run } = undo
    setUndo(null)
    const said = await run().catch(() => 'That couldn’t be undone just now.')
    setAnswer(said)
    speak(said)
  }

  /** A reorder list item's link, if it has one: admins' list (Operations — Inventory). */
  const reorderLink = async (id: string) => {
    if (!isAdmin(useAuthStore.getState().profile)) return null
    try {
      const item = (await getDoc(doc(db, 'reorderItems', id))).data() as
        | { name?: string; link?: string }
        | undefined
      const url = item?.link?.trim() ?? ''
      return /^https?:\/\//i.test(url) ? { url, name: item?.name ?? 'it' } : null
    } catch {
      return null
    }
  }

  return {
    setReminder,
    setReminderBeforeEach,
    addNote,
    showDirections,
    offerAction,
    confirmAction,
    cancelAction,
    undoLast,
    reorderLink,
  }
}
