import { readFileSync } from 'fs'
import { join } from 'path'
import { embed, similarity } from './encoder'
import { SEEDS, asRead, asShown, type Skill } from './skills'
import { unpackVector } from './vectors'

/**
 * What a request means, as Miriam reads it: which of her skills it is
 * (./skills), by the examples whose meaning it is nearest — her starting ones
 * and those she has learned (./learn) — and how sure she is.
 *
 * Each skill is scored by its few nearest examples, so one odd example
 * doesn't decide it; the request is hers only when one skill is near enough
 * and plainly nearer than the next (./index: SURE, CLEAR).
 */

export interface Example {
  text: string
  skill: Skill
  v: Float32Array
}

export interface Reading {
  skill: Skill
  /** How near its nearest examples are, 0–1. */
  score: number
  /** How much nearer than the next skill. */
  margin: number
  /** The example it is nearest, to say why. */
  nearest: string
}

/** Each skill scored by the mean of this many of its nearest examples. */
const NEAREST = 3

let stored: Record<string, string> | null = null
/** A meaning worked out ahead of time (scripts/miriam-model/seeds.js), by its text, or null. */
export function storedMeaning(text: string): Float32Array | null {
  stored ??= JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', 'models', 'minilm', 'seedVectors.json'), 'utf8')
  ) as Record<string, string>
  return stored[text] ? unpackVector(stored[text]) : null
}

let seeds: Example[] | null = null
/** Her starting examples, with their meanings as worked out ahead of time. */
export function seedExamples(): Example[] {
  if (seeds) return seeds
  seeds = []
  for (const [skill, texts] of Object.entries(SEEDS) as [Skill, string[]][]) {
    for (const text of texts) {
      // One not worked out yet (the script not run since it was added): worked out now.
      const v = storedMeaning(text) ?? embed(asRead(text))
      seeds.push({ text: asShown(text), skill, v })
    }
  }
  return seeds
}

/** Which skill a request's meaning `v` is, among these examples. */
export function read(v: Float32Array, examples: readonly Example[]): Reading {
  const bySkill = new Map<Skill, { sim: number; text: string }[]>()
  for (const ex of examples) {
    const list = bySkill.get(ex.skill) ?? []
    list.push({ sim: similarity(v, ex.v), text: ex.text })
    bySkill.set(ex.skill, list)
  }
  const scored = [...bySkill.entries()].map(([skill, list]) => {
    list.sort((a, b) => b.sim - a.sim)
    const top = list.slice(0, NEAREST)
    return {
      skill,
      score: top.reduce((a, b) => a + b.sim, 0) / top.length,
      nearest: top[0].text,
    }
  })
  scored.sort((a, b) => b.score - a.score)
  const [best, next] = scored
  return {
    skill: best.skill,
    score: best.score,
    margin: next ? best.score - next.score : best.score,
    nearest: best.nearest,
  }
}
