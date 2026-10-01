/**
 * expo-file-system for the unit tests, which run in Node: files kept in a Map.
 * Only what offlineCache.ts uses. Wired in by vitest.config.ts.
 */

export const files = new Map<string, string>()
const dirs = new Set<string>()

const join = (parts: (string | { uri: string })[]) =>
  parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/')

export class Directory {
  uri: string
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts)
  }
  get exists() {
    return dirs.has(this.uri)
  }
  create() {
    dirs.add(this.uri)
  }
  delete() {
    dirs.delete(this.uri)
    for (const k of [...files.keys()]) if (k.startsWith(this.uri + '/')) files.delete(k)
  }
}

export class File {
  uri: string
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts)
  }
  get exists() {
    return files.has(this.uri)
  }
  create() {
    files.set(this.uri, '')
  }
  write(content: string) {
    files.set(this.uri, content)
  }
  async text() {
    return files.get(this.uri) ?? ''
  }
}

export const Paths = { document: new Directory('document') }
