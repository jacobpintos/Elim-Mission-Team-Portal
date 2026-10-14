"""
Makes Miriam's language model file (functions/models/minilm/model.bin) from
the original all-MiniLM-L6-v2 ONNX model, and the reference the app's tests
check her TypeScript copy against (src/lib/__fixtures__/miriamEncoder.json).

The original: sentence-transformers/all-MiniLM-L6-v2 (Apache-2.0), as Chroma
ships it to every install —
  https://chroma-onnx-models.s3.amazonaws.com/all-MiniLM-L6-v2/onnx.tar.gz
  sha256 913d7300ceae3b2dbc2c50d1de4baacab4be7b9380491c27fab7418616a16ec3
(Chroma's published checksum, chromadb/utils/embedding_functions/onnx_mini_lm_l6_v2.py).

  pip install onnx onnxruntime numpy tokenizers
  python -I convert.py <extracted onnx folder> <functions/models/minilm> <src/lib/__fixtures__>

What it changes: the weights are kept as 8-bit numbers with one scale for
each 64 of them (a quarter of the size; embeddings within 0.9995 of the
original's), each layer's weights stored by output. Nothing else.
"""
import json
import shutil
import struct
import sys

import numpy as np
import onnx
import onnxruntime as ort
from onnx import numpy_helper
from tokenizers import Tokenizer

GROUP = 64

src, out_dir, fixtures_dir = sys.argv[1], sys.argv[2], sys.argv[3]

# --- The weights, by name: each layer's matrix found through the graph's own MatMul -> Add(bias).
graph = onnx.load(src + '/model.onnx').graph
inits = {i.name: numpy_helper.to_array(i) for i in graph.initializer}
producer = {o: n for n in graph.node for o in n.output}
P = {k: v for k, v in inits.items() if not k.startswith('onnx::') and k != 'embeddings.position_ids'}
for n in graph.node:
    if n.op_type != 'Add':
        continue
    bias = [i for i in n.input if i in inits and i.endswith('.bias') and 'LayerNorm' not in i]
    if not bias:
        continue
    mm = producer[[i for i in n.input if i not in inits][0]]
    assert mm.op_type == 'MatMul'
    P[bias[0][: -len('.bias')] + '.weight'] = inits[[i for i in mm.input if i in inits][0]]  # [in, out]


def q8(rows):
    """int8, one scale per GROUP along each row."""
    r, c = rows.shape
    assert c % GROUP == 0
    g = rows.reshape(r, c // GROUP, GROUP)
    s = np.abs(g).max(-1, keepdims=True) / 127
    s[s == 0] = 1
    q = np.round(g / s).clip(-127, 127).astype(np.int8).reshape(r, c)
    return q, s.reshape(r, c // GROUP).astype(np.float32)


tensors, blobs, offset = {}, [], 0


def add(name, kind, shape, *parts):
    global offset
    entry = {'type': kind, 'shape': list(shape)}
    for label, data in zip(('offset', 'scales'), parts):
        raw = data.tobytes()
        entry[label] = offset
        blobs.append(raw + b'\0' * (-len(raw) % 4))
        offset += len(raw) + (-len(raw) % 4)
    tensors[name] = entry


for name in sorted(P):
    w = P[name].astype(np.float32)
    if w.ndim == 2 and name in ('embeddings.word_embeddings.weight', 'embeddings.position_embeddings.weight'):
        add(name, 'q8', w.shape, *q8(w))  # a row per token, or position
    elif w.ndim == 2 and name != 'embeddings.token_type_embeddings.weight':
        rows = np.ascontiguousarray(w.T)  # a row per output
        add(name, 'q8', rows.shape, *q8(rows))
    else:
        add(name, 'f32', w.shape, w)

header = json.dumps(
    {
        'model': 'sentence-transformers/all-MiniLM-L6-v2',
        'group': GROUP,
        'layers': 6,
        'hidden': 384,
        'heads': 12,
        'tensors': tensors,
    }
).encode()
header += b' ' * (-(8 + len(header)) % 4)
with open(out_dir + '/model.bin', 'wb') as f:
    f.write(b'MML1' + struct.pack('<I', len(header)) + header)
    for b in blobs:
        f.write(b)
shutil.copy(src + '/vocab.txt', out_dir + '/vocab.txt')

# --- The reference: the original tokenizer's ids, and the original model's embeddings.
tok = Tokenizer.from_file(src + '/tokenizer.json')
tok.no_padding()
tok.enable_truncation(128)
sess = ort.InferenceSession(src + '/model.onnx', providers=['CPUExecutionProvider'])

TOKENS = [
    'What time is Youth Night?',
    "where's the retreat this weekend",
    'remind me to call Sam at 3:50 tomorrow',
    "I can't make it to revival on Friday",
    'Héllo wörld — naïve café, 10:30am!!',
    'ÀÉÎÕÜ àéîõü Ççñß ŒœÆæ',
    '中文 字符 and 日本語 mixed',
    'emoji 🙏🎉 and symbols $5 + 3 = 8 <tag> ^caret^ `tick` |pipe| ~tilde~',
    'tabs\tand\nnewlines\r\nand   spaces',
    'İstanbul ǅemal ﬁne ﬂow',
    'supercalifragilisticexpialidocious antidisestablishmentarianism',
    'x' * 120,
    'e-mail: sam@example.com, https://example.com/path?q=1&r=2#frag',
    '“Smart quotes” ‘single’ «guillemets» — en–dash … ellipsis',
    "O'Neil's café—the 3rd/4th of July (approx.) ~5pm",
    'Kauaʻi Oʻahu Hawaiʻi Molokaʻi',
    'zero​width‍things﻿here',
    '',
    ' ',
    'A. B. C. D.',
    '¿Dónde está la iglesia? ¡Vamos!',
    'naïve coöperate façade résumé',
    'FIRST SECOND third FoUrTh',
    '1,000,000 3.14159 1e10 007',
    'the Well of Iowa mission team 2026 summer trip to the Dominican Republic',
    ' '.join(['word'] * 200),
]
EMBED = [
    'What time is Youth Night?',
    "where's the retreat this weekend",
    'remind me to call Sam at 3:50 tomorrow',
    "I can't make it to revival on Friday",
    'what do I have going on this week',
    "Hey Miriam, what's the dress code for Sunday's service?",
    'look up Costco hours',
    'Héllo wörld — naïve café, 10:30am!!',
    'The Well of Iowa is a church with a mission team that serves overseas every summer.',
    '',
    'ok',
    ' '.join(['word'] * 200),
]


def embed(text):
    ids = tok.encode(text).ids
    a = np.array([ids], dtype=np.int64)
    h = sess.run(None, {'input_ids': a, 'attention_mask': np.ones_like(a), 'token_type_ids': np.zeros_like(a)})[0][0]
    m = h.mean(0)
    return (m / np.linalg.norm(m)).tolist()


fixture = {
    'tokens': [{'text': t, 'ids': tok.encode(t).ids} for t in TOKENS],
    'embeddings': [{'text': t, 'vector': [round(x, 6) for x in embed(t)]} for t in EMBED],
}
with open(fixtures_dir + '/miriamEncoder.json', 'w') as f:
    json.dump(fixture, f, ensure_ascii=False, separators=(',', ':'))
print('model.bin', offset + 8 + len(header), 'bytes;', len(tensors), 'tensors')
