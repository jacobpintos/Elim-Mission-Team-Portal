/**
 * Writes dist/sw.js after `expo export --platform web`: the service worker in
 * service-worker.js, with this build's files and a version that changes when
 * any of them does — which is what tells phones there is a new build to keep.
 *
 *   node scripts/build-service-worker.mjs [dist]
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = process.argv[2] ?? 'dist'
const here = fileURLToPath(new URL('.', import.meta.url))

/** Not part of the app: Expo's build notes, source maps, the worker itself. */
const LEAVE_OUT = /(^|\/)(metadata\.json|sw\.js)$|\.map$/

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const files = walk(dist)
  .map((path) => '/' + relative(dist, path).split(sep).join('/'))
  .filter((path) => !LEAVE_OUT.test(path))
  .sort()

if (!files.includes('/index.html')) {
  console.error(`No index.html in ${dist} — run expo export first.`)
  process.exit(1)
}

const hash = createHash('sha256')
for (const path of files) hash.update(path).update(readFileSync(join(dist, path)))
const version = hash.digest('hex').slice(0, 12)

const worker = readFileSync(join(here, 'service-worker.js'), 'utf8')
writeFileSync(
  join(dist, 'sw.js'),
  `const VERSION = ${JSON.stringify(version)}\nconst FILES = ${JSON.stringify(files)}\n\n${worker}`
)
console.log(`sw.js: version ${version}, ${files.length} files`)
