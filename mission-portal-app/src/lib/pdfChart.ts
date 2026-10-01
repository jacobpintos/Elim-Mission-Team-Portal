/**
 * Reading a PDF chart is built on pdf.js, which runs in a browser. The phone
 * app has no browser to run it in, so it says so and points somewhere that
 * works rather than failing quietly.
 */
export async function pdfToChartText(_data: ArrayBuffer): Promise<string> {
  throw new Error(
    'Reading PDFs works in the web app for now. Import it there, or download the song as ChordPro or text and import that here.'
  )
}
