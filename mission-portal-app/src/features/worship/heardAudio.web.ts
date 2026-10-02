import type { Chroma } from '@/lib/keyDetect'

/** A browser's speech recognition keeps no recording, so there is none to read. */
export async function readHeardAudio(_uri: string, _wanted: boolean): Promise<Chroma | null> {
  return null
}
