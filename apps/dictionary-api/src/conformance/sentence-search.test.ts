import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, dictionary, sudachiAvailable } from './support'

describe.runIf(artifactAvailable && sudachiAvailable)('sentence search', () => {
  let service: Dictionary

  beforeAll(async () => {
    service = await dictionary({ morphology: true })
  })

  test('「日本語を勉強する」 lists its words as Discovered Words', async () => {
    const { screen } = await service.search('日本語を勉強する')
    expect(screen.state).toBe('results')
    if (screen.state !== 'results') return
    expect(screen.sections).toContain('discoveredWords')
    expect(screen.rows.map(row => row.headword)).toEqual(['日本語', '勉強', 'する'])
  })

  test('a word the dictionary holds is still searched as itself', async () => {
    const results = await service.searchResults('勉強')
    expect(results.resolution).toBe('direct')
    expect(results.presentation).toBe('ranked')
  })

  test("the service reports sentence search, which the website didn't have before", () => {
    expect(service.features.sentenceSearch).toBe(true)
  })
})
