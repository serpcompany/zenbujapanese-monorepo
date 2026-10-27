import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import { maximumPagesAsked, pagesAsked, readPages } from './pages'
import { sqliteDatabase } from './sqlite-database'

const taberu = '042e07f7052f611fed33ddddf37f55fd'
const dropped = 'f'.repeat(32)
const fromAnotherSource = 'e'.repeat(32)

function artifact() {
  const database = new DatabaseSync(':memory:')
  database.exec(`CREATE TABLE entries (
    id BLOB PRIMARY KEY, source_identity TEXT NOT NULL, source_record_id INTEGER NOT NULL,
    headword TEXT NOT NULL, reading TEXT NOT NULL
  )`)
  const entry = database.prepare('INSERT INTO entries VALUES (unhex(?), ?, ?, ?, ?)')
  entry.run(taberu, 'edrdg.jmdict', 1358280, '食べる', 'たべる')
  entry.run(fromAnotherSource, 'another.source', 7, '別', 'べつ')
  return sqliteDatabase(database)
}

describe('the pages of words and kanji', () => {
  test("answers each word's entry number and slug, and each kanji the dictionary has", () => {
    const asked = pagesAsked(`${taberu.toUpperCase()},${dropped},${fromAnotherSource}`, '日,丢')
    expect(asked).not.toBeNull()
    expect(
      readPages(artifact(), character => character === '日', asked ?? { words: [], kanji: [] })
    ).toEqual({
      words: [{ languageReferenceID: taberu, entSeq: 1358280, slug: '食べる' }],
      kanji: ['日']
    })
  })

  test('reads no entries when it is asked for kanji alone', () => {
    const unread = { all: () => expect.unreachable('no word was asked for') }
    expect(readPages(unread, () => false, { words: [], kanji: ['日'] })).toEqual({
      words: [],
      kanji: []
    })
  })

  test('takes 1 to 100 of each, once each, and refuses anything else', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, n) => n.toString(16).padStart(32, '0'))
    expect(pagesAsked(`${taberu},${taberu}`, undefined)).toEqual({ words: [taberu], kanji: [] })
    expect(pagesAsked(undefined, '日,,日')).toEqual({ words: [], kanji: ['日'] })
    expect(pagesAsked(many(maximumPagesAsked).join(','), '日')?.words).toHaveLength(100)
    expect(pagesAsked(many(maximumPagesAsked + 1).join(','), undefined)).toBeNull()
    expect(pagesAsked(undefined, undefined)).toBeNull()
    expect(pagesAsked('', '')).toBeNull()
    expect(pagesAsked('taberu', undefined)).toBeNull()
    expect(pagesAsked(undefined, '日本')).toBeNull()
  })
})
