import { expect } from 'vitest'
import { readSuite } from './support'

export interface RetrievalCase {
  query: string
  resolution?: string
  presentation?: string
  readingRefinement?: string
  results?: { id: string; headword: string; reading: string }[]
}

interface RetrievalSuite {
  artifact: { name: string; sha256: string }
  resultLimit: number
  cases: RetrievalCase[]
}

export const retrievalSuite = readSuite<RetrievalSuite>('search-retrieval')

export const needsAnalyzer = (expected: RetrievalCase) => expected.resolution === 'analyzed'

export const describeEntries = (entries: { headword: string; reading: string }[]) =>
  entries.map(entry => `${entry.headword}（${entry.reading}）`).join(', ')

export function expectRecordedRetrieval(
  expected: RetrievalCase,
  observed: {
    ids: string[]
    found: string
    resolution: string
    presentation: string
    readingRefinement: string | null
  }
): void {
  expect(
    observed.ids.slice(0, retrievalSuite.resultLimit),
    `「${expected.query}」: expected ${describeEntries(expected.results ?? [])} but found ${observed.found}`
  ).toEqual((expected.results ?? []).map(result => result.id))
  expect(observed.resolution).toBe(expected.resolution)
  expect(observed.presentation).toBe(expected.presentation)
  expect(observed.readingRefinement ?? undefined).toBe(expected.readingRefinement)
}
