import type { SearchDatabase } from '../search/search'
import { exampleIndexMetadata } from './example-search'

export type SqlValue = string | number | bigint | null | Uint8Array

export interface ArtifactDatabase {
  all<Row>(sql: string, params?: readonly SqlValue[]): Row[]
}

export function searchDatabase(db: ArtifactDatabase): SearchDatabase {
  return {
    async all<Row>(sql: string, params: readonly (string | number)[]) {
      return db.all<Row>(sql, params)
    }
  }
}

export const attachments = {
  compound_pitch: {
    file: 'CompoundPitch.sqlite3',
    schema: 'zenbu.compound-pitch.v1',
    languageData: true
  },
  jlpt: {
    file: 'JLPTLevelPack.sqlite3',
    schema: 'zenbu.level-pack.v1',
    packId: 'zenbu.jlpt.waller.levels',
    languageData: true
  },
  tubelex: {
    file: 'TUBELEXFrequencyPack.sqlite3',
    schema: 'zenbu.frequency-pack.v1',
    packId: 'zenbu.tubelex.youtube.ja.unidic-3.1',
    languageData: true
  },
  strokes: {
    file: 'KanjiStrokeData.sqlite3',
    schema: 'zenbu.kanji-stroke-diagrams.v1',
    source: 'kanjivg',
    languageData: false
  },
  word_index: {
    file: 'ExampleWordIndex.sqlite3',
    schema: 'zenbu.example-word-index.v1',
    languageData: true
  }
} as const

export type AttachmentName = keyof typeof attachments

export const supportedTransforms: readonly string[] = [
  '"jmdict-to-zenbu-language-reference-data-v2"'
]

function metadata(db: ArtifactDatabase, schema: string): Map<string, string> {
  const rows = db.all<{ key: string; value: string }>(`SELECT key, value FROM ${schema}.metadata`)
  return new Map(rows.map(row => [row.key, row.value]))
}

export function checkArtifact(db: ArtifactDatabase, sourceSha256: string): void {
  const refuse = (message: string): never => {
    throw new Error(`Refusing the language data: ${message}`)
  }
  const main = metadata(db, 'main')
  const transform = main.get('transform')
  if (transform === undefined || !supportedTransforms.includes(transform)) {
    refuse(`unsupported artifact transform ${transform}; the core reads ${supportedTransforms}`)
  }
  for (const [key, expected] of Object.entries(exampleIndexMetadata)) {
    if (main.get(key) !== expected) refuse(`its ${key} is ${main.get(key)}, not ${expected}`)
  }
  for (const key of [
    'retrieval_corpus_sha256',
    'retrieval_index_mapping_sha256',
    'retrieval_importer_sha256',
    'retrieval_provenance_sha256'
  ]) {
    if (!/^[0-9a-f]{64}$/.test(main.get(key) ?? '')) refuse(`its ${key} isn't a SHA-256`)
  }
  const sentences = Number(main.get('example_sentences'))
  const indexed = [
    main.get('retrieval_index_row_count'),
    main.get('retrieval_exact_index_row_count')
  ]
  if (
    !(sentences > 0) ||
    !(Number(main.get('retrieval_provenance_row_count')) >= sentences) ||
    indexed.some(count => Number(count) !== sentences)
  ) {
    refuse("its example index counts don't match its example sentences")
  }
  for (const [name, expected] of Object.entries(attachments)) {
    const recorded = metadata(db, name)
    const schema = recorded.get('artifact_schema')
    if (schema !== expected.schema) {
      refuse(`${expected.file} is ${schema}; the core reads ${expected.schema}`)
    }
    if ('packId' in expected && recorded.get('pack_id') !== expected.packId) {
      refuse(`${expected.file} is pack ${recorded.get('pack_id')}, not ${expected.packId}`)
    }
    if ('source' in expected && recorded.get('source_identity') !== expected.source) {
      refuse(`${expected.file} is from ${recorded.get('source_identity')}, not ${expected.source}`)
    }
    if (expected.languageData && recorded.get('language_data_sha256') !== sourceSha256) {
      refuse(
        `${expected.file} was built for LanguageReferenceData ` +
          `${recorded.get('language_data_sha256')}, not ${sourceSha256}`
      )
    }
  }
}
