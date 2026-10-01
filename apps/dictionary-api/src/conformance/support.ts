import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import type { MorphologyAnalyzer } from '@zenbu/dictionary-core/search/search'
import {
  artifactFile,
  fileSha256,
  type OpenedArtifact,
  openArtifact,
  rejectGitLfsPointer
} from '../artifact'
import { loadKuromoji } from '../kuromoji'
import { loadSudachi, prepareSudachi, sudachiContract } from '../sudachi'

const repository = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')
export const resources = join(repository, 'apps/ios/Modules/Sources/SearchExperience/Resources')
const suites = join(repository, 'apps/ios/LanguageData/Conformance')
const sudachiDictionary = join(repository, 'apps/dictionary-api/.sudachi/system_core.dic')

export const artifactAvailable = (() => {
  try {
    rejectGitLfsPointer(join(resources, artifactFile))
    return true
  } catch {
    return false
  }
})()

export const sudachiAvailable = existsSync(sudachiDictionary)

if (process.env.ZENBU_REQUIRE_ARTIFACT === '1' && !(artifactAvailable && sudachiAvailable)) {
  throw new Error(
    `ZENBU_REQUIRE_ARTIFACT is set, but ${artifactAvailable ? "Sudachi's dictionary is missing (pnpm sudachi)" : `${artifactFile} is a Git LFS pointer or missing (git lfs pull)`}`
  )
}

export function readSuite<Suite>(name: string): Suite {
  return JSON.parse(readFileSync(join(suites, `${name}.json`), 'utf8')) as Suite
}

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

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

export function sudachiAnalyzer(): MorphologyAnalyzer | undefined {
  if (!sudachiAvailable) return undefined
  if (!sudachi) {
    prepareSudachi(sudachiContract(resources), sudachiDictionary)
    sudachi = loadSudachi(sudachiDictionary)
  }
  return sudachi
}

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

export async function tokenizer() {
  return (await open()).tokenize
}
