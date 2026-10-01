import { chordLine, sectionHeading } from '@/lib/chordImport'

/**
 * Turn the text of a PDF chart back into a chart the reader in chordImport
 * takes: ChordPro, with the chords written into the lyrics.
 *
 * A PDF has no lines of characters in columns. It has runs of text, each at an
 * x and y on the page, almost always in a proportional font — so a chord's
 * place over a lyric is a position, not a character count, and an "i" and an
 * "m" under it are not the same width. Each line is rebuilt from its runs with
 * an x for every character, and each chord is set over the character its x
 * falls on, and written into the lyric there.
 *
 * Pure: the PDF is read elsewhere (pdfChart.web.ts) and the width of a
 * character is asked of `measure`, so this can be tested with made-up runs.
 */

export interface PdfRun {
  str: string
  /** Left edge, in PDF units. */
  x: number
  /** Baseline, in PDF units — up from the bottom of the page. */
  y: number
  width: number
  height: number
}

export interface PdfPage {
  width: number
  runs: PdfRun[]
}

/** How wide a string is in some font — only the ratios within a run matter. */
export type Measure = (s: string) => number

interface Line {
  y: number
  height: number
  text: string
  /** The x each character of `text` starts at. */
  xs: number[]
  /** Where the last character ends. */
  end: number
}

/**
 * Lines from runs: runs on the same baseline, left to right, with a space put
 * in where there is a gap a space wide or more.
 */
function toLines(runs: PdfRun[], measure: Measure): Line[] {
  const sorted = runs.filter((r) => r.str.length > 0).sort((a, b) => b.y - a.y || a.x - b.x)
  const groups: PdfRun[][] = []
  for (const run of sorted) {
    const last = groups[groups.length - 1]
    const tolerance = Math.max(2, (last?.[0].height ?? run.height) * 0.4)
    if (last && Math.abs(last[0].y - run.y) <= tolerance) last.push(run)
    else groups.push([run])
  }

  return groups.map((group) => {
    group.sort((a, b) => a.x - b.x)
    let text = ''
    const xs: number[] = []
    let end = group[0].x
    for (const run of group) {
      const total = measure(run.str) || run.str.length
      const charW = run.width / Math.max(1, run.str.length)
      // A gap a space wide is a space, and so is an overlap: two chords set
      // close, the first in bold, can run into each other ("Am" over "Re",
      // "G" over "vive") and are still two chords.
      const apart = run.x - end > charW * 0.6 || run.x < end - 0.5
      if (text && apart && !text.endsWith(' ') && !run.str.startsWith(' ')) {
        text += ' '
        xs.push(end)
      }
      for (let i = 0; i < run.str.length; i++) {
        xs.push(run.x + (run.width * measure(run.str.slice(0, i))) / total)
        text += run.str[i]
      }
      end = run.x + run.width
    }
    return { y: group[0].y, height: group[0].height, text, xs, end }
  })
}

/**
 * The page as one column or two.
 *
 * Long charts are set in two columns to fit a page. The giveaway is the right
 * column's own margin: its lyrics and headings all start at the same x past
 * the middle. Chords to the right of the middle of a one-column chart do not
 * line up like that — they sit wherever the syllable is — so they do not set
 * it off. Runs left of that margin read first, top to bottom, then the right.
 */
function columns(page: PdfPage, measure: Measure): PdfRun[][] {
  const mid = page.width / 2
  const lines = toLines(page.runs, measure)
  const starts = new Map<number, number>()
  for (const line of lines) {
    // The first word-like run at or past the middle of each line.
    const run = page.runs
      .filter((r) => Math.abs(r.y - line.y) <= Math.max(2, line.height * 0.4))
      .filter((r) => r.x >= mid - page.width * 0.08)
      .sort((a, b) => a.x - b.x)[0]
    if (!run || run.str.trim().length < 3 || chordLine(run.str)) continue
    const key = Math.round(run.x / 4) * 4
    starts.set(key, (starts.get(key) ?? 0) + 1)
  }
  const [margin, count] = [...starts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]
  if (count < 4) return [page.runs]
  const split = margin - 6
  return [page.runs.filter((r) => r.x < split), page.runs.filter((r) => r.x >= split)]
}

/** The index of the character in `line` that x falls on. */
function charAt(line: Line, x: number): number {
  if (x < line.xs[0]) return 0
  if (x >= line.end) return line.text.length + 1
  let i = 0
  while (i + 1 < line.xs.length && line.xs[i + 1] <= x + 0.5) i++
  return i
}

/**
 * A lyric with its chords written in, ChordPro's way: "[Am]Re[G]vive me".
 *
 * Not chords padded over the lyric in a line of their own. Two chords a
 * syllable apart — "Am" over "Re", "G" over "vive" — cannot both sit in
 * columns of text over a short syllable: the second is pushed along past the
 * first and lands on the wrong one. Written in, each stays on its character.
 */
function inline(line: Line, chords: { chord: string; at: number }[]): string {
  let text = line.text
  // Right to left, so the characters left of each chord stay where they are.
  for (const c of [...chords].reverse()) {
    const at = Math.min(c.at, text.length + 1)
    text = `${text.slice(0, at).padEnd(at)}[${c.chord}]${text.slice(at)}`
  }
  return text
}

/**
 * The chart as text: ChordPro's chords written into the lyric they sit over,
 * and plain lines for everything else — the title, headings, a line of chords
 * on its own — which the ChordPro reader takes as a chords-over-lyrics chart
 * has them.
 */
export function pagesToChartText(pages: PdfPage[], measure: Measure): string {
  const out: string[] = []
  for (const page of pages) {
    for (const column of columns(page, measure)) {
      const lines = toLines(column, measure)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const prev = lines[i - 1]
        // A gap of more than a line and a half is a break between sections.
        if (prev && prev.y - line.y > Math.max(prev.height, line.height) * 2.2) out.push('')

        const chords = sectionHeading(line.text) ? null : chordLine(line.text)
        const below = lines[i + 1]
        const belowIsWords =
          !!below &&
          !sectionHeading(below.text) &&
          !chordLine(below.text) &&
          line.y - below.y < Math.max(line.height, below.height) * 2.2
        if (chords && belowIsWords) {
          out.push(
            inline(
              below,
              chords.map((c) => ({ chord: c.chord, at: charAt(below, line.xs[c.at]) }))
            )
          )
          i++
          continue
        }
        out.push(line.text)
      }
      out.push('')
    }
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
