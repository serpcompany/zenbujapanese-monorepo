import { describe, expect, test } from 'vitest'
import { websiteExampleSearch } from './example-search'
import { exampleCandidateLimit } from './examples/search'

// Example search on D1 never reads more than `exampleCandidateLimit` + 1 candidate sentences, for
// any query: a Worker holds and ranks every candidate it reads, and a prefix such as t* or a
// first word such as ^the has over 70,000.

interface Statement {
  sql: string
  params: unknown[]
}

/** A search D1 with no precomputed searches, whose candidate queries return `rows` sentences. */
function fakeD1(rows: number) {
  const statements: Statement[] = []
  const db = {
    prepare(sql: string) {
      const statement: Statement = { sql, params: [] }
      statements.push(statement)
      const bound = {
        first: async () => null,
        all: async () => {
          const limit = statement.params.at(-1)
          const count = typeof limit === 'number' && limit >= 0 ? Math.min(rows, limit) : rows
          return {
            results: Array.from({ length: count }, (_, index) => ({
              id: index + 1,
              pair_id: String(index).padStart(32, '0'),
              japanese: 'たのしい。',
              english: 'The test runs.'
            }))
          }
        }
      }
      return {
        bind(...params: unknown[]) {
          statement.params = params
          return bound
        },
        ...bound
      }
    }
  }
  return { db: db as unknown as D1Database, statements }
}

const queries = [
  't*',
  '^the',
  '^t*',
  'the',
  'thank y*',
  't* the',
  'the ^cat',
  '_',
  'snake_case',
  'e',
  'の',
  'た',
  '日本 語',
  'tシャツ'
]

describe('websiteExampleSearch', () => {
  test.each(queries)('reads at most the limit of candidates for 「%s」', async query => {
    const { db, statements } = fakeD1(200_000)
    await websiteExampleSearch(db).search(query)
    const candidates = statements.filter(({ sql }) => sql.includes('FROM example_sentences'))
    for (const { sql, params } of candidates) {
      expect(sql).toMatch(/LIMIT \?/)
      expect(params.at(-1)).toBe(exampleCandidateLimit + 1)
    }
    // Every statement is the cache lookup, by its key, or a capped candidate read.
    for (const { sql } of statements) {
      expect(
        sql.includes('FROM example_search_cache WHERE key = ?') || sql.includes('LIMIT ?')
      ).toBe(true)
    }
  })

  test('lists nothing for an uncached search with more candidates than the limit', async () => {
    const { db } = fakeD1(exampleCandidateLimit + 1)
    expect(await websiteExampleSearch(db).search('t*')).toEqual({
      ids: [],
      count: 0,
      truncated: false
    })
  })

  test('ranks an uncached search with up to the limit', async () => {
    const { db } = fakeD1(3)
    expect((await websiteExampleSearch(db).search('test')).count).toBe(3)
  })
})
