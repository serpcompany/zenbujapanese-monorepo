import {
  type FoundTokens,
  foundTokens,
  sampleDigest,
  sampleTexts,
  tokenFields
} from '@zenbu/dictionary-core/examples/ipadic.fixture'
import { describe, expect, test } from 'vitest'
import { loadTokenizer } from '../tokenizer'
import {
  readSuite,
  requirePinnedArtifacts,
  tokenizerDictionary,
  tokenizerDictionaryAvailable
} from './support'

interface TokenizerSuite {
  artifacts: { name: string; sha256: string }[]
  fields: string[]
  sample: { pieces: string[]; texts: number; seed: number; digest: string }
  cases: { text: string; tokens?: FoundTokens; refused?: true }[]
}

describe.runIf(tokenizerDictionaryAvailable)(
  'the tokenizer suite, recorded from kuromoji.js',
  () => {
    const suite = readSuite<TokenizerSuite>('tokenizer')
    const tokenize = tokenizerDictionaryAvailable ? loadTokenizer(tokenizerDictionary) : () => []

    test('was recorded from the bundled dictionary, with the fields the core reads', () => {
      requirePinnedArtifacts(suite.artifacts)
      expect(suite.fields).toEqual([...tokenFields])
      expect(suite.cases.length).toBeGreaterThan(700)
      expect(suite.cases.filter(recorded => recorded.refused).length).toBeGreaterThan(5)
    })

    test('each text splits into the tokens kuromoji.js found in it', () => {
      const differing = suite.cases
        .filter(
          ({ text, tokens }) =>
            JSON.stringify(foundTokens(tokenize, text)) !== JSON.stringify(tokens ?? 'refused')
        )
        .map(({ text }) => text)
      expect(differing).toEqual([])
    })

    test('random texts split as kuromoji.js split them', () => {
      const { pieces, texts, seed, digest } = suite.sample
      expect(texts).toBeGreaterThanOrEqual(20_000)
      expect(sampleDigest(tokenize, sampleTexts(pieces, texts, seed))).toBe(digest)
    })
  }
)
