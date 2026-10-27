import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Morpheme, MorphologyAnalyzer } from '@zenbu/dictionary-core/search/morphology'
import { bundledSudachiPack, type SudachiPack } from '../scripts/sudachi-pack.mjs'

const require = createRequire(import.meta.url)

export interface SudachiContract extends SudachiPack {
  packId: string
}

export function sudachiContract(resources: string): SudachiContract {
  const pack = bundledSudachiPack(
    JSON.parse(readFileSync(join(resources, 'LanguageTechnologyPackCatalog.json'), 'utf8'))
  )
  return { ...pack, packId: pack.packID }
}

const napiSudachiBuild = {
  engineVersion: '0.6.11',
  runtimeResourceCommit: '90fd6068c80c2fc3b63e0dbab0e341475bad4d8f'
}

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

interface SudachiMorpheme {
  surface: string
  beginC: number
  endC: number
  partOfSpeech: string[]
  dictionaryForm: string
  normalizedForm: string
  readingForm: string
  dictionaryId: number
}

const morpheme = (found: SudachiMorpheme): Morpheme => ({
  surface: found.surface,
  begin: found.beginC,
  end: found.endC,
  dictionaryForm: found.dictionaryForm,
  normalizedForm: found.normalizedForm,
  reading: found.readingForm,
  partOfSpeech: found.partOfSpeech,
  isOutOfVocabulary: found.dictionaryId < 0
})

export function prepareSudachi(contract: SudachiContract, dictionaryPath: string): void {
  if (
    contract.engineVersion !== napiSudachiBuild.engineVersion ||
    contract.runtimeResourceCommit !== napiSudachiBuild.runtimeResourceCommit
  ) {
    throw new Error(
      `The app's Sudachi is ${contract.engineVersion} (${contract.runtimeResourceCommit}), but ` +
        `@nikkei/napi-sudachi builds ${napiSudachiBuild.engineVersion} (${napiSudachiBuild.runtimeResourceCommit})`
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

export function loadSudachi(dictionaryPath: string): MorphologyAnalyzer {
  if (process.env.SUDACHI_DICT_PATH !== dictionaryPath) {
    throw new Error(`Sudachi isn't prepared for ${dictionaryPath}; call prepareSudachi first`)
  }
  const sudachi = require('@nikkei/napi-sudachi') as {
    Tokenizer: new () => { tokenize(text: string, mode: number): SudachiMorpheme[] }
    SplitMode: { c(): number }
  }
  const tokenizer = new sudachi.Tokenizer()
  const modeC = sudachi.SplitMode.c()
  return {
    async analyze(text) {
      return { words: tokenizer.tokenize(text, modeC).map(morpheme) }
    }
  }
}
