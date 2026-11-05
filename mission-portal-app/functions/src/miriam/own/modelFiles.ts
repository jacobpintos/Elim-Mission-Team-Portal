import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * Where Miriam's model files come from: the model (./encoder), its vocabulary,
 * and her starting examples' meanings (./understand).
 *
 * In the repository they are in functions/models/minilm, and the app's tests,
 * the scripts and the emulator read them from there. A deployed function has
 * no such folder. The functions deploy leaves it out (firebase.json:
 * functions.ignore), because otherwise all 24 MB went into every function's
 * source. The deploy puts the files in Cloud Storage first
 * (../../scripts/uploadModel), and the functions that read requests fetch them
 * from there (../model: loadModel) and hand them over here.
 *
 * Nothing here uses firebase-admin, so the app's tests need nothing from it.
 */

/** The repository's folder, from here (src/ or lib/, the same depth). */
export const MODEL_DIR = join(__dirname, '..', '..', '..', 'models', 'minilm')

export const MODEL_FILES = ['model.bin', 'vocab.txt', 'seedVectors.json'] as const
export type ModelFileName = (typeof MODEL_FILES)[number]

const given = new Map<ModelFileName, Buffer>()

/** Whether the files are in the repository's folder, so there is nothing to fetch. */
export const modelHere = (): boolean => existsSync(join(MODEL_DIR, 'model.bin'))

/** The files, as fetched from Cloud Storage (../model). */
export function giveModelFiles(files: Record<ModelFileName, Buffer>): void {
  for (const name of MODEL_FILES) given.set(name, files[name])
}

/** One of the files: as handed over, or else from the repository's folder. */
export function modelFile(name: ModelFileName): Buffer {
  const got = given.get(name)
  if (got) return got
  const path = join(MODEL_DIR, name)
  if (!existsSync(path)) {
    throw new Error(`Miriam's ${name} hasn't been fetched: await loadModel() (miriam/model) first`)
  }
  return readFileSync(path)
}
