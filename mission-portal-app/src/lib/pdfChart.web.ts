import { pagesToChartText, type PdfPage, type Measure } from '@/lib/pdfLayout'

/**
 * The text of a PDF chart, as chords written over lyrics.
 *
 * pdf.js reads the PDF — every run of text with its position — and
 * pdfLayout puts it back together. Loaded only when somebody picks a PDF, so
 * nobody else downloads it.
 *
 * The worker is imported before the library rather than given as a URL: it
 * sets itself on globalThis, and pdf.js then runs it on the page instead of
 * starting a Worker from a file this app would have to host. A chart is a
 * page or two, which does not need a thread of its own.
 */
export async function pdfToChartText(data: ArrayBuffer): Promise<string> {
  await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  try {
    const pages: PdfPage[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const { width } = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const runs = content.items.flatMap((item) =>
        'str' in item && item.str.trim() !== ''
          ? [
              {
                str: item.str,
                x: item.transform[4],
                y: item.transform[5],
                width: item.width,
                height: item.height || Math.abs(item.transform[3]),
              },
            ]
          : []
      )
      pages.push({ width, runs })
    }
    const text = pagesToChartText(pages, canvasMeasure())
    if (!text.trim()) {
      throw new Error(
        "That PDF has no text in it to read — it's a picture of a chart, as a scan is. Download it as ChordPro or text instead, if the site offers it."
      )
    }
    return text
  } finally {
    await doc.destroy()
  }
}

/**
 * Widths from a canvas, in an ordinary sans-serif.
 *
 * Not the PDF's own font — that is not available to measure — but only the
 * proportions inside each run are used: the run's true width comes from the
 * PDF, and this says how it divides between the letters. Close enough to put
 * a chord on the right syllable.
 */
function canvasMeasure(): Measure {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return (s) => s.length
  ctx.font = '100px Helvetica, Arial, sans-serif'
  return (s) => ctx.measureText(s).width
}
