// What the app-recorded conformance suites (apps/ios/LanguageData/Conformance, ADR 0006) run
// against: the service's dictionary, on the app's bundled files, with Kuromoji and, when its
// dictionary is present, Sudachi. They run wherever those files are real rather than Git LFS
// pointers; `pnpm sudachi` fetches Sudachi's dictionary.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import type { MorphologyAnalyzer } from '@zenbu/dictionary-core/search/search'
import { artifactFile, fileSha256, type OpenedArtifact, openArtifact } from '../artifact'
import { loadKuromoji } from '../kuromoji'
import { loadSudachi, prepareSudachi, sudachiContract } from '../sudachi'

const repository = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')
export const resources = join(repository, 'apps/ios/Modules/Sources/SearchExperience/Resources')
const suites = join(repository, 'apps/ios/LanguageData/Conformance')
const sudachiDictionary = join(repository, 'apps/dictionary-api/.sudachi/system_core.dic')

/** Whether the app's bundled files are here, not Git LFS pointers. */
export const artifactAvailable = (() => {
  try {
    return !readFileSync(join(resources, artifactFile))
      .subarray(0, 7)
      .toString()
      .startsWith('version')
  } catch {
    return false
  }
})()

/** Whether Sudachi's dictionary has been fetched (`pnpm sudachi`). */
export const sudachiAvailable = existsSync(sudachiDictionary)

export function readSuite<Suite>(name: string): Suite {
  return JSON.parse(readFileSync(join(suites, `${name}.json`), 'utf8')) as Suite
}

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

/**
 * Throws unless each file a suite pins is the one in the repository: a suite recorded from other
 * data compares nothing useful.
 */
export function requirePinnedArtifacts(artifacts: { name: string; sha256: string }[]): void {
  const mismatched = artifacts.flatMap(({ name, sha256: pinned }) => {
    const path = join(resources, name)
    if (!existsSync(path)) return []
    const actual = sha256(path)
    return actual === pinned ? [] : [`${name} is ${actual}, the suite pins ${pinned}`]
  })
  if (mismatched.length > 0) {
    throw new Error(`The suite was recorded from other files: ${mismatched.join('; ')}`)
  }
}

let opened: Promise<{
  artifact: OpenedArtifact
  tokenize: ReturnType<typeof loadKuromoji>
}> | null = null
let sudachi: MorphologyAnalyzer | null = null

async function open() {
  opened ??= (async () => {
    const artifact = openArtifact(resources, await fileSha256(join(resources, artifactFile)))
    return { artifact, tokenize: loadKuromoji(join(resources, 'Kuromoji')) }
  })()
  return opened
}

/** Sudachi with the app's dictionary, when it has been fetched. */
export function sudachiAnalyzer(): MorphologyAnalyzer | undefined {
  if (!sudachiAvailable) return undefined
  if (!sudachi) {
    prepareSudachi(sudachiContract(resources), sudachiDictionary)
    sudachi = loadSudachi(sudachiDictionary)
  }
  return sudachi
}

/**
 * The service's dictionary. `morphology` supplies Sudachi, for suites recorded with full text
 * analysis; a suite recorded with reduced analysis runs without it, as the app did.
 */
export async function dictionary(options: { morphology: boolean }): Promise<Dictionary> {
  const { artifact, tokenize } = await open()
  const morphology = options.morphology ? sudachiAnalyzer() : undefined
  return new Dictionary({
    db: artifact.db,
    kanji: artifact.kanji,
    capabilities: { tokenize, ...(morphology ? { morphology } : {}) }
  })
}

export async function artifactDatabase() {
  return (await open()).artifact.db
}
