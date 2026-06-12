export type SectionType = 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'tag' | 'outro'

export const SECTION_TYPES: SectionType[] = [
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'bridge',
  'tag',
  'outro',
]

export const SECTION_LABELS: Record<SectionType, string> = {
  intro: 'Intro',
  verse: 'Verse',
  'pre-chorus': 'Pre-Chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  tag: 'Tag',
  outro: 'Outro',
}

export interface ChordSheetSection {
  id: string
  type: SectionType
  lyrics: string            // raw multiline text; empty for instrumentals
  chordTokens: string[][]  // [lineIdx][wordIdx] = NNS token or ''; one row for instrumentals
  sameAsPrevious?: boolean  // if true, viewer shows label only (or skips in Chords Only)
}

export interface ChordSheet {
  id: string | number
  title: string
  artist?: string
  bpm?: number
  sections: ChordSheetSection[]
  createdBy: string | number
  createdAt: unknown
  updatedAt?: unknown
}
