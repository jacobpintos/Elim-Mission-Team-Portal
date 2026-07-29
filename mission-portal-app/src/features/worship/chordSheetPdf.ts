import type { ChordSheet } from '@/types/chordSheet'

// Real implementation lives in chordSheetPdf.web.ts (uses jsPDF, a web-only
// dependency). Native platforms use expo-print's share sheet instead and
// never reach this call site — see handleExportPdf in ChordSheetViewer.
export function buildChordSheetPdfBlob(
  _sheet: ChordSheet,
  _selectedKey: string,
  _isMinor: boolean,
  _keyIdx: number,
  _primaryColor: string,
  _ccliLicense?: string
): Blob {
  throw new Error('PDF blob export is only available on web')
}
