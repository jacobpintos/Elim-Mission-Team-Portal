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
  lyrics: string        // raw multiline text; empty for instrumentals
  chordLines: string[]  // one string per lyrics line; single entry if no lyrics
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
