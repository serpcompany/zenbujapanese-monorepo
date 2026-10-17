import { fileURLToPath } from 'node:url'
import { groupInflections, kuromojiCandidates } from '@zenbu/dictionary-core/examples/morphology'
import { describe, expect, test } from 'vitest'
import { tokenizerDictionary, tokenizerDictionaryAvailable } from './conformance/support'
import { loadTokenizer } from './tokenizer'

describe.runIf(tokenizerDictionaryAvailable)('the tokenizer over the bundled dictionary', () => {
  const tokenize = tokenizerDictionaryAvailable ? loadTokenizer(tokenizerDictionary) : () => []

  test('splits a sentence as the app records it', () => {
    const text = '見るからに明らかだよ。'
    const candidates = kuromojiCandidates(text, tokenize(text))
    expect(candidates?.map(candidate => candidate.surface)).toEqual([
      '見る',
      'から',
      'に',
      '明らか',
      'だ',
      'よ',
      '。'
    ])
    expect(candidates?.[0]).toMatchObject({ reading: 'ミル', partOfSpeech: ['動詞', '自立'] })
  })

  test('joins inflections the app joins', () => {
    const text = '私は昨日やむをえず外出せざるをえなかった。'
    const candidates = kuromojiCandidates(text, tokenize(text)) ?? []
    expect(groupInflections(candidates).map(candidate => candidate.surface)).toContain('えなかった')
  })
})

test('refuses dictionary files other than the pinned ones', () => {
  expect(() => loadTokenizer(fileURLToPath(new URL('.', import.meta.url)))).toThrow()
})
