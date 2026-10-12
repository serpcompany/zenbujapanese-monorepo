import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, dictionary, sudachiAvailable } from './support'

describe.runIf(artifactAvailable && sudachiAvailable)('sentence search', () => {
  let service: Dictionary

  beforeAll(async () => {
    service = await dictionary({ morphology: true })
  })

  test.each([
    ['日本語を勉強する', ['日本語', '勉強', 'する']],
    ['Where is the bathroom?', ['何処', 'だ', 'その', '浴室']]
  ])('「%s」 lists its words as Discovered Words (#401)', async (sentence, words) => {
    const { screen } = await service.search(sentence)
    expect(screen.state).toBe('results')
    if (screen.state !== 'results') return
    expect(screen.sections).toContain('discoveredWords')
    expect(screen.rows.map(row => row.headword)).toEqual(words)
  })

  test('an English sentence’s rows each show the meaning that is its word', async () => {
    const { screen } = await service.search('Where is the bathroom?')
    expect(screen.state === 'results' && screen.rows.map(row => row.summary)).toEqual([
      'where',
      'is',
      'the',
      'bathroom'
    ])
  })

  test.each([
    '勉強',
    'ice cream'
  ])('「%s」, which the dictionary holds, is still searched as itself', async held => {
    const results = await service.searchResults(held)
    expect(results.resolution).toBe('direct')
    expect(results.presentation).toBe('ranked')
  })

  test("the service reports sentence search, which the website didn't have before", () => {
    expect(service.features.sentenceSearch).toBe(true)
  })
})
