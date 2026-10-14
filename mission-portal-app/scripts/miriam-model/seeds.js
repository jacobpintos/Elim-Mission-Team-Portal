/**
 * Works out the meaning of each of Miriam's starting examples
 * (functions/src/miriam/own/skills.ts: SEEDS), and of the questions her core
 * truths answer (./faith: CORE), ahead of time, so the server
 * never has to at startup, into functions/models/minilm/seedVectors.json —
 * each read as she reads a request, its event's name as "the event".
 *
 *   npm --prefix functions run build && node scripts/miriam-model/seeds.js
 *
 * Run again after changing the examples: src/lib/miriamOwn.test.ts fails
 * until every one has its meaning here.
 */
/* global __dirname */
const fs = require('fs')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'functions', 'lib', 'miriam', 'own')
const { embed } = require(path.join(lib, 'encoder.js'))
const { SEEDS, asRead } = require(path.join(lib, 'skills.js'))
const { packVector } = require(path.join(lib, 'vectors.js'))
const { CORE } = require(path.join(lib, 'faith.js'))

const out = path.join(__dirname, '..', '..', 'functions', 'models', 'minilm', 'seedVectors.json')
const before = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {}
const vectors = {}
let made = 0
for (const texts of Object.values(SEEDS)) {
  for (const text of texts) {
    if (vectors[text]) continue
    vectors[text] = before[text] ?? packVector(embed(asRead(text)))
    if (!before[text]) made++
  }
}
// The core truths' questions too, as said (./faith): what a question of faith is matched with.
for (const q of CORE.flatMap((c) => c.asked)) {
  if (vectors[q]) continue
  vectors[q] = before[q] ?? packVector(embed(q))
  if (!before[q]) made++
}
fs.writeFileSync(out, JSON.stringify(vectors, null, 0) + '\n')
console.log(`${Object.keys(vectors).length} examples, ${made} worked out now`)
