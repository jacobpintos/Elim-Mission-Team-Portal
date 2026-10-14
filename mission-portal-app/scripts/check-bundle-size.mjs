/**
 * The web build's JavaScript, measured as it is sent (gzipped), against a
 * budget a little above its size in October 2026, so that it catches growth:
 *
 *  - what the first page loads (the scripts index.html names): 2.5 MB, from
 *    about 2.3 MB;
 *  - any one chunk loaded later (the PDF viewer, html2canvas, …): 500 KB,
 *    the largest being about 400 KB.
 *
 * Finding nothing to measure fails too: that is a check that no longer looks
 * in the right place (as when Expo moved the files into js/web/), not an app
 * that got small.
 *
 *   node scripts/check-bundle-size.mjs [dist]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

const KB = 1024
const INITIAL_BUDGET = 2.5 * KB * KB
const CHUNK_BUDGET = 500 * KB

const dist = process.argv[2] ?? 'dist'
const jsDir = join(dist, '_expo', 'static', 'js')

function fail(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

let html
try {
  html = readFileSync(join(dist, 'index.html'), 'utf8')
} catch {
  fail(`No index.html in ${dist} — run expo export first.`)
}
let found = []
try {
  found = walk(jsDir).filter((path) => path.endsWith('.js'))
} catch {
  // No such folder: said below.
}
if (found.length === 0) fail(`No JavaScript under ${jsDir} — where does the export put it now?`)

/** As index.html names it: "/_expo/static/js/web/entry-….js". */
const named = (path) => '/' + relative(dist, path).split(sep).join('/')
const initial = new Set(
  [...html.matchAll(/<script\b[^>]*\bsrc="([^"?#]+\.js)/g)].map(
    (m) => '/' + m[1].replace(/^\//, '')
  )
)
if (initial.size === 0) fail('index.html loads no scripts — has the export changed?')
const missing = [...initial].filter((src) => !found.some((path) => named(path) === src))
if (missing.length) fail(`index.html loads what the build doesn't have: ${missing.join(', ')}`)

const kb = (bytes) => `${Math.round(bytes / KB).toLocaleString('en-US')} KB`
const sizes = found
  .map((path) => ({ name: named(path), size: gzipSync(readFileSync(path)).length }))
  .sort((a, b) => b.size - a.size)

let initialSize = 0
let over = false
console.log('Bundle sizes, gzipped:')
for (const { name, size } of sizes) {
  const first = initial.has(name)
  if (first) initialSize += size
  const tooBig = !first && size > CHUNK_BUDGET
  if (tooBig) over = true
  console.log(
    `  ${first ? 'first page' : 'later     '}  ${kb(size).padStart(8)}  ${name.split('/').pop()}${tooBig ? `  ❌ over ${kb(CHUNK_BUDGET)}` : ''}`
  )
}
console.log(`First page: ${kb(initialSize)} of ${kb(INITIAL_BUDGET)}`)
if (initialSize > INITIAL_BUDGET) fail(`What the first page loads is over ${kb(INITIAL_BUDGET)}.`)
if (over) fail(`A chunk loaded later is over ${kb(CHUNK_BUDGET)}.`)
console.log('✅ Bundle size within budget')
