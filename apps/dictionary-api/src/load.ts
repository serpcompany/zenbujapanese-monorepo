import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DictionaryBrowse } from '@zenbu/dictionary-core/artifact/browse'
import { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { artifactFile, fileSha256, openArtifact } from './artifact'
import { loadKuromoji } from './kuromoji'
import { inProcessService, type ServiceInfo } from './service'
import { loadSudachi, prepareSudachi, sudachiContract } from './sudachi'

export interface VerifiedFiles {
  resources: string
  artifactSha256: string
  languageDataRelease: string
  sudachiDictionary: string | null
  release: string
}

export async function verifyFiles(options: {
  resources: string
  languageDataRelease: string
  sudachiDictionary: string | null
  release: string
}): Promise<VerifiedFiles> {
  const { release: languageDataRelease } = JSON.parse(
    await readFile(options.languageDataRelease, 'utf8')
  ) as { release: string }
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
  return { ...options, artifactSha256, languageDataRelease }
}

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
    languageData: {
      release: files.languageDataRelease,
      file: artifactFile,
      sha256: files.artifactSha256
    },
    features: dictionary.features
  }
  const browse = new DictionaryBrowse(artifact.db, artifact.kanji)
  browse.warm()
  return { service: inProcessService(dictionary, browse, info), close: artifact.close }
}
