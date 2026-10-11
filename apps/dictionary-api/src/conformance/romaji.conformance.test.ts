import { romaji, type SpokenWord, sentenceRomaji } from '@zenbu/dictionary-core/detail/romaji'
import { embeddedEndpoint } from '@zenbu/dictionary-core/embedded/dictionary'
import { describe, expect, test } from 'vitest'
import { readSuite } from './support'

interface RomajiSuite {
  cases: { covers: string; readings: { reading: string; romaji: string | null }[] }[]
  sentences: { covers: string; words: SpokenWord[]; romaji: string | null }[]
}

const suite = readSuite<RomajiSuite>('romaji')
const app = embeddedEndpoint({})

async function asked(method: string, argument: string): Promise<unknown> {
  const call = app.begin(method, argument)
  await new Promise(resolve => setTimeout(resolve))
  const outcome = JSON.parse(call.outcome()) as { value?: unknown; error?: string }
  if (outcome.error !== undefined) throw new Error(outcome.error)
  return outcome.value
}

describe('romaji, as the suite recorded it', () => {
  test.each(suite.cases)('$covers', async ({ readings }) => {
    for (const expected of readings) {
      expect(romaji(expected.reading), expected.reading).toBe(expected.romaji)
      expect(await asked('romaji', expected.reading), expected.reading).toBe(expected.romaji)
    }
  })

  test.each(suite.sentences)('a sentence: $covers', async ({ words, romaji: expected }) => {
    expect(sentenceRomaji(words)).toBe(expected)
    expect(await asked('sentenceRomaji', JSON.stringify(words))).toBe(expected)
  })
})
