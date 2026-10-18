import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DictionaryBrowse } from '@zenbu/dictionary-core/artifact/browse'
import { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import {
  type RetiredEntriesFile,
  retiredEntries,
  retiredEntriesFile
} from '@zenbu/dictionary-core/artifact/retired'
import { wordCardInputs } from '@zenbu/dictionary-core/artifact/word-cards'
import { artifactFile, fileSha256, openArtifact } from './artifact'
import { inProcessService, type ServiceInfo } from './service'
import { loadSudachi, prepareSudachi, sudachiContract } from './sudachi'
import { loadTokenizer } from './tokenizer'

export interface VerifiedFiles {
  resources: string
  artifactSha256: string
  languageDataRelease: string
  languageDataFiles: Record<string, string>
  retiredEntries: string
  sudachiDictionary: string | null
  release: string
}

interface PinnedManifest {
  files: { name: string; sha256: string }[]
}

async function readPinnedManifest(releases: string, release: string): Promise<PinnedManifest> {
  const path = join(releases, release, 'manifest.json')
  const text = await readFile(path, 'utf8').catch((error: unknown) => {
    throw new Error(`Language-data release ${release} has no pinned manifest at ${path}`, {
      cause: error
    })
  })
  return JSON.parse(text) as PinnedManifest
}

async function requirePinnedRelease(
  releases: string,
  release: string,
  files: Record<string, string>
): Promise<void> {
  const pinned = new Map(
    (await readPinnedManifest(releases, release)).files.map(file => [file.name, file.sha256])
  )
  const differing = Object.entries(files).flatMap(([name, sha256]) => {
    const expected = pinned.get(name)
    if (expected === sha256) return []
    return [`${name} is ${sha256}, ${expected ? `the release has ${expected}` : 'not in it'}`]
  })
  if (differing.length > 0) {
    throw new Error(
      `These aren't language-data release ${release}'s files: ${differing.join('; ')}. ` +
        'Restore them (git lfs pull), or pin a new release (language-data/README.md)'
    )
  }
}

export async function verifyFiles(options: {
  resources: string
  languageDataRelease: string
  languageDataReleases: string
  languageDataDerived: string
  sudachiDictionary: string | null
  release: string
}): Promise<VerifiedFiles> {
  const { release: languageDataRelease } = JSON.parse(
    await readFile(options.languageDataRelease, 'utf8')
  ) as { release: string }
  const retired = join(options.languageDataDerived, retiredEntriesFile)
  const [inputs, retiredSha256, sudachiSha256] = await Promise.all([
    Promise.all(
      wordCardInputs.map(
        async name => [name, await fileSha256(join(options.resources, name))] as const
      )
    ),
    fileSha256(retired),
    options.sudachiDictionary ? fileSha256(options.sudachiDictionary) : Promise.resolve(null)
  ])
  const languageDataFiles: Record<string, string> = Object.fromEntries(inputs)
  await requirePinnedRelease(options.languageDataReleases, languageDataRelease, {
    ...languageDataFiles,
    [retiredEntriesFile]: retiredSha256
  })
  const artifactSha256 = languageDataFiles[artifactFile]
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
  return {
    ...options,
    artifactSha256,
    languageDataRelease,
    languageDataFiles,
    retiredEntries: retired
  }
}

export function loadService(files: VerifiedFiles) {
  const artifact = openArtifact(files.resources, files.artifactSha256)
  const tokenize = loadTokenizer(join(files.resources, 'Kuromoji'))
  const morphology = files.sudachiDictionary ? loadSudachi(files.sudachiDictionary) : undefined
  const retired = JSON.parse(readFileSync(files.retiredEntries, 'utf8')) as RetiredEntriesFile
  const dictionary = new Dictionary({
    db: artifact.db,
    kanji: artifact.kanji,
    retired: retiredEntries(retired, files.artifactSha256),
    capabilities: { tokenize, ...(morphology ? { morphology } : {}) }
  })
  const info: ServiceInfo = {
    build: `${files.artifactSha256.slice(0, 12)}-${files.release}`,
    artifact: { name: artifactFile, sha256: files.artifactSha256 },
    languageData: { release: files.languageDataRelease, files: files.languageDataFiles },
    features: dictionary.features
  }
  const browse = new DictionaryBrowse(artifact.db, artifact.kanji)
  browse.warm()
  return { service: inProcessService(dictionary, browse, info), close: artifact.close }
}
