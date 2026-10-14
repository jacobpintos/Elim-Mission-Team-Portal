import { describe, expect, it } from 'vitest'
import { embed, similarity, tokenIds } from '../../functions/src/miriam/own/encoder'
import fixture from './__fixtures__/miriamEncoder.json'

/**
 * Miriam's own language model (functions/src/miriam/own/encoder) against the
 * original's own output: the original tokenizer's ids, and the original
 * model's sentence embeddings, made by scripts/miriam-model/convert.py.
 */

describe('her tokenizer', () => {
  it.each(fixture.tokens.map((t) => [t.text.slice(0, 50), t] as const))(
    'splits %j as the original does',
    (_, t) => {
      expect(tokenIds(t.text)).toEqual(t.ids)
    }
  )
})

describe('her model', () => {
  it.each(fixture.embeddings.map((e) => [e.text.slice(0, 50), e] as const))(
    'reads %j as the original does',
    (_, e) => {
      // Her weights are 8-bit: within a hair of the original's meaning.
      expect(similarity(embed(e.text), e.vector)).toBeGreaterThan(0.999)
    }
  )

  it('gives unit-length meanings', () => {
    const v = embed('What time is Youth Night?')
    expect(v).toHaveLength(384)
    expect(similarity(v, v)).toBeCloseTo(1, 5)
  })

  it('puts the same meaning, worded differently, closer than another', () => {
    const asked = embed('when does youth night kick off')
    expect(similarity(asked, embed('What time is Youth Night?'))).toBeGreaterThan(
      similarity(asked, embed('Where is Youth Night?'))
    )
    const away = embed("I won't be able to come to the retreat")
    expect(similarity(away, embed("I can't make it to the retreat"))).toBeGreaterThan(
      similarity(away, embed('What time is the retreat?'))
    )
  })
})
