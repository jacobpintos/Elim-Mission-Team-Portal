import type { ChordSheet } from '@/types/chordSheet'

/**
 * Listening for a song is the phone app's (SongListener.tsx), which uses the
 * phone's own speech recognition. Nothing here on the web.
 */
export function SongListener(_props: {
  sheets: ChordSheet[]
  onFound: (sheet: ChordSheet, sectionId: string | null, line: number | null) => void
}) {
  return null
}
