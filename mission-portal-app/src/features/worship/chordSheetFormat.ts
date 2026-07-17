import { SECTION_LABELS } from '@/types/chordSheet'
import type { ChordSheet, ChordSheetSection } from '@/types/chordSheet'
import { nashvilleToChord, getWordSlots } from '@/lib/nashvilleNumbers'

// Token used to mark the end of one chord progression cycle within a section.
export const PROGRESSION_END = '||'

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// A trailing "." on a chord token marks the end of a progression (used to
// collapse repeats). It is a hidden marker — never rendered — so strip it
// before displaying the chord.
export function stripBoundary(token: string): string {
  return token.endsWith('.') ? token.slice(0, -1) : token
}

// Convert a raw NNS token to a display string.
// "4/1"  → slash chord    (4 chord, 1 in the bass)  e.g. "F/C"
// "4>1"  → passing chord  (moves from 4 to 1)        e.g. "F → C"
// "4 1"  → space-separated chords packed in one box  e.g. "F  C"
export function formatToken(raw: string, keyIdx: number, isMinor: boolean): string {
  if (!raw || raw === PROGRESSION_END) return raw
  const tok = stripBoundary(raw)
  if (!tok) return ''
  const conv = (t: string) => keyIdx < 0 ? t.trim() : nashvilleToChord(t.trim(), keyIdx, isMinor)
  if (tok.includes('>')) return tok.split('>').map(conv).join(' → ')
  if (keyIdx < 0) return tok
  // Space-separated: user packed multiple chords into one box — convert each independently
  if (tok.includes(' ')) {
    return tok.trim().split(/\s+/).map((p) => p.split('/').map(conv).join('/')).join('  ')
  }
  return tok.split('/').map(conv).join('/')
}

// Split a flat chord token array into progression groups. A group ends at a
// PROGRESSION_END ("||") marker or right after a token carrying a trailing "."
// boundary. Stored chords have the "." stripped.
export function splitByProgressionEnd(tokens: string[]): string[][] {
  const groups: string[][] = []
  let current: string[] = []
  for (const t of tokens) {
    if (t === PROGRESSION_END) {
      if (current.length > 0) { groups.push(current); current = [] }
      continue
    }
    if (!t) continue
    const isBoundary = t.endsWith('.')
    const chord = stripBoundary(t)
    if (chord) current.push(chord)
    if (isBoundary && current.length > 0) { groups.push(current); current = [] }
  }
  if (current.length > 0) groups.push(current)
  return groups
}

// Collapse consecutive identical progression groups into { chords, count } entries.
export function compressGroups(groups: string[][]): { chords: string[]; count: number }[] {
  const result: { chords: string[]; count: number }[] = []
  for (const group of groups) {
    const sig = group.join('\x00')
    const last = result[result.length - 1]
    if (last && last.chords.join('\x00') === sig) {
      last.count++
    } else {
      result.push({ chords: [...group], count: 1 })
    }
  }
  return result
}

export function getSectionLabel(sections: ChordSheet['sections'], id: string): string {
  const section = sections.find((s) => s.id === id)
  if (!section) return ''
  const ofType = sections.filter((s) => s.type === section.type)
  const base = SECTION_LABELS[section.type]
  if (ofType.length <= 1) return base
  return `${base} ${ofType.findIndex((s) => s.id === id) + 1}`
}

export function getPrevMatchingLabel(sections: ChordSheet['sections'], id: string): string {
  const idx = sections.findIndex((s) => s.id === id)
  if (idx <= 0) return ''
  const section = sections[idx]
  const prev = sections.slice(0, idx).reverse().find((s) => s.type === section.type)
  if (!prev) return ''
  return getSectionLabel(sections, prev.id)
}

export function getPrevMatchingSection(
  sections: ChordSheet['sections'],
  id: string
): ChordSheetSection | null {
  const idx = sections.findIndex((s) => s.id === id)
  if (idx <= 0) return null
  const section = sections[idx]
  return sections.slice(0, idx).reverse().find((s) => s.type === section.type) ?? null
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return [30, 30, 30]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function buildChordSheetHtml(
  sheet: ChordSheet,
  selectedKey: string,
  isMinor: boolean,
  keyIdx: number,
  primaryColor: string,
): string {
  const disp = (raw: string) => formatToken(raw, keyIdx, isMinor)

  const secLabel = (id: string) => getSectionLabel(sheet.sections, id)
  const prevLabel = (id: string) => getPrevMatchingLabel(sheet.sections, id)

  let body = ''
  for (const section of sheet.sections) {
    const label = secLabel(section.id)

    if (section.sameAsPrevious) {
      const pl = prevLabel(section.id)
      body += `<div class="section"><div class="slabel">${escHtml(label)}</div><div class="same-as">${pl ? `(same as ${escHtml(pl)})` : '(same as previous)'}</div></div>\n`
      continue
    }

    const hasLyrics = section.lyrics.trim().length > 0

    if (!hasLyrics) {
      const toks = (section.chordTokens ?? []).flat().filter(Boolean)
        .map((t) => (t === PROGRESSION_END ? ' | ' : disp(t))).join('  ')
      body += `<div class="section"><div class="slabel">${escHtml(label)}</div>${toks ? `<div class="instrumental">${escHtml(toks)}</div>` : ''}</div>\n`
      continue
    }

    const lyricChordRows = (section.chordTokens ?? []).filter(
      (row) => !(row.length === 1 && row[0] === PROGRESSION_END)
    )
    let linesHtml = ''
    for (let li = 0; li < section.lyrics.split('\n').length; li++) {
      const lyricLine = section.lyrics.split('\n')[li]
      const slots = getWordSlots(lyricLine)
      if (!slots.length) { linesHtml += '<br>'; continue }
      const rowTokens = lyricChordRows[li] ?? []
      let cStr = '', lStr = ''
      for (let wi = 0; wi < slots.length; wi++) {
        const slot = slots[wi]
        const word = slot.text + (slot.trailing === '-' ? '-' : slot.trailing === ' ' ? ' ' : '')
        const chord = rowTokens[wi] ? disp(rowTokens[wi]) : ''
        const w = Math.max(word.length, chord ? chord.length + 1 : 0)
        cStr += chord.padEnd(w, ' ')
        lStr += word.padEnd(w, ' ')
      }
      linesHtml += `<div class="cl">${escHtml(cStr.trimEnd())}</div><div class="ll">${escHtml(lStr.trimEnd())}</div>`
    }
    body += `<div class="section"><div class="slabel">${escHtml(label)}</div>${linesHtml}</div>\n`
  }

  const metaParts: string[] = []
  if (sheet.artist) metaParts.push(sheet.artist)
  if (sheet.bpm != null) metaParts.push(`♩ = ${sheet.bpm} BPM`)
  if (selectedKey) metaParts.push(`Key: ${selectedKey}${isMinor ? ' minor' : ''}`)

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escHtml(sheet.title)}</title>
<style>
  body{font-family:'Courier New',Courier,monospace;padding:28px 32px;color:#222;font-size:13px}
  h1{font-family:sans-serif;margin:0 0 4px;font-size:22px;font-weight:700}
  .meta{color:#888;font-size:12px;font-family:sans-serif;margin-bottom:28px}
  .section{margin-bottom:20px;page-break-inside:avoid}
  .slabel{font-family:sans-serif;font-weight:700;font-size:13px;color:${primaryColor};margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
  .same-as{font-style:italic;color:#888;font-size:12px}
  .cl{color:${primaryColor};font-weight:700;white-space:pre;line-height:1.5;min-height:1em}
  .ll{white-space:pre;line-height:1.5;margin-bottom:4px}
  .instrumental{color:${primaryColor};font-weight:700}
</style></head><body>
<h1>${escHtml(sheet.title)}</h1>
${metaParts.length ? `<div class="meta">${escHtml(metaParts.join(' · '))}</div>` : ''}
${body}
</body></html>`
}
