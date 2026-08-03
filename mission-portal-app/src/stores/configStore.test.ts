import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The config document holds values several screens need at once — the CCLI
 * license number printed on every chord sheet, the shared calendar month, the
 * common teams. One Firestore listener serves all of them, so the rules about
 * when that listener is opened and closed are what these tests pin.
 *
 * The bug that prompted them: the license was blank on chord sheets until
 * somebody opened the admin licensing tab. Only a few screens subscribed, and
 * whichever left first closed the listener out from under the rest.
 */

type SnapshotHandler = (snap: { data: () => unknown }) => void
type ErrorHandler = (err: { code: string; message: string }) => void

const listeners: { onNext: SnapshotHandler; onError: ErrorHandler; unsub: () => void }[] = []

vi.mock('@/lib/firebase', () => ({ db: {} }))

vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_ref: unknown, onNext: SnapshotHandler, onError: ErrorHandler) => {
    const unsub = vi.fn()
    listeners.push({ onNext, onError, unsub })
    return unsub
  },
  updateDoc: vi.fn(async () => {}),
  serverTimestamp: () => 'ts',
}))

const { useConfigStore } = await import('./configStore')

/** The most recently opened listener, which is the live one. */
const current = () => listeners[listeners.length - 1]

/** Deliver a config document to whoever is listening. */
const emit = (data: unknown) => current().onNext({ data: () => data })

beforeEach(() => {
  listeners.length = 0
  useConfigStore.setState({
    ccliLicense: '',
    commonTeams: [],
    loading: false,
    _unsub: null,
    _refCount: 0,
  })
})

describe('config subscription', () => {
  it('opens one listener however many screens ask', () => {
    useConfigStore.getState().subscribe()
    useConfigStore.getState().subscribe()
    useConfigStore.getState().subscribe()

    expect(listeners).toHaveLength(1)
  })

  it('keeps listening while any screen is still watching', () => {
    // The regression. The chord sheet viewer read the license without
    // subscribing, so it only ever showed a number if another screen happened
    // to be holding the listener open — and that screen closing it silently
    // took the number away.
    useConfigStore.getState().subscribe()
    useConfigStore.getState().subscribe()

    useConfigStore.getState().unsubscribe()

    expect(current().unsub).not.toHaveBeenCalled()

    emit({ ccliLicense: '1234567' })
    expect(useConfigStore.getState().ccliLicense).toBe('1234567')
  })

  it('closes the listener once the last screen leaves', () => {
    useConfigStore.getState().subscribe()
    useConfigStore.getState().subscribe()

    useConfigStore.getState().unsubscribe()
    useConfigStore.getState().unsubscribe()

    expect(current().unsub).toHaveBeenCalledTimes(1)
  })

  it('reopens a listener when a screen comes back', () => {
    useConfigStore.getState().subscribe()
    useConfigStore.getState().unsubscribe()
    useConfigStore.getState().subscribe()

    expect(listeners).toHaveLength(2)
    expect(current().unsub).not.toHaveBeenCalled()
  })

  it('does not let an unbalanced unsubscribe wedge the count below zero', () => {
    // A screen that unmounts twice, or one whose effect cleanup runs after an
    // error already reset the count, must not push it negative — that would
    // take two extra subscribes before anything reconnected.
    useConfigStore.getState().unsubscribe()
    useConfigStore.getState().unsubscribe()

    useConfigStore.getState().subscribe()
    useConfigStore.getState().unsubscribe()

    expect(useConfigStore.getState()._refCount).toBe(0)
    expect(current().unsub).toHaveBeenCalledTimes(1)
  })
})

describe('config values', () => {
  it('reads the CCLI license off the document', () => {
    useConfigStore.getState().subscribe()

    emit({ ccliLicense: '7654321' })

    expect(useConfigStore.getState().ccliLicense).toBe('7654321')
  })

  it('treats a document with no license as no license', () => {
    useConfigStore.getState().subscribe()

    emit({})

    expect(useConfigStore.getState().ccliLicense).toBe('')
  })

  it('keeps the loaded values after the listener closes', () => {
    // They are small and rarely change, so holding them means a screen that
    // reopens shows the right thing at once rather than flashing a blank.
    useConfigStore.getState().subscribe()
    emit({ ccliLicense: '1234567' })

    useConfigStore.getState().unsubscribe()

    expect(useConfigStore.getState().ccliLicense).toBe('1234567')
  })

  it('accepts common teams stored as plain strings', () => {
    // Older documents stored team names; newer ones store name and members.
    useConfigStore.getState().subscribe()

    emit({ COMMON_TEAMS: ['Worship', { name: 'Media', members: ['1'] }] })

    expect(useConfigStore.getState().commonTeams).toEqual([
      { name: 'Worship', members: [] },
      { name: 'Media', members: ['1'] },
    ])
  })

  it('stops loading when the document does not exist', () => {
    useConfigStore.getState().subscribe()

    emit(undefined)

    expect(useConfigStore.getState().loading).toBe(false)
  })
})

describe('config listener errors', () => {
  it('lets a later screen reconnect after a failure', () => {
    // A listener attached a moment before auth is ready fails with
    // permission-denied. If the count stayed raised, every later subscribe
    // would see "somebody is already watching" and return without
    // reconnecting, leaving the config blank for the rest of the session.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    useConfigStore.getState().subscribe()
    useConfigStore.getState().subscribe()
    current().onError({ code: 'permission-denied', message: 'nope' })

    expect(useConfigStore.getState().loading).toBe(false)

    useConfigStore.getState().subscribe()

    expect(listeners).toHaveLength(2)
    emit({ ccliLicense: '1234567' })
    expect(useConfigStore.getState().ccliLicense).toBe('1234567')

    spy.mockRestore()
  })
})
