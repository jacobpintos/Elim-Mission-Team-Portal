// pdf.js ships types for the library but not for its worker, which is only
// imported for what it does on load: it registers itself on globalThis.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs'
