// The app's Sudachi, the dictionary core's `morphology` capability (sentence search): Sudachi.rs
// through @nikkei/napi-sudachi, which builds the same engine and runtime commit the app's
// sudachi-swift does, with the SudachiDict Core dictionary the app installs. Both are pinned by
// the app's LanguageTechnologyPackCatalog.json and checked, as SudachiCoreContract checks them.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { MorphologyAnalyzer } from '@zenbu/dictionary-core/search/search'

const require = createRequire(import.meta.url)

/** The pack the app installs for Japanese text analysis, from its catalog. */
export interface SudachiContract {
  packId: string
  engineVersion: string
  runtimeResourceCommit: string
  downloadURL: string
  downloadSHA256: string
  archiveEntry: string
  installedSHA256: string
  characterDefinitionSHA256: string
  unknownDefinitionSHA256: string
}

/** The app's Sudachi pack, from LanguageTechnologyPackCatalog.json in `resources`. */
export function sudachiContract(resources: string): SudachiContract {
  const catalog = JSON.parse(
    readFileSync(join(resources, 'LanguageTechnologyPackCatalog.json'), 'utf8')
  ) as { packs: (SudachiContract & { packID: string; engine: string })[] }
  const pack = catalog.packs.find(candidate => candidate.engine === 'sudachi.rs')
  if (!pack) throw new Error('The app catalogs no Sudachi pack')
  return { ...pack, packId: pack.packID }
}

/** What napi-sudachi builds: the engine and runtime commit, checked against the app's. */
const binding = {
  engineVersion: '0.6.11',
  runtimeResourceCommit: '90fd6068c80c2fc3b63e0dbab0e341475bad4d8f'
}

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

interface Morpheme {
  surface: string
  partOfSpeech: string[]
  dictionaryForm: string
  dictionaryId: number
}

/**
 * Checks that napi-sudachi runs the app's engine with the app's runtime files, and points it at
 * the dictionary at `dictionaryPath`, whose SHA-256 the caller has checked
 * (`contract.installedSHA256`). The native module reads its configuration from the process's
 * environment, which only the main thread can set, so the main thread calls this before any
 * worker thread loads Sudachi.
 */
export function prepareSudachi(contract: SudachiContract, dictionaryPath: string): void {
  if (
    contract.engineVersion !== binding.engineVersion ||
    contract.runtimeResourceCommit !== binding.runtimeResourceCommit
  ) {
    throw new Error(
      `The app's Sudachi is ${contract.engineVersion} (${contract.runtimeResourceCommit}), but ` +
        `@nikkei/napi-sudachi builds ${binding.engineVersion} (${binding.runtimeResourceCommit})`
    )
  }
  const root = dirname(require.resolve('@nikkei/napi-sudachi/package.json'))
  const resources = join(root, 'resources')
  for (const [file, expected] of [
    ['char.def', contract.characterDefinitionSHA256],
    ['unk.def', contract.unknownDefinitionSHA256]
  ] as const) {
    const actual = sha256(join(resources, file))
    if (actual !== expected) {
      throw new Error(`Sudachi's ${file} is ${actual}, not the app's ${expected}`)
    }
  }
  process.env.NAPI_SUDACHI_ROOT = root
  process.env.SUDACHI_RESOURCE_DIR = resources
  process.env.SUDACHI_CONFIG_FILE = join(resources, 'sudachi.json')
  process.env.SUDACHI_DICT_PATH = dictionaryPath
  delete process.env.SUDACHI_USER_DICT
}

/**
 * Sudachi, as `prepareSudachi` configured it for `dictionaryPath`; loading takes a moment. The
 * analyzer returns the app's Mode C words (SudachiJapaneseMorphologyAdapter), which sentence
 * search looks up.
 */
export function loadSudachi(dictionaryPath: string): MorphologyAnalyzer {
  if (process.env.SUDACHI_DICT_PATH !== dictionaryPath) {
    throw new Error(`Sudachi isn't prepared for ${dictionaryPath}; call prepareSudachi first`)
  }
  const sudachi = require('@nikkei/napi-sudachi') as {
    Tokenizer: new () => { tokenize(text: string, mode: number): Morpheme[] }
    SplitMode: { c(): number }
  }
  const tokenizer = new sudachi.Tokenizer()
  const coarse = sudachi.SplitMode.c()
  return {
    async analyze(text) {
      return tokenizer.tokenize(text, coarse).map(morpheme => ({
        surface: morpheme.surface,
        dictionaryForm: morpheme.dictionaryForm,
        partOfSpeech: morpheme.partOfSpeech,
        isOutOfVocabulary: morpheme.dictionaryId < 0
      }))
    }
  }
}
