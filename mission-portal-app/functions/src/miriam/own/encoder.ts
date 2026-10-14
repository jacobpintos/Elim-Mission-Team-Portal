/**
 * Miriam's own language model: what she understands requests with, run here
 * in plain TypeScript — no GPU, no service, nothing outside the app.
 *
 * It is all-MiniLM-L6-v2 (sentence-transformers, Apache-2.0: models/minilm),
 * a small transformer trained on more than a billion pairs of sentences that
 * mean the same thing. It reads a sentence and gives back where its meaning
 * lies, as 384 numbers: two sentences that mean the same come out close,
 * however differently they are worded — "when does Youth Night kick off?" and
 * "what time is Youth Night?". That is what she compares requests with
 * (./understand).
 *
 * Kept as the original computes it (BERT: 6 layers, 12 heads, mean of every
 * token, made unit length), with its weights as 8-bit numbers
 * (scripts/miriam-model/convert.py); src/lib/miriamEncoder.test.ts checks it
 * against the original's own output.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

/** Where the model's files are, from here (src/ or lib/, the same depth). */
const MODEL_DIR = join(__dirname, '..', '..', '..', 'models', 'minilm')

/** Tokens read at most, [CLS] and [SEP] included, as the model was trained. */
export const MAX_TOKENS = 128
export const DIMENSIONS = 384

const CLS = '[CLS]'
const SEP = '[SEP]'
const UNK = '[UNK]'
const MAX_WORD_CHARS = 100

interface Q8 {
  rows: number
  cols: number
  q: Int8Array
  /** One scale for each `group` of a row. */
  s: Float32Array
}

interface Layer {
  query: Q8
  queryB: Float32Array
  key: Q8
  keyB: Float32Array
  value: Q8
  valueB: Float32Array
  out: Q8
  outB: Float32Array
  ln1W: Float32Array
  ln1B: Float32Array
  up: Q8
  upB: Float32Array
  down: Q8
  downB: Float32Array
  ln2W: Float32Array
  ln2B: Float32Array
}

interface Model {
  group: number
  hidden: number
  heads: number
  vocab: Map<string, number>
  words: Q8
  positions: Q8
  type0: Float32Array
  embLnW: Float32Array
  embLnB: Float32Array
  layers: Layer[]
}

interface TensorEntry {
  type: 'q8' | 'f32'
  shape: number[]
  offset: number
  scales?: number
}

function read(dir: string): Model {
  const buf = readFileSync(join(dir, 'model.bin'))
  if (buf.toString('latin1', 0, 4) !== 'MML1') throw new Error('Not a Miriam model file')
  const headerLen = buf.readUInt32LE(4)
  const header = JSON.parse(buf.toString('utf8', 8, 8 + headerLen)) as {
    group: number
    hidden: number
    heads: number
    tensors: Record<string, TensorEntry>
  }
  // A copy that starts on its own, so typed views of it line up.
  const data = new Uint8Array(buf.length - 8 - headerLen)
  data.set(buf.subarray(8 + headerLen))
  const tensor = (name: string): TensorEntry => {
    const t = header.tensors[name]
    if (!t) throw new Error(`The model has no ${name}`)
    return t
  }
  const f32 = (name: string): Float32Array => {
    const t = tensor(name)
    const n = t.shape.reduce((a, b) => a * b, 1)
    return new Float32Array(data.buffer, data.byteOffset + t.offset, n)
  }
  const q8 = (name: string): Q8 => {
    const t = tensor(name)
    const [rows, cols] = t.shape
    return {
      rows,
      cols,
      q: new Int8Array(data.buffer, data.byteOffset + t.offset, rows * cols),
      s: new Float32Array(
        data.buffer,
        data.byteOffset + (t.scales as number),
        (rows * cols) / header.group
      ),
    }
  }
  const vocab = new Map<string, number>()
  readFileSync(join(dir, 'vocab.txt'), 'utf8')
    .split('\n')
    .forEach((w, i) => {
      const word = w.replace(/\r$/, '')
      if (word && !vocab.has(word)) vocab.set(word, i)
    })
  const layers: Layer[] = []
  for (let l = 0; ; l++) {
    const p = `encoder.layer.${l}.`
    if (!header.tensors[`${p}attention.self.query.weight`]) break
    layers.push({
      query: q8(`${p}attention.self.query.weight`),
      queryB: f32(`${p}attention.self.query.bias`),
      key: q8(`${p}attention.self.key.weight`),
      keyB: f32(`${p}attention.self.key.bias`),
      value: q8(`${p}attention.self.value.weight`),
      valueB: f32(`${p}attention.self.value.bias`),
      out: q8(`${p}attention.output.dense.weight`),
      outB: f32(`${p}attention.output.dense.bias`),
      ln1W: f32(`${p}attention.output.LayerNorm.weight`),
      ln1B: f32(`${p}attention.output.LayerNorm.bias`),
      up: q8(`${p}intermediate.dense.weight`),
      upB: f32(`${p}intermediate.dense.bias`),
      down: q8(`${p}output.dense.weight`),
      downB: f32(`${p}output.dense.bias`),
      ln2W: f32(`${p}output.LayerNorm.weight`),
      ln2B: f32(`${p}output.LayerNorm.bias`),
    })
  }
  return {
    group: header.group,
    hidden: header.hidden,
    heads: header.heads,
    vocab,
    words: q8('embeddings.word_embeddings.weight'),
    positions: q8('embeddings.position_embeddings.weight'),
    type0: f32('embeddings.token_type_embeddings.weight').subarray(0, header.hidden),
    embLnW: f32('embeddings.LayerNorm.weight'),
    embLnB: f32('embeddings.LayerNorm.bias'),
    layers,
  }
}

let loaded: Model | null = null
/** Read once for each server instance, when first needed (about 24 MB). */
function model(): Model {
  loaded ??= read(MODEL_DIR)
  return loaded
}

// --- Words into the model's pieces (BERT's own, uncased) ---------------------

// As BERT's tokenizer has them: "control" is any of Unicode's Other
// categories but tab and line breaks, which are whitespace.
const isControl = (c: string) => /\p{C}/u.test(c) && !/[\t\n\r]/.test(c)
const isWhitespace = (c: string) => /\p{White_Space}/u.test(c)
const isPunctuation = (c: string) => {
  const cp = c.codePointAt(0) as number
  // ASCII symbols count as punctuation here, as BERT's own tokenizer has them.
  if ((cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96)) return true
  if (cp >= 123 && cp <= 126) return true
  return /\p{P}/u.test(c)
}
const isCjk = (cp: number) =>
  (cp >= 0x4e00 && cp <= 0x9fff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) ||
  (cp >= 0x20000 && cp <= 0x2a6df) ||
  (cp >= 0x2a700 && cp <= 0x2b73f) ||
  (cp >= 0x2b740 && cp <= 0x2b81f) ||
  (cp >= 0x2b820 && cp <= 0x2ceaf) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0x2f800 && cp <= 0x2fa1f)

/** Cleaned, spaced around Chinese characters, accents taken off, lowercased: then split. */
function basicWords(text: string): string[] {
  let s = ''
  for (const c of text) {
    const cp = c.codePointAt(0) as number
    if (cp === 0 || cp === 0xfffd || isControl(c)) continue
    if (isWhitespace(c)) s += ' '
    else if (isCjk(cp)) s += ` ${c} `
    else s += c
  }
  // Lowercased a character at a time, as it was trained (no final sigma).
  s = Array.from(s.normalize('NFD').replace(/\p{Mn}/gu, ''), (c) => c.toLowerCase()).join('')
  const words: string[] = []
  for (const chunk of s.split(' ')) {
    let cur = ''
    for (const c of chunk) {
      if (isPunctuation(c)) {
        if (cur) words.push(cur)
        words.push(c)
        cur = ''
      } else {
        cur += c
      }
    }
    if (cur) words.push(cur)
  }
  return words
}

/** A word as the vocabulary's pieces — longest first — or unknown as a whole. */
function pieces(word: string, vocab: Map<string, number>): string[] {
  const chars = Array.from(word)
  if (chars.length > MAX_WORD_CHARS) return [UNK]
  const out: string[] = []
  let start = 0
  while (start < chars.length) {
    let end = chars.length
    let found: string | null = null
    while (start < end) {
      const sub = (start > 0 ? '##' : '') + chars.slice(start, end).join('')
      if (vocab.has(sub)) {
        found = sub
        break
      }
      end--
    }
    if (found === null) return [UNK]
    out.push(found)
    start = end
  }
  return out
}

/** Whether a word is a whole word the model knows — an ordinary one, mostly, not a name. */
export function isWord(word: string): boolean {
  return model().vocab.has(word)
}

/** The model's token ids for a text: [CLS], its pieces (as many as fit), [SEP]. */
export function tokenIds(text: string): number[] {
  const { vocab } = model()
  const ids: number[] = []
  for (const w of basicWords(text)) {
    for (const p of pieces(w, vocab)) ids.push(vocab.get(p) as number)
  }
  return [vocab.get(CLS) as number, ...ids.slice(0, MAX_TOKENS - 2), vocab.get(SEP) as number]
}

// --- The model ----------------------------------------------------------------

/** erf, to within about 1e-7 (Numerical Recipes' erfc): the model's GELU is the exact one. */
function erf(x: number): number {
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    )
  return x >= 0 ? 1 - r : r - 1
}

/** out[t] = x[t]·W + b, for each of T rows of x; W kept a row for each output. */
function linear(
  x: Float32Array,
  T: number,
  w: Q8,
  b: Float32Array,
  group: number,
  out: Float32Array
): void {
  const { rows, cols, q, s } = w
  const groups = cols / group
  const row = new Float64Array(cols)
  for (let j = 0; j < rows; j++) {
    const ro = j * cols
    const so = j * groups
    for (let g = 0; g < groups; g++) {
      const scale = s[so + g]
      const base = g * group
      for (let i = 0; i < group; i++) row[base + i] = q[ro + base + i] * scale
    }
    // Four tokens at a time: each weight read once for the four.
    let t = 0
    for (; t + 4 <= T; t += 4) {
      const o0 = t * cols
      const o1 = o0 + cols
      const o2 = o1 + cols
      const o3 = o2 + cols
      let a0 = 0
      let a1 = 0
      let a2 = 0
      let a3 = 0
      for (let i = 0; i < cols; i++) {
        const wi = row[i]
        a0 += x[o0 + i] * wi
        a1 += x[o1 + i] * wi
        a2 += x[o2 + i] * wi
        a3 += x[o3 + i] * wi
      }
      out[t * rows + j] = a0 + b[j]
      out[(t + 1) * rows + j] = a1 + b[j]
      out[(t + 2) * rows + j] = a2 + b[j]
      out[(t + 3) * rows + j] = a3 + b[j]
    }
    for (; t < T; t++) {
      const xo = t * cols
      let a = 0
      for (let i = 0; i < cols; i++) a += x[xo + i] * row[i]
      out[t * rows + j] = a + b[j]
    }
  }
}

/** x[t] = LayerNorm(x[t] + add[t]), for each row. */
function addNorm(
  x: Float32Array,
  add: Float32Array | null,
  T: number,
  H: number,
  w: Float32Array,
  b: Float32Array
): void {
  for (let t = 0; t < T; t++) {
    const o = t * H
    let mean = 0
    for (let i = 0; i < H; i++) {
      if (add) x[o + i] += add[o + i]
      mean += x[o + i]
    }
    mean /= H
    let v = 0
    for (let i = 0; i < H; i++) {
      const d = x[o + i] - mean
      v += d * d
    }
    const inv = 1 / Math.sqrt(v / H + 1e-12)
    for (let i = 0; i < H; i++) x[o + i] = (x[o + i] - mean) * inv * w[i] + b[i]
  }
}

/** Where a text's meaning lies: 384 numbers, unit length. */
export function embed(text: string): Float32Array {
  const m = model()
  const ids = tokenIds(text)
  const T = ids.length
  const H = m.hidden
  const G = m.group
  const heads = m.heads
  const D = H / heads

  // Each token's word, its place, and its segment.
  const x = new Float32Array(T * H)
  const groups = H / G
  for (let t = 0; t < T; t++) {
    const wo = ids[t] * H
    const po = t * H
    for (let i = 0; i < H; i++) {
      x[t * H + i] =
        m.words.q[wo + i] * m.words.s[ids[t] * groups + ((i / G) | 0)] +
        m.positions.q[po + i] * m.positions.s[t * groups + ((i / G) | 0)] +
        m.type0[i]
    }
  }
  addNorm(x, null, T, H, m.embLnW, m.embLnB)

  const q = new Float32Array(T * H)
  const k = new Float32Array(T * H)
  const v = new Float32Array(T * H)
  const ctx = new Float32Array(T * H)
  const att = new Float32Array(T * H)
  const up = new Float32Array(T * m.layers[0].up.rows)
  const down = new Float32Array(T * H)
  const scores = new Float64Array(T)
  const scale = 1 / Math.sqrt(D)

  for (const L of m.layers) {
    linear(x, T, L.query, L.queryB, G, q)
    linear(x, T, L.key, L.keyB, G, k)
    linear(x, T, L.value, L.valueB, G, v)
    for (let h = 0; h < heads; h++) {
      const ho = h * D
      for (let t1 = 0; t1 < T; t1++) {
        let max = -Infinity
        for (let t2 = 0; t2 < T; t2++) {
          let dot = 0
          for (let d = 0; d < D; d++) dot += q[t1 * H + ho + d] * k[t2 * H + ho + d]
          scores[t2] = dot * scale
          if (scores[t2] > max) max = scores[t2]
        }
        let sum = 0
        for (let t2 = 0; t2 < T; t2++) {
          scores[t2] = Math.exp(scores[t2] - max)
          sum += scores[t2]
        }
        for (let d = 0; d < D; d++) {
          let c = 0
          for (let t2 = 0; t2 < T; t2++) c += scores[t2] * v[t2 * H + ho + d]
          ctx[t1 * H + ho + d] = c / sum
        }
      }
    }
    linear(ctx, T, L.out, L.outB, G, att)
    addNorm(x, att, T, H, L.ln1W, L.ln1B)
    linear(x, T, L.up, L.upB, G, up)
    for (let i = 0; i < up.length; i++) up[i] = 0.5 * up[i] * (1 + erf(up[i] / Math.SQRT2))
    linear(up, T, L.down, L.downB, G, down)
    addNorm(x, down, T, H, L.ln2W, L.ln2B)
  }

  // The mean of every token, made unit length.
  const out = new Float32Array(H)
  for (let t = 0; t < T; t++) for (let i = 0; i < H; i++) out[i] += x[t * H + i] / T
  let norm = 0
  for (let i = 0; i < H; i++) norm += out[i] * out[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < H; i++) out[i] /= norm
  return out
}

/** How alike two meanings are: 1 the same, 0 unrelated. */
export function similarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}
