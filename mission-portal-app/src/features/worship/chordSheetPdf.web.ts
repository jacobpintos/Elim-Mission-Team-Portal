import { jsPDF } from 'jspdf'
import type { ChordSheet } from '@/types/chordSheet'
import { getWordSlots } from '@/lib/nashvilleNumbers'
import {
  PROGRESSION_END,
  formatToken,
  getSectionLabel,
  getPrevMatchingLabel,
  hexToRgb,
} from './chordSheetFormat'

// Builds a real PDF file (not a print job) for web export, where expo-print has
// no way to generate an actual file — its web shim just calls window.print().
// Mirrors buildChordSheetHtml's layout section-by-section, but draws text
// directly via jsPDF instead of emitting HTML, with manual page-break tracking
// standing in for the HTML version's `page-break-inside:avoid`.
export function buildChordSheetPdfBlob(
  sheet: ChordSheet,
  selectedKey: string,
  isMinor: boolean,
  keyIdx: number,
  primaryColor: string,
  ccliLicense?: string
): Blob {
  const disp = (raw: string) => formatToken(raw, keyIdx, isMinor)
  const [pr, pg, pb] = hexToRgb(primaryColor)
  const DARK: [number, number, number] = [30, 30, 30]
  const GRAY: [number, number, number] = [140, 140, 140]

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const bottom = pageHeight - margin
  const lineHeight = 16.5
  let y = margin

  const ensureSpace = (needed: number) => {
    if (y + needed > bottom) {
      doc.addPage()
      y = margin
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...DARK)
  doc.text(sheet.title, margin, y)
  y += 26

  const metaParts: string[] = []
  if (sheet.artist) metaParts.push(sheet.artist)
  if (sheet.bpm != null) metaParts.push(`♪ = ${sheet.bpm} BPM`)
  if (selectedKey) metaParts.push(`Key: ${selectedKey}${isMinor ? ' minor' : ''}`)
  if (metaParts.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...GRAY)
    doc.text(metaParts.join('   ·   '), margin, y)
    y += 26
  } else {
    y += 8
  }

  for (const section of sheet.sections) {
    const label = getSectionLabel(sheet.sections, section.id)

    if (section.sameAsPrevious) {
      ensureSpace(lineHeight * 2)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(pr, pg, pb)
      doc.text(label, margin, y)
      y += 15
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(10.5)
      doc.setTextColor(...GRAY)
      const pl = getPrevMatchingLabel(sheet.sections, section.id)
      doc.text(pl ? `(same as ${pl})` : '(same as previous)', margin, y)
      y += 24
      continue
    }

    const hasLyrics = section.lyrics.trim().length > 0

    if (!hasLyrics) {
      const toks = (section.chordTokens ?? [])
        .flat()
        .filter(Boolean)
        .map((t) => (t === PROGRESSION_END ? '|' : disp(t)))
      const text = toks.join('  ')
      ensureSpace(lineHeight * 2)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(pr, pg, pb)
      doc.text(label, margin, y)
      y += 15
      if (text) {
        doc.setFont('courier', 'bold')
        doc.setFontSize(11)
        doc.text(text, margin, y)
        y += lineHeight
      }
      y += 12
      continue
    }

    const lyricsLines = section.lyrics.split('\n')
    const lyricChordRows = (section.chordTokens ?? []).filter(
      (row) => !(row.length === 1 && row[0] === PROGRESSION_END)
    )

    ensureSpace(lineHeight * 2 + 18)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(pr, pg, pb)
    doc.text(label, margin, y)
    y += 18

    for (let li = 0; li < lyricsLines.length; li++) {
      const slots = getWordSlots(lyricsLines[li])
      if (!slots.length) {
        y += 8
        continue
      }
      const rowTokens = lyricChordRows[li] ?? []
      let cStr = ''
      let lStr = ''
      for (let wi = 0; wi < slots.length; wi++) {
        const slot = slots[wi]
        const word = slot.text + (slot.trailing === '-' ? '-' : slot.trailing === ' ' ? ' ' : '')
        const chord = rowTokens[wi] ? disp(rowTokens[wi]) : ''
        const w = Math.max(word.length, chord ? chord.length + 1 : 0)
        cStr += chord.padEnd(w, ' ')
        lStr += word.padEnd(w, ' ')
      }
      ensureSpace(lineHeight * 2)
      doc.setFont('courier', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(pr, pg, pb)
      doc.text(cStr.trimEnd() || ' ', margin, y)
      y += 12
      doc.setFont('courier', 'normal')
      doc.setTextColor(...DARK)
      doc.text(lStr.trimEnd(), margin, y)
      y += 16
    }
    y += 14
  }

  // CCLI requires the license number to appear on reproduced worship material,
  // so stamp it at the foot of the last page when one is configured.
  if (ccliLicense) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    const pageHeight = doc.internal.pageSize.getHeight()
    doc.text(`Reproduced under CCLI License No. ${ccliLicense}`, margin, pageHeight - 24)
  }

  return doc.output('blob')
}
