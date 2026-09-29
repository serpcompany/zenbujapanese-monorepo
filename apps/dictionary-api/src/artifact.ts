// Opens the language-data artifact the app bundles (its SearchExperience/Resources) for the
// dictionary core: LanguageReferenceData.sqlite3 read-only, with the other bundled databases
// attached as the core expects, every file checked before anything is read.

import { createHash } from 'node:crypto'
import { closeSync, createReadStream, openSync, readFileSync, readSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import {
  type ArtifactDatabase,
  attachments,
  checkArtifact,
  type SqlValue
} from '@zenbu/dictionary-core/artifact/database'
import {
  KanjiData,
  type KanjiElementFile,
  type KanjiReferenceFile
} from '@zenbu/dictionary-core/artifact/kanji-data'

export const artifactFile = 'LanguageReferenceData.sqlite3'

/** A file's SHA-256, read in chunks: the dictionary is about 480 MB. */
export async function fileSha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/** Throws when a file is a Git LFS pointer rather than its content. */
export function requireContent(path: string): void {
  const head = Buffer.alloc(40)
  const file = openSync(path, 'r')
  try {
    readSync(file, head, 0, head.length, 0)
  } finally {
    closeSync(file)
  }
  if (head.toString('utf8').startsWith('version https://git-lfs')) {
    throw new Error(`${path} is a Git LFS pointer; run git lfs pull first`)
  }
}

/** SQLite's own accessor, with each statement prepared once. */
class SqliteArtifact implements ArtifactDatabase {
  private readonly statements = new Map<string, StatementSync>()

  constructor(readonly database: DatabaseSync) {}

  all<Row>(sql: string, params: readonly SqlValue[] = []): Row[] {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.database.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement.all(...(params as (string | number | bigint | null | Uint8Array)[])) as Row[]
  }
}

export interface OpenedArtifact {
  db: ArtifactDatabase
  kanji: KanjiData
  close(): void
}

/**
 * The artifact in `resources` (the app's SearchExperience/Resources), checked against
 * `sourceSha256`, the SHA-256 of its LanguageReferenceData.sqlite3.
 */
export function openArtifact(resources: string, sourceSha256: string): OpenedArtifact {
  const source = join(resources, artifactFile)
  requireContent(source)
  const database = new DatabaseSync(source, { readOnly: true })
  for (const [name, attachment] of Object.entries(attachments)) {
    const path = join(resources, attachment.file)
    requireContent(path)
    database.exec(`ATTACH DATABASE 'file:${path.replaceAll("'", "''")}?mode=ro' AS ${name}`)
  }
  const db = new SqliteArtifact(database)
  checkArtifact(db, sourceSha256)
  const json = <T>(name: string): T => {
    const path = join(resources, name)
    requireContent(path)
    return JSON.parse(readFileSync(path, 'utf8')) as T
  }
  const kanji = new KanjiData(
    json<KanjiReferenceFile>('KanjiReferenceData.json'),
    json<KanjiElementFile>('KanjiElementReferenceData.json')
  )
  return { db, kanji, close: () => database.close() }
}
