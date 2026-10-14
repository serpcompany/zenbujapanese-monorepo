import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { tatoebaContributors } from './contributors'
import type { ArtifactDatabase, SqlValue } from './database'

function contributors(counts: Record<string, number>): ArtifactDatabase {
  const database = new DatabaseSync(':memory:')
  database.exec(`
    CREATE TABLE example_sentence_contributors (
      username TEXT PRIMARY KEY,
      sentence_side_count INTEGER NOT NULL
    ) WITHOUT ROWID;
  `)
  const insert = database.prepare('INSERT INTO example_sentence_contributors VALUES (?, ?)')
  for (const [username, count] of Object.entries(counts)) insert.run(username, count)
  return {
    all<Row>(sql: string, params: readonly SqlValue[] = []): Row[] {
      return database.prepare(sql).all(...params) as Row[]
    }
  }
}

test('lists the Tatoeba contributors by username, ignoring case, with their sentence counts', () => {
  expect(tatoebaContributors(contributors({ zoe: 3, Bob: 12, alice: 7, CK: 1 }))).toEqual([
    { username: 'alice', sentenceSideCount: 7 },
    { username: 'Bob', sentenceSideCount: 12 },
    { username: 'CK', sentenceSideCount: 1 },
    { username: 'zoe', sentenceSideCount: 3 }
  ])
})
