import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { primaryItem } from '@zenbu/dictionary-core/results/results'
import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  artifactAvailable,
  artifactDatabase,
  dictionary,
  readSuite,
  requirePinnedArtifacts
} from './support'

interface SuiteToken {
  surface: string
  entry?: string
  candidates?: string[]
  queryMatch?: boolean
}

interface SuiteCase {
  query: string
  covers: string
  title?: string
  count: number
  highlightedEntry?: string
  usesPrimaryEntryExamples: boolean
  ids: string[]
  shown: { id: string; japanese: string; english: string; tokens: SuiteToken[] }[]
}

interface Suite {
  artifacts: { name: string; sha256: string }[]
  tokenLimit: number
  cases: SuiteCase[]
}

const suite = readSuite<Suite>('example-search')
const rowCountForMoreThanFifty = 51

describe.runIf(artifactAvailable)('example search conformance', () => {
  let service: Dictionary

  beforeAll(async () => {
    requirePinnedArtifacts(suite.artifacts)
    service = await dictionary({ morphology: false })
  })

  async function languageReferenceIds(entSeqs: number[]): Promise<Map<number, string>> {
    if (entSeqs.length === 0) return new Map()
    const db = await artifactDatabase()
    const rows = db.all<{ ent_seq: number; id: string }>(
      `SELECT source_record_id AS ent_seq, lower(hex(id)) AS id FROM entries
       WHERE source_identity = 'edrdg.jmdict' AND source_record_id IN (${entSeqs.map(() => '?')})`,
      entSeqs
    )
    return new Map(rows.map(row => [row.ent_seq, row.id]))
  }

  test.each(suite.cases)('「$query」: $covers', async expected => {
    const results = await service.searchResults(expected.query)
    const { screen } = await service.search(expected.query)
    const row = screen.state === 'results' ? screen.examples : null
    const found = await service.searchExamples(expected.query, 0, 100)
    const shown = found?.rows.slice(0, suite.tokenLimit) ?? []
    const ids = await languageReferenceIds([
      ...new Set(shown.flatMap(({ example }) => example.links.flatMap(link => link.entSeqs)))
    ])
    const id = (number: number) => ids.get(number) ?? `missing ${number}`
    const highlightedEntry = primaryItem(results, normalizeQuery(expected.query))?.entry.id

    const observed: Omit<SuiteCase, 'query' | 'covers'> = {
      ...(row ? { title: row.title } : {}),
      count: row?.count ?? 0,
      ...(highlightedEntry ? { highlightedEntry } : {}),
      usesPrimaryEntryExamples: results.usesPrimaryEntryExamples,
      ids: found?.rows.map(({ sentence }) => `esp1_${sentence.pairId}`) ?? [],
      shown: shown.map(({ sentence, example }) => {
        const links = new Map(example.links.map(link => [link.token, link.entSeqs]))
        const highlights = new Set(example.highlights)
        return {
          id: `esp1_${sentence.pairId}`,
          japanese: sentence.japanese,
          english: sentence.english,
          tokens: (example.tokens ?? sentence.tokens).map((token, index): SuiteToken => {
            const entSeqs = links.get(index) ?? []
            return {
              surface: token.text,
              ...(entSeqs.length === 1 ? { entry: id(entSeqs[0]) } : {}),
              ...(entSeqs.length > 1 ? { candidates: entSeqs.map(id) } : {}),
              ...(highlights.has(index) ? { queryMatch: true } : {})
            }
          })
        }
      })
    }
    const { query: _query, covers: _covers, ...recorded } = expected
    expect(observed).toEqual(recorded)
    if (found) {
      expect(
        found.listed === expected.count || expected.count === rowCountForMoreThanFifty,
        'the page lists what the row counts'
      ).toBe(true)
    }
  })
})
