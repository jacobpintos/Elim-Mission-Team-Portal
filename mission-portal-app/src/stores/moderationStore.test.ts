import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * The count beside the Moderation tab.
 *
 * The bug these exist for: the badge was blank on opening the Inbox and only
 * appeared after visiting the Moderation screen. A listener that fails while
 * auth is still settling left the count at zero, and recovery required a fresh
 * mount — which a screen already sitting on the tab never does.
 */
type SnapshotHandler = (snap: { size: number }) => void
type ErrorHandler = (err: { code: string; message: string }) => void

interface FakeListener {
  onNext: SnapshotHandler
  onError: ErrorHandler
  unsub: ReturnType<typeof vi.fn>
}

const listeners: FakeListener[] = []

vi.mock('@/lib/firebase', () => ({ db: {} }))

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  onSnapshot: (_q: unknown, onNext: SnapshotHandler, onError: ErrorHandler) => {
    const unsub = vi.fn()
    listeners.push({ onNext, onError, unsub })
    return unsub
  },
}))

const { useModerationStore } = await import('./moderationStore')

/** Each attach opens two listeners: reports first, then rooms. */
const reports = () => listeners[listeners.length - 2]
const rooms = () => listeners[listeners.length - 1]

const denied = { code: 'permission-denied', message: 'nope' }

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  listeners.length = 0
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  useModerationStore.setState({
    openReports: 0,
    flaggedRooms: 0,
    loading: false,
    _unsubReports: null,
    _unsubRooms: null,
    _retry: null,
    _refCount: 0,
  })
})

afterEach(() => {
  vi.useRealTimers()
  warn.mockRestore()
})

const store = () => useModerationStore.getState()

describe('counting the queue', () => {
  it('adds open reports to flagged conversations', () => {
    store().subscribe()

    reports().onNext({ size: 2 })
    rooms().onNext({ size: 3 })

    expect(store().queueCount()).toBe(5)
  })

  it('is zero when there is nothing waiting', () => {
    store().subscribe()

    reports().onNext({ size: 0 })
    rooms().onNext({ size: 0 })

    expect(store().queueCount()).toBe(0)
  })

  it('opens one pair of listeners however many screens ask', () => {
    store().subscribe()
    store().subscribe()
    store().subscribe()

    expect(listeners).toHaveLength(2)
  })

  it('keeps listening while any screen is still watching', () => {
    store().subscribe()
    store().subscribe()

    store().unsubscribe()

    expect(rooms().unsub).not.toHaveBeenCalled()
  })

  it('clears the count when the last screen leaves', () => {
    // A badge claiming work is waiting, on a screen no longer listening for it
    // to be cleared, is worse than no badge.
    store().subscribe()
    reports().onNext({ size: 4 })

    store().unsubscribe()

    expect(store().queueCount()).toBe(0)
    expect(rooms().unsub).toHaveBeenCalled()
  })
})

describe('recovering from a failed listener', () => {
  it('reattaches without needing the tab bar to remount', () => {
    // The reported bug exactly: the badge stayed blank on the Inbox and only
    // appeared once Moderation was opened, because recovery used to require a
    // fresh subscribe() that a screen already on the tab never makes.
    store().subscribe()
    reports().onError(denied)

    expect(listeners).toHaveLength(2)

    vi.advanceTimersByTime(2000)

    expect(listeners).toHaveLength(4)

    reports().onNext({ size: 1 })
    rooms().onNext({ size: 2 })
    expect(store().queueCount()).toBe(3)
  })

  it('recovers when it is the rooms listener that fails', () => {
    store().subscribe()
    rooms().onError(denied)

    vi.advanceTimersByTime(2000)

    expect(listeners).toHaveLength(4)
  })

  it('drops the surviving listener before retrying, so it does not double up', () => {
    // Only one of the two fails; leaving the other attached would stack a
    // second listener on the same query with every retry.
    store().subscribe()
    const survivor = rooms()

    reports().onError(denied)

    expect(survivor.unsub).toHaveBeenCalled()
  })

  it('schedules only one retry when both listeners fail', () => {
    store().subscribe()
    const first = reports()
    const second = rooms()

    first.onError(denied)
    second.onError(denied)
    vi.advanceTimersByTime(2000)

    expect(listeners).toHaveLength(4)
  })

  it('stops retrying once nobody is watching', () => {
    // Otherwise leaving the tab would leave a timer reattaching listeners for
    // a screen that is gone.
    store().subscribe()
    reports().onError(denied)

    store().unsubscribe()
    vi.advanceTimersByTime(10000)

    expect(listeners).toHaveLength(2)
  })

  it('does not retry when the failure happens with no subscribers left', () => {
    store().subscribe()
    store().unsubscribe()
    listeners.length = 0

    vi.advanceTimersByTime(10000)

    expect(listeners).toHaveLength(0)
  })

  it('keeps the reference count across a failure', () => {
    // Zeroing it was the old recovery mechanism, and it meant the next
    // unsubscribe underflowed and the retry had no idea anyone was watching.
    store().subscribe()
    store().subscribe()

    reports().onError(denied)

    expect(store()._refCount).toBe(2)
  })

  it('stops claiming to be loading after a failure', () => {
    store().subscribe()

    reports().onError(denied)

    expect(store().loading).toBe(false)
  })
})
