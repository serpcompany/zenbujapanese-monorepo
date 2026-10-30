import { attachments } from '@zenbu/dictionary-core/artifact/database'
import { retiredEntriesFile } from '@zenbu/dictionary-core/artifact/retired'
import { ipadicFiles } from '@zenbu/dictionary-core/examples/ipadic'

export const artifactFile = 'LanguageReferenceData.sqlite3'

export const firstAttachments = ['compound_pitch', 'jlpt', 'tubelex', 'word_index'] as const

export const laterAttachments = ['strokes', 'ranked'] as const

export const builtForArtifact: ReadonlySet<string> = new Set(
  laterAttachments
    .filter(name => attachments[name].languageData)
    .map(name => attachments[name].file)
)

export const kanjiFiles = ['KanjiReferenceData.json', 'KanjiElementReferenceData.json'] as const

export const kuromojiFile = (file: string) => `Kuromoji/${file}.dat.gz`

const schemaOf = (name: keyof typeof attachments) => [
  attachments[name].file,
  attachments[name].schema
]

export const firstSet: ReadonlyMap<string, string | null> = new Map([
  [artifactFile, 'zenbu.language-reference.v2'],
  ...firstAttachments.map(schemaOf),
  [kanjiFiles[0], 'zenbu.kanji-reference.v2'],
  [kanjiFiles[1], 'zenbu.kanji-elements.v1'],
  [retiredEntriesFile, 'zenbu.retired-entries.v1'],
  ...ipadicFiles.map(file => [kuromojiFile(file), null] as const)
] as [string, string | null][])

export const laterSet: ReadonlyMap<string, string | null> = new Map(
  laterAttachments.map(schemaOf) as [string, string][]
)

export interface Part {
  key: string
  bytes: number
  sha256: string
}

export interface Listed {
  release: string
  manifest_sha256: string
  published_at: string
}

export interface ManifestFile {
  name: string
  sha256: string
  bytes: number
  artifact_schema?: string
}

export interface Compressed {
  manifest_sha256: string
  files: { name: string; parts: Part[] }[]
}

export const fileKey = (file: { name: string; sha256: string }) =>
  `files/${file.sha256}/${file.name}`

export const packed = (name: string) => /\.(sqlite3|json)$/.test(name)
