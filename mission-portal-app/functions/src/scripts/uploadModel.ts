/**
 * Puts Miriam's model files (functions/models/minilm) in Cloud Storage, where
 * the deployed functions fetch them from (../miriam/model). The deploy runs
 * this before it deploys the functions, because their source doesn't include
 * the files (firebase.json: functions.ignore).
 *
 *   node functions/lib/scripts/uploadModel.js <bucket>
 *
 * Uses the deploy's credentials (GOOGLE_APPLICATION_CREDENTIALS). The bucket
 * must be the project's default one, which is the bucket the functions read:
 * firebase.json's storage bucket. A file that is already there unchanged is
 * not uploaded again.
 */
import { createHash } from 'crypto'
import * as admin from 'firebase-admin'
import { MODEL_STORAGE_DIR } from '../miriam/model'
import { MODEL_FILES, modelFile, modelHere, MODEL_DIR } from '../miriam/own/modelFiles'

const CONTENT_TYPES = {
  'model.bin': 'application/octet-stream',
  'vocab.txt': 'text/plain; charset=utf-8',
  'seedVectors.json': 'application/json',
} as const

async function upload(bucketName: string) {
  if (!modelHere()) throw new Error(`No model in ${MODEL_DIR}`)
  if (!admin.apps.length) admin.initializeApp()
  const bucket = admin.storage().bucket(bucketName)
  for (const name of MODEL_FILES) {
    const data = modelFile(name)
    const md5 = createHash('md5').update(data).digest('base64')
    const file = bucket.file(`${MODEL_STORAGE_DIR}/${name}`)
    const [there] = await file.exists()
    if (there) {
      const [meta] = await file.getMetadata()
      if (meta.md5Hash === md5) {
        console.log(`${file.name}: unchanged`)
        continue
      }
    }
    await file.save(data, { resumable: false, contentType: CONTENT_TYPES[name] })
    console.log(`${file.name}: uploaded (${data.length} bytes)`)
  }
}

const bucketName = process.argv[2]
if (!bucketName || bucketName === 'null') {
  console.error('Usage: node lib/scripts/uploadModel.js <bucket>')
  process.exit(1)
}
upload(bucketName)
  .then(() => {
    console.log(`Miriam's model is in gs://${bucketName}/${MODEL_STORAGE_DIR}.`)
    process.exit(0)
  })
  .catch((err) => {
    console.error('Uploading the model failed:', err)
    process.exit(1)
  })
