import * as admin from 'firebase-admin'
import { giveModelFiles, MODEL_FILES, modelHere, type ModelFileName } from './own/modelFiles'

/**
 * Miriam's model files in Cloud Storage, in the project's default bucket. The
 * deploy puts them there before it deploys the functions
 * (../scripts/uploadModel), because the functions' source doesn't include them
 * (./own/modelFiles). No Storage rule matches this folder, so no device can
 * read or write it.
 */
export const MODEL_STORAGE_DIR = 'miriam/models/minilm'

let loading: Promise<void> | null = null

/**
 * Fetches the model's files into memory, once for each server instance (about
 * 25 MB). In the repository there is nothing to fetch, so this resolves at
 * once. If a fetch fails, the next call tries again.
 *
 * askMiriam starts this at cold start. miriamOwnAdmin and readChurchSite call
 * it only when they need the model.
 */
export function loadModel(): Promise<void> {
  if (modelHere()) return Promise.resolve()
  loading ??= fetchModel().catch((err: unknown) => {
    loading = null
    throw err
  })
  return loading
}

async function fetchModel(): Promise<void> {
  if (!admin.apps.length) admin.initializeApp()
  const bucket = admin.storage().bucket()
  const files = await Promise.all(
    MODEL_FILES.map(async (name) => {
      const [data] = await bucket.file(`${MODEL_STORAGE_DIR}/${name}`).download()
      return [name, data] as const
    })
  )
  giveModelFiles(Object.fromEntries(files) as Record<ModelFileName, Buffer>)
}
