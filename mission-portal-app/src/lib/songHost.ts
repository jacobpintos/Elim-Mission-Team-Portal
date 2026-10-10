import type { ChordSheet } from '@/types/chordSheet'

/**
 * Where a song asked for is opened, while a song screen is up: the open
 * chord sheet (in its place), or else the Chord Sheets page. While there is
 * one, "Hey Miriam…" is taken as asking for a song, and answered here on the
 * device — never sent off to be worked out (features/miriam/MiriamButton).
 * The last one registered is the one in front.
 */
export type OpenSong = (sheet: ChordSheet, key: { key: string; minor: boolean } | null) => void

const hosts: { open: OpenSong; queue?: OpenSong }[] = []

/**
 * Registers a place songs open — and, where a song is open, are queued to
 * come after it ("queue Above All"); returns its unregistering.
 */
export function registerSongHost(open: OpenSong, queue?: OpenSong): () => void {
  const entry = { open, queue }
  hosts.push(entry)
  return () => {
    const at = hosts.indexOf(entry)
    if (at >= 0) hosts.splice(at, 1)
  }
}

/** Where a song asked for opens now, if a song screen is up. */
export function songHost(): OpenSong | null {
  return hosts.length ? hosts[hosts.length - 1].open : null
}

/** Where a song asked to come next is queued, if the song screen in front has a song open. */
export function songQueue(): OpenSong | null {
  return hosts.length ? (hosts[hosts.length - 1].queue ?? null) : null
}
