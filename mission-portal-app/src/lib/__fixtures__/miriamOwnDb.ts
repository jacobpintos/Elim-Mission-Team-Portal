import { Lookups } from '../../../functions/src/miriam/lookups'
import type { OwnDb } from '../../../functions/src/miriam/own/learn'

/**
 * The databases Miriam's own answers read, for her tests: the church's, as
 * fixed data (functions/src/miriam/lookups), and her own store, in memory
 * (functions/src/miriam/own/learn).
 */

export type Firestore = ConstructorParameters<typeof Lookups>[0]
export function fakeDb(data: Record<string, Record<string, Record<string, unknown>>>): Firestore {
  const snap = (id: string, d: Record<string, unknown> | undefined) => ({
    id,
    exists: d !== undefined,
    data: () => d,
  })
  return {
    collection: (name: string) => ({
      get: async () => ({ docs: Object.entries(data[name] ?? {}).map(([id, d]) => snap(id, d)) }),
    }),
    doc: (path: string) => {
      const [name, id] = path.split('/')
      return { get: async () => snap(id, data[name]?.[id]) }
    },
  } as unknown as Firestore
}

/** Her own store, in memory: one document per path. */
export function memoryOwnDb(): OwnDb & { docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>()
  const ref = (path: string) => ({
    get: async () => ({ data: () => docs.get(path) }),
    set: async (d: Record<string, unknown>, opts?: { merge: boolean }) => {
      docs.set(path, opts?.merge ? { ...(docs.get(path) ?? {}), ...d } : d)
    },
  })
  return {
    docs,
    doc: ref,
    runTransaction: async (fn) =>
      fn({ get: (r) => r.get(), set: (r, d) => (r as ReturnType<typeof ref>).set(d) }),
  }
}
