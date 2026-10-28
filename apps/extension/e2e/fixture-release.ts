import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { type AttachmentName, attachments } from '@zenbu/dictionary-core/artifact/database'
import { retiredEntriesFile } from '@zenbu/dictionary-core/artifact/retired'
import { rankedPackIds } from '@zenbu/dictionary-core/browse/lists'
import { publishRelease, releasesIndex } from '../src/test/publish-release.ts'
import {
  artifactFile,
  firstSet,
  kanjiFiles,
  laterSet,
  sha256Hex
} from '../src/worker/release-files.ts'
import { kuromojiFiles } from './fixture-ipadic.ts'
import { attachmentRows, type Fill, fillEntries } from './fixture-words.ts'

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

function database(folder: string, name: string, metadata: Record<string, string>, fill?: Fill) {
  const path = join(folder, name)
  const db = new DatabaseSync(path)
  db.exec('CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  const insert = db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(metadata)) insert.run(key, value)
  fill?.(db)
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

const attachmentFills: Partial<Record<AttachmentName, Fill>> = {
  ...attachmentRows,
  ranked: db => db.exec(rankedLists)
}

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

async function fileBytes(folder: string): Promise<Map<string, Uint8Array>> {
  const artifact = database(folder, artifactFile, artifactMetadata, fillEntries)
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
  for (const name of Object.keys(attachments) as AttachmentName[]) {
    const attachment = attachments[name]
    const metadata = attachmentMetadata(attachment, artifactSha256)
    bytes.set(attachment.file, database(folder, attachment.file, metadata, attachmentFills[name]))
  }
  for (const [file, gzipped] of kuromojiFiles()) bytes.set(file, gzipped)
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
