# Miriam's language model

`model.bin` is **all-MiniLM-L6-v2** by sentence-transformers (Apache-2.0, `LICENSE`
here), the small open-source transformer Miriam reads requests with
(`functions/src/miriam/own/encoder.ts`). It turns a sentence into 384 numbers
that say what it means, so two sentences that mean the same land close
together however they are worded.

- **From:** Chroma's copy, which every Chroma install downloads:
  `https://chroma-onnx-models.s3.amazonaws.com/all-MiniLM-L6-v2/onnx.tar.gz`,
  sha256 `913d7300ceae3b2dbc2c50d1de4baacab4be7b9380491c27fab7418616a16ec3`
  (Chroma's published checksum, verified).
- **Changed:** the weights only, stored as 8-bit numbers with one scale per 64
  weights (about a quarter of the size). Her embeddings are within 0.999 of
  the original's (`src/lib/miriamEncoder.test.ts` checks it). Nothing else.
- **Made with:** `scripts/miriam-model/convert.py`, which also writes the
  reference the tests compare against.

`vocab.txt` is the model's own vocabulary, unchanged.

`seedVectors.json` holds the meanings of her starting examples
(`functions/src/miriam/own/skills.ts`), worked out ahead of time so the server
never computes them at startup. After you change the examples, run:

    npm --prefix functions run build && node scripts/miriam-model/seeds.js

A test fails until every example has its meaning here.
