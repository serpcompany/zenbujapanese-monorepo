import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { lookupSegments, type Morpheme } from './morphology'

const suite = JSON.parse(
  readFileSync(
    new URL('../../../../language-data/conformance/sentence-search.json', import.meta.url),
    'utf8'
  )
) as { cases: { query: string; words: Morpheme[]; searched: string[] }[] }

describe('the sentence search suite', () => {
  test('records Sudachi’s words and the words searched for every case', () => {
    expect(suite.cases.length).toBeGreaterThan(500)
    expect(suite.cases.every(({ words, searched }) => words && searched)).toBe(true)
  })

  test.each(suite.cases)('searches the words of 「$query」 the app searches', ({
    words,
    searched
  }) => {
    expect(lookupSegments(words)).toEqual(searched)
  })
})
