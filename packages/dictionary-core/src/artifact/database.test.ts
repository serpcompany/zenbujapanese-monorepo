import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, test } from 'vitest'
import { rankedPackIds } from '../browse/lists'
import { type AttachmentName, attachments, checkArtifact } from './database'
import { sqliteDatabase } from './sqlite-database'

const languageData = 'a'.repeat(64)
const otherLanguageData = 'b'.repeat(64)

const mainMetadata = {
  transform: '"jmdict-to-zenbu-language-reference-data-v3"',
  retrieval_index_schema_version: 'zenbu.example-sentence-retrieval-index.v2',
  retrieval_policy_version: 'ExampleSentenceRetrievalPolicy/v1',
  retrieval_porter_tokenizer: 'fts4/porter',
  retrieval_exact_tokenizer: 'fts4/simple',
  retrieval_pair_id_scheme: 'esp1-sha256-128-nfc-length-prefixed',
  retrieval_corpus_sha256: 'c'.repeat(64),
  retrieval_index_mapping_sha256: 'd'.repeat(64),
  retrieval_importer_sha256: 'e'.repeat(64),
  retrieval_provenance_sha256: 'f'.repeat(64),
  example_sentences: '2',
  retrieval_provenance_row_count: '2',
  retrieval_index_row_count: '2',
  retrieval_exact_index_row_count: '2',
  sense_examples: '1'
}

const opened: DatabaseSync[] = []

afterEach(() => {
  for (const database of opened.splice(0)) database.close()
})

function writeMetadata(
  connection: DatabaseSync,
  schema: string,
  values: Readonly<Record<string, string>>
) {
  connection.exec(`CREATE TABLE ${schema}.metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  const insert = connection.prepare(`INSERT INTO ${schema}.metadata (key, value) VALUES (?, ?)`)
  for (const [key, value] of Object.entries(values)) insert.run(key, value)
}

function attach(connection: DatabaseSync, name: AttachmentName, builtFor: string) {
  const expected = attachments[name]
  connection.exec(`ATTACH DATABASE ':memory:' AS ${name}`)
  writeMetadata(connection, name, {
    artifact_schema: expected.schema,
    ...('packId' in expected ? { pack_id: expected.packId } : {}),
    language_data_sha256: builtFor
  })
}

function database(attached: Partial<Record<AttachmentName, string>>) {
  const connection = new DatabaseSync(':memory:')
  opened.push(connection)
  writeMetadata(connection, 'main', mainMetadata)
  for (const [name, builtFor] of Object.entries(attached)) {
    attach(connection, name as AttachmentName, builtFor)
  }
  return connection
}

describe('checkArtifact with the attachments installed so far', () => {
  test('passes with only the JLPT levels attached, leaving the stroke order and ranked lists unchecked', () => {
    const connection = database({ jlpt: languageData })
    expect(() => checkArtifact(sqliteDatabase(connection), languageData, ['jlpt'])).not.toThrow()
  })

  test('checks every attachment when none is named', () => {
    const connection = database({ jlpt: languageData })
    expect(() => checkArtifact(sqliteDatabase(connection), languageData)).toThrow(
      'no such table: compound_pitch.metadata'
    )
  })

  test('refuses ranked lists built for other language data', () => {
    const connection = database({ ranked: otherLanguageData })
    connection.exec('CREATE TABLE ranked.ranked_lists (pack_id TEXT PRIMARY KEY)')
    const insert = connection.prepare('INSERT INTO ranked.ranked_lists (pack_id) VALUES (?)')
    for (const packId of rankedPackIds) insert.run(packId)
    expect(() => checkArtifact(sqliteDatabase(connection), languageData, ['ranked'])).toThrow(
      `Refusing the language data: ${attachments.ranked.file} was built for LanguageReferenceData ${otherLanguageData}, not ${languageData}`
    )
  })
})
