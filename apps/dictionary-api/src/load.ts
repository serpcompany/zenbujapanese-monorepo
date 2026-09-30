// Loads the dictionary from the app's files: once per worker thread, after the main thread has
// checked the large files' SHA-256s (`verifyFiles`), so each thread only opens them.

import { join } from 'node:path'
import { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { artifactFile, fileSha256, openArtifact } from './artifact'
import { loadKuromoji } from './kuromoji'
import { inProcessService, type ServiceInfo } from './service'
import { loadSudachi, prepareSudachi, sudachiContract } from './sudachi'

/** What every thread loads from, checked once. */
export interface VerifiedFiles {
  resources: string
  artifactSha256: string
  /** Sudachi's dictionary, checked against the app's pin; null leaves sentence search off. */
  sudachiDictionary: string | null
  release: string
}

/**
 * Hashes LanguageReferenceData.sqlite3, which the packs must have been built for, and Sudachi's
 * dictionary, which must be the one the app pins, then configures Sudachi. Throws on a mismatch.
 * Runs on the main thread, before any worker starts.
 */
export async function verifyFiles(options: {
  resources: string
  sudachiDictionary: string | null
  release: string
}): Promise<VerifiedFiles> {
  const [artifactSha256, sudachiSha256] = await Promise.all([
    fileSha256(join(options.resources, artifactFile)),
    options.sudachiDictionary ? fileSha256(options.sudachiDictionary) : Promise.resolve(null)
  ])
  if (options.sudachiDictionary && sudachiSha256 !== null) {
    const contract = sudachiContract(options.resources)
    if (sudachiSha256 !== contract.installedSHA256) {
      throw new Error(
        `${options.sudachiDictionary} is ${sudachiSha256}, not the app's Sudachi dictionary ` +
          contract.installedSHA256
      )
    }
    prepareSudachi(contract, options.sudachiDictionary)
  }
  return { ...options, artifactSha256 }
}

/** The dictionary and its service, in this thread. */
export function loadService(files: VerifiedFiles) {
  const artifact = openArtifact(files.resources, files.artifactSha256)
  const tokenize = loadKuromoji(join(files.resources, 'Kuromoji'))
  const morphology = files.sudachiDictionary ? loadSudachi(files.sudachiDictionary) : undefined
  const dictionary = new Dictionary({
    db: artifact.db,
    kanji: artifact.kanji,
    capabilities: { tokenize, ...(morphology ? { morphology } : {}) }
  })
  const info: ServiceInfo = {
    build: `${files.artifactSha256.slice(0, 12)}-${files.release}`,
    artifact: { name: artifactFile, sha256: files.artifactSha256 },
    features: dictionary.features
  }
  return { service: inProcessService(dictionary, info), close: artifact.close }
}
