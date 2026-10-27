import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { gzipSync } from 'node:zlib'
import { attachments } from '@zenbu/dictionary-core/artifact/database'
import { retiredEntriesFile } from '@zenbu/dictionary-core/artifact/retired'
import { rankedPackIds } from '@zenbu/dictionary-core/browse/lists'
import { ipadicFiles } from '@zenbu/dictionary-core/examples/ipadic'
import { publishRelease, releasesIndex } from '../src/test/publish-release.ts'
import {
  artifactFile,
  firstSet,
  kanjiFiles,
  kuromojiFile,
  laterSet,
  sha256Hex
} from '../src/worker/release-files.ts'

export const fixtureRelease = '2026.10.1'

const partBytes = 4096

const anySha256 = '0'.repeat(64)

const artifactMetadata = {
  transform: '"jmdict-to-zenbu-language-reference-data-v3"',
  retrieval_index_schema_version: 'zenbu.example-sentence-retrieval-index.v2',
  retrieval_policy_version: 'ExampleSentenceRetrievalPolicy/v1',
  retrieval_porter_tokenizer: 'fts4/porter',
  retrieval_exact_tokenizer: 'fts4/simple',
  retrieval_pair_id_scheme: 'esp1-sha256-128-nfc-length-prefixed',
  retrieval_corpus_sha256: anySha256,
  retrieval_index_mapping_sha256: anySha256,
  retrieval_importer_sha256: anySha256,
  retrieval_provenance_sha256: anySha256,
  example_sentences: '1',
  retrieval_provenance_row_count: '1',
  retrieval_index_row_count: '1',
  retrieval_exact_index_row_count: '1',
  sense_examples: '1'
}

type Attachment = (typeof attachments)[keyof typeof attachments]

function database(folder: string, name: string, metadata: Record<string, string>, sql = '') {
  const path = join(folder, name)
  const db = new DatabaseSync(path)
  db.exec(`CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); ${sql}`)
  const insert = db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(metadata)) insert.run(key, value)
  db.close()
  return new Uint8Array(readFileSync(path))
}

function attachmentMetadata(attachment: Attachment, artifactSha256: string) {
  return {
    artifact_schema: attachment.schema,
    ...('packId' in attachment ? { pack_id: attachment.packId } : {}),
    ...('source' in attachment ? { source_identity: attachment.source } : {}),
    ...(attachment.languageData ? { language_data_sha256: artifactSha256 } : {})
  }
}

const rankedLists = `CREATE TABLE ranked_lists (pack_id TEXT PRIMARY KEY); ${rankedPackIds
  .map(packId => `INSERT INTO ranked_lists VALUES ('${packId}');`)
  .join(' ')}`

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

async function fileBytes(folder: string): Promise<Map<string, Uint8Array>> {
  const artifact = database(folder, artifactFile, artifactMetadata)
  const artifactSha256 = await sha256Hex(artifact)
  const bytes = new Map<string, Uint8Array>([
    [artifactFile, artifact],
    [
      kanjiFiles[0],
      json({
        metadataSourceIdentity: 'edrdg.kanjidic2',
        componentSourceIdentity: 'edrdg.kradfile',
        entries: []
      })
    ],
    [kanjiFiles[1], json({ schema: firstSet.get(kanjiFiles[1]), kanji: [], elements: [] })],
    [
      retiredEntriesFile,
      json({
        schema: firstSet.get(retiredEntriesFile),
        language_data_sha256: artifactSha256,
        entries: []
      })
    ]
  ])
  for (const attachment of Object.values(attachments)) {
    const sql = attachment === attachments.ranked ? rankedLists : ''
    const metadata = attachmentMetadata(attachment, artifactSha256)
    bytes.set(attachment.file, database(folder, attachment.file, metadata, sql))
  }
  for (const file of ipadicFiles) bytes.set(kuromojiFile(file), new Uint8Array(gzipSync(file)))
  return bytes
}

export async function fixtureReleaseObjects(): Promise<Map<string, Uint8Array>> {
  const folder = mkdtempSync(join(tmpdir(), 'zenbu-fixture-release-'))
  try {
    const bytes = await fileBytes(folder)
    const files = [...firstSet, ...laterSet].map(([name, schema]) => {
      const found = bytes.get(name)
      if (!found) throw new Error(`The fixture release has no ${name}, which the installer reads.`)
      return { name, bytes: found, schema }
    })
    const { objects, listed } = await publishRelease({
      release: fixtureRelease,
      files,
      partBytes,
      publishedAt: '2026-10-28T00:00:00Z'
    })
    objects.set('releases.json', releasesIndex([listed]))
    return objects
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}
