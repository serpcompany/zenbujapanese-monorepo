import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DictionaryBrowse } from '@zenbu/dictionary-core/artifact/browse'
import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import {
  type RetiredEntries,
  type RetiredEntriesFile,
  retiredEntries,
  retiredEntriesFile
} from '@zenbu/dictionary-core/artifact/retired'
import { ipadicTokenizer, type ReadIpadicFile } from '@zenbu/dictionary-core/examples/ipadic'
import type { Tokenize } from '@zenbu/dictionary-core/examples/morphology'
import type { MorphologyAnalyzer } from '@zenbu/dictionary-core/search/search'
import type { Hono } from 'hono'
import { createApp } from '../app'
import {
  artifactFile,
  fileSha256,
  type OpenedArtifact,
  openArtifact,
  rejectGitLfsPointer
} from '../artifact'
import { inProcessService } from '../service'
import { loadSudachi, prepareSudachi, sudachiContract } from '../sudachi'
import { tokenizerFiles } from '../tokenizer'
import { info } from './fake-service'

const repository = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')
export const resources = join(repository, 'apps/ios/Modules/Sources/SearchExperience/Resources')
const suites = join(repository, 'language-data/conformance')
const sudachiDictionary = join(repository, 'apps/dictionary-api/.sudachi/system_core.dic')
export const retiredEntriesPath = join(repository, 'language-data/derived', retiredEntriesFile)

export const artifactAvailable = (() => {
  try {
    rejectGitLfsPointer(join(resources, artifactFile))
    return true
  } catch {
    return false
  }
})()

export const sudachiAvailable = existsSync(sudachiDictionary)

export const tokenizerDictionary = join(resources, 'Kuromoji')

export const tokenizerDictionaryAvailable = (() => {
  try {
    rejectGitLfsPointer(join(tokenizerDictionary, 'base.dat.gz'))
    return true
  } catch {
    return false
  }
})()

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

export const recordedSudachi = (artifacts: { name: string; sha256: string }[]) =>
  artifacts.find(artifact => artifact.name === 'system_core.dic')?.sha256

let opened: Promise<{
  artifact: OpenedArtifact
  tokenizerFile: ReadIpadicFile
  tokenize: Tokenize
  retired: RetiredEntries
}> | null = null
let sudachi: MorphologyAnalyzer | null = null

async function open() {
  opened ??= (async () => {
    const artifactSha256 = await fileSha256(join(resources, artifactFile))
    const artifact = openArtifact(resources, artifactSha256)
    const tokenizerFile = tokenizerFiles(tokenizerDictionary)
    const retired = retiredEntries(
      JSON.parse(readFileSync(retiredEntriesPath, 'utf8')) as RetiredEntriesFile,
      artifactSha256
    )
    return { artifact, tokenizerFile, tokenize: ipadicTokenizer(tokenizerFile), retired }
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
  const { artifact, tokenize, retired } = await open()
  const morphology = options.morphology ? sudachiAnalyzer() : undefined
  return new Dictionary({
    db: artifact.db,
    kanji: artifact.kanji,
    retired,
    capabilities: { tokenize, ...(morphology ? { morphology } : {}) }
  })
}

export async function artifactDatabase() {
  return (await open()).artifact.db
}

export async function artifactKanji() {
  return (await open()).artifact.kanji
}

export async function artifactRadicals() {
  return (await open()).artifact.radicals
}

export async function artifactTokenizerFile() {
  return (await open()).tokenizerFile
}

export async function browse(watch?: (sql: string) => void): Promise<DictionaryBrowse> {
  const { artifact } = await open()
  const db: ArtifactDatabase = watch
    ? {
        all(sql, params) {
          watch(sql)
          return artifact.db.all(sql, params)
        }
      }
    : artifact.db
  return new DictionaryBrowse(db, artifact.kanji)
}

export const serviceToken = 'service-token-0123456789'

export async function serviceOnTheData(service: Dictionary): Promise<Hono> {
  return createApp({
    service: inProcessService(service, await browse(), info, await artifactRadicals()),
    token: serviceToken,
    ready: () => true
  })
}
